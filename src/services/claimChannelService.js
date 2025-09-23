const ClaimChannelConfig = require('../database/models/ClaimChannelConfig');

/**
 * Servicio para gestionar la configuración de canales de claims
 */
class ClaimChannelService {

  /**
   * Obtener la configuración de canales de un servidor
   * @param {string} guildId - ID del servidor
   * @returns {Promise<Object|null>} - Configuración de canales o null
   */
  static async getChannelConfig(guildId) {
    try {
      const config = await ClaimChannelConfig.findOne({ guildId });
      return config;
    } catch (error) {
      console.error('[ERROR] Error obteniendo configuración de canales:', error);
      throw error;
    }
  }

  /**
   * Configurar canal de claims
   * @param {string} guildId - ID del servidor
   * @param {string} guildName - Nombre del servidor
   * @param {string} channelId - ID del canal
   * @param {string} channelName - Nombre del canal
   * @param {string} userId - ID del usuario que configura
   * @returns {Promise<Object>} - Configuración actualizada
   */
  static async setClaimsChannel(guildId, guildName, channelId, channelName, userId) {
    try {
      let config = await ClaimChannelConfig.findOne({ guildId });

      if (!config) {
        config = new ClaimChannelConfig({
          guildId,
          guildName,
          claimsChannelId: channelId,
          claimsChannelName: channelName,
          configuredBy: userId
        });
      } else {
        config.claimsChannelId = channelId;
        config.claimsChannelName = channelName;
        config.updatedBy = userId;
      }

      await config.save();

      console.log(`[INFO] Canal de claims configurado: ${channelName} (${channelId}) en servidor ${guildName}`);
      return config;
    } catch (error) {
      console.error('[ERROR] Error configurando canal de claims:', error);
      throw error;
    }
  }

  /**
   * Configurar canal de recordatorios
   * @param {string} guildId - ID del servidor
   * @param {string} guildName - Nombre del servidor
   * @param {string} channelId - ID del canal
   * @param {string} channelName - Nombre del canal
   * @param {string} userId - ID del usuario que configura
   * @returns {Promise<Object>} - Configuración actualizada
   */
  static async setRemindersChannel(guildId, guildName, channelId, channelName, userId) {
    try {
      let config = await ClaimChannelConfig.findOne({ guildId });

      if (!config) {
        config = new ClaimChannelConfig({
          guildId,
          guildName,
          remindersChannelId: channelId,
          remindersChannelName: channelName,
          configuredBy: userId
        });
      } else {
        config.remindersChannelId = channelId;
        config.remindersChannelName = channelName;
        config.updatedBy = userId;
      }

      await config.save();

      console.log(`[INFO] Canal de recordatorios configurado: ${channelName} (${channelId}) en servidor ${guildName}`);
      return config;
    } catch (error) {
      console.error('[ERROR] Error configurando canal de recordatorios:', error);
      throw error;
    }
  }

  /**
   * Obtener canal de claims configurado
   * @param {string} guildId - ID del servidor
   * @returns {Promise<string|null>} - ID del canal de claims o null
   */
  static async getClaimsChannelId(guildId) {
    try {
      const config = await this.getChannelConfig(guildId);
      return config ? config.claimsChannelId : null;
    } catch (error) {
      console.error('[ERROR] Error obteniendo canal de claims:', error);
      return null;
    }
  }

  /**
   * Obtener canal de recordatorios configurado
   * @param {string} guildId - ID del servidor
   * @returns {Promise<string|null>} - ID del canal de recordatorios o null
   */
  static async getRemindersChannelId(guildId) {
    try {
      const config = await this.getChannelConfig(guildId);
      return config ? config.remindersChannelId : null;
    } catch (error) {
      console.error('[ERROR] Error obteniendo canal de recordatorios:', error);
      return null;
    }
  }

  /**
   * Eliminar configuración de canal de claims
   * @param {string} guildId - ID del servidor
   * @param {string} userId - ID del usuario que elimina
   * @returns {Promise<Object>} - Configuración actualizada
   */
  static async removeClaimsChannel(guildId, userId) {
    try {
      const config = await ClaimChannelConfig.findOne({ guildId });

      if (!config) {
        throw new Error('No hay configuración de canales para este servidor');
      }

      config.claimsChannelId = null;
      config.claimsChannelName = null;
      config.updatedBy = userId;

      await config.save();

      console.log(`[INFO] Canal de claims eliminado en servidor ${guildId}`);
      return config;
    } catch (error) {
      console.error('[ERROR] Error eliminando canal de claims:', error);
      throw error;
    }
  }

  /**
   * Eliminar configuración de canal de recordatorios
   * @param {string} guildId - ID del servidor
   * @param {string} userId - ID del usuario que elimina
   * @returns {Promise<Object>} - Configuración actualizada
   */
  static async removeRemindersChannel(guildId, userId) {
    try {
      const config = await ClaimChannelConfig.findOne({ guildId });

      if (!config) {
        throw new Error('No hay configuración de canales para este servidor');
      }

      config.remindersChannelId = null;
      config.remindersChannelName = null;
      config.updatedBy = userId;

      await config.save();

      console.log(`[INFO] Canal de recordatorios eliminado en servidor ${guildId}`);
      return config;
    } catch (error) {
      console.error('[ERROR] Error eliminando canal de recordatorios:', error);
      throw error;
    }
  }
  /**
   * Configurar canal de claims exitosos
   * @param {string} guildId - ID del servidor
   * @param {string} guildName - Nombre del servidor
   * @param {string} channelId - ID del canal
   * @param {string} channelName - Nombre del canal
   * @param {string} userId - ID del usuario que configuró
   * @returns {Promise<Object>} - Configuración actualizada
   */
  static async setSuccessChannel(guildId, guildName, channelId, channelName, userId) {
    try {
      let config = await ClaimChannelConfig.findOne({ guildId });

      if (!config) {
        config = new ClaimChannelConfig({
          guildId,
          guildName,
          successChannelId: channelId,
          successChannelName: channelName,
          configuredBy: userId
        });
      } else {
        config.successChannelId = channelId;
        config.successChannelName = channelName;
        config.updatedBy = userId;
      }

      await config.save();

      console.log(`[INFO] Canal de claims exitosos configurado: ${channelName} (${channelId}) en servidor ${guildName}`);
      return config;
    } catch (error) {
      console.error('[ERROR] Error configurando canal de claims exitosos:', error);
      throw error;
    }
  }

  /**
   * Configurar canal de claims cerrados
   * @param {string} guildId - ID del servidor
   * @param {string} guildName - Nombre del servidor
   * @param {string} channelId - ID del canal
   * @param {string} channelName - Nombre del canal
   * @param {string} userId - ID del usuario que configuró
   * @returns {Promise<Object>} - Configuración actualizada
   */
  static async setClosedChannel(guildId, guildName, channelId, channelName, userId) {
    try {
      let config = await ClaimChannelConfig.findOne({ guildId });

      if (!config) {
        config = new ClaimChannelConfig({
          guildId,
          guildName,
          closedChannelId: channelId,
          closedChannelName: channelName,
          configuredBy: userId
        });
      } else {
        config.closedChannelId = channelId;
        config.closedChannelName = channelName;
        config.updatedBy = userId;
      }

      await config.save();

      console.log(`[INFO] Canal de claims cerrados configurado: ${channelName} (${channelId}) en servidor ${guildName}`);
      return config;
    } catch (error) {
      console.error('[ERROR] Error configurando canal de claims cerrados:', error);
      throw error;
    }
  }

  /**
   * Obtener ID del canal de claims exitosos
   * @param {string} guildId - ID del servidor
   * @returns {Promise<string|null>} - ID del canal o null
   */
  static async getSuccessChannelId(guildId) {
    try {
      const config = await ClaimChannelConfig.findOne({ guildId });
      return config ? config.successChannelId : null;
    } catch (error) {
      console.error('[ERROR] Error obteniendo canal de claims exitosos:', error);
      throw error;
    }
  }

  /**
   * Obtener ID del canal de claims cerrados
   * @param {string} guildId - ID del servidor
   * @returns {Promise<string|null>} - ID del canal o null
   */
  static async getClosedChannelId(guildId) {
    try {
      const config = await ClaimChannelConfig.findOne({ guildId });
      return config ? config.closedChannelId : null;
    } catch (error) {
      console.error('[ERROR] Error obteniendo canal de claims cerrados:', error);
      throw error;
    }
  }

  /**
   * Eliminar configuración del canal de claims exitosos
   * @param {string} guildId - ID del servidor
   * @param {string} userId - ID del usuario que eliminó
   * @returns {Promise<Object>} - Configuración actualizada
   */
  static async removeSuccessChannel(guildId, userId) {
    try {
      const config = await ClaimChannelConfig.findOne({ guildId });

      if (!config) {
        throw new Error('No hay configuración de canales para este servidor');
      }

      config.successChannelId = null;
      config.successChannelName = null;
      config.updatedBy = userId;

      await config.save();

      console.log(`[INFO] Canal de claims exitosos eliminado en servidor ${guildId}`);
      return config;
    } catch (error) {
      console.error('[ERROR] Error eliminando canal de claims exitosos:', error);
      throw error;
    }
  }

  /**
   * Eliminar configuración del canal de claims cerrados
   * @param {string} guildId - ID del servidor
   * @param {string} userId - ID del usuario que eliminó
   * @returns {Promise<Object>} - Configuración actualizada
   */
  static async removeClosedChannel(guildId, userId) {
    try {
      const config = await ClaimChannelConfig.findOne({ guildId });

      if (!config) {
        throw new Error('No hay configuración de canales para este servidor');
      }

      config.closedChannelId = null;
      config.closedChannelName = null;
      config.updatedBy = userId;

      await config.save();

      console.log(`[INFO] Canal de claims cerrados eliminado en servidor ${guildId}`);
      return config;
    } catch (error) {
      console.error('[ERROR] Error eliminando canal de claims cerrados:', error);
      throw error;
    }
  }
}

module.exports = ClaimChannelService;
