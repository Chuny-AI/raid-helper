const {
  SlashCommandBuilder,
  InteractionContextType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const { checkAuthorizedRole } = require('../../middleware/roleCheck');
const { createErrorEmbed, safeReply } = require('../../utils/errorEmbeds');
const NotifyEvent = require('../../database/models/NotifyEvent');
const { logDatabaseError } = require('../../utils/logging');

/**
 * Genera un ID corto único para la notificación (8 caracteres alfanuméricos).
 */
function generateNotifyId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

/**
 * Construye el embed público del canal con las listas de asistencia actuales.
 * @param {string} message   - Texto de la notificación
 * @param {string} hora      - Hora del evento (ej: "21:00")
 * @param {string} creatorId - ID del usuario que creó la notificación
 * @param {string[]} attending     - Array de userIds que asistirán
 * @param {string[]} notAttending  - Array de userIds que no asistirán
 * @param {number} totalMembers    - Total de miembros no-bot en el servidor
 */
function buildNotifyEmbed(message, hora, creatorId, attending, notAttending, totalMembers) {
  const sinResponder = Math.max(0, totalMembers - attending.length - notAttending.length);

  const attendingValue =
    attending.length > 0
      ? attending.map((id) => `<@${id}>`).join('\n').substring(0, 1020)
      : '*(nadie aún)*';

  const notAttendingValue =
    notAttending.length > 0
      ? notAttending.map((id) => `<@${id}>`).join('\n').substring(0, 1020)
      : '*(nadie aún)*';

  return new EmbedBuilder()
    .setTitle('📢 Notificación de actividad')
    .setColor('#00FFFF')
    .setDescription(
      `**Mensaje:**\n${message}\n\n**Hora:**\n${hora} UTC\n\n**Organizado por:** <@${creatorId}>`,
    )
    .addFields(
      { name: `✅ Asistirán (${attending.length})`, value: attendingValue },
      { name: `❌ No asistirán (${notAttending.length})`, value: notAttendingValue },
      { name: `⏳ Sin responder (${sinResponder})`, value: '\u200b' },
    )
    .setFooter({
      text: 'Creado con ❤️ por Chuny',
      iconURL:
        'https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless',
    })
    .setTimestamp();
}

/**
 * Construye los botones Asistiré / No asistiré.
 */
function buildNotifyButtons(notifyId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`notify_attending-${notifyId}`)
      .setLabel('✅ Asistiré')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`notify_notattending-${notifyId}`)
      .setLabel('❌ No asistiré')
      .setStyle(ButtonStyle.Danger),
  );
}

/**
 * Construye el embed de DM para notificar a usuarios de roles específicos.
 */
function buildDmEmbed(mensaje, hora, guildName, creatorMention, messageUrl) {
  const embed = new EmbedBuilder()
    .setTitle('📢 Nueva actividad del gremio')
    .setColor('#00FFFF')
    .setDescription(`**Mensaje:**\n${mensaje}\n\n**Hora:**\n${hora} UTC`)
    .addFields(
      { name: '🏰 Servidor', value: guildName, inline: true },
      { name: '👤 Organizado por', value: creatorMention, inline: true },
    )
    .setFooter({
      text: 'Creado con ❤️ por Chuny',
      iconURL:
        'https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce23c74b6a561877&=&format=webp&quality=lossless',
    })
    .setTimestamp();

  if (messageUrl) {
    embed.addFields({ name: '🔗 Ver en el canal', value: `[Ir al mensaje](${messageUrl})`, inline: true });
  }

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('notify')
    // Comando de servidor: sin guild no hay miembros, roles ni templates que consultar.
    .setContexts(InteractionContextType.Guild)
    .setDescription('Crea una notificación de actividad en este canal')
    .addStringOption((opt) =>
      opt.setName('mensaje').setDescription('Mensaje de la notificación').setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName('hora')
        .setDescription('Hora del evento en UTC (formato HH:MM, ej: 21:00)')
        .setRequired(true),
    )
    .addRoleOption((opt) =>
      opt
        .setName('rol_1')
        .setDescription('Primer rol al que enviar DM (opcional)')
        .setRequired(false),
    )
    .addRoleOption((opt) =>
      opt.setName('rol_2').setDescription('Segundo rol al que enviar DM (opcional)').setRequired(false),
    )
    .addRoleOption((opt) =>
      opt.setName('rol_3').setDescription('Tercer rol al que enviar DM (opcional)').setRequired(false),
    ),

  async execute(interaction) {
    // Defer immediately to prevent Unknown Interaction (10062) on slow operations
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Permission check: admin OR authorized role
    const isAdmin = interaction.member.permissions.has('Administrator');
    const hasRole = await checkAuthorizedRole(interaction);

    if (!isAdmin && !hasRole) {
      const errorEmbed = createErrorEmbed(
        'Acceso Denegado',
        'No tienes permisos para usar este comando.\nSolo los usuarios con roles autorizados (configurados con `/roles`) o administradores pueden enviar notificaciones.',
      );
      return interaction.editReply({ embeds: [errorEmbed] });
    }

    const mensaje = interaction.options.getString('mensaje');
    const hora = interaction.options.getString('hora');
    const rol1 = interaction.options.getRole('rol_1');
    const rol2 = interaction.options.getRole('rol_2');
    const rol3 = interaction.options.getRole('rol_3');
    const targetRoles = [rol1, rol2, rol3].filter(Boolean);

    const notifyId = generateNotifyId();

    // Count non-bot members for "sin responder" baseline
    let allMembers;
    try {
      allMembers = await interaction.guild.members.fetch();
    } catch (e) {
      console.error('[WARN] notify: No se pudo obtener los miembros:', e);
      allMembers = interaction.guild.members.cache;
    }
    const totalMembers = allMembers.filter((m) => !m.user.bot).size;

    const embed = buildNotifyEmbed(mensaje, hora, interaction.user.id, [], [], totalMembers);
    const buttons = buildNotifyButtons(notifyId);

    // Post the embed publicly in the current channel
    let postedMessage;
    try {
      postedMessage = await interaction.channel.send({ embeds: [embed], components: [buttons] });
    } catch (e) {
      console.error('[ERROR] notify: No se pudo enviar el embed al canal:', e);
      return interaction.editReply({ content: '❌ No se pudo publicar la notificación en este canal.' });
    }

    // Persist the notification in DB
    try {
      await new NotifyEvent({
        notifyId,
        guildId: interaction.guild.id,
        channelId: interaction.channel.id,
        messageId: postedMessage.id,
        createdBy: interaction.user.id,
        message: mensaje,
        hora,
        totalMembers,
        attending: [],
        not_attending: [],
      }).save();
    } catch (e) {
      logDatabaseError('notify save', e);
      return interaction.editReply({
        content: `⚠️ La notificación fue publicada pero hubo un error al guardarla (ID: \`${notifyId}\`).`,
      });
    }

    // If no roles specified, we're done — no DMs sent
    if (targetRoles.length === 0) {
      return interaction.editReply({
        content: `✅ Notificación publicada correctamente (ID: \`${notifyId}\`).`,
      });
    }

    // Roles specified → send DMs (non-blocking)
    const targetRoleIds = targetRoles.map((r) => r.id);
    const uniqueTargets = new Map();
    for (const [, member] of allMembers) {
      if (member.user.bot) continue;
      if (targetRoleIds.some((rid) => member.roles.cache.has(rid))) {
        uniqueTargets.set(member.id, member);
      }
    }

    const messageUrl = postedMessage.url;
    const dmEmbed = buildDmEmbed(
      mensaje,
      hora,
      interaction.guild.name,
      interaction.user.toString(),
      messageUrl,
    );

    const roleNames = targetRoles.map((r) => `**@${r.name}**`).join(', ');
    await interaction.editReply({
      content: `✅ Notificación publicada (ID: \`${notifyId}\`). Enviando DMs a ${roleNames} (${uniqueTargets.size} usuarios)…`,
    });

    setImmediate(async () => {
      let sent = 0;
      let failed = 0;
      for (const [, member] of uniqueTargets) {
        try {
          await member.send({ embeds: [dmEmbed] });
          sent++;
        } catch {
          // DMs closed or blocked — silently skip
          failed++;
        }
        // Respect Discord rate-limits
        await new Promise((r) => setTimeout(r, 250));
      }
      console.log(
        `[INFO] notify #${notifyId}: DMs — ${sent} enviados, ${failed} fallidos de ${uniqueTargets.size} targets.`,
      );
    });
  },

  // Exported so events.js can import them for embed reconstruction
  buildNotifyEmbed,
  buildNotifyButtons,
};
