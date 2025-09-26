/**
 * Middleware para manejar todas las interactions de templates de manera centralizada
 * Este middleware debe ser integrado en el sistema principal de interactions del bot
 */

const { handleTemplateButton, handleTemplateModal, handleTemplateSelectMenu } = require('../lib/template/template-interaction-handler');
const templateDelete = require('../commands/utility/template-delete');

/**
 * Maneja las interactions de botones
 */
async function handleButtonInteraction(interaction) {
  const customId = interaction.customId;

  // Template system buttons (incluye botones de grupos)
  if (customId.startsWith('template_') || customId.startsWith('group_') || customId.includes('_group_') || customId.includes('back_to_group_') || customId.includes('confirm_delete_group_')) {
    await handleTemplateButton(interaction);
    return true; // Indica que la interaction fue manejada
  }

  // Template delete buttons
  if (customId.startsWith('template_delete_')) {
    await templateDelete.handleButton(interaction);
    return true;
  }

  return false; // Indica que esta interaction no fue manejada por este middleware
}

/**
 * Maneja las interactions de modales
 */
async function handleModalInteraction(interaction) {
  const customId = interaction.customId;

  // Template system modals (incluye modales de grupos)
  if (customId.startsWith('template_') || customId.includes('add_weapon_modal_') || customId.includes('edit_weapon_modal_') || customId.includes('new_group_modal_')) {
    await handleTemplateModal(interaction);
    return true; // Indica que la interaction fue manejada
  }

  return false; // Indica que esta interaction no fue manejada por este middleware
}

/**
 * Maneja las interactions de select menus
 */
async function handleSelectMenuInteraction(interaction) {
  const customId = interaction.customId;

  // Template system select menus (incluye selects de grupos)
  if (customId.startsWith('template_') || customId.includes('select_weapon_') || customId.includes('back_to_group_')) {
    await handleTemplateSelectMenu(interaction);
    return true; // Indica que la interaction fue manejada
  }

  return false; // Indica que esta interaction no fue manejada por este middleware
}

/**
 * Función principal que debe ser llamada desde el interaction handler del bot
 */
async function handleTemplateInteractions(interaction) {
  try {
    let handled = false;

    if (interaction.isButton()) {
      handled = await handleButtonInteraction(interaction);
    } else if (interaction.isModalSubmit()) {
      handled = await handleModalInteraction(interaction);
    } else if (interaction.isStringSelectMenu()) {
      handled = await handleSelectMenuInteraction(interaction);
    }

    return handled;
  } catch (error) {
    console.error('[ERROR] Error en handleTemplateInteractions:', error);

    // Intentar responder si la interaction no ha sido respondida
    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: 'Ocurrió un error al procesar la interacción del template.',
          ephemeral: true
        });
      } catch (replyError) {
        console.error('[ERROR] Error al responder después de error:', replyError);
      }
    }

    return true; // Devolver true para evitar que otros handlers procesen esta interaction
  }
}

module.exports = {
  handleTemplateInteractions,
  handleButtonInteraction,
  handleModalInteraction,
  handleSelectMenuInteraction
};