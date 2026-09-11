const { MessageFlags } = require('discord.js');
const { buildTemplateCommandDefinition } = require('../../features/templates/presentation/template-command-definition');
const crud = require('../../features/templates/presentation/template-crud-controller');
const create = require('../../features/templates/presentation/template-create-controller');
const editor = require('../../features/templates/presentation/template-editor-controller');
const { createErrorEmbed, safeReply } = require('../../utils/errorEmbeds');

const LEGACY_EDITOR_PREFIXES = [
  'group_', 'back_to_group_', 'back_to_weapons_', 'delete_weapon_',
  'modify_units_', 'modify_weapon_', 'add_url_', 'confirm_delete_weapon_',
  'cancel_delete_weapon_', 'category_select_for_group_', 'weapon_select_for_group_',
  'remove_weapons_select_', 'direct_weapon_select_', 'select_weapon_',
];

const execute = async (interaction) => {
  const subcommand = interaction.options.getSubcommand();
  try {
    const actions = {
      list: crud.executeList,
      create: create.executeCreate,
      edit: editor.executeEdit,
      delete: crud.executeDelete,
      clone: crud.executeClone,
      export: crud.executeExport,
      import: crud.executeImport,
      rename: crud.executeRename,
    };
    const action = actions[subcommand];
    if (!action) throw new Error(`Subcomando no reconocido: ${subcommand}`);
    return await action(interaction);
  } catch (error) {
    console.error(`[TEMPLATE] Error ejecutando /template ${subcommand}:`, error);
    return safeReply(interaction, {
      embeds: [createErrorEmbed('No se pudo completar el comando', error.message || 'Ocurrió un error inesperado.')],
      flags: MessageFlags.Ephemeral,
    });
  }
};

const canHandleInteraction = (interaction) => {
  const id = interaction.customId || '';
  return id.startsWith('te:')
    || id.startsWith('template_')
    || LEGACY_EDITOR_PREFIXES.some((prefix) => id.startsWith(prefix));
};

const handleInteraction = async (interaction) => {
  if (!canHandleInteraction(interaction)) return false;
  if ((interaction.customId || '').startsWith('te:')) return editor.handleInteraction(interaction);
  if ((interaction.customId || '').startsWith('template_delete_')) {
    const handled = await crud.handleDeleteInteraction(interaction);
    if (handled) return true;
  }
  if (!(interaction.customId || '').startsWith('template_')) {
    await safeReply(interaction, {
      embeds: [createErrorEmbed('Panel antiguo', 'Este panel pertenece a una sesión anterior. Ejecuta `/template edit` para abrir el editor actualizado.')],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }
  const handled = await create.handleInteraction(interaction);
  if (!handled) {
    await safeReply(interaction, {
      embeds: [createErrorEmbed('Panel antiguo', 'Esta sesión pertenece al editor anterior. Ejecuta `/template create` o `/template edit` para continuar.')],
      flags: MessageFlags.Ephemeral,
    });
  }
  return true;
};

module.exports = {
  data: buildTemplateCommandDefinition(),
  execute,
  autocomplete: crud.autocomplete,
  canHandleInteraction,
  handleInteraction,
};
