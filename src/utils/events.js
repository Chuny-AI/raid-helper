const { InteractionType, Events, EmbedBuilder } = require("discord.js");
const { client } = require("./client");
const { embedsMap, rebuildEmbedFromSnapshot, safeFieldValue, updateParticipantsCounter } = require("../utils/embed");
const { getOrCreateServer } = require("../services/serverService");
const { filterCommand } = require("./commandFilter");
const { getActiveRaids, closeRaidEvent, syncEmbedSnapshot, updateRaidEvent } = require('../services/raidEventService');
const RaidEvent = require('../database/models/RaidEvent');

// Import template command
const templateCommand = require("../commands/utility/template");

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
        console.error(error);
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: "Hubo un error ejecutando el comando",
            ephemeral: true,
          });
        } else {
          await interaction.reply({
            content: "Hubo un error ejecutando el comando",
            ephemeral: true,
          });
        }
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
        await command.autocomplete(interaction);
      } catch (error) {
        console.error(error);
      }
    }

    if (interaction.isStringSelectMenu()) {
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
      if (interaction.customId === "template_continue") {
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
        try {
          await interaction.deferUpdate();
        } catch (ackError) {
          console.error('[WARN] No se pudo deferUpdate en interacción de registro:', ackError);
        }

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
        // Para usuarios que NO estaban en este grupo: eliminar de cualquier otra arma/sección
        if (!userAlreadyInGroup) {
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

      // Botón: mover a Lista de espera (libera cupo)
      if (customId.startsWith('raid_waitlist-')) {
        // Acknowledge quickly to avoid interaction failure
        try { await interaction.deferUpdate(); } catch (e) { }
        const lastDashIndex = customId.lastIndexOf('-');
        const getCustomEmbedId = customId.substring(lastDashIndex + 1);
        const templateName = customId.substring('raid_waitlist-'.length, lastDashIndex);

        try {
          // Obtener el embed actual
          const embedsList = embedsMap[templateName];
          const currentEmbedEntry = embedsList?.find((entry) => entry.id.trim() === getCustomEmbedId);
          if (!currentEmbedEntry) return;
          const embed = currentEmbedEntry.embed;

          // Capturar en qué grupo estaba el usuario antes de moverlo a la lista de espera
          const userStr = interaction.user.toString();
          let previousGroup = null;
          for (const field of embed.data.fields) {
            if (typeof field.name !== 'string') continue;
            if (!/\(\d+\/\d+\):/.test(field.name)) continue;
            if (field.name.startsWith('👑 Looters')) continue;
            if (typeof field.value === 'string' && field.value.includes(userStr)) {
              const groupMatch = field.name.match(/<:[^:]+:[0-9]+>\s+(.+?)\s+\(/);
              if (groupMatch) previousGroup = groupMatch[1];
              break;
            }
          }

          // Registrar el grupo preferido del usuario en la lista de espera por grupo
          if (!currentEmbedEntry.waitlistGroups) currentEmbedEntry.waitlistGroups = {};
          if (previousGroup) currentEmbedEntry.waitlistGroups[interaction.user.id] = previousGroup;

          // Quitar usuario de cualquier arma y decrementar unidades
          deleteUserIfExistsOnCurrentField(embed, interaction);

          // Asegurar campo de Lista de espera
          const waitlistFieldName = '🕒 Lista de espera';
          let waitlistField = embed.data.fields.find(f => f.name === waitlistFieldName);
          if (!waitlistField) {
            waitlistField = { name: waitlistFieldName, value: '\u200b', inline: false };
            embed.data.fields.push(waitlistField);
          }
          // Añadir usuario a la lista si no está ya
          if (!waitlistField.value.includes(interaction.user.toString())) {
            const current = (waitlistField.value === '\u200b' || waitlistField.value.trim() === '') ? '' : waitlistField.value;
            waitlistField.value = current ? `${current}\n${interaction.user}` : `${interaction.user}`;
          }

          // Remover del apartado "No puedo ir" si estaba allí
          const cannotGoFieldName = '🚫 No puedo ir';
          const cannotGoField = embed.data.fields.find(f => f.name === cannotGoFieldName);
          if (cannotGoField && typeof cannotGoField.value === 'string' && cannotGoField.value.includes(interaction.user.toString())) {
            const lines = cannotGoField.value.split('\n').filter(line => !line.includes(interaction.user.toString()));
            cannotGoField.value = lines.join('\n') || '\u200b';
          }

          // Actualizar contador de participantes y visualmente el mensaje
          try {
            const { updateParticipantsCounter } = require('./embed');
            updateParticipantsCounter(embed);
          } catch (counterErr) {
            console.error('[WARN] No se pudo actualizar el contador (waitlist):', counterErr);
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
            console.error('[ERROR] Actualizando recordatorio (waitlist):', remErr);
          }

          await interaction.followUp({ content: 'Has sido movido a la lista de espera.', ephemeral: true });
        } catch (err) {
          console.error('[ERROR] raid_waitlist handler:', err);
          await interaction.followUp({ content: 'No se pudo mover a la lista de espera.', ephemeral: true });
        }
        return;
      }

      // Botón: marcar No puedo ir (mueve a Lista de espera y libera cupo)
      if (customId.startsWith('raid_cannotgo-')) {
        // Acknowledge quickly to avoid interaction failure
        try { await interaction.deferUpdate(); } catch (e) { }
        const lastDashIndex = customId.lastIndexOf('-');
        const getCustomEmbedId = customId.substring(lastDashIndex + 1);
        const templateName = customId.substring('raid_cannotgo-'.length, lastDashIndex);

        try {
          const embedsList = embedsMap[templateName];
          const currentEmbedEntry = embedsList?.find((entry) => entry.id.trim() === getCustomEmbedId);
          if (!currentEmbedEntry) return;
          const embed = currentEmbedEntry.embed;

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

          await interaction.followUp({ content: 'Has marcado que no puedes ir. Se actualizó tu estado.', ephemeral: true });
        } catch (err) {
          console.error('[ERROR] raid_cannotgo handler:', err);
          await interaction.followUp({ content: 'No se pudo actualizar tu estado.', ephemeral: true });
        }
        return;
      }

      // Botón: inscribirse como Looter
      if (customId.startsWith('raid_looter-')) {
        try { await interaction.deferUpdate(); } catch (e) { }
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
