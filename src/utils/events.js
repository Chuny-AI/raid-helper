const { InteractionType, Events, EmbedBuilder } = require("discord.js");
const { client } = require("./client");
const { getOrCreateServer } = require("../services/serverService");
const { filterCommand } = require("./commandFilter");
const { getActiveRaids, closeRaidEvent } = require('../services/raidEventService');
const RaidEvent = require('../database/models/RaidEvent');
const NotifyEvent = require('../database/models/NotifyEvent');
const { safeReply } = require('./errorEmbeds');
const { logDiscordError, logDatabaseError, logInteractionError } = require('./logging');
const { safeDeferUpdate, wrapInteractionMethods } = require('./interaction');
const { logUncontrolledError } = require('./processGuards');
const raidRegistry = require('../services/raidRegistry');
const raidInteractions = require('./raidInteractions');
const { migrateFromSnapshot } = require('../services/raidStateMigration');
const { deleteRaidThread } = require('./raidThread');
const { renderRaidEmbed } = require('./raidRender');

// Import template command
const templateCommand = require("../commands/utility/template");

// Import raid command handlers for the confirm/config flow
const raidCommand = require("../commands/utility/raid");

// Prefijo de los customId del panel de configuración de armas de /raid create
const RAID_CONFIG_PREFIX = 'raidcfg-';

/**
 * Deja el mensaje de un raid cerrado en solo lectura.
 *
 * `closeRaidEvent` solo cambia el estado en BD, así que el mensaje se quedaba
 * con sus selectores y su botón "Finalizar evento" sobre un raid ya cerrado:
 * quien los pulsara recibía un error en vez de ver que el evento terminó.
 * `finishRaid` (cierre manual) sí lo hacía; esto lo iguala para los cierres
 * automáticos.
 * @param {Object} raid documento RaidEvent
 * @param {import('discord.js').Client} clientRef
 * @param {string} motivo para el log
 */
async function sealRaidMessage(raid, clientRef, motivo) {
  try {
    // Si el raid está en el registro, su documento es otra instancia distinta
    // de la que llega aquí: hay que cerrar esa para que el render la vea.
    const runtime = raidRegistry.getByRaidId(raid.eventId);
    if (runtime) {
      runtime.raid.status = 'closed';
      runtime.raid.threadId = null;
      await raidRegistry.renderAndEdit(raid.eventId);
      raidRegistry.unregister(raid.eventId);
      return;
    }

    if (!raid.channelId || !raid.messageId) return;
    const channel = await clientRef.channels.fetch(raid.channelId);
    const message = channel ? await channel.messages.fetch(raid.messageId) : null;
    if (!message) return;

    raid.status = 'closed';
    raid.threadId = null;
    // Un raid legacy (stateVersion 1) no tiene el estado estructurado que
    // necesita el render, así que ahí solo se le quitan los componentes.
    const payload = raid.stateVersion >= 2
      ? { embeds: [renderRaidEmbed(raid, raid)], components: [] }
      : { components: [] };
    await message.edit(payload);
  } catch (e) {
    // 10003 canal desconocido, 10008 mensaje desconocido: el mensaje ya no
    // existe, que es justo uno de los motivos por los que se cierra el raid.
    if (e?.code === 10003 || e?.code === 10008) return;
    console.error(`[WARN] ${motivo}: no se pudieron desactivar los botones del raid #${raid.eventId}:`, e?.message);
  }
}

/**
 * Cierra un raid desde las rutinas automáticas borrando antes su hilo privado.
 * `closeRaidEvent` solo toca la BD: sin esto, un raid que expira (o cuyo mensaje
 * ya no existe) dejaría su hilo privado colgando en el canal para siempre.
 * @param {Object} raid documento RaidEvent
 * @param {import('discord.js').Client} clientRef
 * @param {string} motivo para el log
 */
async function closeRaidAndThread(raid, clientRef, motivo) {
  if (raid.threadId) {
    try {
      const guild = clientRef.guilds.cache.get(raid.guildId)
        || await clientRef.guilds.fetch(raid.guildId);
      await deleteRaidThread(guild, raid.threadId, raid.eventId);
    } catch (e) {
      console.error(`[WARN] ${motivo}: no se pudo borrar el hilo del raid #${raid.eventId}:`, e?.message);
    }
  }
  const cerrado = await closeRaidEvent(raid.eventId);
  await sealRaidMessage(raid, clientRef, motivo);
  return cerrado;
}

/**
 * Reprograma el recordatorio de un raid tras un reinicio.
 *
 * Los recordatorios viven en un `setTimeout` en memoria (reminderManager), así
 * que un reinicio los perdía en silencio: el raid recuperaba sus botones pero
 * nunca avisaba. Se reprograma con la misma clave (el eventId), y
 * `createReminder` ya devuelve null si la hora de disparo ya pasó.
 * @param {Object} raid documento RaidEvent ya reconectado
 * @returns {boolean} true si quedó un recordatorio programado
 */
function restoreReminder(raid) {
  if (!raid.reminder || !raid.eventTimestamp) return false;
  try {
    const { createReminder } = require('./reminderManager');
    const timeoutId = createReminder(
      raid.eventId,
      raid.reminder,
      raid.eventTimestamp * 1000,
      raid.templateName,
      raid.channelId,
      raid.guildId,
      raid.title,
      [],
    );
    return timeoutId !== null;
  } catch (e) {
    console.error(`[WARN] Raid #${raid.eventId}: no se pudo reprogramar el recordatorio:`, e?.message);
    return false;
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

    // Reconstruir el registro de raids activos (raidRegistry) y migrar los que
    // aún estén en formato legacy (stateVersion 1, estado como texto de embed)
    // al estado estructurado por slot (stateVersion 2). Esto es lo que evita
    // que los raids activos pierdan interactividad tras un reinicio del bot.
    try {
      const activeRaids = await getActiveRaids();
      let migrated = 0;
      let reattached = 0;
      let restoredReminders = 0;
      const now = Date.now();

      for (const raid of activeRaids) {
        // Expirar raids cuya hora ya pasó hace más de 2 horas
        if (raid.eventTimestamp && raid.eventTimestamp * 1000 + 2 * 60 * 60 * 1000 < now) {
          await closeRaidAndThread(raid, readyClient, 'expiración al arrancar');
          console.log(`[INFO] Raid #${raid.eventId} expirado y cerrado automáticamente.`);
          continue;
        }

        if (raid.stateVersion < 2) {
          const result = await migrateFromSnapshot(raid);
          if (!result.ok) {
            console.error(`[MIGRATE] Raid #${raid.eventId}: no se pudo migrar (${result.reason}). Se cierra para evitar dejarlo en un estado inconsistente.`);
            await closeRaidAndThread(raid, readyClient, 'migración fallida');
            continue;
          }
          try {
            await raid.save();
          } catch (saveErr) {
            console.error(`[MIGRATE] Raid #${raid.eventId}: error guardando el estado migrado:`, saveErr);
            continue;
          }
          migrated++;
          if (result.warnings?.length) {
            console.log(`[MIGRATE] Raid #${raid.eventId}: ${result.warnings.join(' | ')}`);
          }
        }

        if (!raid.channelId || !raid.messageId) continue;
        try {
          const channel = await readyClient.channels.fetch(raid.channelId);
          const message = channel ? await channel.messages.fetch(raid.messageId) : null;
          if (!message) {
            console.error(`[WARN] Raid #${raid.eventId}: no se encontró su mensaje (${raid.messageId}), se cierra.`);
            await closeRaidAndThread(raid, readyClient, 'mensaje inexistente');
            continue;
          }
          raidRegistry.register({ raidId: raid.eventId, raid, message, templateName: raid.templateName });
          // Re-renderiza con los componentes actuales (customId estables por raidId,
          // opciones desaparecen/reaparecen según ocupación, botón "Finalizar evento").
          await raidRegistry.renderAndEdit(raid.eventId);
          if (restoreReminder(raid)) restoredReminders++;
          reattached++;
        } catch (e) {
          console.error(`[WARN] Raid #${raid.eventId}: no se pudo reconectar su mensaje:`, e?.message);
        }
      }

      if (migrated > 0) console.log(`[INFO] ${migrated} raid(s) migrados a estado estructurado (stateVersion 2).`);
      if (reattached > 0) console.log(`[INFO] ${reattached} raid(s) activos reconectados.`);
      if (restoredReminders > 0) console.log(`[INFO] ${restoredReminders} recordatorio(s) reprogramados.`);
    } catch (error) {
      console.error('[ERROR] Error reconstruyendo el registro de raids:', error);
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
      try {
        const activeRaids = await getActiveRaids();
        for (const raid of activeRaids) {
          if (!raid.eventTimestamp) continue;
          if (raid.eventTimestamp * 1000 + 2 * 60 * 60 * 1000 < now) {
            await closeRaidAndThread(raid, readyClient, 'limpieza periódica');
            raidRegistry.unregister(raid.eventId);
            console.log(`[INFO] Raid #${raid.eventId} expirado, cerrado por limpieza periódica.`);
          }
        }
      } catch (e) {
        console.error('[WARN] Error en limpieza periódica de raids:', e);
      }
    }, 30 * 60 * 1000);

    // Purga de sesiones de creación de templates abandonadas (cada 10 min).
    // El módulo exportaba la limpieza pero nadie la llamaba: una creación que
    // el usuario dejaba a medias se quedaba en memoria hasta reiniciar el bot.
    setInterval(() => {
      try {
        require('../lib/template/template-sessions').cleanupExpiredSessions();
      } catch (e) {
        console.error('[WARN] Error limpiando sesiones de template:', e?.message);
      }
    }, 10 * 60 * 1000);
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

  // Todo el enrutado vive aquí; el listener de abajo es quien lo protege.
  const dispatchInteraction = async (interaction) => {
    wrapInteractionMethods(interaction);

    // Enrutar interacciones de raids (select de armas, lista de espera, no puedo
    // ir, looters, finalizar evento) antes que cualquier otro manejador. Cubre
    // tanto el esquema de customId nuevo ("raid:*") como el legacy pre-refactor.
    if (interaction.customId) {
      const handled = await raidInteractions.routeRaidInteraction(interaction);
      if (handled) return;
    }

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
      // Panel de configuración de armas al crear raid (grupos/armas, cupos)
      if (interaction.customId.startsWith(RAID_CONFIG_PREFIX)) {
        await raidCommand.handleWeaponConfigInteraction(interaction);
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

      // Panel de configuración de armas al crear raid (navegación y toggles)
      if (interaction.customId.startsWith(RAID_CONFIG_PREFIX)) {
        await raidCommand.handleWeaponConfigInteraction(interaction);
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
      // Modales del panel de configuración de armas al crear raid (cupos)
      if (interaction.customId.startsWith(RAID_CONFIG_PREFIX)) {
        await raidCommand.handleWeaponConfigInteraction(interaction);
        return;
      }

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

  };

  // Un manejador que lanza deja una promesa rechazada que discord.js no captura:
  // sin este try/catch, un fallo al crear un raid tumbaba el proceso entero.
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      await dispatchInteraction(interaction);
    } catch (error) {
      logUncontrolledError(`interacción ${interaction?.commandName || interaction?.customId || interaction?.type}`, error);

      // 10062: token caducado. 40060: ya respondida. En ambos casos no hay
      // ningún mensaje que podamos actualizar, solo dejar constancia del fallo.
      if (error?.code === 10062 || error?.code === 40060) return;
      if (interaction?.isAutocomplete?.()) return;

      await safeReply(interaction, {
        content: 'Ocurrió un error procesando esta acción. El bot sigue activo: vuelve a intentarlo.',
        ephemeral: true,
      });
    }
  });
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

  // 1-3. Mover al usuario a la lista elegida con operadores atómicos.
  //
  // No se hace leer -> modificar en memoria -> save(): dos personas pulsando a
  // la vez leerían la misma lista y la segunda escritura borraría la respuesta
  // de la primera. Con $pull/$addToSet cada update solo toca el id de quien
  // pulsa, así que las respuestas simultáneas no se pisan. Son dos updates
  // porque MongoDB no admite $pull y $addToSet sobre el mismo array en uno
  // solo; ambos son idempotentes y afectan únicamente a este usuario.
  const target = isAttending ? 'attending' : 'not_attending';
  let event;
  try {
    const found = await NotifyEvent.findOneAndUpdate(
      { notifyId },
      { $pull: { attending: userId, not_attending: userId } },
      { new: true },
    );
    if (!found) {
      return interaction.reply({
        content: '❌ Esta notificación ya no está disponible.',
        ephemeral: true,
      });
    }
    event = await NotifyEvent.findOneAndUpdate(
      { notifyId },
      { $addToSet: { [target]: userId } },
      { new: true },
    ) || found;
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

