/**
 * Middleware para verificar si el usuario es el propietario del bot
 * @param {Object} interaction - La interacción de Discord
 * @returns {Promise<boolean>} - true si es el propietario, false si no
 */
const checkOwner = async (interaction) => {
  try {
    let botOwnerId;
    
    // Intentar obtener el ID del propietario desde la aplicación
    const application = interaction.client.application;
    if (application && application.owner) {
      botOwnerId = application.owner.id;
    } else {
      // Fallback: usar variable de entorno
      botOwnerId = process.env.BOT_OWNER_ID;
      if (!botOwnerId) {
        console.error('[ERROR] No se pudo obtener el ID del propietario del bot');
        return false;
      }
    }

    const isOwner = interaction.user.id === botOwnerId;
    
    if (!isOwner) {
      await interaction.reply({
        content: "❌ Solo el propietario del bot puede usar este comando.",
        ephemeral: true,
      });
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('[ERROR] Error en checkOwner:', error);
    await interaction.reply({
      content: "❌ Error verificando permisos del propietario.",
      ephemeral: true,
    });
    return false;
  }
};

/**
 * Middleware para verificar si el usuario es el propietario del bot (sin respuesta automática)
 * @param {Object} interaction - La interacción de Discord
 * @returns {Promise<boolean>} - true si es el propietario, false si no
 */
const isOwner = async (interaction) => {
  try {
    let botOwnerId;
    
    // Intentar obtener el ID del propietario desde la aplicación
    const application = interaction.client.application;
    if (application && application.owner) {
      botOwnerId = application.owner.id;
    } else {
      // Fallback: usar variable de entorno
      botOwnerId = process.env.BOT_OWNER_ID;
      if (!botOwnerId) {
        console.error('[ERROR] No se pudo obtener el ID del propietario del bot');
        return false;
      }
    }

    return interaction.user.id === botOwnerId;
  } catch (error) {
    console.error('[ERROR] Error en isOwner:', error);
    return false;
  }
};

module.exports = {
  checkOwner,
  isOwner
};
