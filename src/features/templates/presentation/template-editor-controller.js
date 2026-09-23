const { MessageFlags } = require('discord.js');
const editor = require('../application/template-editor-service');
const screens = require('./template-edit-screens');
const groupScreens = require('./template-group-screens');
const { checkAuthorizedAccess } = require('../../../middleware/roleCheck');
const { createErrorEmbed, createInfoEmbed, createSuccessEmbed, safeReply } = require('../../../utils/errorEmbeds');

const context = (interaction, sessionId) => ({
  sessionId,
  userId: interaction.user.id,
  guildId: interaction.guild.id,
  guildName: interaction.guild.name,
});

const deny = (interaction) => safeReply(interaction, {
  embeds: [createErrorEmbed('Acceso denegado', 'Ya no tienes permisos para editar plantillas en este servidor.')],
  flags: MessageFlags.Ephemeral,
});

const field = (interaction, name) => interaction.fields.getTextInputValue(name);
const groupIndexFromToken = (token) => (token === 'new' ? null : Number(token));

const executeEdit = async (interaction) => {
  if (!await checkAuthorizedAccess(interaction)) return deny(interaction);
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }
  const sessionId = await editor.start({
    templateName: interaction.options.getString('template'),
    userId: interaction.user.id,
    guildId: interaction.guild.id,
  });
  return screens.showOverview(interaction, sessionId);
};

const handleBasicSubmit = async (interaction, sessionId) => {
  editor.updateBasic({
    ...context(interaction, sessionId),
    title: field(interaction, 'title'),
    description: field(interaction, 'description'),
    image: field(interaction, 'image'),
  });
  return screens.showOverview(interaction, sessionId);
};

const handleSettingsSubmit = async (interaction, sessionId) => {
  editor.updateSettings({
    ...context(interaction, sessionId),
    color: field(interaction, 'color'),
    url: field(interaction, 'url'),
    reminder: field(interaction, 'reminder'),
    notifyAll: field(interaction, 'notifyAll'),
  });
  return screens.showOverview(interaction, sessionId);
};

const handleInteraction = async (interaction) => {
  const customId = interaction.customId || '';
  if (!customId.startsWith('te:')) return false;
  if (!await checkAuthorizedAccess(interaction)) {
    await deny(interaction);
    return true;
  }

  const parts = customId.split(':');
  const action = parts[1];
  const sessionId = parts.at(-1);
  try {
    if (action === 'home') await screens.showOverview(interaction, sessionId);
    else if (action === 'basic') await screens.showBasicInfo(interaction, sessionId);
    else if (action === 'settings') await screens.showSettings(interaction, sessionId);
    else if (action === 'roles') await screens.showRoles(interaction, sessionId);
    else if (action === 'roles-select') {
      editor.updateRoles({ ...context(interaction, sessionId), roleIds: interaction.values, guild: interaction.guild });
      await screens.showRoles(interaction, sessionId);
    } else if (action === 'roles-clear') {
      editor.updateRoles({ ...context(interaction, sessionId), roleIds: [], guild: interaction.guild });
      await screens.showRoles(interaction, sessionId);
    } else if (action === 'groups') await screens.showWeapons(interaction, sessionId, Number(parts[2]));
    else if (action === 'group-select') await groupScreens.showGroup(interaction, sessionId, Number(interaction.values[0]));
    else if (action === 'group') await groupScreens.showGroup(interaction, sessionId, Number(parts[2]));
    else if (action === 'group-new') await groupScreens.showNewGroupModal(interaction, sessionId);
    else if (action === 'group-new-submit') {
      editor.stageGroupChange({
        ...context(interaction, sessionId),
        groupIndex: null,
        displayName: field(interaction, 'displayName'),
        maxPlayers: field(interaction, 'maxPlayers'),
      });
      const categories = await editor.catalogCategories();
      await groupScreens.showGroupEmojiCategories(interaction, sessionId, 'create', null, categories);
    } else if (action === 'group-edit') await groupScreens.showEditGroupModal(interaction, sessionId, Number(parts[2]));
    else if (action === 'group-edit-submit') {
      const groupIndex = Number(parts[2]);
      editor.stageGroupChange({
        ...context(interaction, sessionId),
        groupIndex,
        displayName: field(interaction, 'displayName'),
        maxPlayers: field(interaction, 'maxPlayers'),
      });
      const categories = await editor.catalogCategories();
      await groupScreens.showGroupEmojiCategories(interaction, sessionId, 'edit', groupIndex, categories);
    } else if (action === 'group-icon-categories') {
      const mode = parts[2];
      const groupIndex = groupIndexFromToken(parts[3]);
      const categories = await editor.catalogCategories();
      await groupScreens.showGroupEmojiCategories(
        interaction,
        sessionId,
        mode,
        groupIndex,
        categories,
        Number(parts[4]),
      );
    } else if (action === 'group-icon-category') {
      const mode = parts[2];
      const groupIndex = groupIndexFromToken(parts[3]);
      const category = interaction.values[0];
      const weapons = await editor.catalogWeapons(category);
      await groupScreens.showGroupEmojiWeapons(
        interaction,
        sessionId,
        mode,
        groupIndex,
        category,
        weapons,
      );
    } else if (action === 'group-icon-weapons') {
      const mode = parts[2];
      const groupIndex = groupIndexFromToken(parts[3]);
      const category = parts[4];
      const weapons = await editor.catalogWeapons(category);
      await groupScreens.showGroupEmojiWeapons(
        interaction,
        sessionId,
        mode,
        groupIndex,
        category,
        weapons,
        Number(parts[5]),
      );
    } else if (action === 'group-icon-select') {
      const mode = parts[2];
      const groupIndex = groupIndexFromToken(parts[3]);
      const result = await editor.applyStagedGroupEmoji({
        ...context(interaction, sessionId),
        mode,
        groupIndex,
        emojiId: interaction.values[0],
      });
      if (mode === 'create') {
        const staged = await editor.stageCatalogWeapon({
          ...context(interaction, sessionId),
          groupIndex: result.result,
          emojiId: interaction.values[0],
        });
        await groupScreens.showCatalogWeaponModal(
          interaction,
          sessionId,
          result.result,
          staged.result.weapon,
        );
      } else {
        await groupScreens.showGroup(interaction, sessionId, result.result);
      }
    } else if (action === 'group-delete') {
      await groupScreens.showDeleteConfirmation(interaction, sessionId, Number(parts[2]));
    } else if (action === 'group-delete-ok') {
      editor.deleteGroup({ ...context(interaction, sessionId), groupIndex: Number(parts[2]) });
      await screens.showWeapons(interaction, sessionId);
    } else if (action === 'catalog') {
      const categories = await editor.catalogCategories();
      await groupScreens.showCatalogCategories(interaction, sessionId, Number(parts[2]), categories);
    } else if (action === 'catalog-category') {
      const category = interaction.values[0];
      const weapons = await editor.catalogWeapons(category);
      await groupScreens.showCatalogWeapons(interaction, sessionId, Number(parts[2]), category, weapons);
    } else if (action === 'catalog-add') {
      const groupIndex = Number(parts[2]);
      const staged = await editor.stageCatalogWeapon({
        ...context(interaction, sessionId),
        groupIndex,
        emojiId: interaction.values[0],
      });
      await groupScreens.showCatalogWeaponModal(
        interaction,
        sessionId,
        groupIndex,
        staged.result.weapon,
      );
    } else if (action === 'catalog-add-submit') {
      const groupIndex = Number(parts[2]);
      editor.confirmCatalogWeapon({
        ...context(interaction, sessionId),
        groupIndex,
        units: field(interaction, 'units'),
        url: field(interaction, 'url'),
        label: field(interaction, 'label'),
      });
      await groupScreens.showGroup(interaction, sessionId, groupIndex);
    } else if (action === 'weapon-edit-menu' || action === 'weapon-remove-menu') {
      await groupScreens.showWeaponMenu(
        interaction,
        sessionId,
        Number(parts[2]),
        Number(parts[3]),
        action === 'weapon-edit-menu' ? 'edit' : 'remove',
      );
    } else if (action === 'weapon-edit-select') {
      await groupScreens.showWeaponEditModal(interaction, sessionId, Number(parts[2]), Number(interaction.values[0]));
    } else if (action === 'weapon-edit-submit') {
      const groupIndex = Number(parts[2]);
      editor.updateWeapon({
        ...context(interaction, sessionId),
        groupIndex,
        weaponIndex: Number(parts[3]),
        name: field(interaction, 'name'),
        units: field(interaction, 'units'),
        emoji: field(interaction, 'emoji'),
        url: field(interaction, 'url'),
      });
      await groupScreens.showGroup(interaction, sessionId, groupIndex);
    } else if (action === 'weapon-remove-select') {
      const groupIndex = Number(parts[2]);
      editor.removeWeapons({ ...context(interaction, sessionId), groupIndex, weaponIndices: interaction.values });
      await groupScreens.showGroup(interaction, sessionId, groupIndex);
    } else if (action === 'basic-submit') await handleBasicSubmit(interaction, sessionId);
    else if (action === 'settings-submit') await handleSettingsSubmit(interaction, sessionId);
    else if (action === 'save') {
      const saved = await editor.save(context(interaction, sessionId));
      await screens.respondPanel(interaction, {
        embeds: [createSuccessEmbed(
          saved.created ? 'Plantilla creada' : 'Plantilla actualizada',
          `**${saved.template.title}** se guardó correctamente.`,
        )],
        components: [],
      });
    } else if (action === 'cancel') {
      editor.cancel(context(interaction, sessionId));
      await screens.respondPanel(interaction, {
        embeds: [createInfoEmbed('Edición cancelada', 'No se guardó ningún cambio.')],
        components: [],
      });
    } else {
      await safeReply(interaction, { content: 'Esta opción del editor ya no está disponible.', ephemeral: true });
    }
  } catch (error) {
    console.error(`[TEMPLATE] Error en editor (${action}):`, error);
    await safeReply(interaction, {
      embeds: [createErrorEmbed('No se pudo completar la acción', error.message || 'Ocurrió un error en el editor.')],
      flags: MessageFlags.Ephemeral,
    });
  }
  return true;
};

module.exports = {
  executeEdit,
  handleInteraction,
  showOverview: screens.showOverview,
  showWeapons: screens.showWeapons,
};
