const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const {
  addMoney,
  removeMoney,
  resetBalance,
  getBalance,
  getLeaderboard,
  getDebtors,
  getLogChannel,
  setLogChannel,
} = require('../../services/economy/economyService');
const {
  addEconomyRole,
  removeEconomyRole,
  resetEconomyRoles,
  hasConfiguredEconomyRole,
  canManageEconomyRoles,
} = require('../../services/economy/economyRoleService');
const { createErrorEmbed, createSuccessEmbed, safeReply } = require('../../utils/errorEmbeds');

const formatMoney = (value) => Number(value || 0).toLocaleString('es-ES');

// ─── Permission guards ────────────────────────────────────────────────────────

const checkEconomyPermission = async (interaction) => {
  const isAdmin = canManageEconomyRoles(interaction.member);
  const hasRole = await hasConfiguredEconomyRole(interaction.member, interaction.guild.id);
  if (isAdmin || hasRole) return true;
  await safeReply(interaction, {
    embeds: [createErrorEmbed('Acceso denegado', 'No tienes permisos para usar comandos de economia')],
    flags: MessageFlags.Ephemeral,
  });
  return false;
};

const checkLogChannel = async (interaction) => {
  const channelId = await getLogChannel(interaction.guild.id);
  if (channelId) return channelId;
  await safeReply(interaction, {
    embeds: [createErrorEmbed('Canal no configurado', 'No hay canal de logs configurado. Usa /eco set-channel')],
    flags: MessageFlags.Ephemeral,
  });
  return null;
};

// ─── Unified public embed builder ────────────────────────────────────────────

const COLOR = {
  add: '#00C851',
  remove: '#FF4444',
  reset: '#FF8800',
  info: '#4A90D9',
};

/**
 * Builds the standardised economy embed.
 * @param {object} opts
 * @param {'add'|'remove'|'reset'|'info'} opts.type
 * @param {string} opts.action         - Human-readable action label
 * @param {string} opts.userMention
 * @param {string|null} [opts.amountDisplay]
 * @param {number|null} [opts.previousBalance]
 * @param {number|null} [opts.newBalance]
 * @param {string|null} [opts.balanceDisplay]   - For plain balance query
 * @param {string|null} [opts.rankingText]       - For leaderboard
 * @param {string} opts.executorMention
 * @param {string} opts.sourceChannelMention
 * @param {string} [opts.description]
 */
const buildEmbed = (opts) => {
  const embed = new EmbedBuilder()
    .setTitle('Sistema de Economia')
    .setColor(COLOR[opts.type] || COLOR.info)
    .setTimestamp();

  // ranking goes in description, everything else uses fields
  if (opts.rankingText) {
    embed.setDescription(opts.rankingText);
  }

  const fields = [];

  fields.push({ name: 'Accion', value: opts.action, inline: true });
  fields.push({ name: 'Usuario', value: opts.userMention, inline: true });
  fields.push({ name: '\u200B', value: '\u200B', inline: true });

  if (opts.amountDisplay) {
    fields.push({ name: 'Cantidad', value: opts.amountDisplay, inline: true });
  }

  if (opts.previousBalance !== null && opts.previousBalance !== undefined) {
    fields.push({ name: 'Balance Anterior', value: formatMoney(opts.previousBalance), inline: true });
  }

  if (opts.newBalance !== null && opts.newBalance !== undefined) {
    fields.push({ name: 'Balance Nuevo', value: formatMoney(opts.newBalance), inline: true });
  }

  if (opts.balanceDisplay) {
    fields.push({ name: 'Balance', value: opts.balanceDisplay, inline: true });
  }

  // Debt indicator: use rawBalance (numeric) when provided
  const debtValue = opts.rawBalance !== undefined ? opts.rawBalance : opts.newBalance;
  if (typeof debtValue === 'number' && debtValue < 0) {
    fields.push({ name: 'Estado', value: '🔴 En deuda', inline: true });
  }

  fields.push({ name: 'Ejecutado por', value: opts.executorMention, inline: true });
  fields.push({ name: 'Canal origen', value: opts.sourceChannelMention, inline: true });

  if (opts.description) {
    fields.push({ name: 'Descripcion', value: opts.description, inline: false });
  }

  embed.addFields(fields);
  return embed;
};

/**
 * Sends the unified public embed to the configured log channel.
 * Never throws — failure must not block the command response.
 */
const sendPublic = async (guild, channelId, embed) => {
  try {
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;
    await channel.send({ embeds: [embed] });
  } catch (_) {}
};

/**
 * Sends a minimal ephemeral ACK to the executor pointing to the log channel.
 */
const ackEphemeral = async (interaction, logChannelId) => {
  await safeReply(interaction, {
    embeds: [createSuccessEmbed('Accion registrada', `Resultado publicado en <#${logChannelId}>`)],
    flags: MessageFlags.Ephemeral,
  });
};

// ─── Command definition ───────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('eco')
    .setDescription('Comandos de economia del servidor')

    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Suma dinero a un usuario')
        .addUserOption((o) => o.setName('usuario').setDescription('Usuario a acreditar').setRequired(true))
        .addIntegerOption((o) => o.setName('cantidad').setDescription('Cantidad a sumar').setRequired(true).setMinValue(1))
        .addStringOption((o) => o.setName('descripcion').setDescription('Descripcion opcional').setRequired(false)),
    )

    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Resta dinero a un usuario')
        .addUserOption((o) => o.setName('usuario').setDescription('Usuario a debitar').setRequired(true))
        .addIntegerOption((o) => o.setName('cantidad').setDescription('Cantidad a restar').setRequired(true).setMinValue(1))
        .addStringOption((o) => o.setName('descripcion').setDescription('Descripcion opcional').setRequired(false)),
    )

    .addSubcommand((sub) =>
      sub
        .setName('reset')
        .setDescription('Resetea el balance de un usuario a 0 (requiere confirmacion)')
        .addUserOption((o) => o.setName('usuario').setDescription('Usuario a resetear').setRequired(true))
        .addBooleanOption((o) =>
          o.setName('confirmar').setDescription('Escribe true para confirmar').setRequired(true),
        ),
    )

    .addSubcommand((sub) =>
      sub
        .setName('balance')
        .setDescription('Consulta el balance de un usuario')
        .addUserOption((o) => o.setName('usuario').setDescription('Usuario a consultar').setRequired(false)),
    )

    .addSubcommand((sub) =>
      sub
        .setName('leaderboard')
        .setDescription('Muestra el ranking de balances del servidor')
        .addIntegerOption((o) =>
          o
            .setName('limite')
            .setDescription('Cantidad de usuarios a mostrar (1-100, por defecto 10)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(100),
        ),
    )

    .addSubcommand((sub) =>
      sub
        .setName('debt')
        .setDescription('Muestra los usuarios con balance negativo (en deuda)')
        .addIntegerOption((o) =>
          o
            .setName('limite')
            .setDescription('Cantidad de usuarios a mostrar (1-100, por defecto 10)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(100),
        ),
    )

    .addSubcommand((sub) =>
      sub
        .setName('set-channel')
        .setDescription('Configura el canal de economia (solo administradores)')
        .addChannelOption((o) =>
          o.setName('canal').setDescription('Canal de texto para publicar los logs').setRequired(true),
        ),
    )

    .addSubcommandGroup((group) =>
      group
        .setName('roles')
        .setDescription('Gestiona roles autorizados de economia')
        .addSubcommand((sub) =>
          sub
            .setName('add')
            .setDescription('Agrega un rol autorizado')
            .addRoleOption((o) => o.setName('rol').setDescription('Rol a autorizar').setRequired(true)),
        )
        .addSubcommand((sub) =>
          sub
            .setName('remove')
            .setDescription('Quita un rol autorizado')
            .addRoleOption((o) => o.setName('rol').setDescription('Rol a remover').setRequired(true)),
        )
        .addSubcommand((sub) =>
          sub.setName('reset').setDescription('Elimina todos los roles autorizados'),
        ),
    ),

  // ─── Handler ─────────────────────────────────────────────────────────────────

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const group = interaction.options.getSubcommandGroup(false);
      const subcommand = interaction.options.getSubcommand(true);
      const guildId = interaction.guild.id;

      // ── set-channel (admin, ephemeral) ────────────────────────────────────
      if (subcommand === 'set-channel') {
        if (!canManageEconomyRoles(interaction.member)) {
          await safeReply(interaction, {
            embeds: [createErrorEmbed('Acceso denegado', 'Solo los administradores pueden configurar el canal.')],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        const channel = interaction.options.getChannel('canal', true);
        if (!channel.isTextBased()) {
          await safeReply(interaction, {
            embeds: [createErrorEmbed('Canal invalido', 'El canal seleccionado debe ser un canal de texto.')],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        await setLogChannel({ guildId, channelId: channel.id, setBy: interaction.user.id });
        await safeReply(interaction, {
          embeds: [createSuccessEmbed('Canal configurado', `Los mensajes de economia se publicaran en ${channel}.`)],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // ── roles group (admin, ephemeral) ────────────────────────────────────
      if (group === 'roles') {
        if (!canManageEconomyRoles(interaction.member)) {
          await safeReply(interaction, {
            embeds: [createErrorEmbed('Acceso denegado', 'Solo los administradores pueden gestionar roles.')],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        if (subcommand === 'add') {
          const role = interaction.options.getRole('rol', true);
          await addEconomyRole({ guildId, roleId: role.id, roleName: role.name, addedBy: interaction.user.id });
          await safeReply(interaction, {
            embeds: [createSuccessEmbed('Rol agregado', `El rol ${role} ahora esta autorizado.`)],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        if (subcommand === 'remove') {
          const role = interaction.options.getRole('rol', true);
          await removeEconomyRole({ guildId, roleId: role.id });
          await safeReply(interaction, {
            embeds: [createSuccessEmbed('Rol removido', `El rol ${role} fue removido.`)],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        if (subcommand === 'reset') {
          const result = await resetEconomyRoles({ guildId });
          await safeReply(interaction, {
            embeds: [createSuccessEmbed('Roles reseteados', `Se eliminaron ${result.deletedCount || 0} roles autorizados.`)],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
      }

      // ── balance (open: self always, others require DB role) ───────────────
      if (subcommand === 'balance') {
        const sourceChannelMention = interaction.channel ? `<#${interaction.channel.id}>` : 'Desconocido';
        const executorMention = `${interaction.user}`;
        const targetUser = interaction.options.getUser('usuario') || interaction.user;

        if (targetUser.id !== interaction.user.id) {
          const hasRole = await hasConfiguredEconomyRole(interaction.member, guildId);
          if (!hasRole) {
            await safeReply(interaction, {
              embeds: [createErrorEmbed('Acceso denegado', '❌ No tienes permisos para ver el balance de otros usuarios.')],
              flags: MessageFlags.Ephemeral,
            });
            return;
          }
        }

        const balance = await getBalance(guildId, targetUser.id);
        const embed = buildEmbed({
          type: 'info',
          action: 'Consulta de Balance',
          userMention: `${targetUser}`,
          balanceDisplay: formatMoney(balance),
          rawBalance: balance,
          executorMention,
          sourceChannelMention,
        });

        if (interaction.channel?.isTextBased()) await interaction.channel.send({ embeds: [embed] });
        await safeReply(interaction, {
          embeds: [createSuccessEmbed('Balance consultado', 'El resultado fue enviado en este canal.')],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // ── All transactional commands: require permission ────────────────────
      const hasPermission = await checkEconomyPermission(interaction);
      if (!hasPermission) return;

      const sourceChannelMention = interaction.channel ? `<#${interaction.channel.id}>` : 'Desconocido';
      const executorMention = `${interaction.user}`;

      // ── leaderboard (informativo, se envía en el canal actual) ───────────
      if (subcommand === 'leaderboard') {
        const limite = interaction.options.getInteger('limite') || 10;
        const entries = await getLeaderboard(guildId, limite);

        let rankingText;
        if (entries.length === 0) {
          rankingText = 'No hay balances registrados en este servidor.';
        } else {
          const userIds = entries.map((e) => e.userId);
          const memberMap = new Map();
          try {
            const fetched = await interaction.guild.members.fetch({ user: userIds });
            fetched.forEach((member) => memberMap.set(member.id, member.displayName));
          } catch (_) {}

          rankingText = entries
            .map((entry, i) => {
              const name = memberMap.get(entry.userId) || `<@${entry.userId}>`;
              return `**#${i + 1}** ${name} — ${formatMoney(entry.balance)}`;
            })
            .join('\n');
        }

        const embed = buildEmbed({
          type: 'info',
          action: `Leaderboard (Top ${entries.length})`,
          userMention: executorMention,
          rankingText,
          executorMention,
          sourceChannelMention,
        });

        if (interaction.channel?.isTextBased()) await interaction.channel.send({ embeds: [embed] });
        await safeReply(interaction, {
          embeds: [createSuccessEmbed('Resultado enviado', 'El ranking fue enviado en este canal.')],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // ── debt (informativo, se envía en el canal actual) ──────────────────
      if (subcommand === 'debt') {
        const limite = interaction.options.getInteger('limite') || 10;
        const entries = await getDebtors(guildId, limite);

        let embed;
        if (entries.length === 0) {
          embed = new EmbedBuilder()
            .setTitle('Sin deudas')
            .setDescription('No hay usuarios con balance negativo.')
            .setColor('#00C851')
            .setFooter({ text: 'Sistema de Economia' })
            .setTimestamp();
        } else {
          const userIds = entries.map((e) => e.userId);
          const memberMap = new Map();
          try {
            const fetched = await interaction.guild.members.fetch({ user: userIds });
            fetched.forEach((member) => memberMap.set(member.id, member.displayName));
          } catch (_) {}

          const lines = entries.map((entry, i) => {
            const name = memberMap.get(entry.userId) || `<@${entry.userId}>`;
            return `**#${i + 1}** ${name} — ${formatMoney(entry.balance)}`;
          });

          const totalDebt = entries.reduce((sum, e) => sum + e.balance, 0);

          embed = new EmbedBuilder()
            .setTitle('Usuarios en Deuda')
            .setDescription(lines.join('\n'))
            .setColor('#FF4444')
            .addFields(
              { name: 'Total usuarios en deuda', value: String(entries.length), inline: true },
              { name: 'Deuda total acumulada', value: formatMoney(totalDebt), inline: true },
              { name: 'Ejecutado por', value: executorMention, inline: true },
            )
            .setFooter({ text: 'Sistema de Economia' })
            .setTimestamp();
        }

        if (interaction.channel?.isTextBased()) await interaction.channel.send({ embeds: [embed] });
        await safeReply(interaction, {
          embeds: [createSuccessEmbed('Resultado enviado', 'La lista de deudas fue enviada en este canal.')],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // ── Action commands (add/remove/reset): require log channel ──────────
      const logChannelId = await checkLogChannel(interaction);
      if (!logChannelId) return;

      // ── add ───────────────────────────────────────────────────────────────
      if (subcommand === 'add') {
        const user = interaction.options.getUser('usuario', true);
        const amount = interaction.options.getInteger('cantidad', true);
        const description = interaction.options.getString('descripcion') || '';

        const { previousBalance, newBalance } = await addMoney({
          guildId,
          userId: user.id,
          executorId: interaction.user.id,
          amount,
          description,
        });

        const embed = buildEmbed({
          type: 'add',
          action: 'Agregar',
          userMention: `${user}`,
          amountDisplay: `+${formatMoney(amount)}`,
          previousBalance,
          newBalance,
          executorMention,
          sourceChannelMention,
          description: description || null,
        });

        await sendPublic(interaction.guild, logChannelId, embed);
        await ackEphemeral(interaction, logChannelId);
        return;
      }

      // ── remove ────────────────────────────────────────────────────────────
      if (subcommand === 'remove') {
        const user = interaction.options.getUser('usuario', true);
        const amount = interaction.options.getInteger('cantidad', true);
        const description = interaction.options.getString('descripcion') || '';

        const { previousBalance, newBalance } = await removeMoney({
          guildId,
          userId: user.id,
          executorId: interaction.user.id,
          amount,
          description,
        });

        const embed = buildEmbed({
          type: 'remove',
          action: 'Quitar',
          userMention: `${user}`,
          amountDisplay: `-${formatMoney(amount)}`,
          previousBalance,
          newBalance,
          executorMention,
          sourceChannelMention,
          description: description || null,
        });

        await sendPublic(interaction.guild, logChannelId, embed);
        await ackEphemeral(interaction, logChannelId);
        return;
      }

      // ── reset ─────────────────────────────────────────────────────────────
      if (subcommand === 'reset') {
        const confirmed = interaction.options.getBoolean('confirmar', true);
        if (!confirmed) {
          await safeReply(interaction, {
            embeds: [createErrorEmbed('Confirmacion requerida', 'Debes confirmar la accion para resetear el balance')],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const user = interaction.options.getUser('usuario', true);

        const targetMember = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (targetMember && canManageEconomyRoles(targetMember)) {
          await safeReply(interaction, {
            embeds: [createErrorEmbed('Accion bloqueada', 'No se puede resetear el balance de un administrador.')],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const { previousBalance } = await resetBalance({
          guildId,
          userId: user.id,
          executorId: interaction.user.id,
        });

        const embed = buildEmbed({
          type: 'reset',
          action: 'Reset',
          userMention: `${user}`,
          amountDisplay: `${formatMoney(previousBalance)} → 0`,
          previousBalance,
          newBalance: 0,
          executorMention,
          sourceChannelMention,
        });

        await sendPublic(interaction.guild, logChannelId, embed);
        await ackEphemeral(interaction, logChannelId);
        return;
      }
    } catch (error) {
      await safeReply(interaction, {
        embeds: [createErrorEmbed('Error en economia', error.message || 'Ocurrio un error inesperado.')],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
