const { isServerPremium } = require('../services/serverService');

/**
 * Middleware para verificar si un servidor tiene premium (sin respuesta automática)
 * @param {Object} interaction - La interacción de Discord
 * @returns {Promise<boolean>} - true si tiene premium, false si no
 */
const isServerPremiumSilent = async (interaction) => {
  try {
    const guildId = interaction.guild.id;
    const isPremium = await isServerPremium(guildId);
    return isPremium;
  } catch (error) {
    console.error('[ERROR] Error en isServerPremiumSilent:', error);
    return false;
  }
};

module.exports = {
  isServerPremiumSilent
};
