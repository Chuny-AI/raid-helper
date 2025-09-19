const { shouldShowPremiumCommand, shouldShowOwnerCommand, shouldShowAdminCommand } = require('../middleware/commandVisibility');

/**
 * Mapa de comandos y sus tipos de visibilidad
 */
const commandVisibilityMap = {
  'raid': 'premium',
  'templates': 'premium', 
  'roles': 'admin',
  'debug': 'premium',
  'migrate': 'owner',
  'premium': 'owner'
};

/**
 * Filtra comandos basado en permisos del usuario
 * @param {Object} interaction - La interacción de Discord
 * @returns {Promise<boolean>} - true si el comando debe ejecutarse, false si debe ser ocultado
 */
const filterCommand = async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) {
      return true;
    }

    const commandName = interaction.commandName;
    const commandType = commandVisibilityMap[commandName];

    // Si el comando no está en el mapa, permitir ejecución
    if (!commandType) {
      return true;
    }

    let shouldShow = false;

    switch (commandType) {
      case 'premium':
        shouldShow = await shouldShowPremiumCommand(interaction);
        break;
      case 'owner':
        shouldShow = await shouldShowOwnerCommand(interaction);
        break;
      case 'admin':
        shouldShow = await shouldShowAdminCommand(interaction);
        break;
      default:
        shouldShow = true;
    }

    if (!shouldShow) {
      // Responder con un mensaje genérico para ocultar el comando
      await interaction.reply({
        content: "❌ No tienes permisos para usar este comando.",
        ephemeral: true,
      });
      return false;
    }

    return true;
  } catch (error) {
    console.error('[ERROR] Error en filterCommand:', error);
    return true; // En caso de error, permitir ejecución
  }
};

module.exports = {
  filterCommand,
  commandVisibilityMap
};
