const { getAuthorizedRoles } = require('../services/authorizedRoleService');

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
 * Middleware que verifica acceso: administrador o rol autorizado.
 * El nombre se mantiene por compatibilidad con imports existentes.
 * @param {Object} interaction
 * @returns {Promise<boolean>}
 */
const checkPremiumAccessWithOwnerBypass = async (interaction) => {
  return await checkPremiumAccess(interaction);
};

module.exports = {
  checkAuthorizedRole,
  checkPremiumAccess,
  checkPremiumAccessWithOwnerBypass,
};
