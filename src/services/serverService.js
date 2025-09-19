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

/**
 * Actualiza el estado premium del servidor
 */
const updateServerPremium = async (guildId, premium) => {
  try {
    return await Server.findOneAndUpdate(
      { guildId },
      { premium },
      { new: true }
    );
  } catch (error) {
    console.error('[ERROR] Error en updateServerPremium:', error);
    throw error;
  }
};

/**
 * Verifica si un servidor tiene premium
 */
const isServerPremium = async (guildId) => {
  try {
    const server = await Server.findOne({ guildId });
    return server ? server.premium : false;
  } catch (error) {
    console.error('[ERROR] Error en isServerPremium:', error);
    return false;
  }
};

/**
 * Obtiene todos los servidores premium
 */
const getPremiumServers = async () => {
  try {
    return await Server.find({ premium: true });
  } catch (error) {
    console.error('[ERROR] Error en getPremiumServers:', error);
    throw error;
  }
};

module.exports = {
  getOrCreateServer,
  getServer,
  updateServerName,
  updateServerPremium,
  isServerPremium,
  getPremiumServers
};
