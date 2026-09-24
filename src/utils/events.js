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
const { renderRaidEmbed, renderRaidComponents } = require('./raidRender');
const { deleteRaidVoiceChannelIfEmpty } = require('./raidVoice');
const {
  handleDiscordMemberJoin,
  handleDiscordMemberLeave,
  sweepRegistrations,
} = require('../services/albionRegistrationService');
const {
  handleMemberJoin,
  handleMemberLeave,
  handleMemberUpdate,
  syncConfiguredGuildMembers,
} = require('../services/memberLogService');
const {
  handleChannelDelete,
  handleVoiceStateUpdate,
  recoverTemporaryVoiceChannels,
} = require('../services/temporaryVoiceService');

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
 * con sus selectores sobre un raid ya cerrado:
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
      await raidRegistry.renderAndEdit(raid.eventId);
      raidRegistry.unregister(raid.eventId);
      return;
    }

    if (!raid.channelId || !raid.messageId) return;
    const channel = await clientRef.channels.fetch(raid.channelId);
    const message = channel ? await channel.messages.fetch(raid.messageId) : null;
    if (!message) return;

    raid.status = 'closed';
    // Un raid legacy (stateVersion 1) no tiene el estado estructurado que
    // necesita el render, así que ahí solo se le quitan los componentes.
    // En stateVersion 2 el render deja el botón de registrar asistencia: un
    // raid que se cierra solo (expiración) también necesita ese informe.
    const payload = raid.stateVersion >= 2
      ? { embeds: [renderRaidEmbed(raid, raid)], components: renderRaidComponents(raid, raid) }
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
 * Cierra un raid desde las rutinas automáticas: marca el documento como cerrado
 * y deja el mensaje en solo lectura.
 *
 * El hilo privado NO se toca. Ningún cierre borra hilos: el borrado es siempre
 * una decisión del líder, que la toma con el botón "Eliminar hilo" del mensaje
 * del raid (o al terminar de registrar la asistencia).
 * @param {Object} raid documento RaidEvent
 * @param {import('discord.js').Client} clientRef
 * @param {string} motivo para el log
 */
async function closeRaidAndSeal(raid, clientRef, motivo) {
  const cerrado = await closeRaidEvent(raid.eventId);
  await sealRaidMessage(raid, clientRef, motivo);
  if (raid.voiceChannelId) {
    const guild = clientRef.guilds.cache.get(raid.guildId);
    if (guild) {
      try {
        await deleteRaidVoiceChannelIfEmpty(guild, raid);
      } catch (error) {
        console.error(`[WARN] ${motivo}: no se pudo limpiar el canal de voz del raid #${raid.eventId}:`, error?.message);
      }
    }
  }
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
  if (raid.status !== 'active' || !raid.reminder || !raid.eventTimestamp) return false;
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
      let migratedStarted = 0;
      let reattached = 0;
      let restoredReminders = 0;
      const now = Date.now();

      for (const raid of activeRaids) {
        // Compatibilidad: tanto el antiguo estado `started` como un raid activo
        // que ya tenga sala significan que se pulsó Iniciar. El flujo actual lo
        // convierte directamente en finalizado con asistencia abierta.
        if (raid.status === 'started' || (raid.status === 'active' && raid.voiceChannelId)) {
          raid.status = 'closed';
          raid.startedAt ||= raid.updatedAt || new Date();
          raid.closedBy ||= raid.startedBy;
          raid.closedAt ||= raid.startedAt;
          try {
            await raid.save();
            migratedStarted++;
            await sealRaidMessage(raid, readyClient, 'migración de evento iniciado');
          } catch (saveError) {
            console.error(`[MIGRATE] Raid #${raid.eventId}: no se pudo finalizar el evento ya iniciado:`, saveError);
          }
          continue;
        }

        // Expirar raids cuya hora ya pasó hace más de 2 horas
        if (raid.eventTimestamp && raid.eventTimestamp * 1000 + 2 * 60 * 60 * 1000 < now) {
          await closeRaidAndSeal(raid, readyClient, 'expiración al arrancar');
          console.log(`[INFO] Raid #${raid.eventId} expirado y cerrado automáticamente.`);
          continue;
        }

        if (raid.stateVersion < 2) {
          const result = await migrateFromSnapshot(raid);
          if (!result.ok) {
            console.error(`[MIGRATE] Raid #${raid.eventId}: no se pudo migrar (${result.reason}). Se cierra para evitar dejarlo en un estado inconsistente.`);
            await closeRaidAndSeal(raid, readyClient, 'migración fallida');
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
            await closeRaidAndSeal(raid, readyClient, 'mensaje inexistente');
            continue;
          }
          raidRegistry.register({ raidId: raid.eventId, raid, message, templateName: raid.templateName });
          // Re-renderiza con los componentes actuales (customId estables por raidId,
          // opciones desaparecen/reaparecen según ocupación y fase del raid).
          await raidRegistry.renderAndEdit(raid.eventId);
          if (restoreReminder(raid)) restoredReminders++;
          reattached++;
        } catch (e) {
          console.error(`[WARN] Raid #${raid.eventId}: no se pudo reconectar su mensaje:`, e?.message);
        }
      }

      if (migrated > 0) console.log(`[INFO] ${migrated} raid(s) migrados a estado estructurado (stateVersion 2).`);
      if (migratedStarted > 0) console.log(`[INFO] ${migratedStarted} raid(s) iniciados finalizados automáticamente con asistencia abierta.`);
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
            await closeRaidAndSeal(raid, readyClient, 'limpieza periódica');
            raidRegistry.unregister(raid.eventId);
            console.log(`[INFO] Raid #${raid.eventId} expirado, cerrado por limpieza periódica.`);
          }
        }
      } catch (e) {
        console.error('[WARN] Error en limpieza periódica de raids:', e);
      }
    }, 30 * 60 * 1000);

    // Se ejecuta después de recuperar raids y recordatorios para que una
    // sincronización grande de miembros no retrase funciones ya activas.
    try {
      const syncedMembers = await syncConfiguredGuildMembers(readyClient);
      if (syncedMembers > 0) {
        console.log(`[INFO] ${syncedMembers} identidad(es) de miembros sincronizadas para bienvenida y despedida.`);
      }
    } catch (error) {
      console.error('[ERROR] No se pudieron sincronizar las identidades de miembros:', error);
    }

    try {
      const removedChannels = await recoverTemporaryVoiceChannels(readyClient);
      if (removedChannels > 0) {
        console.log(`[INFO] ${removedChannels} canal(es) de voz temporales vacíos eliminados al iniciar.`);
      }
    } catch (error) {
      console.error('[ERROR] No se pudieron recuperar los canales de voz temporales:', error);
    }

    // Un lote pequeño al arrancar y luego lotes periódicos. Cada ficha
    // conserva su propio nextCheckAt y un fallo de Albion no retira roles.
    sweepRegistrations(readyClient).catch((error) => {
      console.error('[WARN] No se pudieron sincronizar los registros Albion al iniciar:', error);
    });
    setInterval(() => {
      sweepRegistrations(readyClient).catch((error) => {
        console.error('[WARN] No se pudieron sincronizar los registros Albion:', error);
      });
    }, 5 * 60 * 1000).unref?.();

  });

  client.on(Events.GuildCreate, async (guild) => {
    try {
      await getOrCreateServer(guild.id, guild.name);
      console.log(`[INFO] Bot añadido al servidor: ${guild.name} (${guild.id})`);
    } catch (error) {
      console.error('[ERROR] Error al procesar nuevo servidor:', error);
    }
  });

  client.on(Events.GuildMemberAdd, async (member) => {
    try {
      await handleMemberJoin(member, client.user);
    } catch (error) {
      console.error(`[ERROR] No se pudo registrar la entrada de ${member.id}:`, error);
    }
    try {
      await handleDiscordMemberJoin(member);
    } catch (error) {
      console.error(`[WARN] No se pudo validar Albion al entrar ${member.id}:`, error);
    }
  });

  client.on(Events.GuildMemberUpdate, async (_oldMember, newMember) => {
    try {
      await handleMemberUpdate(newMember);
    } catch (error) {
      console.error(`[ERROR] No se pudo actualizar el nombre de ${newMember.id}:`, error);
    }
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    try {
      await handleMemberLeave(member, client.user);
    } catch (error) {
      console.error(`[ERROR] No se pudo registrar la salida de ${member.id}:`, error);
    }
    try {
      await handleDiscordMemberLeave(member);
    } catch (error) {
      console.error(`[WARN] No se pudo actualizar la vinculación Albion de ${member.id}:`, error);
    }
  });

  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    try {
      await handleVoiceStateUpdate(oldState, newState);
    } catch (error) {
      console.error(`[ERROR] No se pudo procesar el cambio de voz de ${newState.id || oldState.id}:`, error);
    }
  });

  client.on(Events.ChannelDelete, async (channel) => {
    try {
      await handleChannelDelete(channel);
    } catch (error) {
      console.error(`[ERROR] No se pudo limpiar el registro del canal ${channel.id}:`, error);
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
      if (interaction.customId.startsWith('albion-register:')) {
        const panelCommand = interaction.client.commands?.get('registro-panel');
        if (panelCommand?.handleInteraction && await panelCommand.handleInteraction(interaction)) return;
      }
      if (interaction.customId.startsWith('regcfg:')) {
        const setupRegistration = interaction.client.commands?.get('setup-registro');
        if (setupRegistration?.handleInteraction && await setupRegistration.handleInteraction(interaction)) return;
      }
      const handled = await raidInteractions.routeRaidInteraction(interaction);
      if (handled) return;

      if (interaction.customId.startsWith('setup:')) {
        const setupCommand = interaction.client.commands?.get('setup');
        if (setupCommand?.handleInteraction) {
          await setupCommand.handleInteraction(interaction);
          return;
        }
      }

      // Un único punto de entrada para creación, edición y eliminación de
      // plantillas. El controlador decide el flujo según el prefijo del ID.
      if (templateCommand.canHandleInteraction(interaction)) {
        await templateCommand.handleInteraction(interaction);
        return;
      }
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

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith(RAID_CONFIG_PREFIX)) {
      await raidCommand.handleWeaponConfigInteraction(interaction);
      return;
    }

    if (interaction.isButton()) {
      // Confirmar creación de raid (publicar con armas configuradas)
      if (interaction.customId.startsWith('raid_confirm_create-')) {
        await raidCommand.handleConfirmRaidCreate(interaction);
        return;
      }

      if (interaction.customId.startsWith('raid_confirm_edit-')) {
        await raidCommand.handleConfirmRaidEdit(interaction);
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

    }

    if (interaction.isModalSubmit()) {
      // Modales del panel de configuración de armas al crear raid (cupos)
      if (interaction.customId.startsWith(RAID_CONFIG_PREFIX)) {
        await raidCommand.handleWeaponConfigInteraction(interaction);
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

