const RaidEvent = require('../database/models/RaidEvent');

/**
 * Obtener todos los raids activos
 */
async function getActiveRaids() {
  try {
    return await RaidEvent.find({ status: 'active' });
  } catch (error) {
    console.error('[ERROR] Error obteniendo raids activos:', error);
    return [];
  }
}

/**
 * Cerrar un raid (marcar como cerrado) por su eventId, sin tener el documento
 * cargado en memoria. Usado por las rutinas de expiración automática
 * (src/utils/events.js), que solo conocen el eventId. Para cerrar un raid
 * desde una interacción, usa raidInteractions.finishRaid en su lugar.
 *
 * Suelta también `threadId`: un raid cerrado ya no tiene hilo privado (quien
 * cierra debe borrarlo antes; ver `closeRaidAndThread` en src/utils/events.js).
 */
async function closeRaidEvent(eventId) {
  try {
    return await RaidEvent.findOneAndUpdate(
      { eventId },
      { status: 'closed', threadId: null, updatedAt: new Date() },
      { new: true }
    );
  } catch (error) {
    console.error('[ERROR] Error cerrando raid:', error);
    throw error;
  }
}

module.exports = {
  getActiveRaids,
  closeRaidEvent,
};
