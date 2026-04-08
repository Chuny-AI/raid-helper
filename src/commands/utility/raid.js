const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { createEmbed, embedsMap, createMassNotificationEmbed, updateParticipantsCounter, safeFieldValue } = require("../../utils/embed");
const { parseUTCTime, parseMinutes } = require("../../utils/time");
const { isValidHex } = require("../../utils/regex");
const { createSelect, createDisableWeaponsConfig } = require("../../utils/select");
const { getTemplateNames, getTemplateByName } = require("../../services/templateService");
const { getOrCreateServer } = require("../../services/serverService");
const { createErrorEmbed, createWarningEmbed, safeReply } = require("../../utils/errorEmbeds");
const { checkAuthorizedRole } = require('../../middleware/roleCheck');
const { safeDeferUpdate } = require('../../utils/interaction');
const { createRaidEvent, getRaidEvent, updateRaidEvent, closeRaidEvent, syncEmbedSnapshot } = require('../../services/raidEventService');

/**
 * Almacena temporalmente los parámetros de raid pendiente de publicación.
 * key: originalInteractionId, value: { ...raidParams, disabledWeapons: [] }
 * Se limpian automáticamente a los 15 minutos (expiración del token de Discord).
 */
const pendingRaids = new Map();

/** Persiste snapshot del embed en BD de forma no bloqueante. */
function persistRaidStateKick(raidId, embed) {
  setImmediate(async () => {
    try { await syncEmbedSnapshot(raidId, embed.data); } catch (e) {
      console.error('[WARN] kick: persistRaidState error:', e);
    }
  });
}

/** Garantiza que ningún campo del embed supere 1024 chars. */
function sanitizeEmbedFields(embed) {
  if (!embed?.data?.fields) return;
  embed.data.fields.forEach(f => {
    if (typeof f.value === 'string' && f.value.length > 1024) f.value = safeFieldValue(f.value);
  });
}

/**
 * Elimina a un usuario del embed de un raid y decrementa los contadores afectados.
 * Devuelve { wasInSlot, freedGroup } donde freedGroup es el nombre del grupo liberado.
 * @param {Object} embed - EmbedBuilder con data.fields
 * @param {string} userMention - Mención del usuario (ej: "<@123456789>")
 * @returns {{ wasInSlot: boolean, freedGroup: string|null }}
 */
function kickUserFromEmbed(embed, userMention) {
  let wasInSlot = false;
  let freedGroup = null;
  const escapedMention = userMention.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  embed.data.fields.forEach((field) => {
    if (typeof field.value !== 'string' || !field.value.includes(userMention)) return;

    // Lista de espera / No puedo ir — solo eliminar la línea, sin tocar contadores
    if (field.name === '🕒 Lista de espera' || field.name === '🚫 No puedo ir') {
      const lines = field.value.split('\n').filter(l => !l.includes(userMention));
      field.value = lines.length > 0 ? lines.join('\n') : '\u200b';
      return;
    }

    // Campo Looters
    if (field.name.startsWith('👑 Looters')) {
      const lines = field.value.split('\n').filter(l => !l.includes(userMention));
      field.value = lines.join('\n') || '\u200b';
      const m = field.name.match(/(\d+)\/(\d+)/);
      if (m) {
        const cur = parseInt(m[1]);
        if (cur > 0) field.name = field.name.replace(/(\d+)\/(\d+)/, `${cur - 1}/${m[2]}`);
      }
      wasInSlot = true;
      freedGroup = 'looters';
      return;
    }

    // Campos de grupos de armas — soporta primera línea sin \n previo
    const weaponLineRegex = new RegExp(`(^|\\n)<:[^:]+:[0-9]+>[^\\n]*${escapedMention}`, 'gm');
    const before = field.value;
    field.value = field.value.replace(weaponLineRegex, (match, prefix) => prefix === '\n' ? '' : '');
    field.value = field.value.replace(/^\n+/, '');
    if (field.value.trim() === '') field.value = '\u200b';

    if (before !== field.value) {
      const unitMatch = field.name.match(/<:[\w]+:[\w]+>\s+.+?\s+\((\d+)\/(\d+)\):/);
      if (unitMatch) {
        const cur = parseInt(unitMatch[1]);
        const total = unitMatch[2];
        const newCount = Math.max(0, cur - 1);
        field.name = field.name.replace(/(\d+)\/(\d+)/, `${newCount}/${total}`);
        wasInSlot = true;
        const groupMatch = field.name.match(/<:[^:]+:[0-9]+>\s+(.+?)\s+\(/);
        if (groupMatch) freedGroup = groupMatch[1];
      }
    }
  });

  return { wasInSlot, freedGroup };
}

/**
 * Manejador del subcomando /raid kick
 */
async function executeKickSubcommand(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const raidId = interaction.options.getString('raid_id').toUpperCase().trim();
  const targetUser = interaction.options.getUser('usuario');

  // 1. Buscar el embed activo en memoria
  let targetEmbedEntry = null;
  let targetTemplateName = null;
  for (const [tmplName, entries] of Object.entries(embedsMap)) {
    const found = entries.find(e => e.raidId === raidId);
    if (found) {
      targetEmbedEntry = found;
      targetTemplateName = tmplName;
      break;
    }
  }

  if (!targetEmbedEntry) {
    return interaction.editReply({
      content: `No se encontró ningún raid activo con el ID **${raidId}**. Verifica el ID en el footer del embed del raid.`,
    });
  }

  const embed = targetEmbedEntry.embed;

  // 2. Verificar permisos: solo el líder del raid (o admin) puede expulsar
  const leaderField = embed.data.fields.find(f => f.name === 'Líder de la actividad:');
  const isLeader = leaderField && leaderField.value.includes(interaction.user.toString());
  const isAdmin = interaction.member.permissions.has('Administrator');

  if (!isLeader && !isAdmin) {
    return interaction.editReply({
      content: 'Solo el líder del raid puede expulsar participantes.',
    });
  }

  const userMention = targetUser.toString();

  // 3. Verificar que el usuario está en CUALQUIER sección del raid (grupo, waitlist o cannotgo)
  const isInRaid = embed.data.fields.some(f =>
    typeof f.value === 'string' && f.value.includes(userMention)
  );

  if (!isInRaid) {
    return interaction.editReply({
      content: `**${targetUser.username}** no está en este raid.`,
    });
  }

  // 4a. Capturar el arma individual del usuario ANTES de eliminarlo (para auto-promoción exacta)
  let freedIndividualWeapon = null;
  let freedGroupFieldRef = null;
  for (const field of embed.data.fields) {
    if (!/\(\d+\/\d+\):/.test(field.name) || field.name.startsWith('👑')) continue;
    if (!field.value?.includes(userMention)) continue;
    for (const line of (field.value || '').split('\n')) {
      if (!line.includes(userMention)) continue;
      const wm = line.match(/<:[^:]+:[0-9]+>\s+(.+?)\s+<@/);
      if (wm) {
        freedIndividualWeapon = wm[1].trim();
        freedGroupFieldRef = field;
        break;
      }
    }
    if (freedIndividualWeapon) break;
  }

  // 4b. Eliminar usuario del embed (funciona para grupos, waitlist, cannotgo y looters)
  const { wasInSlot, freedGroup } = kickUserFromEmbed(embed, userMention);

  // 5. Actualizar contador de participantes
  try {
    updateParticipantsCounter(embed);
  } catch (e) {
    console.error('[WARN] kick: No se pudo actualizar el contador:', e);
  }

  // 6. Promover primer usuario de la waitlist que espera exactamente el arma liberada
  let promotedUserId = null;
  let promotedMention = null;
  const searchWeapon = freedIndividualWeapon || freedGroup;
  if (wasInSlot && searchWeapon && searchWeapon !== 'looters') {
    const waitlistField = embed.data.fields.find(f => f.name === '🕒 Lista de espera');
    if (waitlistField && waitlistField.value && waitlistField.value !== '\u200b') {
      const waitlistWeapons = targetEmbedEntry.waitlistWeapons || {};
      const lines = waitlistField.value.split('\n').filter(l => l.trim());

      // Buscar el primer candidato que espera exactamente este arma/grupo
      // Soporte doble: nuevo formato (línea contiene el nombre) + legacy (in-memory map)
      const seen = new Set();
      let promotedEntry = null;
      for (const line of lines) {
        const uidMatch = line.match(/<@!?(\d+)>/);
        if (!uidMatch) continue;
        const uid = uidMatch[1];
        if (seen.has(uid)) continue;
        seen.add(uid);

        const prefs = waitlistWeapons[uid];
        const matchesNewFormat = freedIndividualWeapon && line.includes(freedIndividualWeapon);
        const matchesLegacy = prefs?.weapons?.includes(searchWeapon);

        if (matchesNewFormat || matchesLegacy) {
          const emojiMatch = matchesNewFormat ? line.match(/^(<:[^:]+:[0-9]+>)/) : null;
          promotedEntry = { uid, emoji: emojiMatch ? emojiMatch[1] : '' };
          break;
        }
      }

      if (promotedEntry) {
        promotedUserId = promotedEntry.uid;
        promotedMention = `<@${promotedUserId}>`;

        // Eliminar TODAS las líneas del usuario promovido de la waitlist
        const newLines = lines.filter(l => !l.includes(promotedMention));
        waitlistField.value = newLines.length > 0 ? newLines.join('\n') : '\u200b';

        // Limpiar preferencias en memoria
        if (targetEmbedEntry.waitlistWeapons) {
          delete targetEmbedEntry.waitlistWeapons[promotedUserId];
        }

        // Añadir al grupo con formato correcto: <emoji> NombreArma @user (o solo @user si no hay emoji)
        const targetGroupField = freedGroupFieldRef || embed.data.fields.find(f =>
          typeof f.name === 'string' && f.name.includes(freedGroup || '') && /\(\d+\/\d+\):/.test(f.name)
        );
        if (targetGroupField) {
          const counterMatch = targetGroupField.name.match(/\((\d+)\/(\d+)\):/);
          if (counterMatch) {
            const cur = parseInt(counterMatch[1]);
            const max = parseInt(counterMatch[2]);
            if (cur < max) {
              const formattedEntry = promotedEntry.emoji && freedIndividualWeapon
                ? `${promotedEntry.emoji} ${freedIndividualWeapon} ${promotedMention}`
                : promotedMention;
              const currentVal = (targetGroupField.value === '\u200b' || targetGroupField.value.trim() === '')
                ? '' : targetGroupField.value;
              targetGroupField.value = currentVal ? `${currentVal}\n${formattedEntry}` : formattedEntry;
              targetGroupField.name = targetGroupField.name.replace(/(\d+)\/(\d+)/, `${cur + 1}/${max}`);
            }
          }
        }
      }
    }
  }

  // 7. Protección anti-overflow + actualizar embed en Discord
  sanitizeEmbedFields(embed);

  try {
    const raidEvent = await getRaidEvent(raidId);
    if (raidEvent) {
      const channel = await interaction.guild.channels.fetch(raidEvent.channelId);
      if (channel) {
        const message = await channel.messages.fetch(raidEvent.messageId);
        if (message) await message.edit({ embeds: [embed] });
      }
    }
  } catch (msgErr) {
    console.error('[ERROR] kick: No se pudo actualizar el mensaje del raid:', msgErr);
  }

  // Persistir en BD
  persistRaidStateKick(raidId, embed);

  // 8. Confirmar al ejecutor
  const promotedNote = promotedUserId ? ` ${promotedMention} ha sido promovido desde la lista de espera.` : '';
  await interaction.editReply({
    content: `✅ **${targetUser.username}** ha sido expulsado del raid **#${raidId}**.${promotedNote}`,
  });

  // 9. DMs y notificación al líder (no bloqueantes)
  setImmediate(async () => {
    try {
      await targetUser.send({ content: 'Has sido removido del raid por el líder.' });
    } catch (e) {
      console.log(`[INFO] kick: No se pudo enviar DM al expulsado: ${e.message}`);
    }

    if (promotedUserId) {
      try {
        const promotedMember = await interaction.guild.members.fetch(promotedUserId);
        await promotedMember.send({
          content: `✅ Se liberó un espacio en el raid y has sido movido automáticamente desde la lista de espera al arma **${freedIndividualWeapon || freedGroup}**. ¡Buena suerte!`,
        });
      } catch (e) {
        console.log(`[INFO] kick: No se pudo enviar DM al promovido: ${e.message}`);
      }

      // Notificar al líder sobre la promoción automática
      try {
        const leaderField = embed.data.fields.find(f => f.name === 'Líder de la actividad:');
        if (leaderField) {
          const leaderId = leaderField.value.replace(/<@!?(\d+)>/, '$1');
          const leader = await interaction.guild.members.fetch(leaderId);
          await leader.send({
            content: `✅ Un usuario fue movido automáticamente desde la lista de espera al slot de **${freedIndividualWeapon || freedGroup}** (liberado por el kick de **${targetUser.username}**).`,
          });
        }
      } catch (e) {
        console.log(`[INFO] kick: No se pudo enviar DM de notificación al líder: ${e.message}`);
      }
    } else if (wasInSlot) {
      // Notificar al líder que se liberó un slot pero no había nadie en waitlist
      try {
        const leaderField = embed.data.fields.find(f => f.name === 'Líder de la actividad:');
        if (leaderField) {
          const leaderId = leaderField.value.replace(/<@!?(\d+)>/, '$1');
          const leader = await interaction.guild.members.fetch(leaderId);
          await leader.send({
            content: `⚠️ **${targetUser.username}** ha sido expulsado del raid **#${raidId}** y se ha liberado un slot en **${freedIndividualWeapon || freedGroup || 'un grupo'}**.`,
          });
        }
      } catch (e) {
        console.log(`[INFO] kick: No se pudo enviar DM de notificación al líder: ${e.message}`);
      }
    }
  });
}

/**
 * Genera un ID corto único para identificar un raid (6 caracteres alfanuméricos).
 * Excluye O, I, 0, 1 para mejor legibilidad.
 */
function generateRaidId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

/**
 * Manejador del subcomando /raid edit
 */
async function executeEditSubcommand(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const raidId = interaction.options.getString('raid_id').toUpperCase().trim();
  const newTime = interaction.options.getString('time');
  const newDescription = interaction.options.getString('description');
  const newColor = interaction.options.getString('color');
  const newTitle = interaction.options.getString('title');

  // Buscar en embedsMap
  let targetEmbedEntry = null;
  for (const [, entries] of Object.entries(embedsMap)) {
    const found = entries.find(e => e.raidId === raidId);
    if (found) { targetEmbedEntry = found; break; }
  }

  if (!targetEmbedEntry) {
    return interaction.editReply({
      content: `No se encontró ningún raid activo con el ID **${raidId}**.`,
    });
  }

  // Verificar permisos
  const embed = targetEmbedEntry.embed;
  const leaderField = embed.data.fields.find(f => f.name === 'Líder de la actividad:');
  const isLeader = leaderField && leaderField.value.includes(interaction.user.toString());
  const isAdmin = interaction.member.permissions.has('Administrator');
  if (!isLeader && !isAdmin) {
    return interaction.editReply({ content: 'Solo el líder del raid puede editarlo.' });
  }

  if (newColor && !isValidHex(newColor)) {
    return interaction.editReply({ content: 'Color inválido. Usa formato hexadecimal: `#FFFFFF`' });
  }

  const dbUpdates = {};

  // Aplicar cambios al embed en memoria
  if (newTitle) {
    embed.setTitle(newTitle);
    dbUpdates.title = newTitle;
  }
  if (newDescription) {
    embed.setDescription(newDescription);
    dbUpdates.description = newDescription;
  }
  if (newColor) {
    embed.setColor(newColor);
    dbUpdates.color = newColor;
  }
  if (newTime) {
    let eventTimestamp;
    try {
      eventTimestamp = parseUTCTime(newTime);
    } catch (e) {
      return interaction.editReply({ content: `Hora inválida: ${e.message}` });
    }
    // Actualizar el campo de hora en el embed
    const timeFieldIdx = embed.data.fields?.findIndex(f => f.name === 'Hora de la actividad:');
    if (timeFieldIdx !== undefined && timeFieldIdx >= 0) {
      embed.data.fields[timeFieldIdx].value = `<t:${eventTimestamp}:F> (<t:${eventTimestamp}:R>)`;
    }
    dbUpdates.time = newTime;
  }

  // Actualizar el mensaje de Discord (sin recrearlo)
  try {
    const raidEvent = await getRaidEvent(raidId);
    if (raidEvent) {
      const channel = await interaction.guild.channels.fetch(raidEvent.channelId);
      if (channel) {
        const message = await channel.messages.fetch(raidEvent.messageId);
        if (message) await message.edit({ embeds: [embed] });
      }
    }
  } catch (e) {
    console.error('[ERROR] edit: No se pudo actualizar el mensaje:', e);
    return interaction.editReply({ content: 'No se pudo actualizar el mensaje del raid.' });
  }

  // Persistir en BD
  if (Object.keys(dbUpdates).length > 0) {
    setImmediate(async () => {
      try {
        await updateRaidEvent(raidId, dbUpdates);
        await syncEmbedSnapshot(raidId, embed.data);
      } catch (e) {
        console.error('[WARN] edit: Error persistiendo cambios:', e);
      }
    });
  }

  await interaction.editReply({ content: `✅ Raid **#${raidId}** actualizado correctamente.` });
}

/**
 * Manejador del subcomando /raid close
 */
async function executeCloseSubcommand(interaction) {  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const raidId = interaction.options.getString('raid_id').toUpperCase().trim();

  let targetEmbedEntry = null;
  let targetTemplateName = null;
  for (const [tmplName, entries] of Object.entries(embedsMap)) {
    const found = entries.find(e => e.raidId === raidId);
    if (found) { targetEmbedEntry = found; targetTemplateName = tmplName; break; }
  }

  if (!targetEmbedEntry) {
    return interaction.editReply({ content: `No se encontró ningún raid activo con ID **${raidId}**.` });
  }

  const embed = targetEmbedEntry.embed;
  const leaderField = embed.data.fields.find(f => f.name === 'Líder de la actividad:');
  const isLeader = leaderField && leaderField.value.includes(interaction.user.toString());
  const isAdmin = interaction.member.permissions.has('Administrator');
  if (!isLeader && !isAdmin) {
    return interaction.editReply({ content: 'Solo el líder del raid puede cerrarlo.' });
  }

  // Remover de embedsMap
  if (targetTemplateName && embedsMap[targetTemplateName]) {
    embedsMap[targetTemplateName] = embedsMap[targetTemplateName].filter(e => e.raidId !== raidId);
  }

  // Cerrar en BD
  setImmediate(async () => {
    try { await closeRaidEvent(raidId); } catch (e) {
      console.error('[WARN] close: Error cerrando raid:', e);
    }
  });

  await interaction.editReply({ content: `✅ Raid **#${raidId}** cerrado y removido correctamente.` });
}

/**
 * Manejador del select de configuración de armas (deshabilitar armas al crear raid).
 * Se ejecuta cuando el líder selecciona armas a deshabilitar antes de publicar.
 * @param {import('discord.js').StringSelectMenuInteraction} interaction
 */
async function handleWeaponsConfigSelect(interaction) {
  const originalId = interaction.customId.substring('raid_config_weapons-'.length);
  const pending = pendingRaids.get(originalId);
  if (!pending) {
    try { await interaction.reply({ content: 'Esta sesión ha expirado. Ejecuta `/raid create` nuevamente.', flags: MessageFlags.Ephemeral }); } catch { /* ignored */ }
    return;
  }

  // Guardar armas deshabilitadas
  pending.disabledWeapons = interaction.values || [];

  // Actualizar el mensaje ephemeral con la lista de lo que se deshabilitará
  const disabledList = pending.disabledWeapons.length > 0
    ? pending.disabledWeapons.map(v => `\`${v}\``).join(', ')
    : 'ninguna (todas habilitadas)';

  try {
    await safeDeferUpdate(interaction);
    await interaction.editReply({
      content: `⚙️ **Configuración guardada.**\nArmas a deshabilitar: ${disabledList}\n\nPresiona **Confirmar y publicar raid** cuando estés listo.`,
    });
  } catch (e) {
    console.error('[WARN] handleWeaponsConfigSelect: Error actualizando respuesta:', e);
  }
}

/**
 * Manejador del botón de confirmar y publicar raid.
 * Lee los parámetros pendientes y publica el raid con las armas configuradas.
 * @param {import('discord.js').ButtonInteraction} interaction
 */
async function handleConfirmRaidCreate(interaction) {
  const originalId = interaction.customId.substring('raid_confirm_create-'.length);
  const pending = pendingRaids.get(originalId);

  if (!pending) {
    await interaction.update({
      content: '⏰ Esta sesión de creación ha expirado (15 min). Ejecuta `/raid create` nuevamente.',
      components: [],
    });
    return;
  }

  // Marcar como procesado para evitar dobles publicaciones
  pendingRaids.delete(originalId);

  const {
    templateName, template, eventTimestamp, title, color, image, description,
    finalReminder, finalNotificationRoles, looters, guildId, user, disabledWeapons,
  } = pending;

  const raidId = generateRaidId();
  const disabledWeaponValues = disabledWeapons || [];

  // Construir embed con armas habilitadas
  const embed = createEmbed({
    title,
    eventTimestamp,
    template,
    color,
    image,
    description,
    user,
    finalRoles: finalNotificationRoles,
    looters,
    raidId,
    disabledWeapons: disabledWeaponValues,
  });

  // Construir select de armas con filtrado aplicado
  const row = createSelect(template, templateName, { id: originalId }, disabledWeaponValues);

  // Construir botones de participación
  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
  const extraRowComponents = [
    new ButtonBuilder()
      .setCustomId(`raid_waitlist-${templateName}-${originalId}`)
      .setLabel('Lista de espera')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🕒'),
    new ButtonBuilder()
      .setCustomId(`raid_cannotgo-${templateName}-${originalId}`)
      .setLabel('No puedo ir')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🚫'),
  ];
  if (looters) {
    extraRowComponents.push(
      new ButtonBuilder()
        .setCustomId(`raid_looter-${templateName}-${originalId}`)
        .setLabel('Looters')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('👑')
    );
  }
  const extraRow = new ActionRowBuilder().addComponents(extraRowComponents);

  // Registrar en embedsMap ANTES de publicar para que botones puedan buscarlo
  if (!embedsMap[templateName]) embedsMap[templateName] = [];
  embedsMap[templateName].push({
    id: originalId,
    raidId,
    embed,
    fullNotificationSent: false,
    disabledWeapons: disabledWeaponValues,
    waitlistWeapons: {},
  });

  // Configurar recordatorio si aplica
  if (finalReminder) {
    try {
      const { createReminder, addInterestedUser } = require('../../utils/reminderManager');
      const activityTitle = title || template.title;
      createReminder(
        originalId,
        finalReminder,
        eventTimestamp * 1000,
        templateName,
        interaction.channel?.id,
        guildId,
        activityTitle,
        []
      );
      addInterestedUser(originalId, user.id);
    } catch (reminderError) {
      console.error('[ERROR] handleConfirmRaidCreate: Error configurando recordatorio:', reminderError);
    }
  }

  // Publicar el raid en el canal
  let raidMessage;
  let notificationContent = '';
  if (finalNotificationRoles.length > 0) {
    notificationContent = finalNotificationRoles.map(id => `<@&${id}>`).join(' ') + '\n';
  }

  try {
    raidMessage = await interaction.channel.send({
      content: notificationContent || undefined,
      embeds: [embed],
      components: [row, extraRow],
      allowedMentions: finalNotificationRoles.length > 0 ? { roles: finalNotificationRoles } : undefined,
    });
  } catch (publishError) {
    console.error('[ERROR] handleConfirmRaidCreate: Error publicando raid:', publishError);
      await interaction.update({
      content: '❌ No se pudo publicar el raid. Intenta de nuevo.',
      components: [],
    });
    // Limpiar el embedsMap entry
    if (embedsMap[templateName]) {
      embedsMap[templateName] = embedsMap[templateName].filter(e => e.raidId !== raidId);
    }
    return;
  }

  // Confirmar al líder que el raid fue publicado (actualiza el mensaje ephemeral)
  await interaction.update({
    content: `✅ Raid **#${raidId}** publicado correctamente.${disabledWeaponValues.length > 0 ? ` (${disabledWeaponValues.length} arma(s)/grupo(s) deshabilitados)` : ''}`,
    components: [],
  });

  // Enviar DMs de notificación masiva (no bloqueante)
  if (finalNotificationRoles.length > 0 && raidMessage) {
    setImmediate(async () => {
      try {
        const members = await interaction.guild.members.fetch();
        const targetMembers = members.filter(member =>
          finalNotificationRoles.some(roleId => member.roles.cache.has(roleId))
        );
        const activityTitle = title || template.title;
        const discordTimestamp = `<t:${eventTimestamp}:F>`;
        const messageUrl = `https://discord.com/channels/${interaction.guild.id}/${interaction.channel.id}/${raidMessage.id}`;
        const massNotification = createMassNotificationEmbed(
          activityTitle,
          interaction.guild.name,
          discordTimestamp,
          user.toString(),
          messageUrl
        );
        for (const member of targetMembers.values()) {
          try {
            await member.send({ embeds: massNotification.embeds, components: massNotification.components });
          } catch { /* DMs cerrados, ignorar */ }
          await new Promise((r) => setTimeout(r, 250));
        }
        console.log(`[INFO] Notificación enviada a ${targetMembers.size} miembros`);
      } catch (e) {
        console.error('[ERROR] handleConfirmRaidCreate: Error enviando notificaciones:', e);
      }
    });
  }

  // Guardar en BD (no bloqueante)
  setImmediate(async () => {
    try {
      await createRaidEvent({
        eventId: raidId,
        guildId,
        channelId: interaction.channel.id,
        messageId: raidMessage.id,
        templateName,
        title: title || template.title,
        description: description || template.description,
        time: pending.time,
        color: color || null,
        image: image || null,
        reminder: finalReminder || null,
        rolesToNotify: finalNotificationRoles,
        participants: [],
        cannotGo: [],
        weaponAssignments: [],
        waitList: [],
        disabledWeapons: disabledWeaponValues,
        status: 'active',
        embedSnapshot: embed.data,
      });
      console.log(`[INFO] Raid #${raidId} guardado en DB (messageId: ${raidMessage.id})`);
    } catch (dbError) {
      console.error('[ERROR] handleConfirmRaidCreate: Error guardando raid en DB:', dbError);
    }
  });
}

/**
 * Comando para crear raids usando templates del servidor
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName("raid")
    .setDescription("Gestiona raids del servidor")
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Crea un raid usando una plantilla")
        .addStringOption((option) =>
          option
            .setName("template")
            .setDescription("Selecciona la plantilla para esta actividad")
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption((option) =>
          option
            .setName("time")
            .setDescription(
              'Hora del evento en UTC (formato HH:MM) ej: "17:00", "21:30"'
            )
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("title")
            .setDescription(
              "Especifica un título personalizado para la actividad (opcional)"
            )
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("description")
            .setDescription(
              "Especifica una descripción personalizada para la actividad (opcional)"
        )
          .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("color")
            .setDescription(
              "Especifica el color del embed en formato hexadecimal (#FFFFFF) (opcional)"
            )
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("image")
            .setDescription(
              "Proporciona una URL para la imagen del embed (opcional)"
            )
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("reminder")
            .setDescription(
              'Minutos antes del evento para enviar recordatorio ej: "10", "30" (opcional)'
            )
            .setRequired(false)
        )
        .addRoleOption((option) =>
          option
            .setName("role_to_notify_1")
            .setDescription("Primer rol del servidor a notificar (opcional)")
            .setRequired(false)
        )
        .addRoleOption((option) =>
          option
            .setName("role_to_notify_2")
            .setDescription("Segundo rol del servidor a notificar (opcional)")
            .setRequired(false)
        )
        .addRoleOption((option) =>
          option
            .setName("role_to_notify_3")
            .setDescription("Tercer rol del servidor a notificar (opcional)")
            .setRequired(false)
        )
        .addIntegerOption((option) =>
          option
            .setName("looters")
            .setDescription("Número máximo de looters permitidos (opcional)")
            .setRequired(false)
            .setMinValue(1)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("kick")
        .setDescription("Expulsa a un participante inscrito del raid")
        .addStringOption((option) =>
          option
            .setName("raid_id")
            .setDescription("ID de 6 caracteres del raid (visible en el footer del embed)")
            .setRequired(true)
        )
        .addUserOption((option) =>
          option
            .setName("usuario")
            .setDescription("Usuario a expulsar del raid")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("edit")
        .setDescription("Edita parámetros de un raid activo")
        .addStringOption((option) =>
          option
            .setName("raid_id")
            .setDescription("ID de 6 caracteres del raid")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("title")
            .setDescription("Nuevo título del raid (opcional)")
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("time")
            .setDescription('Nueva hora en UTC (formato HH:MM, opcional)')
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("description")
            .setDescription("Nueva descripción del raid (opcional)")
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("color")
            .setDescription("Nuevo color en hexadecimal (#FFFFFF, opcional)")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("close")
        .setDescription("Cierra manualmente un raid activo")
        .addStringOption((option) =>
          option
            .setName("raid_id")
            .setDescription("ID de 6 caracteres del raid")
            .setRequired(true)
        )
    ),

  async autocomplete(interaction) {
    let subcommand;
    try { subcommand = interaction.options.getSubcommand(); } catch { subcommand = null; }
    if (subcommand !== 'create') return;

    const focusedOption = interaction.options.getFocused(true);

    if (focusedOption.name === 'template') {
      // Crear timeout para evitar interacciones que se cuelguen
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Autocomplete timeout')), 2500) // 2.5 segundos
      );

      try {
        const guildId = interaction.guild.id;

        // Ejecutar la consulta con timeout
        const templates = await Promise.race([
          getTemplateNames(guildId),
          timeoutPromise
        ]);

        const filtered = templates
          .filter(template =>
            template.name.toLowerCase().includes(focusedOption.value.toLowerCase())
          )
          .slice(0, 25); // Discord limita a 25 opciones

        // Solo responder si la interacción no ha sido respondida
        if (!interaction.responded && !interaction.deferred && !interaction.replied) {
          await interaction.respond(
            filtered.map(template => ({
              name: template.name,
              value: template.name
            }))
          );
        }
      } catch (error) {
        console.error('[ERROR] Error en autocomplete:', error.message);

        // Solo responder si la interacción no ha sido respondida
        try {
          if (!interaction.responded && !interaction.deferred && !interaction.replied) {
            await interaction.respond([]);
          }
        } catch (responseError) {
          // Si falla al responder, solo loggear el código de error
          if (responseError.code !== 40060) { // No loggear si ya fue reconocida
            console.error('[WARN] Error respondiendo autocomplete:', responseError.code);
          }
        }
      }
    }
  },

  async execute(interaction) {
    // Rutear al manejador del subcomando correspondiente
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'kick') {
      return executeKickSubcommand(interaction);
    }
    if (subcommand === 'edit') {
      return executeEditSubcommand(interaction);
    }
    if (subcommand === 'close') {
      return executeCloseSubcommand(interaction);
    }

    // Subcomando 'create' — flujo de creación de raid
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      // Verificar roles autorizados (authorizedroles), independiente de economy/decode
      const hasAuthorizedRole = await checkAuthorizedRole(interaction);
      if (!hasAuthorizedRole) {
        const errorEmbed = createErrorEmbed(
          'Acceso denegado',
          'No tienes un rol autorizado para usar el comando /raid en este servidor.\nPide a un administrador que te agregue a la lista de roles autorizados.'
        );
        await safeReply(interaction, { embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        return;
      }

      /**
       * Obtener los parámetros del comando slash
       */
      const templateName = interaction.options.getString("template");
      const title = interaction.options.getString("title");
      const time = interaction.options.getString("time");
      const color = interaction.options.getString("color");
      const image = interaction.options.getString("image");
      const description = interaction.options.getString("description");
      const reminder = interaction.options.getString("reminder");
      const roleToNotify1 = interaction.options.getRole("role_to_notify_1");
      const roleToNotify2 = interaction.options.getRole("role_to_notify_2");
      const roleToNotify3 = interaction.options.getRole("role_to_notify_3");
      const looters = interaction.options.getInteger("looters");
      const user = interaction.user;
      const guildId = interaction.guild.id;

      /**
       * Asegurar que el servidor existe en la base de datos
       */
      await getOrCreateServer(guildId, interaction.guild.name);

      /**
       * Obtener la plantilla de la base de datos
       */
      const template = await getTemplateByName(templateName, guildId);

      if (!template) {
        const errorEmbed = createErrorEmbed(
          "Plantilla No Encontrada",
          `No se encontró la plantilla "${templateName}" en este servidor.`,
          [{
            name: "Solución",
            value: "Verifica que el nombre de la plantilla sea correcto o crea una nueva plantilla.",
            inline: false
          }]
        );
        return await safeReply(interaction, {
          embeds: [errorEmbed],
          flags: MessageFlags.Ephemeral,
        });
      }

      let eventTimestamp;
      try {
        eventTimestamp = parseUTCTime(time);
      } catch (timeError) {
        const errorEmbed = createErrorEmbed(
          "Error en el Tiempo del Evento",
          `Error procesando la hora del evento: ${timeError.message}`,
          [{
            name: "Formato Correcto",
            value: "Usa el formato HH:MM en UTC: `17:00`, `21:30`, `09:00`",
            inline: false
          }]
        );
        return await safeReply(interaction, {
          embeds: [errorEmbed],
          flags: MessageFlags.Ephemeral,
        });
      }

      let finalReminder = reminder;

      if (finalReminder) {
        let reminderTimeMs;
        try {
          reminderTimeMs = parseMinutes(finalReminder);
        } catch (reminderError) {
          const errorEmbed = createErrorEmbed(
            "Error en el Tiempo del Recordatorio",
            `Error procesando el tiempo del recordatorio: ${reminderError.message}`,
            [{
              name: "Formato Correcto",
              value: "Usa un número de minutos: `10`, `30`, `60`",
              inline: false
            }]
          );
          return await safeReply(interaction, {
            embeds: [errorEmbed],
            ephemeral: true,
          });
        }

        // El recordatorio debe dispararse antes del evento
        const msUntilEvent = eventTimestamp * 1000 - Date.now();
        if (reminderTimeMs >= msUntilEvent) {
          const warningEmbed = createWarningEmbed(
            "Tiempo de Recordatorio Inválido",
            "El recordatorio debe programarse antes de la hora del evento.",
            [{
              name: "Ejemplo",
              value: `Para un evento en ${Math.round(msUntilEvent / 60000)} minutos, el recordatorio máximo permitido es ${Math.floor((msUntilEvent - 60000) / 60000)} minutos`,
              inline: false
            }]
          );
          return await safeReply(interaction, {
            embeds: [warningEmbed],
            flags: MessageFlags.Ephemeral,
          });
        }
        if (reminderTimeMs <= 0) {
          const warningEmbed = createWarningEmbed(
            "Tiempo de Recordatorio Inválido",
            "El tiempo del recordatorio debe ser mayor a 0.",
            [{
              name: "Ejemplo",
              value: "Usa números como: `5`, `10`, `30`",
              inline: false
            }]
          );
          return await safeReply(interaction, {
            embeds: [warningEmbed],
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      if (color && !isValidHex(color)) {
        const errorEmbed = createErrorEmbed(
          "Color Inválido",
          "El color proporcionado no es válido.",
          [{
            name: "Formato Correcto",
            value: "Usa el formato hexadecimal: `#FFFFFF`, `#FF0000`, `#00FF00`",
            inline: false
          }]
        );
        return await safeReply(interaction, {
          embeds: [errorEmbed],
          flags: MessageFlags.Ephemeral,
        });
      }

      const notificationRoles = [];
      for (const role of [roleToNotify1, roleToNotify2, roleToNotify3]) {
        if (role && !notificationRoles.includes(role.id)) {
          notificationRoles.push(role.id);
        }
      }

      let finalNotificationRoles = [];
      if (notificationRoles.length > 0) {
        finalNotificationRoles = notificationRoles;
        console.log(`[DEBUG RAID] Usando roles del comando:`, finalNotificationRoles);
      } else {
        console.log(`[DEBUG RAID] No se especificaron roles para notificar`);
      }

      // Almacenar los parámetros del raid pendiente de confirmación
      pendingRaids.set(interaction.id, {
        templateName,
        template,
        eventTimestamp,
        time,
        title,
        color,
        image,
        description,
        finalReminder,
        finalNotificationRoles,
        looters,
        guildId,
        user,
        disabledWeapons: [],
      });
      // Auto-limpiar tras 15 minutos (expiración del token de Discord)
      setTimeout(() => pendingRaids.delete(interaction.id), 15 * 60 * 1000);

      // Mostrar el configurador de armas antes de publicar
      const { selectRow, confirmRow } = createDisableWeaponsConfig(template, interaction.id);
      const components = selectRow ? [selectRow, confirmRow] : [confirmRow];

      await interaction.editReply({
        content: '⚙️ **Configurar armas del raid**\n\nTodas las armas están habilitadas por defecto. Si deseas **deshabilitar** alguna arma o grupo, selecciónala(s) en el menú y luego confirma.\n\n*Deja el selector vacío para mantener todas las armas habilitadas.*',
        components,
      });

    } catch (error) {
      console.error('[ERROR] Error en comando raid create:', error);
      const errorEmbed = createErrorEmbed(
        "Error del Sistema",
        "Hubo un error ejecutando el comando de raid.",
        [{
          name: "Solución",
          value: "Intenta ejecutar el comando de nuevo. Si el problema persiste, contacta al soporte.",
          inline: false
        }]
      );
      await safeReply(interaction, {
        embeds: [errorEmbed],
        flags: MessageFlags.Ephemeral,
      });
    }
  },

  pendingRaids,
  handleWeaponsConfigSelect,
  handleConfirmRaidCreate,
};

