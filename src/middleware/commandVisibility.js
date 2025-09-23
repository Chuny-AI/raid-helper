const { isServerPremiumSilent } = require('./premiumCheckSilent');
const { isOwner } = require('./ownerCheck');

/**
 * Middleware para verificar si un comando debe ser visible para el usuario
 * @param {Object} interaction - La interacción de Discord
 * @param {string} commandType - Tipo de comando ('premium', 'owner', 'admin')
 * @returns {Promise<boolean>} - true si el comando debe ser visible, false si no
 */
const shouldShowCommand = async (interaction, commandType) => {
  try {
    switch (commandType) {
      case 'premium':
        return await isServerPremiumSilent(interaction);
      
      case 'owner':
        return await isOwner(interaction);
      
      case 'admin':
        if (!interaction.guild || !interaction.member) {
          return false;
        }
        return interaction.member.permissions.has('Administrator');
      
      default:
        return true;
    }
  } catch (error) {
    console.error('[ERROR] Error en shouldShowCommand:', error);
    return false;
  }
};

/**
 * Middleware para verificar si un comando premium debe ser visible
 * @param {Object} interaction - La interacción de Discord
 * @returns {Promise<boolean>} - true si el comando debe ser visible, false si no
 */
const shouldShowPremiumCommand = async (interaction) => {
  return await shouldShowCommand(interaction, 'premium');
};

/**
 * Middleware para verificar si un comando de propietario debe ser visible
 * @param {Object} interaction - La interacción de Discord
 * @returns {Promise<boolean>} - true si el comando debe ser visible, false si no
 */
const shouldShowOwnerCommand = async (interaction) => {
  return await shouldShowCommand(interaction, 'owner');
};

/**
 * Middleware para verificar si un comando de administrador debe ser visible
 * @param {Object} interaction - La interacción de Discord
 * @returns {Promise<boolean>} - true si el comando debe ser visible, false si no
 */
const shouldShowAdminCommand = async (interaction) => {
  return await shouldShowCommand(interaction, 'admin');
};

module.exports = {
  shouldShowCommand,
  shouldShowPremiumCommand,
  shouldShowOwnerCommand,
  shouldShowAdminCommand
};
