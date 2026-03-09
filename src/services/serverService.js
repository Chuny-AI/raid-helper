const Server = require('../database/models/Server');

/**
 * Obtiene o crea un servidor en la base de datos
 */
const getOrCreateServer = async (guildId, guildName) => {
  try {
    let server = await Server.findOne({ guildId });
    
    if (!server) {
      server = new Server({
        guildId,
        guildName,
        templates: []
      });
      await server.save();
      console.log(`[INFO] Nuevo servidor creado: ${guildName} (${guildId})`);
    }
    
    return server;
  } catch (error) {
    console.error('[ERROR] Error en getOrCreateServer:', error);
    throw error;
  }
};

/**
 * Obtiene un servidor por su ID
 */
const getServer = async (guildId) => {
  try {
    return await Server.findOne({ guildId }).populate('templates');
  } catch (error) {
    console.error('[ERROR] Error en getServer:', error);
    throw error;
  }
};

/**
 * Actualiza el nombre del servidor
 */
const updateServerName = async (guildId, guildName) => {
  try {
    return await Server.findOneAndUpdate(
      { guildId },
      { guildName },
      { new: true }
    );
  } catch (error) {
    console.error('[ERROR] Error en updateServerName:', error);
    throw error;
  }
};

module.exports = {
  getOrCreateServer,
  getServer,
  updateServerName
};
