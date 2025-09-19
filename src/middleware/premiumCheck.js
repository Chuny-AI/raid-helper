const { isServerPremium } = require('../services/serverService');

/**
 * Middleware para verificar si un servidor tiene premium
 * @param {Object} interaction - La interacción de Discord
 * @returns {Promise<boolean>} - true si tiene premium, false si no
 */
const checkPremium = async (interaction) => {
  try {
    const guildId = interaction.guild.id;
    const isPremium = await isServerPremium(guildId);
    
    if (!isPremium) {
      await interaction.reply({
        content: "❌ Este servidor no tiene acceso premium. Contacta al administrador para activar el bot.",
        ephemeral: true,
      });
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('[ERROR] Error en checkPremium:', error);
    await interaction.reply({
      content: "❌ Error verificando el estado premium del servidor.",
      ephemeral: true,
    });
    return false;
  }
};

module.exports = {
  checkPremium
};
