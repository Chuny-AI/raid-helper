const { getAuthorizedRoles } = require('../services/authorizedRoleService');
const { isServerPremium } = require('../services/serverService');
const { isUserAuthorized } = require('../services/authorizedUserService');
const EconomyRoleService = require('../services/economyRoleService');
const { EmbedBuilder } = require('discord.js');
const { createPremiumEmbed } = require('../utils/errorEmbeds');

/**
 * Middleware para verificar si un usuario tiene roles autorizados para comandos premium.
 * @param {Object} interaction - La interacción de Discord.
 * @returns {Promise<boolean>} - true si el usuario tiene roles autorizados, false si no.
 */
const checkAuthorizedRole = async (interaction) => {
  try {
    if (!interaction.guild || !interaction.member) {
      return false;
    }

    const guildId = interaction.guild.id;
    const authorizedRoles = await getAuthorizedRoles(guildId);

    if (authorizedRoles.length === 0) {
      return false;
    }

    const authorizedRoleIds = authorizedRoles.map(role => role.roleId);
    const hasAuthorizedRole = interaction.member.roles.cache.some(role =>
      authorizedRoleIds.includes(role.id)
    );

    return hasAuthorizedRole;
  } catch (error) {
    console.error('[ERROR] Error en checkAuthorizedRole:', error);
    return false;
  }
};

/**
 * Middleware para verificar si un usuario puede usar comandos premium.
 * Verifica si es propietario del bot, administrador, o tiene roles autorizados.
 * @param {Object} interaction - La interacción de Discord.
 * @returns {Promise<boolean>} - true si el usuario puede usar comandos premium, false si no.
 */
const checkPremiumAccess = async (interaction) => {
  try {
    if (!interaction.guild || !interaction.member) {
      return false;
    }

    let botOwnerId;
    const application = interaction.client.application;
    if (application && application.owner) {
      botOwnerId = application.owner.id;
    } else {
      botOwnerId = process.env.BOT_OWNER_ID;
    }

    if (interaction.user.id === botOwnerId) {
      return true;
    }

    if (interaction.member.permissions.has('Administrator')) {
      return true;
    }

    const hasAuthorizedRole = await checkAuthorizedRole(interaction);
    if (hasAuthorizedRole) {
      return true;
    }

    return false;
  } catch (error) {
    console.error('[ERROR] Error en checkPremiumAccess:', error);
    return false;
  }
};

/**
 * Middleware para verificar acceso premium con bypass para el propietario.
 * PRIORIDAD 1: Solo el propietario puede usar comandos en servidores no premium.
 * PRIORIDAD 2: En servidores premium, verificar permisos de usuario.
 * @param {Object} interaction - La interacción de Discord.
 * @returns {Promise<boolean>} - true si el usuario puede usar el comando, false si no.
 */
const checkPremiumAccessWithOwnerBypass = async (interaction) => {
  try {
    if (!interaction.guild) {
      return false; // No permitir comandos premium en DMs
    }

    let botOwnerId;
    const application = interaction.client.application;
    if (application && application.owner) {
      botOwnerId = application.owner.id;
    } else {
      botOwnerId = process.env.BOT_OWNER_ID;
    }

    const guildId = interaction.guild.id;
    const isPremium = await isServerPremium(guildId);

    if (!isPremium) {
      if (interaction.user.id === botOwnerId) {
        return true; // El propietario puede usar comandos en cualquier servidor
      } else {
        // No responder aquí, dejar que commandFilter maneje la respuesta
        return false;
      }
    }

    return await checkPremiumAccess(interaction);
  } catch (error) {
    console.error('[ERROR] Error en checkPremiumAccessWithOwnerBypass:', error);
    return false;
  }
};

/**
 * Middleware para verificar si un usuario está autorizado para comandos de decode
 * @param {Object} interaction - La interacción de Discord.
 * @returns {Promise<boolean>} - true si el usuario está autorizado, false si no.
 */
const checkAuthorizedUserAccess = async (interaction) => {
  try {
    if (!interaction.user) {
      return false;
    }

    // Verificar si es el propietario del bot
    let botOwnerId;
    const application = interaction.client.application;
    if (application && application.owner) {
      botOwnerId = application.owner.id;
    } else {
      botOwnerId = process.env.BOT_OWNER_ID;
    }

    if (interaction.user.id === botOwnerId) {
      return true;
    }

    // Verificar si está en la tabla de usuarios autorizados
    return await isUserAuthorized(interaction.user.id);
  } catch (error) {
    console.error('[ERROR] Error en checkAuthorizedUserAccess:', error);
    return false;
  }
};

/**
 * Middleware para verificar permisos de economía
 * Verifica PREMIUM + roles con permisos ECONOMY en la base de datos
 * @param {Object} interaction - La interacción de Discord
 * @param {string} [specificPermission] - Permiso específico a verificar (opcional)
 * @returns {Promise<boolean>} - true si tiene permisos de economía
 */
const checkEconomyPermission = async (interaction, specificPermission = 'ECONOMY') => {
  try {
    if (!interaction.guild || !interaction.member) {
      console.log('[ECONOMY_CHECK] No guild o member encontrado');
      return false;
    }

    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    // 1. PRIMERA PRIORIDAD: Verificar si es propietario del bot
    let botOwnerId;
    const application = interaction.client.application;
    if (application && application.owner) {
      botOwnerId = application.owner.id;
    } else {
      botOwnerId = process.env.BOT_OWNER_ID;
    }

    if (userId === botOwnerId) {
      console.log('[ECONOMY_CHECK] Usuario es propietario del bot - acceso total');
      return true;
    }

    // 2. SEGUNDA PRIORIDAD: Verificar estado premium del servidor
    const isPremium = await isServerPremium(guildId);
    console.log(`[ECONOMY_CHECK] ¿Servidor premium?: ${isPremium}`);
    
    if (!isPremium) {
      console.log('[ECONOMY_CHECK] Servidor no premium - acceso denegado');
      return false;
    }

    // 3. TERCERA PRIORIDAD: Verificar si es administrador
    if (interaction.member.permissions.has('Administrator')) {
      console.log('[ECONOMY_CHECK] Usuario es administrador - acceso permitido');
      return true;
    }

    // 4. CUARTA PRIORIDAD: Verificar permisos de economía en base de datos
    const hasEconomyPermission = await EconomyRoleService.hasEconomyPermission(interaction, specificPermission);
    console.log(`[ECONOMY_CHECK] ¿Tiene permiso ${specificPermission}?: ${hasEconomyPermission}`);

    if (!hasEconomyPermission) {
      console.log('[ECONOMY_CHECK] Usuario no tiene permisos de economía');
      return false;
    }

    console.log('[ECONOMY_CHECK] Todas las validaciones pasadas - acceso permitido');
    return true;

  } catch (error) {
    console.error('[ERROR] Error en checkEconomyPermission:', error);
    return false;
  }
};

/**
 * Middleware para verificar permisos específicos de economía
 * @param {Object} interaction - La interacción de Discord
 * @param {string} permission - Permiso específico requerido
 * @returns {Promise<boolean>} - true si tiene el permiso específico
 */
const checkSpecificEconomyPermission = async (interaction, permission) => {
  try {
    // Primero verificar permisos básicos de economía
    const hasBasicAccess = await checkEconomyPermission(interaction, 'ECONOMY');
    if (!hasBasicAccess) {
      return false;
    }

    // Si es propietario o admin, tiene todos los permisos
    const userId = interaction.user.id;
    let botOwnerId;
    const application = interaction.client.application;
    if (application && application.owner) {
      botOwnerId = application.owner.id;
    } else {
      botOwnerId = process.env.BOT_OWNER_ID;
    }

    if (userId === botOwnerId || interaction.member.permissions.has('Administrator')) {
      return true;
    }

    // Verificar permiso específico
    return await EconomyRoleService.hasEconomyPermission(interaction, permission);
  } catch (error) {
    console.error('[ERROR] Error en checkSpecificEconomyPermission:', error);
    return false;
  }
};

/**
 * Obtiene información detallada de permisos de economía de un usuario
 * @param {Object} interaction - La interacción de Discord
 * @returns {Promise<Object>} - Información de permisos
 */
const getEconomyPermissionInfo = async (interaction) => {
  try {
    if (!interaction.guild || !interaction.member) {
      return {
        hasAccess: false,
        reason: 'No guild o member encontrado',
        permissions: []
      };
    }

    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    // Verificar si es propietario
    let botOwnerId;
    const application = interaction.client.application;
    if (application && application.owner) {
      botOwnerId = application.owner.id;
    } else {
      botOwnerId = process.env.BOT_OWNER_ID;
    }

    if (userId === botOwnerId) {
      return {
        hasAccess: true,
        reason: 'Propietario del bot',
        permissions: ['ALL']
      };
    }

    // Verificar premium
    const isPremium = await isServerPremium(guildId);
    if (!isPremium) {
      return {
        hasAccess: false,
        reason: 'Servidor no premium',
        permissions: []
      };
    }

    // Verificar si es admin
    if (interaction.member.permissions.has('Administrator')) {
      return {
        hasAccess: true,
        reason: 'Administrador del servidor',
        permissions: ['ALL']
      };
    }

    // Obtener permisos específicos de economía
    const permissions = await EconomyRoleService.getUserEconomyPermissions(interaction);
    
    return {
      hasAccess: permissions.length > 0,
      reason: permissions.length > 0 ? 'Roles de economía autorizados' : 'Sin roles de economía',
      permissions
    };

  } catch (error) {
    console.error('[ERROR] Error en getEconomyPermissionInfo:', error);
    return {
      hasAccess: false,
      reason: 'Error interno',
      permissions: []
    };
  }
};

module.exports = {
  checkAuthorizedRole,
  checkPremiumAccess,
  checkPremiumAccessWithOwnerBypass,
  checkAuthorizedUserAccess,
  checkEconomyPermission,
  checkSpecificEconomyPermission,
  getEconomyPermissionInfo
};
