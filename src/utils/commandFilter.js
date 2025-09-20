const { shouldShowPremiumCommand, shouldShowOwnerCommand, shouldShowAdminCommand } = require('../middleware/commandVisibility');
const { checkPremiumAccess } = require('../middleware/roleCheck');
const { EmbedBuilder } = require('discord.js');
const { createErrorEmbed, safeReply } = require('./errorEmbeds');

/**
 * Mapa de comandos y sus tipos de visibilidad
 */
const commandVisibilityMap = {
  'raid': 'role_based',
  'templates': 'role_based', 
  'create_template': 'role_based',
  'edit_template': 'role_based',
  'upload_weapons': 'owner',
  'show_all_weapons': 'role_based',
  'show_all_categories': 'role_based',
  'roles': 'admin_owner',
  'premium': 'owner',
  'status': 'all',
  'migrate': 'role_based'
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
      case 'all':
        shouldShow = true; // Comandos visibles para todos
        break;
      case 'role_based':
        shouldShow = await checkPremiumAccess(interaction);
        break;
      case 'admin_owner':
        // Verificar si es propietario del bot
        let botOwnerId;
        const application = interaction.client.application;
        if (application && application.owner) {
          botOwnerId = application.owner.id;
        } else {
          botOwnerId = process.env.BOT_OWNER_ID;
        }
        
        if (interaction.user.id === botOwnerId) {
          shouldShow = true;
        } else {
          shouldShow = shouldShowAdminCommand(interaction);
        }
        break;
      case 'owner':
        shouldShow = await shouldShowOwnerCommand(interaction);
        break;
      default:
        shouldShow = true;
    }

    if (!shouldShow) {
      // Crear embed de error según el tipo de comando
      let embed;
      
      if (commandType === 'role_based') {
        embed = createErrorEmbed(
          "Acceso Denegado",
          "No tienes permisos para usar este comando.",
          [{
            name: "Permisos Requeridos",
            value: "• Propietario del bot\n• Administrador del servidor\n• Rol autorizado",
            inline: false
          }, {
            name: "Comandos Disponibles",
            value: "• `/show_all_weapons` - Ver armas disponibles\n• `/show_all_categories` - Ver categorías\n• `/roles list` - Ver roles autorizados",
            inline: false
          }]
        );
      } else if (commandType === 'admin_owner') {
        embed = createErrorEmbed(
          "Acceso Denegado",
          "Solo el propietario del bot y los administradores pueden usar este comando.",
          [{
            name: "Permisos Requeridos",
            value: "• Propietario del bot\n• Administrador del servidor",
            inline: false
          }]
        );
      } else if (commandType === 'owner') {
        embed = createErrorEmbed(
          "Acceso Denegado",
          "Solo el propietario del bot puede usar este comando.",
          [{
            name: "Comandos Disponibles",
            value: "• `/show_all_weapons` - Ver armas disponibles\n• `/show_all_categories` - Ver categorías",
            inline: false
          }]
        );
      } else {
        embed = createErrorEmbed(
          "Acceso Denegado",
          "No tienes permisos para usar este comando.",
          [{
            name: "Solución",
            value: "Contacta a un administrador para obtener permisos.",
            inline: false
          }]
        );
      }
      
      await safeReply(interaction, {
        embeds: [embed],
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
