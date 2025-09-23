const { isServerPremium } = require('../services/serverService');
const { createPremiumEmbed, createErrorEmbed, safeReply } = require('../utils/errorEmbeds');

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
      const embed = createPremiumEmbed();
      await safeReply(interaction, { embeds: [embed], ephemeral: true });
      return false;
    }

    return true;
  } catch (error) {
    console.error('[ERROR] Error en checkPremium:', error);
    const embed = createErrorEmbed(
      'Error del Sistema',
      'Error verificando el estado premium del servidor.'
    );
    await safeReply(interaction, { embeds: [embed], ephemeral: true });
    return false;
  }
};

module.exports = {
  checkPremium
};
