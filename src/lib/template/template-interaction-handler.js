/**
 * Handler centralizado para todas las interacciones de templates
 */
const templateCreate = require('./template-create-handlers');
const templateUnified = require('../../commands/utility/template');

/**
 * Maneja todas las interacciones de botones relacionadas con templates
 */
async function handleTemplateButton(interaction) {
  const customId = interaction.customId;

  if (customId.startsWith('template_edit_') || customId.startsWith('group_') || customId.includes('_group_') || customId.includes('back_to_group_') || customId.includes('confirm_delete_group_')) {
    await templateUnified.handleEditButton(interaction);
  } else if (customId.startsWith('template_')) {
    await templateCreate.handleButton(interaction);
  }
}

/**
 * Maneja todas las interacciones de modales relacionadas con templates
 */
async function handleTemplateModal(interaction) {
  const customId = interaction.customId;

  if (customId.startsWith('template_edit_') || customId.includes('add_weapon_modal_') || customId.includes('edit_weapon_modal_') || customId.includes('new_group_modal_')) {
    await templateUnified.handleModalSubmit(interaction);
  } else if (customId.startsWith('template_')) {
    await templateCreate.handleModalSubmit(interaction);
  }
}

/**
 * Maneja todas las interacciones de select menus relacionadas con templates
 */
async function handleTemplateSelectMenu(interaction) {
  const customId = interaction.customId;

  if (customId.startsWith('template_edit_') || customId.includes('select_weapon_') || customId.includes('back_to_group_')) {
    await templateUnified.handleSelectMenu(interaction);
  } else if (customId.startsWith('template_')) {
    await templateCreate.handleSelectMenu(interaction);
  }
}

module.exports = {
  handleTemplateButton,
  handleTemplateModal,
  handleTemplateSelectMenu
};