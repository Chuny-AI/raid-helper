const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const sessions = require('../application/template-edit-session-store');
const { getGroupEntries, getWeaponCollection } = require('../domain/template-editor');
const { formatEmoji } = require('../../../utils/emoji');
const { environmentName } = require('../../../config/environment');
const { respondPanel } = require('./template-edit-screens');
const { safeReply } = require('../../../utils/errorEmbeds');

const owned = (interaction, sessionId) => sessions.getValidSession(
  sessionId,
  interaction.user.id,
  interaction.guild.id,
);

const sessionOrReply = async (interaction, sessionId) => {
  const valid = owned(interaction, sessionId);
  if (valid) return valid;
  await safeReply(interaction, { content: 'Sesión de edición expirada o inválida.', ephemeral: true });
  return null;
};

const emojiText = (value) => {
  const text = String(value || '⚔️');
  return /^\d{15,20}$/.test(text) ? formatEmoji(text) : text;
};

const customEmoji = (value) => (/^\d{15,20}$/.test(String(value || ''))
  ? { id: String(value) }
  : undefined);

const pageItems = (items, requestedPage) => {
  const pageCount = Math.max(1, Math.ceil(items.length / 25));
  const page = Math.min(Math.max(0, Number(requestedPage) || 0), pageCount - 1);
  return { page, pageCount, items: items.slice(page * 25, page * 25 + 25) };
};

const groupAt = (session, groupIndex) => getGroupEntries(session.data.weapons)[Number(groupIndex)]?.[1];

const showGroup = async (interaction, sessionId, groupIndex) => {
  const valid = await sessionOrReply(interaction, sessionId);
  if (!valid) return;
  const group = groupAt(valid.session, groupIndex);
  if (!group) return showMissingGroup(interaction, valid.sessionId);
  const weapons = getWeaponCollection(group);
  const lines = weapons.slice(0, 20).map((weapon, index) =>
    `${index + 1}. ${emojiText(weapon.emoji || weapon.emojiId)} **${weapon.name || 'Arma'}** · ${weapon.units || weapon.quantity || 1} plaza(s)`,
  );
  if (weapons.length > 20) lines.push(`… y ${weapons.length - 20} arma(s) más.`);
  const weaponText = lines.join('\n');
  const embed = new EmbedBuilder()
    .setTitle(`${emojiText(group.defaultEmoji)} ${group.displayName || group.name || 'Grupo'}`)
    .setColor(0x3498db)
    .addFields(
      { name: 'Cupo máximo', value: String(group.max_players || 1), inline: true },
      { name: 'Armas', value: String(weapons.length), inline: true },
      {
        name: 'Configuración',
        value: weaponText
          ? `${weaponText.slice(0, 1021)}${weaponText.length > 1021 ? '...' : ''}`
          : 'Este grupo todavía no contiene armas.',
      },
    );
  return respondPanel(interaction, {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`te:group-edit:${groupIndex}:${valid.sessionId}`).setLabel('Editar grupo').setStyle(ButtonStyle.Primary).setEmoji('✏️'),
        new ButtonBuilder().setCustomId(`te:catalog:${groupIndex}:${valid.sessionId}`).setLabel('Añadir armas').setStyle(ButtonStyle.Success).setEmoji('➕'),
        new ButtonBuilder().setCustomId(`te:weapon-edit-menu:${groupIndex}:0:${valid.sessionId}`).setLabel('Editar arma').setStyle(ButtonStyle.Secondary).setEmoji('🛠️').setDisabled(weapons.length === 0),
        new ButtonBuilder().setCustomId(`te:weapon-remove-menu:${groupIndex}:0:${valid.sessionId}`).setLabel('Quitar armas').setStyle(ButtonStyle.Secondary).setEmoji('➖').setDisabled(weapons.length === 0),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`te:group-delete:${groupIndex}:${valid.sessionId}`).setLabel('Eliminar grupo').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
        new ButtonBuilder().setCustomId(`te:groups:0:${valid.sessionId}`).setLabel('Volver a grupos').setStyle(ButtonStyle.Secondary).setEmoji('⬅️'),
      ),
    ],
  });
};

const showMissingGroup = (interaction, sessionId) => respondPanel(interaction, {
  content: 'Ese grupo ya no existe. Se ha actualizado la lista.',
  embeds: [],
  components: [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`te:groups:0:${sessionId}`).setLabel('Volver a grupos').setStyle(ButtonStyle.Secondary),
  )],
});

const showNewGroupModal = (interaction, sessionId) => interaction.showModal(
  new ModalBuilder().setCustomId(`te:group-new-submit:${sessionId}`).setTitle('Crear grupo de armas').addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('displayName').setLabel('Nombre del grupo').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('maxPlayers').setLabel('Cupo máximo').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(3).setValue('1')),
  ),
);

const showEditGroupModal = async (interaction, sessionId, groupIndex) => {
  const valid = await sessionOrReply(interaction, sessionId);
  if (!valid) return;
  const group = groupAt(valid.session, groupIndex);
  if (!group) return showMissingGroup(interaction, valid.sessionId);
  return interaction.showModal(new ModalBuilder()
    .setCustomId(`te:group-edit-submit:${groupIndex}:${valid.sessionId}`)
    .setTitle('Editar grupo de armas')
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('displayName').setLabel('Nombre del grupo').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100).setValue(group.displayName || group.name || 'Grupo')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('maxPlayers').setLabel('Cupo máximo').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(3).setValue(String(group.max_players || 1))),
    ));
};

const groupIndexToken = (mode, groupIndex) => (mode === 'create' ? 'new' : String(groupIndex));

const cancelGroupIconButton = (mode, groupIndex, sessionId) => new ButtonBuilder()
  .setCustomId(mode === 'create'
    ? `te:groups:0:${sessionId}`
    : `te:group:${groupIndex}:${sessionId}`)
  .setLabel(mode === 'create' ? 'Cancelar grupo' : 'Cancelar cambios')
  .setStyle(ButtonStyle.Secondary)
  .setEmoji('⬅️');

const showGroupEmojiCategories = async (
  interaction,
  sessionId,
  mode,
  groupIndex,
  categories,
  requestedPage = 0,
) => {
  const valid = await sessionOrReply(interaction, sessionId);
  if (!valid) return;
  if (mode === 'edit' && !groupAt(valid.session, groupIndex)) {
    return showMissingGroup(interaction, valid.sessionId);
  }
  const paged = pageItems(categories, requestedPage);
  const options = paged.items.map((category) => ({
    label: String(category.displayName || category.key).slice(0, 100),
    value: String(category.key).slice(0, 100),
    emoji: customEmoji(category.defaultEmoji),
  }));
  if (options.length === 0) {
    return safeReply(interaction, { content: 'El catálogo de armas del entorno está vacío.', ephemeral: true });
  }

  const token = groupIndexToken(mode, groupIndex);
  const navigation = [];
  if (paged.page > 0) navigation.push(new ButtonBuilder()
    .setCustomId(`te:group-icon-categories:${mode}:${token}:${paged.page - 1}:${valid.sessionId}`)
    .setLabel('Anterior').setStyle(ButtonStyle.Secondary));
  if (paged.page + 1 < paged.pageCount) navigation.push(new ButtonBuilder()
    .setCustomId(`te:group-icon-categories:${mode}:${token}:${paged.page + 1}:${valid.sessionId}`)
    .setLabel('Siguiente').setStyle(ButtonStyle.Secondary));
  navigation.push(cancelGroupIconButton(mode, groupIndex, valid.sessionId));

  return respondPanel(interaction, {
    embeds: [new EmbedBuilder()
      .setTitle('Elige el icono del grupo')
      .setDescription(`Selecciona primero una familia. Solo se muestran emojis de armas del catálogo de **${environmentName()}**.`)
      .setColor(0xf1c40f)
      .setFooter({ text: `Familias · Página ${paged.page + 1}/${paged.pageCount}` })],
    components: [
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
        .setCustomId(`te:group-icon-category:${mode}:${token}:${valid.sessionId}`)
        .setPlaceholder('Selecciona una familia de armas')
        .setMinValues(1).setMaxValues(1).addOptions(options)),
      new ActionRowBuilder().addComponents(navigation),
    ],
  });
};

const showGroupEmojiWeapons = async (
  interaction,
  sessionId,
  mode,
  groupIndex,
  category,
  weapons,
  requestedPage = 0,
) => {
  const valid = await sessionOrReply(interaction, sessionId);
  if (!valid) return;
  if (mode === 'edit' && !groupAt(valid.session, groupIndex)) {
    return showMissingGroup(interaction, valid.sessionId);
  }
  const paged = pageItems(weapons, requestedPage);
  const options = paged.items.map((weapon) => ({
    label: String(weapon.name || 'Arma').slice(0, 100),
    value: String(weapon.emojiId).slice(0, 100),
    emoji: customEmoji(weapon.emojiId),
  }));
  if (options.length === 0) {
    return safeReply(interaction, { content: 'Esa familia no contiene armas en el catálogo actual.', ephemeral: true });
  }

  const token = groupIndexToken(mode, groupIndex);
  const navigation = [];
  if (paged.page > 0) navigation.push(new ButtonBuilder()
    .setCustomId(`te:group-icon-weapons:${mode}:${token}:${category}:${paged.page - 1}:${valid.sessionId}`)
    .setLabel('Anterior').setStyle(ButtonStyle.Secondary));
  if (paged.page + 1 < paged.pageCount) navigation.push(new ButtonBuilder()
    .setCustomId(`te:group-icon-weapons:${mode}:${token}:${category}:${paged.page + 1}:${valid.sessionId}`)
    .setLabel('Siguiente').setStyle(ButtonStyle.Secondary));
  navigation.push(new ButtonBuilder()
    .setCustomId(`te:group-icon-categories:${mode}:${token}:0:${valid.sessionId}`)
    .setLabel('Volver a familias').setStyle(ButtonStyle.Secondary).setEmoji('⬅️'));

  return respondPanel(interaction, {
    embeds: [new EmbedBuilder()
      .setTitle('Elige un arma como icono')
      .setDescription('El emoji seleccionado se usará para identificar el grupo.')
      .setColor(0xf1c40f)
      .setFooter({ text: `Armas · Página ${paged.page + 1}/${paged.pageCount}` })],
    components: [
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
        .setCustomId(`te:group-icon-select:${mode}:${token}:${valid.sessionId}`)
        .setPlaceholder('Selecciona el icono del grupo')
        .setMinValues(1).setMaxValues(1).addOptions(options)),
      new ActionRowBuilder().addComponents(navigation),
    ],
  });
};

const showDeleteConfirmation = async (interaction, sessionId, groupIndex) => {
  const valid = await sessionOrReply(interaction, sessionId);
  if (!valid) return;
  const group = groupAt(valid.session, groupIndex);
  if (!group) return showMissingGroup(interaction, valid.sessionId);
  return respondPanel(interaction, {
    embeds: [new EmbedBuilder().setTitle('Eliminar grupo').setDescription(`¿Eliminar **${group.displayName || group.name || 'Grupo'}** y todas sus armas?`).setColor(0xed4245)],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`te:group-delete-ok:${groupIndex}:${valid.sessionId}`).setLabel('Sí, eliminar').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`te:group:${groupIndex}:${valid.sessionId}`).setLabel('Cancelar').setStyle(ButtonStyle.Secondary),
    )],
  });
};

const showCatalogCategories = async (interaction, sessionId, groupIndex, categories) => {
  const valid = await sessionOrReply(interaction, sessionId);
  if (!valid) return;
  if (!groupAt(valid.session, groupIndex)) return showMissingGroup(interaction, valid.sessionId);
  const options = categories.slice(0, 25).map((category) => ({
    label: String(category.displayName || category.key).slice(0, 100),
    value: String(category.key).slice(0, 100),
    emoji: customEmoji(category.defaultEmoji),
  }));
  if (options.length === 0) return safeReply(interaction, { content: 'No hay categorías de armas activas.', ephemeral: true });
  return respondPanel(interaction, {
    embeds: [new EmbedBuilder().setTitle('Añadir armas').setDescription('Selecciona una categoría del catálogo.').setColor(0x57f287)],
    components: [
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`te:catalog-category:${groupIndex}:${valid.sessionId}`).setPlaceholder('Categoría').addOptions(options)),
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`te:group:${groupIndex}:${valid.sessionId}`).setLabel('Volver al grupo').setStyle(ButtonStyle.Secondary)),
    ],
  });
};

const showCatalogWeapons = async (interaction, sessionId, groupIndex, category, weapons) => {
  const valid = await sessionOrReply(interaction, sessionId);
  if (!valid) return;
  const options = weapons.slice(0, 25).map((weapon) => ({
    label: String(weapon.name).slice(0, 100),
    value: String(weapon.emojiId).slice(0, 100),
    emoji: customEmoji(weapon.emojiId),
  }));
  if (options.length === 0) return safeReply(interaction, { content: 'Esta categoría no tiene armas activas.', ephemeral: true });
  return respondPanel(interaction, {
    embeds: [new EmbedBuilder().setTitle('Añadir armas').setDescription(`Categoría: **${category}**. Puedes seleccionar varias.`).setColor(0x57f287)],
    components: [
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`te:catalog-add:${groupIndex}:${valid.sessionId}`).setPlaceholder('Selecciona las armas').setMinValues(1).setMaxValues(options.length).addOptions(options)),
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`te:catalog:${groupIndex}:${valid.sessionId}`).setLabel('Volver a categorías').setStyle(ButtonStyle.Secondary)),
    ],
  });
};

const pagedWeaponOptions = (weapons, page) => {
  const pageCount = Math.max(1, Math.ceil(weapons.length / 25));
  const safePage = Math.min(Math.max(0, Number(page) || 0), pageCount - 1);
  return {
    page: safePage,
    pageCount,
    options: weapons.slice(safePage * 25, safePage * 25 + 25).map((weapon, offset) => ({
      label: String(weapon.name || 'Arma').slice(0, 100),
      description: `${weapon.units || weapon.quantity || 1} plaza(s)`.slice(0, 100),
      value: String(safePage * 25 + offset),
    })),
  };
};

const showWeaponMenu = async (interaction, sessionId, groupIndex, page, mode) => {
  const valid = await sessionOrReply(interaction, sessionId);
  if (!valid) return;
  const group = groupAt(valid.session, groupIndex);
  if (!group) return showMissingGroup(interaction, valid.sessionId);
  const weapons = getWeaponCollection(group);
  const paged = pagedWeaponOptions(weapons, page);
  if (paged.options.length === 0) return showGroup(interaction, valid.sessionId, groupIndex);
  const removing = mode === 'remove';
  const components = [new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`te:weapon-${removing ? 'remove' : 'edit'}-select:${groupIndex}:${valid.sessionId}`)
      .setPlaceholder(removing ? 'Selecciona armas para retirar' : 'Selecciona un arma para editar')
      .setMinValues(1)
      .setMaxValues(removing ? paged.options.length : 1)
      .addOptions(paged.options),
  )];
  const nav = [];
  if (paged.page > 0) nav.push(new ButtonBuilder().setCustomId(`te:weapon-${mode}-menu:${groupIndex}:${paged.page - 1}:${valid.sessionId}`).setLabel('Anterior').setStyle(ButtonStyle.Secondary));
  if (paged.page + 1 < paged.pageCount) nav.push(new ButtonBuilder().setCustomId(`te:weapon-${mode}-menu:${groupIndex}:${paged.page + 1}:${valid.sessionId}`).setLabel('Siguiente').setStyle(ButtonStyle.Secondary));
  nav.push(new ButtonBuilder().setCustomId(`te:group:${groupIndex}:${valid.sessionId}`).setLabel('Volver al grupo').setStyle(ButtonStyle.Secondary));
  components.push(new ActionRowBuilder().addComponents(nav));
  return respondPanel(interaction, {
    embeds: [new EmbedBuilder().setTitle(removing ? 'Quitar armas' : 'Editar arma').setDescription(`Página ${paged.page + 1}/${paged.pageCount}`).setColor(removing ? 0xed4245 : 0x5865f2)],
    components,
  });
};

const showWeaponEditModal = async (interaction, sessionId, groupIndex, weaponIndex) => {
  const valid = await sessionOrReply(interaction, sessionId);
  if (!valid) return;
  const weapon = getWeaponCollection(groupAt(valid.session, groupIndex))[Number(weaponIndex)];
  if (!weapon) return showGroup(interaction, valid.sessionId, groupIndex);
  return interaction.showModal(new ModalBuilder()
    .setCustomId(`te:weapon-edit-submit:${groupIndex}:${weaponIndex}:${valid.sessionId}`)
    .setTitle('Editar arma')
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nombre').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100).setValue(String(weapon.name || 'Arma'))),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('units').setLabel('Plazas').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(3).setValue(String(weapon.units || weapon.quantity || 1))),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('emoji').setLabel('Emoji o ID del emoji').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(50).setValue(String(weapon.emoji || weapon.emojiId || '⚔️'))),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('url').setLabel('Enlace de build (opcional)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(500).setValue(String(weapon.url || ''))),
    ));
};

module.exports = {
  showCatalogCategories,
  showCatalogWeapons,
  showDeleteConfirmation,
  showEditGroupModal,
  showGroup,
  showGroupEmojiCategories,
  showGroupEmojiWeapons,
  showNewGroupModal,
  showWeaponEditModal,
  showWeaponMenu,
};
