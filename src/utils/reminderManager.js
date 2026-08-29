const { parseMinutes, formatMinutes } = require('./time');
const { createReminderEmbed } = require('./embed');

/**
 * Mapa para almacenar los recordatorios activos
 * Estructura: { interactionId: { timeoutId, participants, templateName, channelId, guildId, interestedUsers } }
 */
const activeReminders = new Map();

/**
 * Crea un recordatorio para una actividad
 * @param {string} interactionId - ID único de la interacción
 * @param {string} reminderTime - Tiempo del recordatorio en minutos (ej: "10", "30")
 * @param {number} eventTimestampMs - Timestamp Unix del evento en milisegundos
 * @param {string} templateName - Nombre del template
 * @param {string} channelId - ID del canal donde se creó la actividad
 * @param {string} guildId - ID del servidor
 * @param {string} activityTitle - Título de la actividad
 * @param {Array} participants - Lista de participantes (se actualizará dinámicamente)
 */
const createReminder = (interactionId, reminderTime, eventTimestampMs, templateName, channelId, guildId, activityTitle, participants = []) => {
  try {
    const reminderDelayMs = parseMinutes(reminderTime);

    // El recordatorio se envía X minutos antes del evento
    const fireAtMs = eventTimestampMs - reminderDelayMs;
    const delayMs = fireAtMs - Date.now();

    if (delayMs <= 0) {
      console.log(`[WARNING] El recordatorio para "${activityTitle}" no se puede programar: el tiempo de disparo ya pasó`);
      return null;
    }

    const timeoutId = setTimeout(async () => {
      await sendReminderNotification(interactionId, templateName, channelId, guildId, activityTitle, participants);
      activeReminders.delete(interactionId);
    }, delayMs);

    activeReminders.set(interactionId, {
      timeoutId,
      participants,
      templateName,
      channelId,
      guildId,
      activityTitle,
      reminderTime,
      interestedUsers: new Set()
    });

    console.log(`[INFO] Recordatorio creado para "${activityTitle}" - disparo en ${Math.round(delayMs / 60000)} min`);
    return timeoutId;

  } catch (error) {
    console.error('[ERROR] Error creando recordatorio:', error);
    return null;
  }
};

/**
 * Actualiza la lista de participantes de un recordatorio
 * @param {string} interactionId - ID de la interacción
 * @param {Array} participants - Nueva lista de participantes
 */
const updateReminderParticipants = (interactionId, participants) => {
  const reminder = activeReminders.get(interactionId);
  if (reminder) {
    reminder.participants = participants;
    activeReminders.set(interactionId, reminder);
  }
};

/**
 * Agrega un usuario interesado a un recordatorio
 * @param {string} interactionId - ID de la interacción
 * @param {string} userId - ID del usuario
 */
const addInterestedUser = (interactionId, userId) => {
  const reminder = activeReminders.get(interactionId);
  if (reminder && reminder.interestedUsers) {
    reminder.interestedUsers.add(userId);
    activeReminders.set(interactionId, reminder);
  }
};

/**
 * Envía la notificación de recordatorio a todos los participantes
 * @param {string} interactionId - ID de la interacción
 * @param {string} templateName - Nombre del template
 * @param {string} channelId - ID del canal
 * @param {string} guildId - ID del servidor
 * @param {string} activityTitle - Título de la actividad
 * @param {Array} participants - Lista de participantes
 */
const sendReminderNotification = async (interactionId, templateName, channelId, guildId, activityTitle, participants) => {
  try {
    const { client } = require('./client');
    const channel = client.channels.cache.get(channelId);

    if (!channel) {
      console.error(`[ERROR] No se encontró el canal ${channelId}`);
      return;
    }

    const reminder = activeReminders.get(interactionId);
    const reminderTimeFormatted = reminder ? formatMinutes(parseMinutes(reminder.reminderTime)) : 'pronto';

    let updatedParticipants = participants || [];
    try {
      // interactionId es el raidId (ver src/commands/utility/raid.js): se lee el
      // estado estructurado actual en vez de reconstruirlo desde el texto del embed.
      const RaidEvent = require('../database/models/RaidEvent');
      const { participantMentions } = require('../services/raidState');
      const raidDoc = await RaidEvent.findOne({ eventId: interactionId });
      if (raidDoc && raidDoc.stateVersion >= 2) {
        const extractedParticipants = participantMentions(raidDoc);
        if (extractedParticipants.length > 0) {
          updatedParticipants = extractedParticipants;
          console.log(`[INFO] Participantes actualizados desde el estado del raid: ${updatedParticipants.length} usuarios`);
        }
      }
    } catch (fetchError) {
      console.error('[ERROR] Error obteniendo participantes del raid:', fetchError);
    }

    const reminderEmbed = createReminderEmbed(activityTitle, templateName, reminderTimeFormatted, updatedParticipants, channelId);

    const { createReminderComponents } = require('./embed');
    const components = createReminderComponents(channelId, guildId);

    await channel.send({
      embeds: [reminderEmbed],
      components: components
    });

    const interestedUsers = reminder?.interestedUsers || new Set();

    updatedParticipants.forEach(participant => {
      const userId = participant.replace(/[<@!>]/g, '');
      if (userId && userId.length > 0) {
        interestedUsers.add(userId);
      }
    });

    if (interestedUsers.size === 0) {
      try {
        const messages = await channel.messages.fetch({ limit: 10 });
        const eventMessage = messages.find(msg =>
          msg.embeds.length > 0 &&
          msg.embeds[0].title &&
          msg.embeds[0].title.includes(activityTitle)
        );

        if (eventMessage) {
          interestedUsers.add(eventMessage.author.id);
        }
      } catch (fetchError) {
        console.error('[ERROR] Error obteniendo mensajes del canal:', fetchError);
      }
    }

    let successfulDMs = 0;
    let failedDMs = 0;

    for (const userId of interestedUsers) {
      try {
        const user = await client.users.fetch(userId);

        if (user && !user.bot) {
          await user.send({
            embeds: [reminderEmbed],
            components: components
          });
          successfulDMs++;
        }
      } catch (dmError) {
        console.error(`[ERROR] No se pudo enviar DM a ${userId}:`, dmError.message);
        failedDMs++;
      }
      // Mismo respiro que en /notify y en el aviso masivo de /raid create:
      // abrir muchos DM seguidos choca con el rate limit de Discord.
      await new Promise((r) => setTimeout(r, 250));
    }

    console.log(`[INFO] Recordatorio enviado para ${templateName}: ${successfulDMs} DMs exitosos, ${failedDMs} DMs fallidos, ${updatedParticipants.length} participantes`);

  } catch (error) {
    console.error('[ERROR] Error enviando recordatorio:', error);
  }
};

/**
 * Cancela un recordatorio
 * @param {string} interactionId - ID de la interacción
 */
const cancelReminder = (interactionId) => {
  const reminder = activeReminders.get(interactionId);
  if (reminder) {
    clearTimeout(reminder.timeoutId);
    activeReminders.delete(interactionId);
    console.log(`[INFO] Recordatorio cancelado para ${interactionId}`);
  }
};

/**
 * Obtiene todos los recordatorios activos
 * @returns {Map} Mapa de recordatorios activos
 */
const getActiveReminders = () => {
  return activeReminders;
};

/**
 * Limpia todos los recordatorios (útil para shutdown)
 */
const clearAllReminders = () => {
  for (const [interactionId, reminder] of activeReminders) {
    clearTimeout(reminder.timeoutId);
  }
  activeReminders.clear();
  console.log('[INFO] Todos los recordatorios han sido limpiados');
};

module.exports = {
  createReminder,
  updateReminderParticipants,
  addInterestedUser,
  cancelReminder,
  getActiveReminders,
  clearAllReminders
};
