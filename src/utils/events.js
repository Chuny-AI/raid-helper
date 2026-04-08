const { InteractionType, Events, EmbedBuilder } = require("discord.js");
const { client } = require("./client");
const { embedsMap, rebuildEmbedFromSnapshot, safeFieldValue, updateParticipantsCounter } = require("../utils/embed");
const { getOrCreateServer } = require("../services/serverService");
const { filterCommand } = require("./commandFilter");
const { getActiveRaids, closeRaidEvent, syncEmbedSnapshot, updateRaidEvent, getRaidEvent } = require('../services/raidEventService');
const RaidEvent = require('../database/models/RaidEvent');
const NotifyEvent = require('../database/models/NotifyEvent');
const { safeReply } = require('./errorEmbeds');
const { logDiscordError, logDatabaseError, logInteractionError } = require('./logging');
const { safeDeferUpdate, wrapInteractionMethods } = require('./interaction');

// Import template command
const templateCommand = require("../commands/utility/template");

// Import raid command handlers for the confirm/config flow
const raidCommand = require("../commands/utility/raid");

/**
 * Persiste el estado actual del embed en la base de datos de forma no bloqueante.
 * @param {string} raidId
 * @param {Object} embed - EmbedBuilder con data
 * @param {Object} [extra] - Campos adicionales a actualizar en el documento
 */
const persistRaidState = (raidId, embed, extra = {}) => {
  setImmediate(async () => {
    try {
      await syncEmbedSnapshot(raidId, embed.data);
      if (Object.keys(extra).length > 0) {
        await updateRaidEvent(raidId, extra);
      }
    } catch (e) {
      console.error('[WARN] persistRaidState error:', e);
    }
  });
};

/**
 * Garantiza que el valor de un campo no supere el límite de 1024 chars de Discord.
 * Aplica safeFieldValue a todos los campos de tipo string del embed.
 * @param {Object} embed - EmbedBuilder
 */
const sanitizeEmbedFields = (embed) => {
  if (!embed?.data?.fields) return;
  embed.data.fields.forEach(f => {
    if (typeof f.value === 'string' && f.value.length > 1024) {
      f.value = safeFieldValue(f.value);
    }
  });
};

/**
 * Envía un DM al líder del raid con el mensaje indicado (no bloqueante).
 * @param {Object} embed - EmbedBuilder activo
 * @param {import('discord.js').Guild} guild
 * @param {string} message
 */
const notifyRaidLeader = (embed, guild, message) => {
  setImmediate(async () => {
    try {
      const leaderField = embed.data.fields.find(f => f.name === 'Líder de la actividad:');
      if (!leaderField) return;
      const leaderId = leaderField.value.replace(/<@!?(\d+)>/, '$1');
      const leader = await guild.members.fetch(leaderId);
      await leader.send({ content: message });
    } catch (e) {
      console.log(`[INFO] notifyRaidLeader: No se pudo enviar DM al líder: ${e?.message}`);
    }
  });
};

/**
 * Intenta promover al primer usuario de la waitlist que espera por un arma específica.
 * Soporta el formato nuevo ("<emoji> NombreArma — @user") y el formato legacy (in-memory map).
 * Si hay espacio en el grupo del arma liberado, el usuario es movido al slot.
 * @param {Object} embed - EmbedBuilder activo
 * @param {Object} embedEntry - Entrada del embedsMap
 * @param {string} freedWeaponName - Nombre del arma cuyo slot fue liberado
 * @param {Object} freedGroupField - Campo del embed que representa el grupo del arma liberada
 * @param {import('discord.js').Guild} guild - Guild de Discord
 * @returns {string|null} ID del usuario promovido, o null si no se pudo promover
 */
const tryPromoteFromWaitlist = async (embed, embedEntry, freedWeaponName, freedGroupField, guild) => {
  if (!freedGroupField || !freedWeaponName) return null;

  const waitlistField = embed.data.fields.find(f => f.name === '🕒 Lista de espera');
  if (!waitlistField?.value || waitlistField.value === '\u200b') return null;

  const waitlistLines = waitlistField.value.split('\n').filter(l => l.trim());
  if (waitlistLines.length === 0) return null;

  // Verificar que aún haya espacio en el grupo
  const capMatch = freedGroupField.name.match(/\((\d+)\/(\d+)\)/);
  if (!capMatch) return null;
  const current = parseInt(capMatch[1]);
  const max = parseInt(capMatch[2]);
  if (current >= max) return null;

  // Buscar el primer candidato que espere exactamente este arma.
  // Soporte doble: nuevo formato (línea contiene el nombre del arma) + legacy (in-memory map).
  const waitlistWeapons = embedEntry.waitlistWeapons || {};
  const seen = new Set();
  let promotedCandidate = null;

  for (const line of waitlistLines) {
    const uidMatch = line.match(/<@!?(\d+)>/);
    if (!uidMatch) continue;
    const uid = uidMatch[1];
    if (seen.has(uid)) continue;
    seen.add(uid);

    const prefs = waitlistWeapons[uid];
    // Nuevo formato: la línea contiene el nombre del arma directamente
    const matchesNewFormat = line.includes(freedWeaponName);
    // Formato legacy: el in-memory map contiene el arma
    const matchesLegacy = prefs?.weapons?.includes(freedWeaponName);

    if (matchesNewFormat || matchesLegacy) {
      // Capturar emoji de la línea si está en nuevo formato
      const emojiMatch = matchesNewFormat ? line.match(/^(<:[^:]+:[0-9]+>)/) : null;
      const emoji = emojiMatch ? emojiMatch[1] : '';
      promotedCandidate = { uid, emoji, timestamp: prefs?.timestamp || 0 };
      break; // Tomar el primero en orden de la waitlist (orden de llegada)
    }
  }

  if (!promotedCandidate) return null;

  const { uid: promotedId, emoji: promotedEmoji } = promotedCandidate;
  const userMention = `<@${promotedId}>`;

  // Remover TODAS las líneas del usuario promovido de la waitlist
  const newLines = waitlistLines.filter(l => !l.includes(userMention));
  waitlistField.value = newLines.length > 0 ? newLines.join('\n') : '\u200b';

  // Añadir al campo del grupo con formato correcto: <emoji> NombreArma @user
  const promotedEntry = promotedEmoji
    ? `${promotedEmoji} ${freedWeaponName} ${userMention}`
    : userMention;
  const currentVal = (!freedGroupField.value || freedGroupField.value === '\u200b' || !freedGroupField.value.trim())
    ? '' : freedGroupField.value;
  freedGroupField.value = currentVal ? `${currentVal}\n${promotedEntry}` : promotedEntry;

  // Incrementar el contador del grupo
  freedGroupField.name = freedGroupField.name.replace(/(\d+)\/(\d+)/, `${current + 1}/${max}`);

  // Limpiar preferencias del usuario promovido
  if (embedEntry.waitlistWeapons?.[promotedId]) {
    delete embedEntry.waitlistWeapons[promotedId];
  }

  // Enviar DM al usuario promovido (no bloqueante)
  setImmediate(async () => {
    try {
      const member = await guild.members.fetch(promotedId);
      await member.send({
        content: `✅ Se liberó un espacio en el raid y has sido movido automáticamente desde la lista de espera al arma **${freedWeaponName}**. ¡Buena suerte!`,
      });
    } catch (e) {
      console.log(`[INFO] tryPromoteFromWaitlist: No se pudo enviar DM a ${promotedId}: ${e?.message}`);
    }
  });

  return promotedId;
};

/**
 * Maneja la selección de armas en la lista de espera (raid_waitlist_weapons-).
 * Si hay espacio en alguna arma seleccionada, el usuario es añadido directamente.
 * Si no, se le añade a la waitlist con sus armas preferidas.
 * @param {import('discord.js').StringSelectMenuInteraction} interaction
 */
async function handleWaitlistWeaponsSelect(interaction) {
  await safeDeferUpdate(interaction);

  const lastDashIndex = interaction.customId.lastIndexOf('-');
  const getCustomEmbedId = interaction.customId.substring(lastDashIndex + 1);
  const templateName = interaction.customId.substring('raid_waitlist_weapons-'.length, lastDashIndex);

  const embedsList = embedsMap[templateName];
  const currentEmbedEntry = embedsList?.find(e => e.id.trim() === getCustomEmbedId);
  if (!currentEmbedEntry) return;

  const embed = currentEmbedEntry.embed;
  const userStr = interaction.user.toString();

  // Cargar template para obtener datos de armas seleccionadas
  const { getTemplateByName } = require('../services/templateService');
  const template = await getTemplateByName(templateName, interaction.guild.id).catch(() => null);
  if (!template) {
    try { await interaction.editReply({ content: '⚠️ No se pudo cargar el template.', components: [] }); } catch { /* ignored */ }
    return;
  }

  // Resolver los datos de cada arma seleccionada
  const selectedWeapons = [];
  for (const val of interaction.values) {
    const tildeIdx = val.indexOf('~');
    if (tildeIdx < 0) continue;
    const groupKey = val.substring(0, tildeIdx);
    const itemIdx = parseInt(val.substring(tildeIdx + 1));
    const groupData = template.weapons[groupKey];
    if (!groupData) continue;
    const item = groupData.data?.[itemIdx];
    if (!item) continue;
    selectedWeapons.push({
      groupKey, itemIdx,
      weaponName: item.name || groupData.displayName,
      weaponCategory: groupData.displayName,
      emojiId: item.emojiId || item.emoji,
      units: item.units || 1,
      value: val,
    });
  }

  if (selectedWeapons.length === 0) {
    try { await interaction.editReply({ content: '⚠️ No se seleccionó ninguna arma válida.', components: [] }); } catch { /* ignored */ }
    return;
  }

  // Intentar añadir directamente si hay espacio en alguna arma seleccionada
  let directlyAddedWeapon = null;

  for (const wd of selectedWeapons) {
    const groupField = embed.data.fields.find(f =>
      typeof f.name === 'string' && f.name.includes(wd.weaponCategory) && /\(\d+\/\d+\):/.test(f.name)
    );
    if (!groupField) continue;

    // Verificar capacidad del grupo
    const groupCapMatch = groupField.name.match(/\((\d+)\/(\d+)\)/);
    if (!groupCapMatch) continue;
    const groupCurrent = parseInt(groupCapMatch[1]);
    const groupMax = parseInt(groupCapMatch[2]);
    if (groupCurrent >= groupMax) continue;

    // Verificar capacidad individual del arma
    const escapedName = wd.weaponName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const weaponCount = (groupField.value.match(new RegExp(escapedName, 'g')) || []).length;
    if (weaponCount >= wd.units) continue;

    // ¡Hay espacio! Eliminar de su slot actual y añadir al arma disponible
    deleteUserIfExistsOnCurrentField(embed, interaction);

    // Limpiar de waitlist y cannotgo si estaba
    const waitlistField = embed.data.fields.find(f => f.name === '🕒 Lista de espera');
    if (waitlistField?.value?.includes(userStr)) {
      const lines = waitlistField.value.split('\n').filter(l => !l.includes(userStr));
      waitlistField.value = lines.join('\n') || '\u200b';
    }
    const cannotGoField = embed.data.fields.find(f => f.name === '🚫 No puedo ir');
    if (cannotGoField?.value?.includes(userStr)) {
      const lines = cannotGoField.value.split('\n').filter(l => !l.includes(userStr));
      cannotGoField.value = lines.join('\n') || '\u200b';
    }

    // Incrementar contador y añadir al campo
    modifyUnitsFromName(embed, wd.weaponCategory);
    let formattedEmoji = wd.emojiId;
    if (wd.emojiId && String(wd.emojiId).match(/^\d+$/)) {
      formattedEmoji = `<:weapon:${wd.emojiId}>`;
    }
    const currentVal = (!groupField.value || groupField.value === '\u200b' || !groupField.value.trim()) ? '' : groupField.value;
    groupField.value = currentVal
      ? `${currentVal}\n${formattedEmoji} ${wd.weaponName} ${interaction.user}`
      : `${formattedEmoji} ${wd.weaponName} ${interaction.user}`;

    directlyAddedWeapon = wd.weaponName;
    break;
  }

  let replyContent;

  if (directlyAddedWeapon) {
    updateParticipantsCounter(embed);
    sanitizeEmbedFields(embed);

    // Actualizar mensaje del raid
    try {
      const raidEvent = await getRaidEvent(currentEmbedEntry.raidId);
      if (raidEvent) {
        const channel = await interaction.guild.channels.fetch(raidEvent.channelId);
        const msg = await channel?.messages.fetch(raidEvent.messageId);
        if (msg) await msg.edit({ embeds: [embed] });
      }
    } catch (e) {
      console.error('[ERROR] handleWaitlistWeaponsSelect (direct add): No se pudo actualizar el mensaje:', e);
    }

    persistRaidState(currentEmbedEntry.raidId, embed);
    replyContent = `✅ Había un espacio disponible en **${directlyAddedWeapon}** y has sido añadido automáticamente.`;

  } else {
    // No hay espacio → añadir a la waitlist con preferencias de armas
    deleteUserIfExistsOnCurrentField(embed, interaction);

    // Asegurar campo de waitlist
    const waitlistFieldName = '🕒 Lista de espera';
    let waitlistField = embed.data.fields.find(f => f.name === waitlistFieldName);
    if (!waitlistField) {
      waitlistField = { name: waitlistFieldName, value: '\u200b', inline: false };
      embed.data.fields.push(waitlistField);
    }

    // Añadir una línea por cada arma seleccionada con formato: <emoji> NombreArma — @user
    for (const wd of selectedWeapons) {
      // Evitar duplicado si el usuario ya tiene una línea para este arma
      const alreadyInLine = waitlistField.value !== '\u200b' &&
        waitlistField.value.split('\n').some(l => l.includes(wd.weaponName) && l.includes(userStr));
      if (alreadyInLine) continue;

      let wdEmoji = wd.emojiId;
      if (wd.emojiId && String(wd.emojiId).match(/^\d+$/)) {
        wdEmoji = `<:weapon:${wd.emojiId}>`;
      }
      const line = `${wdEmoji} ${wd.weaponName} — ${interaction.user}`;
      const curr = (!waitlistField.value || waitlistField.value === '\u200b' || !waitlistField.value.trim()) ? '' : waitlistField.value;
      waitlistField.value = curr ? `${curr}\n${line}` : line;
    }

    // Limpiar de cannotgo
    const cannotGoField = embed.data.fields.find(f => f.name === '🚫 No puedo ir');
    if (cannotGoField?.value?.includes(userStr)) {
      const lines = cannotGoField.value.split('\n').filter(l => !l.includes(userStr));
      cannotGoField.value = lines.join('\n') || '\u200b';
    }

    // Guardar preferencias de armas en memoria (para auto-promoción)
    if (!currentEmbedEntry.waitlistWeapons) currentEmbedEntry.waitlistWeapons = {};
    currentEmbedEntry.waitlistWeapons[interaction.user.id] = {
      weapons: selectedWeapons.map(wd => wd.weaponName),
      timestamp: Date.now(),
    };

    updateParticipantsCounter(embed);
    sanitizeEmbedFields(embed);

    // Actualizar mensaje del raid
    try {
      const raidEvent = await getRaidEvent(currentEmbedEntry.raidId);
      if (raidEvent) {
        const channel = await interaction.guild.channels.fetch(raidEvent.channelId);
        const msg = await channel?.messages.fetch(raidEvent.messageId);
        if (msg) await msg.edit({ embeds: [embed] });
      }
    } catch (e) {
      console.error('[ERROR] handleWaitlistWeaponsSelect (waitlist add): No se pudo actualizar el mensaje:', e);
    }

    persistRaidState(currentEmbedEntry.raidId, embed);

    try {
      const { updateReminderParticipants, addInterestedUser } = require('./reminderManager');
      updateReminderParticipants(getCustomEmbedId, extractParticipantsFromEmbed(embed));
      addInterestedUser(getCustomEmbedId, interaction.user.id);
    } catch { /* ignored */ }

    const weaponNames = selectedWeapons.map(wd => `**${wd.weaponName}**`).join(', ');
    replyContent = `🕒 Has sido añadido a la lista de espera para: ${weaponNames}.`;
  }

  try {
    await interaction.editReply({ content: replyContent, components: [] });
  } catch (e) {
    try { await interaction.followUp({ content: replyContent, ephemeral: true }); } catch { /* ignored */ }
  }
}

const getEvents = () => {
  client.once(Events.ClientReady, async (readyClient) => {
    console.log(`El bot ${readyClient.user.tag} está listo.`);

    try {
      const guilds = readyClient.guilds.cache;
      for (const [guildId, guild] of guilds) {
        await getOrCreateServer(guildId, guild.name);
      }
      console.log('[INFO] Servidores registrados en la base de datos');
    } catch (error) {
      console.error('[ERROR] Error al registrar servidores:', error);
    }

    // Reconstruir embedsMap desde la base de datos para raids activos
    try {
      const activeRaids = await getActiveRaids();
      let rebuilt = 0;
      const now = Date.now();
      for (const raid of activeRaids) {
        // Expirar raids cuya hora ya pasó hace más de 2 horas
        if (raid.time) {
          const { parseUTCTime } = require('../utils/time');
          try {
            const raidTs = parseUTCTime(raid.time) * 1000;
            if (raidTs + 2 * 60 * 60 * 1000 < now) {
              await closeRaidEvent(raid.eventId);
              console.log(`[INFO] Raid #${raid.eventId} expirado y cerrado automáticamente.`);
              continue;
            }
          } catch { /* ignorar parse errors */ }
        }
        if (!raid.embedSnapshot) continue;
        try {
          const embed = rebuildEmbedFromSnapshot(raid.embedSnapshot);
          const tmplName = raid.templateName;
          if (!embedsMap[tmplName]) embedsMap[tmplName] = [];
          // Evitar duplicados (puede llamarse varias veces en dev)
          const exists = embedsMap[tmplName].some(e => e.raidId === raid.eventId);
          if (!exists) {
            embedsMap[tmplName].push({
              id: raid.messageId,
              raidId: raid.eventId,
              embed,
              fullNotificationSent: false,
              disabledWeapons: raid.disabledWeapons || [],
              waitlistWeapons: {},
            });
            rebuilt++;
          }
        } catch (e) {
          console.error(`[WARN] No se pudo reconstruir embed del raid #${raid.eventId}:`, e);
        }
      }
      if (rebuilt > 0) console.log(`[INFO] ${rebuilt} raids activos reconstruidos en embedsMap.`);
    } catch (error) {
      console.error('[ERROR] Error reconstruyendo embedsMap:', error);
    }

    // Reconstruir botones de notificaciones activas (spec #8)
    // Los componentes de Discord persisten en los mensajes entre reinicios,
    // así que sólo necesitamos asegurarnos de que el handler puede responder.
    // Aquí verificamos que los registros existen y logueamos su estado.
    try {
      const activeNotifies = await NotifyEvent.find({});
      if (activeNotifies.length > 0) {
        console.log(`[INFO] ${activeNotifies.length} notificación(es) activa(s) cargada(s) desde BD. Los botones siguen operativos.`);
      }
    } catch (error) {
      console.error('[ERROR] Error cargando notificaciones activas:', error);
    }

    // Programar limpieza periódica de raids expirados (cada 30 min)
    setInterval(async () => {
      const now = Date.now();
      for (const [tmplName, entries] of Object.entries(embedsMap)) {
        const active = [];
        for (const entry of entries) {
          let expired = false;
          try {
            const dbRaid = await RaidEvent.findOne({ eventId: entry.raidId });
            if (dbRaid?.time) {
              const { parseUTCTime } = require('../utils/time');
              const raidTs = parseUTCTime(dbRaid.time) * 1000;
              if (raidTs + 2 * 60 * 60 * 1000 < now) {
                await closeRaidEvent(entry.raidId);
                console.log(`[INFO] Raid #${entry.raidId} expirado, removido de embedsMap.`);
                expired = true;
              }
            }
          } catch { /* continuar */ }
          if (!expired) active.push(entry);
        }
        embedsMap[tmplName] = active;
      }
    }, 30 * 60 * 1000);
  });

  client.on(Events.GuildCreate, async (guild) => {
    try {
      await getOrCreateServer(guild.id, guild.name);
      console.log(`[INFO] Bot añadido al servidor: ${guild.name} (${guild.id})`);
    } catch (error) {
      console.error('[ERROR] Error al procesar nuevo servidor:', error);
    }
  });

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    if (!message.guild) return;

    const hexPattern = /(?:41[\s]?56[\s]?41[\s]?5F|AVA_TEMPLE)/i;

    if (hexPattern.test(message.content)) {
      try {
        console.log(`[AUTO-DECODE] Datos hex detectados en mensaje de ${message.author.tag}`);
        await processHexMessage(message);
      } catch (error) {
        console.error('[ERROR] Error procesando mensaje hex automático:', error);
      }
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    wrapInteractionMethods(interaction);

    if (interaction.isChatInputCommand()) {
      const shouldExecute = await filterCommand(interaction);
      if (!shouldExecute) {
        return;
      }

      if (!interaction.client.commands) {
        console.error("interaction.client.commands no está definido");
        return;
      }

      const command = interaction.client.commands.get(interaction.commandName);

      if (!command) {
        console.error(
          `No se encontró un comando identificado con ${interaction.commandName}.`
        );
        return;
      }

      try {
        await command.execute(interaction);
      } catch (error) {
        logInteractionError('command.execute failed', error);
        if (error?.code === 10062 || error?.code === 40060) {
          return;
        }
        await safeReply(interaction, {
          content: "Hubo un error ejecutando el comando",
          ephemeral: true,
        });
      }
    }

    if (interaction.isAutocomplete()) {
      const command = interaction.client.commands.get(interaction.commandName);

      if (!command) {
        console.error(
          `No se encontró un comando identificado con ${interaction.commandName}.`
        );
        return;
      }

      try {
        if (!interaction.responded && !interaction.deferred && !interaction.replied) {
          await command.autocomplete(interaction);
        }
      } catch (error) {
        logInteractionError('autocomplete failed', error);
      }
    }

    if (interaction.isStringSelectMenu()) {
      // Configuración de armas al crear raid (deshabilitar armas)
      if (interaction.customId.startsWith('raid_config_weapons-')) {
        await raidCommand.handleWeaponsConfigSelect(interaction);
        return;
      }

      // Selección de armas para la lista de espera
      if (interaction.customId.startsWith('raid_waitlist_weapons-')) {
        await handleWaitlistWeaponsSelect(interaction);
        return;
      }

      if (interaction.customId.startsWith("template_weapon_select_")) {
        await templateCommand.handleSelectMenu(interaction);
        return;
      }


      if (interaction.customId.startsWith("template_weapon_category_")) {
        console.log('[DEBUG] Eventos: Selección de categoría de armas detectada:', interaction.customId);
        await templateCommand.handleSelectMenu(interaction);
        return;
      }

      if (interaction.customId.startsWith("template_emoji_category_")) {
        console.log('[DEBUG] Eventos: Selección de categoría de emoji detectada:', interaction.customId);
        await templateCommand.handleSelectMenu(interaction);
        return;
      }

      if (interaction.customId.startsWith("template_emoji_weapon_")) {
        console.log('[DEBUG] Eventos: Selección de arma para emoji detectada:', interaction.customId);
        await templateCommand.handleSelectMenu(interaction);
        return;
      }

      if (interaction.customId.startsWith("template_multi_category_")) {
        console.log('[DEBUG] Eventos: Selección múltiple de categoría detectada:', interaction.customId);
        await templateCommand.handleSelectMenu(interaction);
        return;
      }

      if (interaction.customId.startsWith("template_change_category_")) {
        console.log('[DEBUG] Eventos: Cambiar categoría detectado:', interaction.customId);
        await templateCommand.handleSelectMenu(interaction);
        return;
      }

      if (interaction.customId.startsWith("template_add_more_weapons_")) {
        console.log('[DEBUG] Eventos: Agregar más armas detectado:', interaction.customId);
        await templateCommand.handleSelectMenu(interaction);
        return;
      }

      if (interaction.customId.startsWith("template_add_weapons_")) {
        console.log('[DEBUG] Eventos: Agregar armas detectado:', interaction.customId);
        await templateCommand.handleSelectMenu(interaction);
        return;
      }



      if (interaction.customId.startsWith("template_categories_prev_") || interaction.customId.startsWith("template_categories_next_")) {
        await templateCommand.handleBackToMain(interaction);
        return;
      }

      if (interaction.customId.startsWith("template_emoji_category_select_")) {
        await templateCommand.handleEmojiCategorySelect(interaction);
        return;
      }

      if (interaction.customId.startsWith("template_emoji_select_")) {
        await templateCommand.handleEmojiSelect(interaction);
        return;
      }

      // Group selects para edición de grupos de armas
      if (interaction.customId.includes("select_weapon_") ||
        interaction.customId.includes("back_to_group_") ||
        interaction.customId.startsWith("modify_weapon_select_")) {
        console.log('[DEBUG] Events: Redirigiendo group select a templateCommand.handleSelectMenu');
        await templateCommand.handleSelectMenu(interaction);
        return;
      }

      // Template select menus - usar comando unificado
      if (interaction.customId.startsWith("template_") ||
        interaction.customId === "edit_template_select" ||
        interaction.customId === "edit_weapon_category_select") {
        await templateCommand.handleSelectMenu(interaction);
        return;
      }

      // Category select para añadir armas a grupos
      if (interaction.customId.startsWith("category_select_for_group_")) {
        await templateCommand.handleCategorySelectForGroup(interaction);
        return;
      }

      // Weapon select para añadir armas específicas a grupos
      if (interaction.customId.startsWith("weapon_select_for_group_")) {
        await templateCommand.handleWeaponSelectForGroup(interaction);
        return;
      }

      // Remove weapons select para eliminar armas específicas de grupos
      if (interaction.customId.startsWith("remove_weapons_select_")) {
        await templateCommand.handleRemoveWeaponsSelect(interaction);
        return;
      }

      // Direct weapon select para añadir armas directamente sin categorías
      if (interaction.customId.startsWith("direct_weapon_select_")) {
        await templateCommand.handleDirectWeaponSelect(interaction);
        return;
      }
    }

    if (interaction.isButton()) {
      // Confirmar creación de raid (publicar con armas configuradas)
      if (interaction.customId.startsWith('raid_confirm_create-')) {
        await raidCommand.handleConfirmRaidCreate(interaction);
        return;
      }

      // ── Botones de respuesta de notificación masiva (/notify send)
      if (
        interaction.customId.startsWith('notify_attending-') ||
        interaction.customId.startsWith('notify_notattending-')
      ) {
        await handleNotifyResponse(interaction);
        return;
      }

      if (interaction.customId === "template_continue") {
        if (interaction.deferred || interaction.replied) return;
        await interaction.reply({
          content: "Por favor selecciona al menos una arma para continuar.",
          ephemeral: true
        });
        return;
      }

      if (interaction.customId === "template_add_category") {
        await templateCommand.handleAddCategory(interaction);
        return;
      }

      if (interaction.customId === "template_edit_category") {
        await templateCommand.handleEditCategory(interaction);
        return;
      }

      if (interaction.customId === "template_remove_category") {
        await templateCommand.handleRemoveCategory(interaction);
        return;
      }

      if (interaction.customId === "template_config_final") {
        await templateCommand.handleConfigFinal(interaction);
        return;
      }

      if (interaction.customId === "template_skip_category") {
        await templateCommand.handleBackToMain(interaction);
        return;
      }

      if (interaction.customId.startsWith("template_continue_category_")) {
        await templateCommand.handleContinueCategory(interaction);
        return;
      }

      if (interaction.customId.startsWith("template_config_weapon_")) {
        await templateCommand.handleBackToMain(interaction);
        return;
      }

      if (interaction.customId.startsWith("template_edit_weapons_")) {
        await templateCommand.handleButton(interaction);
        return;
      }

      if (interaction.customId.startsWith("template_edit_category_info_")) {
        await templateCommand.handleEditCategoryInfo(interaction);
        return;
      }

      if (interaction.customId === "template_back_to_main") {
        await templateCommand.handleBackToMain(interaction);
        return;
      }

      // Botones de navegación de vuelta
      if (interaction.customId.startsWith("back_to_weapons_") || interaction.customId.startsWith("back_to_group_")) {
        console.log('[DEBUG] Events: Redirigiendo back_to navigation a templateCommand.handleButton');
        await templateCommand.handleButton(interaction);
        return;
      }

      // Nuevos botones para el flujo mejorado
      if (interaction.customId.startsWith("template_add_weapon_group_")) {
        await templateCommand.handleButton(interaction);
        return;
      }

      if (interaction.customId.startsWith("template_finish_group_")) {
        await templateCommand.handleButton(interaction);
        return;
      }

      if (interaction.customId.startsWith("template_finish_weapons_")) {
        console.log('[DEBUG] Events: Detected template_finish_weapons_ button click:', interaction.customId);
        await templateCommand.handleButton(interaction);
        return;
      }

      if (interaction.customId.startsWith("template_cancel_group_")) {
        await templateCommand.handleButton(interaction);
        return;
      }

      if (interaction.customId.startsWith("template_back_to_categories_")) {
        await templateCommand.handleButton(interaction);
        return;
      }

      if (interaction.customId === "template_back_to_emoji_categories") {
        await templateCommand.handleBackToMain(interaction);
        return;
      }

      if (interaction.customId.startsWith("template_back_to_emoji_categories_")) {
        await templateCommand.handleBackToMain(interaction);
        return;
      }

      if (interaction.customId === "template_back_to_edit_emoji_categories") {
        await templateCommand.handleBackToMain(interaction);
        return;
      }

      if (interaction.customId.startsWith("edit_")) {
        await templateCommand.handleButtonClick(interaction);
        return;
      }

      // Template edit buttons específicos - usar comando unificado para edit
      if (interaction.customId.startsWith("template_edit_")) {
        console.log('[DEBUG] Events: Redirigiendo template_edit_ a templateCommand.handleButton');
        await templateCommand.handleButton(interaction);
        return;
      }

      // Group buttons para edición de grupos de armas
      if (interaction.customId.startsWith("group_") ||
        interaction.customId.includes("_group_") ||
        interaction.customId.includes("back_to_group_") ||
        interaction.customId.includes("confirm_delete_group_") ||
        interaction.customId.startsWith("delete_weapon_") ||
        interaction.customId.startsWith("modify_units_") ||
        interaction.customId.startsWith("add_url_") ||
        interaction.customId.startsWith("confirm_delete_weapon_") ||
        interaction.customId.startsWith("cancel_delete_weapon_")) {
        console.log('[DEBUG] Events: Redirigiendo group button a templateCommand.handleEditButton');
        await templateCommand.handleEditButton(interaction);
        return;
      }

      if (interaction.customId.startsWith("template_confirm_creation_")) {
        await templateCommand.handleButton(interaction);
        return;
      }

      if (interaction.customId.startsWith("template_cancel_")) {
        await templateCommand.handleButton(interaction);
        return;
      }

      if (interaction.customId.startsWith("template_continue_roles_")) {
        await templateCommand.handleButton(interaction);
        return;
      }

      if (interaction.customId.startsWith("template_back_roles_")) {
        await templateCommand.handleButton(interaction);
        return;
      }

      if (interaction.customId.startsWith("template_quick_create_")) {
        await templateCommand.handleButton(interaction);
        return;
      }

      if (interaction.customId.startsWith("template_force_cancel_")) {
        console.log('[DEBUG] Events: Detected template_force_cancel_ button click:', interaction.customId);
        await templateCommand.handleButton(interaction);
        return;
      }

      if (interaction.customId.startsWith("template_continue_existing_")) {
        console.log('[DEBUG] Events: Detected template_continue_existing_ button click:', interaction.customId);
        await templateCommand.handleButton(interaction);
        return;
      }

      // Template deletion buttons
      if (interaction.customId.startsWith("template_delete_confirm_") || interaction.customId.startsWith("template_delete_cancel_")) {
        await templateCommand.handleButton(interaction);
        return;
      }

      // Template confirmation and cancellation buttons (for template creation)
      if (interaction.customId.startsWith("template_confirm_") || interaction.customId.startsWith("template_cancel_")) {
        console.log('[DEBUG] Events: Detected template confirm/cancel button click:', interaction.customId);
        await templateCommand.handleButton(interaction);
        return;
      }

    }

    if (interaction.isModalSubmit()) {
      // Handle template basic info modal (first modal in template creation)
      if (interaction.customId.startsWith("template_basic_info_")) {
        await templateCommand.handleModalSubmit(interaction);
        return;
      }

      // Group modals para edición de grupos de armas
      if (interaction.customId.includes("add_weapon_modal_") ||
        interaction.customId.includes("edit_weapon_modal_") ||
        interaction.customId.includes("new_group_modal_") ||
        interaction.customId.startsWith("modify_weapon_modal_") ||
        interaction.customId.startsWith("modify_weapon_full_modal_") ||
        interaction.customId.startsWith("modify_units_modal_") ||
        interaction.customId.startsWith("add_url_modal_") ||
        interaction.customId.startsWith("edit_max_players_modal_")) {
        console.log('[DEBUG] Events: Redirigiendo group modal a templateCommand.handleModalSubmit');
        await templateCommand.handleModalSubmit(interaction);
        return;
      }

      if (interaction.customId === "template_new_category_modal") {
        await templateCommand.handleNewCategoryModal(interaction);
        return;
      }

      if (interaction.customId.startsWith("template_weapon_config_modal_")) {
        // Este es para modales de creación de templates, no para edición
        await templateCommand.handleBackToMain(interaction);
        return;
      }

      if (interaction.customId.startsWith("weapon_config_modal_")) {
        // Este es para modales de edición de armas en grupos existentes
        await templateCommand.handleModalSubmit(interaction);
        return;
      }

      if (interaction.customId.startsWith("template_weapon_search_modal_")) {
        await templateCommand.handleBackToMain(interaction);
        return;
      }

      if (interaction.customId === "template_final_config_modal") {
        await templateCommand.handleFinalConfigModal(interaction);
        return;
      }

      if (interaction.customId.startsWith("template_edit_category_info_modal_")) {
        await templateCommand.handleEditCategoryInfoModal(interaction);
        return;
      }

      // Template modals - usar comando unificado
      if (interaction.customId.startsWith("template_")) {
        await templateCommand.handleModalSubmit(interaction);
        return;
      }

      if (interaction.customId.startsWith("template_weapon_config_")) {
        await templateCommand.handleModalSubmit(interaction);
        return;
      }

      if (interaction.customId.startsWith("edit_") && interaction.customId.endsWith("_modal")) {
        await templateCommand.handleModalSubmit(interaction);
        return;
      }
    }

    if (interaction.type === InteractionType.MessageComponent) {
      const { customId, values } = interaction;
      if (customId.startsWith("weapons-")) {
        // Acknowledge immediately to avoid "This interaction failed" due to long processing
        await safeDeferUpdate(interaction);

        // Extract templateName and interactionId from customId: weapons-{templateName}-{interactionId}
        // Since templateName can contain dashes, we need to extract the interactionId (last part) first
        const lastDashIndex = customId.lastIndexOf('-');
        const getCustomEmbedId = customId.substring(lastDashIndex + 1);
        const templateName = customId.substring('weapons-'.length, lastDashIndex);

        // Parse the unique value format: groupKey~itemGroupIndex
        const rawValue = values[0];
        const tildeIdx = rawValue.indexOf('~');
        const groupKey = rawValue.substring(0, tildeIdx);
        const itemGroupIndex = parseInt(rawValue.substring(tildeIdx + 1));

        const embedsList = embedsMap[templateName];
        if (!embedsList) {
          console.error(`No se encontró la lista de embeds para ${templateName}`);
          return;
        }
        const currentEmbedEntry = embedsList.find(
          (entry) => entry.id.trim() === getCustomEmbedId
        );
        if (!currentEmbedEntry) {
          console.error(`No se encontró el embed correspondiente para ID: ${getCustomEmbedId}`);
          await interaction.followUp({
            content: "No se encontró el embed correspondiente.",
            ephemeral: true,
          });
          return;
        }

        // Get weapon info from template using groupKey and per-group item index
        let weaponCategory = null;
        let emojiSelected = null;
        let weaponName = null;
        let weaponUnitsLimit = 1;
        let template = null;

        try {
          const { getTemplateByName } = require('../services/templateService');
          template = await getTemplateByName(templateName, interaction.guild.id);

          if (template && template.weapons) {
            const weaponGroup = template.weapons[groupKey];
            if (weaponGroup && weaponGroup.data && Array.isArray(weaponGroup.data) &&
                itemGroupIndex >= 0 && itemGroupIndex < weaponGroup.data.length) {
              const weaponItem = weaponGroup.data[itemGroupIndex];
              weaponCategory = weaponGroup.displayName;
              emojiSelected = weaponItem.emojiId || weaponItem.emoji;
              weaponName = weaponItem.name || weaponGroup.displayName;
              weaponUnitsLimit = weaponItem.units || 1;
            }
          }
        } catch (templateError) {
          console.error('[ERROR] Error obteniendo datos del template:', templateError);
        }

        if (!weaponCategory || !emojiSelected) {
          await interaction.followUp({
            content: "No se pudo procesar la selección del arma.",
            ephemeral: true,
          });
          return;
        }

        const embed = currentEmbedEntry.embed;

        const groupField = embed.data.fields.find(f => f.name.includes(weaponCategory));

        // Determinar si el usuario ya pertenece a este grupo (está inscrito en alguna arma del grupo)
        const userAlreadyInGroup = groupField
          ? (typeof groupField.value === 'string' && groupField.value.includes(interaction.user.toString()))
          : false;

        // Paso 1 — Validar el grupo (max_players)
        // Solo aplica si el usuario NO está ya en el grupo.
        // Si ya pertenece, solo está cambiando de arma dentro del mismo grupo → omitir esta validación.
        if (!userAlreadyInGroup && groupField) {
          const groupCapacityMatch = groupField.name.match(/\((\d+)\/(\d+)\):/);
          if (groupCapacityMatch) {
            const groupCurrent = parseInt(groupCapacityMatch[1]);
            const groupMax = parseInt(groupCapacityMatch[2]);
            if (groupCurrent >= groupMax) {
              await interaction.followUp({
                content: 'No se pueden unir más jugadores a este grupo.',
                ephemeral: true,
              });
              return;
            }
          }
        }

        // Paso 2 — Validar el arma (límite individual de esa arma)
        // Si el usuario ya está en el grupo, simular la liberación de su slot actual
        // para no bloquear el cambio cuando el arma destino tiene espacio que él mismo liberará.
        if (groupField && weaponName) {
          const escapedWeaponName = weaponName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          let effectiveWeaponCount = (groupField.value.match(new RegExp(escapedWeaponName, 'g')) || []).length;

          // Si el usuario ya ocupa un slot en exactamente este arma, al cambiar la liberará,
          // por lo que no consume un cupo extra.
          if (userAlreadyInGroup) {
            const userOnThisWeapon = groupField.value.split('\n').some(line =>
              line.includes(interaction.user.toString()) && line.includes(weaponName)
            );
            if (userOnThisWeapon) effectiveWeaponCount = Math.max(0, effectiveWeaponCount - 1);
          }

          if (effectiveWeaponCount >= weaponUnitsLimit) {
            await interaction.followUp({
              content: `Esta arma ya alcanzó su límite dentro del grupo.`,
              ephemeral: true,
            });
            return;
          }
        }

        // Si el usuario ya pertenece al grupo, eliminarlo ANTES de intentar incrementar
        // el contador del grupo. Así modifyUnitsFromName verá un slot libre (1/2) en lugar
        // del máximo (2/2) y podrá incrementar correctamente.
        if (userAlreadyInGroup) {
          deleteUserIfExistsOnCurrentField(embed, interaction);
        }

        const newUser = modifyUnitsFromName(embed, weaponCategory);
        if (!newUser) {
          // Red de seguridad: no debería ocurrir si los pre-checks anteriores funcionaron
          await interaction.followUp({
            content: 'No se pueden unir más jugadores a este grupo.',
            ephemeral: true,
          });
          return;
        }
        // Para usuarios que NO estaban en este grupo: capturar el slot anterior y luego eliminar
        let freedAssignments = [];
        if (!userAlreadyInGroup) {
          // Capturar datos del slot actual ANTES de eliminar (para auto-promoción)
          const userStr = interaction.user.toString();
          for (const field of embed.data.fields) {
            if (!/\(\d+\/\d+\):/.test(field.name) || field.name.startsWith('👑')) continue;
            if (!field.value?.includes(userStr)) continue;
            for (const line of (field.value || '').split('\n')) {
              if (!line.includes(userStr)) continue;
              const weaponMatch = line.match(/<:[^:]+:[0-9]+>\s+(.+?)\s+<@/);
              if (weaponMatch) {
                freedAssignments.push({ weaponName: weaponMatch[1].trim(), groupField: field });
              }
            }
          }
          deleteUserIfExistsOnCurrentField(embed, interaction);
        }
        // Asegurar visibilidad permanente de las secciones
        const waitlistFieldName = '🕒 Lista de espera';
        const cannotGoFieldName = '🚫 No puedo ir';
        let waitlistField = embed.data.fields.find(f => f.name === waitlistFieldName);
        let cannotGoField = embed.data.fields.find(f => f.name === cannotGoFieldName);
        if (!waitlistField) {
          waitlistField = { name: waitlistFieldName, value: '\u200b', inline: false };
          embed.data.fields.push(waitlistField);
        }
        if (!cannotGoField) {
          cannotGoField = { name: cannotGoFieldName, value: '\u200b', inline: false };
          embed.data.fields.push(cannotGoField);
        }
        // Remover al usuario de ambas listas si está presente
        if (typeof waitlistField.value === 'string' && waitlistField.value.includes(interaction.user.toString())) {
          const lines = waitlistField.value.split('\n').filter(line => !line.includes(interaction.user.toString()));
          waitlistField.value = lines.length > 0 ? lines.join('\n') : '\u200b';
        }
        if (typeof cannotGoField.value === 'string' && cannotGoField.value.includes(interaction.user.toString())) {
          const lines = cannotGoField.value.split('\n').filter(line => !line.includes(interaction.user.toString()));
          cannotGoField.value = lines.length > 0 ? lines.join('\n') : '\u200b';
        }
        embed.data.fields.forEach((field) => {
          if (field.name.includes(weaponCategory)) {
            // Formatear el emoji correctamente para mostrar en texto
            let formattedEmoji = emojiSelected;
            if (emojiSelected && emojiSelected.match(/^\d+$/)) {
              // Si es solo un ID numérico, formatearlo como emoji personalizado
              formattedEmoji = `<:weapon:${emojiSelected}>`;
            }
            field.value += `\n${formattedEmoji} ${weaponName} ${interaction.user}`;
          }
        });

        // Actualizar contador de participantes (solo usuarios con arma)
        try {
          const { updateParticipantsCounter } = require('./embed');
          updateParticipantsCounter(embed);
        } catch (counterErr) {
          console.error('[WARN] No se pudo actualizar el contador de participantes:', counterErr);
        }

        // Protección contra overflow de campos del embed
        sanitizeEmbedFields(embed);

        // PRIMERO: Actualizar el embed inmediatamente para respuesta visual rápida
        try {
          await interaction.message.edit({ embeds: [embed] });
        } catch (updateError) {
          console.error('[ERROR] Error actualizando el mensaje del evento:', updateError);
        }

        // Persistir estado en BD de forma no bloqueante
        persistRaidState(currentEmbedEntry.raidId, embed);

        // SEGUNDO: Actualizar recordatorios (rápido)
        try {
          const { updateReminderParticipants, addInterestedUser } = require('./reminderManager');
          const participants = extractParticipantsFromEmbed(embed);
          updateReminderParticipants(getCustomEmbedId, participants);
          addInterestedUser(getCustomEmbedId, interaction.user.id);
        } catch (reminderError) {
          console.error('[ERROR] Error actualizando participantes del recordatorio:', reminderError);
        }

        // CUARTO: Notificar al creador si el raid se llenó por primera vez
        setImmediate(() => checkAndNotifyRaidFull(currentEmbedEntry, interaction.guild));

        // QUINTO: Auto-promover desde waitlist para los slots que quedaron libres
        if (freedAssignments.length > 0) {
          setImmediate(async () => {
            for (const { weaponName: fw, groupField: fgf } of freedAssignments) {
              const promoted = await tryPromoteFromWaitlist(embed, currentEmbedEntry, fw, fgf, interaction.guild);
              if (promoted) {
                try {
                  updateParticipantsCounter(embed);
                  sanitizeEmbedFields(embed);
                  await interaction.message.edit({ embeds: [embed] });
                  persistRaidState(currentEmbedEntry.raidId, embed);
                  notifyRaidLeader(embed, interaction.guild,
                    `✅ Un usuario fue movido automáticamente desde la lista de espera al slot de **${fw}** (liberado al cambiar de arma).`
                  );
                } catch (e) {
                  console.error('[WARN] Auto-promotion embed update error:', e);
                }
              }
            }
          });
        }

        // TERCERO: Enviar build en segundo plano (puede tomar tiempo)
        // Usar setImmediate para no bloquear la respuesta visual
        setImmediate(async () => {
          try {
            const { createBuildEmbed } = require('./embed');
            // Reusar el template ya cargado (via closure) para evitar segunda llamada a DB
            if (template && template.weapons) {
              const weaponGroup = template.weapons[groupKey];
              const foundItem = weaponGroup?.data?.[itemGroupIndex];

              if (foundItem) {
                const weaponUrl = foundItem.url;
                const weaponEmoji = foundItem.emojiId || foundItem.emoji;

                // Enviar build solo si hay URL válida
                if (weaponUrl && weaponUrl.trim() !== '') {
                  const buildEmbed = createBuildEmbed(weaponCategory, weaponUrl, weaponEmoji, templateName);
                  try {
                    await interaction.user.send({ embeds: [buildEmbed] });
                  } catch (dmError) {
                    console.error('Error enviando mensaje privado:', dmError);
                    console.log('[INFO] No se pudo enviar build por DM, usuario probablemente tiene DMs cerrados');
                  }
                }
              }
            }
          } catch (error) {
            console.error('Error obteniendo URL del arma:', error);
          }
        });
      }

      // Botón: mover a Lista de espera — muestra selector de armas
      if (customId.startsWith('raid_waitlist-')) {
        const lastDashIndex = customId.lastIndexOf('-');
        const getCustomEmbedId = customId.substring(lastDashIndex + 1);
        const templateName = customId.substring('raid_waitlist-'.length, lastDashIndex);

        try {
          const embedsList = embedsMap[templateName];
          const currentEmbedEntry = embedsList?.find((entry) => entry.id.trim() === getCustomEmbedId);
          if (!currentEmbedEntry) return;

          // Cargar el template para construir el selector de armas
          const { getTemplateByName } = require('../services/templateService');
          const template = await getTemplateByName(templateName, interaction.guild.id);
          if (!template) {
            if (interaction.deferred || interaction.replied) return;
            await interaction.reply({ content: '⚠️ No se pudo cargar el template del raid.', ephemeral: true });
            return;
          }

          const disabledWeapons = currentEmbedEntry.disabledWeapons || [];
          const { createWaitlistWeaponsSelect } = require('./select');
          const weaponSelectRow = createWaitlistWeaponsSelect(template, disabledWeapons, templateName, getCustomEmbedId);

          if (!weaponSelectRow) {
            if (interaction.deferred || interaction.replied) return;
            await interaction.reply({ content: '⚠️ No hay armas disponibles en este raid.', ephemeral: true });
            return;
          }

          if (interaction.deferred || interaction.replied) return;
          await interaction.reply({
            content: '🕒 **Lista de espera** — Selecciona las armas para las que quieres esperar.\n*Si hay espacio disponible en alguna arma seleccionada, serás añadido automáticamente al slot.*',
            components: [weaponSelectRow],
            ephemeral: true,
          });
        } catch (err) {
          console.error('[ERROR] raid_waitlist handler:', err);
          try { await interaction.reply({ content: 'No se pudo mostrar el selector de armas.', ephemeral: true }); } catch { /* ignored */ }
        }
        return;
      }

      // Botón: marcar No puedo ir (mueve a Lista de espera y libera cupo)
      if (customId.startsWith('raid_cannotgo-')) {
        // Acknowledge quickly to avoid interaction failure
        await safeDeferUpdate(interaction);
        const lastDashIndex = customId.lastIndexOf('-');
        const getCustomEmbedId = customId.substring(lastDashIndex + 1);
        const templateName = customId.substring('raid_cannotgo-'.length, lastDashIndex);

        try {
          const embedsList = embedsMap[templateName];
          const currentEmbedEntry = embedsList?.find((entry) => entry.id.trim() === getCustomEmbedId);
          if (!currentEmbedEntry) return;
          const embed = currentEmbedEntry.embed;

          // Capturar asignaciones del usuario ANTES de eliminarlo (para auto-promoción)
          const userStr = interaction.user.toString();
          const freedAssignments = [];
          for (const field of embed.data.fields) {
            if (!/\(\d+\/\d+\):/.test(field.name) || field.name.startsWith('👑')) continue;
            if (!field.value?.includes(userStr)) continue;
            for (const line of (field.value || '').split('\n')) {
              if (!line.includes(userStr)) continue;
              const weaponMatch = line.match(/<:[^:]+:[0-9]+>\s+(.+?)\s+<@/);
              if (weaponMatch) {
                freedAssignments.push({ weaponName: weaponMatch[1].trim(), groupField: field });
              }
            }
          }

          // Quitar usuario de cualquier arma y decrementar unidades
          deleteUserIfExistsOnCurrentField(embed, interaction);

          // Asegurar campo de "No puedo ir" (sección separada)
          const cannotGoFieldName = '🚫 No puedo ir';
          let cannotGoField = embed.data.fields.find(f => f.name === cannotGoFieldName);
          if (!cannotGoField) {
            cannotGoField = { name: cannotGoFieldName, value: '\u200b', inline: false };
            embed.data.fields.push(cannotGoField);
          }
          if (!cannotGoField.value.includes(interaction.user.toString())) {
            const current = (cannotGoField.value === '\u200b' || cannotGoField.value.trim() === '') ? '' : cannotGoField.value;
            cannotGoField.value = current ? `${current}\n${interaction.user}` : `${interaction.user}`;
          }

          // Remover del apartado "Lista de espera" si estaba allí
          const waitlistFieldName = '🕒 Lista de espera';
          const waitlistField = embed.data.fields.find(f => f.name === waitlistFieldName);
          if (waitlistField && typeof waitlistField.value === 'string' && waitlistField.value.includes(interaction.user.toString())) {
            const lines = waitlistField.value.split('\n').filter(line => !line.includes(interaction.user.toString()));
            waitlistField.value = lines.join('\n') || '\u200b';
          }

          // Actualizar contador de participantes y visualmente el mensaje
          try {
            const { updateParticipantsCounter } = require('./embed');
            updateParticipantsCounter(embed);
          } catch (counterErr) {
            console.error('[WARN] No se pudo actualizar el contador (cannotgo):', counterErr);
          }
          sanitizeEmbedFields(embed);
          await interaction.message.edit({ embeds: [embed] });

          // Persistir estado en BD
          persistRaidState(currentEmbedEntry.raidId, embed);

          // Actualizar recordatorio con los participantes y añadir interesado
          try {
            const { updateReminderParticipants, addInterestedUser } = require('./reminderManager');
            const participants = extractParticipantsFromEmbed(embed);
            updateReminderParticipants(getCustomEmbedId, participants);
            addInterestedUser(getCustomEmbedId, interaction.user.id);
          } catch (remErr) {
            console.error('[ERROR] Actualizando recordatorio (cannotgo):', remErr);
          }

          // Notificar al líder que el usuario abandonó
          notifyRaidLeader(embed, interaction.guild,
            `⚠️ **${interaction.user.username}** ha marcado que no puede ir al raid y se ha liberado un slot.`
          );

          // Auto-promover desde waitlist para cada slot liberado
          if (freedAssignments.length > 0) {
            setImmediate(async () => {
              for (const { weaponName: fw, groupField: fgf } of freedAssignments) {
                const promoted = await tryPromoteFromWaitlist(embed, currentEmbedEntry, fw, fgf, interaction.guild);
                if (promoted) {
                  try {
                    updateParticipantsCounter(embed);
                    sanitizeEmbedFields(embed);
                    await interaction.message.edit({ embeds: [embed] });
                    persistRaidState(currentEmbedEntry.raidId, embed);
                    notifyRaidLeader(embed, interaction.guild,
                      `✅ Un usuario fue movido automáticamente desde la lista de espera al slot de **${fw}** (liberado por ${interaction.user.username}).`
                    );
                  } catch (e) {
                    console.error('[WARN] cannotgo: auto-promotion embed update error:', e);
                  }
                }
              }
            });
          }

          await interaction.followUp({ content: 'Has marcado que no puedes ir. Se actualizó tu estado.', ephemeral: true });
        } catch (err) {
          console.error('[ERROR] raid_cannotgo handler:', err);
          await interaction.followUp({ content: 'No se pudo actualizar tu estado.', ephemeral: true });
        }
        return;
      }

      // Botón: inscribirse como Looter
      if (customId.startsWith('raid_looter-')) {
        await safeDeferUpdate(interaction);
        const lastDashIndex = customId.lastIndexOf('-');
        const getCustomEmbedId = customId.substring(lastDashIndex + 1);
        const templateName = customId.substring('raid_looter-'.length, lastDashIndex);

        try {
          const embedsList = embedsMap[templateName];
          const currentEmbedEntry = embedsList?.find((entry) => entry.id.trim() === getCustomEmbedId);
          if (!currentEmbedEntry) return;
          const embed = currentEmbedEntry.embed;

          // Comprobar si todos los roles del raid están llenos
          if (!areAllRaidRolesFull(embed)) {
            await interaction.followUp({
              content: '⚠️ Los looters se habilitan cuando **todos los roles del raid estén completos**.',
              ephemeral: true,
            });
            return;
          }

          // Encontrar el campo de Looters
          const lootersField = embed.data.fields.find(f => typeof f.name === 'string' && f.name.startsWith('👑 Looters'));
          if (!lootersField) {
            await interaction.followUp({ content: '⚠️ Este raid no tiene plazas de looter configuradas.', ephemeral: true });
            return;
          }

          const match = lootersField.name.match(/(\d+)\/(\d+)/);
          if (!match) return;
          const current = parseInt(match[1]);
          const total = parseInt(match[2]);

          if (current >= total) {
            await interaction.followUp({ content: '⚠️ El grupo de Looters ya está lleno.', ephemeral: true });
            return;
          }

          if (lootersField.value.includes(interaction.user.toString())) {
            await interaction.followUp({ content: '⚠️ Ya estás inscrito como looter.', ephemeral: true });
            return;
          }

          // Quitar al usuario de cualquier otro slot o sección antes de inscribir
          deleteUserIfExistsOnCurrentField(embed, interaction);

          const waitlistField = embed.data.fields.find(f => f.name === '🕒 Lista de espera');
          const cannotGoField = embed.data.fields.find(f => f.name === '🚫 No puedo ir');
          if (waitlistField?.value?.includes(interaction.user.toString())) {
            const lines = waitlistField.value.split('\n').filter(l => !l.includes(interaction.user.toString()));
            waitlistField.value = lines.join('\n') || '\u200b';
          }
          if (cannotGoField?.value?.includes(interaction.user.toString())) {
            const lines = cannotGoField.value.split('\n').filter(l => !l.includes(interaction.user.toString()));
            cannotGoField.value = lines.join('\n') || '\u200b';
          }

          // Añadir usuario al campo de Looters e incrementar contador
          const currentVal = (lootersField.value === '\u200b' || lootersField.value.trim() === '') ? '' : lootersField.value;
          lootersField.value = currentVal ? `${currentVal}\n${interaction.user}` : `${interaction.user}`;
          lootersField.name = lootersField.name.replace(/(\d+)\/(\d+)/, `${current + 1}/${total}`);

          // Actualizar contador de participantes
          try {
            const { updateParticipantsCounter } = require('./embed');
            updateParticipantsCounter(embed);
          } catch (counterErr) {
            console.error('[WARN] No se pudo actualizar el contador (looter):', counterErr);
          }

          sanitizeEmbedFields(embed);
          await interaction.message.edit({ embeds: [embed] });

          // Persistir estado en BD
          persistRaidState(currentEmbedEntry.raidId, embed);

          try {
            const { updateReminderParticipants, addInterestedUser } = require('./reminderManager');
            const participants = extractParticipantsFromEmbed(embed);
            updateReminderParticipants(getCustomEmbedId, participants);
            addInterestedUser(getCustomEmbedId, interaction.user.id);
          } catch (remErr) {
            console.error('[ERROR] Actualizando recordatorio (looter):', remErr);
          }

          setImmediate(() => checkAndNotifyRaidFull(currentEmbedEntry, interaction.guild));

          await interaction.followUp({ content: '✅ Te has inscrito como looter.', ephemeral: true });
        } catch (err) {
          console.error('[ERROR] raid_looter handler:', err);
          await interaction.followUp({ content: 'No se pudo inscribir como looter.', ephemeral: true });
        }
        return;
      }
    }
  });
};

const modifyUnitsFromName = (embed, weaponCategory) => {
  let isValidUser = true;
  embed.data.fields.forEach((field) => {
    const regex = /<:(\w+):\1>\s+(.+?)\s+\((\d+)\/(\d+)\):/;
    if (field.name.includes(weaponCategory)) {
      console.log(weaponCategory);
      const match = field.name.match(regex);
      if (match) {
        const currentUnits = parseInt(match[3]); // Obtiene las unidades actuales
        const totalUnits = parseInt(match[4]); // Obtiene el total de unidades
        console.log(currentUnits, totalUnits);
        if (currentUnits < totalUnits) {
          const newUnits = currentUnits + 1; // Incrementa el número de unidades
          const updatedName = field.name.replace(
            /(\d+)\/(\d+)/, // Captura el formato X/Y
            `${newUnits}/${totalUnits}` // Reemplaza por el nuevo conteo
          );
          field.name = updatedName; // Asigna el nombre actualizado
          console.log(updatedName); // Muestra el nombre actualizado
          isValidUser = true;
        } else {
          isValidUser = false; // No se puede incrementar más allá del total
        }
      }
    }
  });
  return isValidUser; // Devuelve si fue una acción válida
};


const deleteUserIfExistsOnCurrentField = (
  embed,
  interaction
) => {
  embed.data.fields.forEach((field) => {
    const regexUnits = /<:(\w+):\1>\s+(.+?)\s+\((\d+)\/(\d+)\):/;
    if (field.value.includes(interaction.user)) {
      // Looters field: no emoji prefix, use line-based removal
      if (typeof field.name === 'string' && field.name.startsWith('👑 Looters')) {
        const lines = field.value.split('\n').filter(line => !line.includes(interaction.user.toString()));
        field.value = lines.join('\n') || '\u200b';
        const lootersMatch = field.name.match(/(\d+)\/(\d+)/);
        if (lootersMatch) {
          const current = parseInt(lootersMatch[1]);
          if (current > 0) {
            field.name = field.name.replace(/(\d+)\/(\d+)/, `${current - 1}/${lootersMatch[2]}`);
          }
        }
        return;
      }
      // Regular weapon fields: emoji-prefixed entries
      // Use (^|\n) to also match when the user is the very first line of the field
      const escapedUser = interaction.user.toString().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(^|\\n)<:[^:]+:[0-9]+>[^\\n]*${escapedUser}`, "gm");
      const before = field.value;
      field.value = field.value.replace(regex, (match, prefix) => prefix === '\n' ? '' : '');
      // Trim leading newline that may remain when first line was removed
      field.value = field.value.replace(/^\n+/, '');
      if (field.value.trim() === '') field.value = '\u200b';
      const userWasRemoved = before !== field.value;
      if (userWasRemoved) {
        const match = field.name.match(regexUnits);
        if (match) {
          const currentUnits = parseInt(match[3]);
          const newUnits = Math.max(0, currentUnits - 1);
          const updatedName = field.name.replace(
            /(\d+)\/(\d+)/,
            `${newUnits}/${match[4]}`
          );
          field.name = updatedName;
        }
      }
    }
  });
};

/**
 * Envía un DM al creador del raid cuando todos los grupos se llenan.
 * Solo se envía una vez por raid (flag fullNotificationSent en el embedEntry).
 * @param {{ embed: Object, fullNotificationSent: boolean }} embedEntry
 * @param {import('discord.js').Guild} guild
 */
const checkAndNotifyRaidFull = async (embedEntry, guild) => {
  if (!embedEntry || embedEntry.fullNotificationSent) return;
  if (!areAllRaidRolesFull(embedEntry.embed)) return;

  // Marcar antes del await para evitar doble envío ante condiciones de carrera
  embedEntry.fullNotificationSent = true;

  const leaderField = embedEntry.embed.data.fields.find(f => f.name === 'Líder de la actividad:');
  if (!leaderField) return;

  const creatorId = leaderField.value.replace(/<@!?(\d+)>/, '$1');

  try {
    const creator = await guild.members.fetch(creatorId);
    await creator.send({
      content: 'Tu raid se ha llenado completamente.\n\nTodos los slots están ocupados y el raid está listo.',
    });
    console.log(`[INFO] Notificación de raid lleno enviada al creador (${creatorId})`);
  } catch (e) {
    console.log(`[INFO] No se pudo enviar DM de raid lleno al creador: ${e.message}`);
  }
};

/**
 * Comprueba si todos los roles de raid del embed están completamente llenos.
 * Los campos de roles son los que tienen el patrón (X/Y): en el nombre, excluyendo Looters.
 * @param {Object} embed
 * @returns {boolean}
 */
const areAllRaidRolesFull = (embed) => {
  const fields = embed?.data?.fields || [];
  const roleFields = fields.filter(f =>
    typeof f.name === 'string' &&
    /\(\d+\/\d+\):/.test(f.name) &&
    !f.name.startsWith('👑 Looters')
  );
  if (roleFields.length === 0) return true;
  return roleFields.every(f => {
    const match = f.name.match(/(\d+)\/(\d+)/);
    if (!match) return true;
    return parseInt(match[1]) >= parseInt(match[2]);
  });
};

/**
 * Extrae todos los participantes de un embed
 * @param {Object} embed - El embed del cual extraer participantes
 * @returns {Array} Lista de participantes únicos
 */
const extractParticipantsFromEmbed = (embed) => {
  const participants = new Set();

  try {
    if (embed && embed.data && embed.data.fields) {
      embed.data.fields.forEach((field) => {
        if (field.value && typeof field.value === 'string') {
          const userMatches = field.value.match(/<@!?(\d+)>/g);
          if (userMatches) {
            userMatches.forEach(match => {
              const userId = match.replace(/<@!?(\d+)>/, '$1');
              participants.add(`<@${userId}>`);
            });
          }
        }
      });
    }

    console.log(`[DEBUG] Participantes extraídos: ${Array.from(participants).length} usuarios`);
    return Array.from(participants);
  } catch (error) {
    console.error('[ERROR] Error extrayendo participantes del embed:', error);
    return [];
  }
};

/**
 * Procesa un mensaje que contiene datos hexadecimales automáticamente
 * @param {Message} message - El mensaje de Discord
 */
async function processHexMessage(message) {
  const DungeonDecoder = require('../services/dungeonDecoder');
  const { colorMap, chestEmojis } = require('../utils/dungeonConfig');
  const { createErrorEmbed } = require('../utils/errorEmbeds');

  try {
    let hexData = message.content;

    hexData = hexData
      .replace(/\`\`\`[\s\S]*?\`\`\`/g, '') // Remover bloques de código
      .replace(/\`[^`]*\`/g, '') // Remover código inline
      .replace(/\s+/g, ' ') // Normalizar espacios
      .trim();

    if (!DungeonDecoder.isValidHexData(hexData)) {
      if (hexData.includes('AVA_TEMPLE')) {
        await message.react('❌');
      }
      return;
    }

    console.log(`[AUTO-DECODE] Procesando ${hexData.length} caracteres de ${message.author.tag}`);
    const bosses = DungeonDecoder.decode(hexData);

    if (bosses.length === 0) {
      await message.react('🔍');
      return;
    }

    await message.react('✅');

    const mainEmbed = new EmbedBuilder()
      .setTitle('🤖 Calabozo Detectado Automáticamente')
      .setDescription(`Se encontraron **${bosses.length}** jefe(s) en tu mensaje`)
      .setColor('#00D166')
      .addFields({
        name: '📊 Resumen de Cofres',
        value: generateChestSummary(bosses),
        inline: false
      }, {
        name: '🗺️ Orden de Jefes',
        value: bosses.map((boss, index) =>
          `**${index + 1}.** ${boss.name} (Capa ${boss.layer})`
        ).join('\n'),
        inline: false
      }, {
        name: '👤 Detectado de',
        value: `${message.author.toString()}`,
        inline: false
      })
      .setFooter({
        text: 'Chuny BOT - Auto Decoder • Hecho con ❤️ por @chuny-dev',
        iconURL: 'https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless'
      })
      .setTimestamp();

    const maxEmbeds = Math.min(bosses.length, 4);
    const bossEmbeds = bosses.slice(0, maxEmbeds).map((boss, index) => {
      const color = colorMap[boss.color] || '#FFFFFF';
      const emoji = chestEmojis[boss.color] || '📦';

      return new EmbedBuilder()
        .setTitle(`${emoji} ${boss.name}`)
        .setDescription(`**Cofre:** ${boss.color}`)
        .setColor(color)
        .addFields(
          {
            name: '🗂️ Posición',
            value: `#${index + 1}`,
            inline: true
          },
          {
            name: '🏗️ Capa',
            value: `Nivel ${boss.layer}`,
            inline: true
          },
          {
            name: '📍 Índice',
            value: `${boss.position}`,
            inline: true
          }
        )
        .setFooter({
          text: `Jefe ${index + 1} de ${bosses.length} • Auto-detectado`,
          iconURL: 'https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless'
        })
        .setTimestamp();
    });

    await message.reply({
      embeds: [mainEmbed, ...bossEmbeds],
      allowedMentions: { repliedUser: false }
    });

    console.log(`[AUTO-DECODE] Respuesta enviada: ${bosses.length} jefes detectados para ${message.author.tag}`);

  } catch (error) {
    console.error('[ERROR] Error en auto-decode:', error);
    await message.react('⚠️');
  }
}

/**
 * Genera un resumen de los tipos de cofres encontrados
 * @param {Array} bosses - Lista de jefes
 * @returns {string} Resumen formateado
 */
function generateChestSummary(bosses) {
  const { chestEmojis } = require('../utils/dungeonConfig');
  const chestCounts = {};

  bosses.forEach(boss => {
    if (boss.color) {
      chestCounts[boss.color] = (chestCounts[boss.color] || 0) + 1;
    }
  });

  const summary = Object.entries(chestCounts)
    .map(([color, count]) => {
      const emoji = chestEmojis[color] || '📦';
      return `${emoji} **${color}**: ${count}`;
    })
    .join('\n');

  return summary || 'Sin información de cofres';
}

module.exports = {
  getEvents,
  extractParticipantsFromEmbed,
};

// ─────────────────────────────────────────────────────────────────────────────
// Notify button handler
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Maneja los botones "✅ Asistiré" y "❌ No asistiré" del embed público de notificaciones.
 * Actualiza las listas en BD y edita el mensaje del canal en tiempo real.
 * @param {import('discord.js').ButtonInteraction} interaction
 */
async function handleNotifyResponse(interaction) {
  if (interaction.deferred || interaction.replied) return;
  const { customId } = interaction;
  const isAttending = customId.startsWith('notify_attending-');
  const notifyId = customId.substring(
    isAttending ? 'notify_attending-'.length : 'notify_notattending-'.length,
  );
  const userId = interaction.user.id;

  // 1. Load record from DB
  let event;
  try {
    event = await NotifyEvent.findOne({ notifyId });
  } catch (e) {
    logDatabaseError(`handleNotifyResponse lookup #${notifyId}`, e);
    return interaction.reply({ content: '❌ Error interno. Inténtalo de nuevo.', ephemeral: true });
  }

  if (!event) {
    return interaction.reply({
      content: '❌ Esta notificación ya no está disponible.',
      ephemeral: true,
    });
  }

  // 2. Move user to the correct list (remove from both, then add to chosen)
  event.attending = event.attending.filter((id) => id !== userId);
  event.not_attending = event.not_attending.filter((id) => id !== userId);
  if (isAttending) {
    event.attending.push(userId);
  } else {
    event.not_attending.push(userId);
  }

  // 3. Persist updated lists
  try {
    await event.save();
  } catch (e) {
    logDatabaseError(`handleNotifyResponse save #${notifyId}`, e);
    return interaction.reply({ content: '❌ Error al guardar tu respuesta.', ephemeral: true });
  }

  // 4. Rebuild the channel embed with updated lists
  const { buildNotifyEmbed, buildNotifyButtons } = require('../commands/utility/notify');
  const updatedEmbed = buildNotifyEmbed(
    event.message,
    event.hora,
    event.createdBy,
    event.attending,
    event.not_attending,
    event.totalMembers,
  );
  const buttons = buildNotifyButtons(notifyId);

  // 5. Update the original channel message via interaction.update()
  try {
    await interaction.update({ embeds: [updatedEmbed], components: [buttons] });
  } catch (e) {
    logDiscordError(`handleNotifyResponse update #${notifyId}`, e);
    try {
      await interaction.reply({ content: '⚠️ Tu respuesta fue guardada pero no se pudo actualizar el embed.', ephemeral: true });
    } catch { /* already ack'd */ }
    return;
  }

  // 6. Ephemeral confirmation
  const replyText = isAttending
    ? '✅ Has confirmado tu asistencia.'
    : '❌ Has indicado que no podrás asistir.';
  try {
    await interaction.followUp({ content: replyText, ephemeral: true });
  } catch { /* ignore if interaction window expired */ }
}

