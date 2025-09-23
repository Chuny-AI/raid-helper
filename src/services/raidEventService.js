const RaidEvent = require('../database/models/RaidEvent');

/**
 * Crear un nuevo evento de raid
 */
const createRaidEvent = async (eventData) => {
  try {
    const raidEvent = new RaidEvent(eventData);
    await raidEvent.save();
    return raidEvent;
  } catch (error) {
    console.error('[ERROR] Error creando evento de raid:', error);
    throw error;
  }
};

/**
 * Obtener un evento de raid por ID
 */
const getRaidEvent = async (eventId) => {
  try {
    return await RaidEvent.findOne({ eventId });
  } catch (error) {
    console.error('[ERROR] Error obteniendo evento de raid:', error);
    throw error;
  }
};

/**
 * Actualizar un evento de raid
 */
const updateRaidEvent = async (eventId, updateData) => {
  try {
    return await RaidEvent.findOneAndUpdate(
      { eventId },
      { ...updateData, updatedAt: new Date() },
      { new: true }
    );
  } catch (error) {
    console.error('[ERROR] Error actualizando evento de raid:', error);
    throw error;
  }
};

/**
 * Agregar participante al evento
 */
const addParticipant = async (eventId, userId, username, assignedWeapons = []) => {
  try {
    const event = await getRaidEvent(eventId);
    if (!event) {
      throw new Error('Evento no encontrado');
    }

    const existingParticipant = event.participants.find(p => p.userId === userId);
    if (existingParticipant) {
      return { success: false, message: 'Ya eres participante de este evento' };
    }

    event.cannotGo = event.cannotGo.filter(p => p.userId !== userId);

    event.participants.push({
      userId,
      username,
      assignedWeapons
    });

    for (const weapon of assignedWeapons) {
      const weaponAssignment = event.weaponAssignments.find(w => w.weaponId === weapon.weaponId);
      if (weaponAssignment) {
        weaponAssignment.currentCount += 1;
        weaponAssignment.assignedUsers.push({
          userId,
          username
        });
      }
    }

    await event.save();
    return { success: true, message: 'Te has apuntado al evento' };
  } catch (error) {
    console.error('[ERROR] Error agregando participante:', error);
    throw error;
  }
};

/**
 * Marcar usuario como "No Puedo Ir"
 */
const markCannotGo = async (eventId, userId, username) => {
  try {
    const event = await getRaidEvent(eventId);
    if (!event) {
      throw new Error('Evento no encontrado');
    }

    const existingCannotGo = event.cannotGo.find(p => p.userId === userId);
    if (existingCannotGo) {
      return { success: false, message: 'Ya estás marcado como "No Puedo Ir"' };
    }

    for (const weaponAssignment of event.weaponAssignments) {
      const userIndex = weaponAssignment.assignedUsers.findIndex(u => u.userId === userId);
      if (userIndex !== -1) {
        weaponAssignment.currentCount = Math.max(0, weaponAssignment.currentCount - 1);
        weaponAssignment.assignedUsers.splice(userIndex, 1);
      }
    }

    event.participants = event.participants.filter(p => p.userId !== userId);

    event.cannotGo.push({
      userId,
      username
    });

    await event.save();
    return { success: true, message: 'Te has marcado como "No Puedo Ir"' };
  } catch (error) {
    console.error('[ERROR] Error marcando como no puede ir:', error);
    throw error;
  }
};

/**
 * Quitar usuario de "No Puedo Ir"
 */
const removeCannotGo = async (eventId, userId) => {
  try {
    const event = await getRaidEvent(eventId);
    if (!event) {
      throw new Error('Evento no encontrado');
    }

    const existingCannotGo = event.cannotGo.find(p => p.userId === userId);
    if (!existingCannotGo) {
      return { success: false, message: 'No estabas marcado como "No Puedo Ir"' };
    }

    event.cannotGo = event.cannotGo.filter(p => p.userId !== userId);

    await event.save();
    return { success: true, message: 'Te has quitado de "No Puedo Ir"' };
  } catch (error) {
    console.error('[ERROR] Error quitando de no puede ir:', error);
    throw error;
  }
};

/**
 * Toggle estado de "No Puedo Ir"
 */
const toggleCannotGo = async (eventId, userId, username) => {
  try {
    const event = await getRaidEvent(eventId);
    if (!event) {
      throw new Error('Evento no encontrado');
    }

    const existingCannotGo = event.cannotGo.find(p => p.userId === userId);
    
    if (existingCannotGo) {
      return await removeCannotGo(eventId, userId);
    } else {
      return await markCannotGo(eventId, userId, username);
    }
  } catch (error) {
    console.error('[ERROR] Error toggle no puede ir:', error);
    throw error;
  }
};

/**
 * Obtener participantes del evento
 */
const getParticipants = async (eventId) => {
  try {
    const event = await getRaidEvent(eventId);
    return event ? event.participants : [];
  } catch (error) {
    console.error('[ERROR] Error obteniendo participantes:', error);
    return [];
  }
};

/**
 * Obtener usuarios que no pueden ir
 */
const getCannotGo = async (eventId) => {
  try {
    const event = await getRaidEvent(eventId);
    return event ? event.cannotGo : [];
  } catch (error) {
    console.error('[ERROR] Error obteniendo no pueden ir:', error);
    return [];
  }
};

/**
 * Obtener asignaciones de armas
 */
const getWeaponAssignments = async (eventId) => {
  try {
    const event = await getRaidEvent(eventId);
    return event ? event.weaponAssignments : [];
  } catch (error) {
    console.error('[ERROR] Error obteniendo asignaciones de armas:', error);
    return [];
  }
};

/**
 * Eliminar evento de raid
 */
const deleteRaidEvent = async (eventId) => {
  try {
    return await RaidEvent.findOneAndDelete({ eventId });
  } catch (error) {
    console.error('[ERROR] Error eliminando evento de raid:', error);
    throw error;
  }
};

module.exports = {
  createRaidEvent,
  getRaidEvent,
  updateRaidEvent,
  addParticipant,
  markCannotGo,
  removeCannotGo,
  toggleCannotGo,
  getParticipants,
  getCannotGo,
  getWeaponAssignments,
  deleteRaidEvent
};
