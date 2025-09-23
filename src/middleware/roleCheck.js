const { getAuthorizedRoles } = require('../services/authorizedRoleService');
const { isServerPremium } = require('../services/serverService');
const { isUserAuthorized } = require('../services/authorizedUserService');
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
};/**
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

module.exports = {
  checkAuthorizedRole,
  checkPremiumAccess,
  checkPremiumAccessWithOwnerBypass,
  checkAuthorizedUserAccess
};
