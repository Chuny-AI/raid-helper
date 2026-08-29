const { getAuthorizedRoles } = require('../services/authorizedRoleService');

/**
 * Middleware para verificar si un usuario tiene alguno de los roles autorizados del servidor.
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
 * Middleware para verificar si un usuario puede usar los comandos restringidos.
 * Concede acceso a administradores del servidor y a quien tenga un rol autorizado.
 * @param {Object} interaction - La interacción de Discord.
 * @returns {Promise<boolean>} - true si el usuario tiene acceso, false si no.
 */
const checkAuthorizedAccess = async (interaction) => {
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
    console.error('[ERROR] Error en checkAuthorizedAccess:', error);
    return false;
  }
};

module.exports = {
  checkAuthorizedRole,
  checkAuthorizedAccess,
};
