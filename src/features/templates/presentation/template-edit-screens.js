const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const editSessions = require('../application/template-edit-session-store');
const { getGroupEntries, getWeaponCollection } = require('../domain/template-editor');
const { formatEmoji, toComponentEmoji } = require('../../../utils/emoji');
const { client } = require('../../../utils/client');
const { createErrorEmbed, safeReply } = require('../../../utils/errorEmbeds');

const getOwnedSession = (interaction, sessionId) => editSessions.getValidSession(
  sessionId,
  interaction.user.id,
  interaction.guild.id,
);

const respondPanel = async (interaction, payload) => {
  if (interaction.deferred) return interaction.editReply(payload);
  if (interaction.isModalSubmit?.() && interaction.isFromMessage?.() && typeof interaction.update === 'function') {
    return interaction.update(payload);
  }
  if (interaction.isMessageComponent?.() && !interaction.replied) return interaction.update(payload);
  return interaction.reply({ ...payload, ephemeral: true });
};

const renderEmoji = (interaction, emojiLike) => {
  if (!emojiLike) return '⚔️';
  if (typeof emojiLike === 'string' && !/^\d{15,20}$/.test(emojiLike)) return emojiLike;
  const id = String(emojiLike);
  return client?.emojis?.cache?.get(id)?.toString()
    || interaction.guild?.emojis?.cache?.get(id)?.toString()
    || formatEmoji(id);
};

const backButton = (sessionId) => new ButtonBuilder()
  .setCustomId(`te:home:${sessionId}`)
  .setLabel('Volver al editor')
  .setStyle(ButtonStyle.Secondary)
  .setEmoji('⬅️');

const showOverview = async (interaction, sessionId) => {
  const valid = getOwnedSession(interaction, sessionId);
  if (!valid) return safeReply(interaction, { content: 'Sesión de edición expirada o inválida.', ephemeral: true });
  const template = valid.session.data;
  const creating = valid.session.mode === 'create';
  const groups = getGroupEntries(template.weapons);
  const groupLines = groups.map(([key, group]) => {
    const name = group?.displayName || group?.name || key;
    return `• ${renderEmoji(interaction, group?.defaultEmoji)} ${name} (${getWeaponCollection(group).length} armas)`;
  });
  const groupText = groupLines.join('\n');

  const embed = new EmbedBuilder()
    .setTitle(creating ? '✨ Crear plantilla' : '📝 Editor de plantillas')
    .setDescription(`**${template.title || 'Sin título'}**\n\n${creating ? 'Completa la configuración y guarda cuando esté lista.' : '¿Qué deseas editar?'}`)
    .setColor(0x00ffff)
    .addFields(
      { name: '📋 Información básica', value: `Título: \`${template.title || 'Sin título'}\``, inline: true },
      {
        name: '📝 Descripción',
        value: template.description
          ? `${String(template.description).slice(0, 150)}${String(template.description).length > 150 ? '...' : ''}`
          : 'Sin descripción',
      },
      {
        name: '⚔️ Grupos de armas',
        value: groupText ? `${groupText.slice(0, 1021)}${groupText.length > 1021 ? '...' : ''}` : 'Sin grupos configurados',
      },
    );
  if (template.image) embed.setThumbnail(template.image);

  return respondPanel(interaction, {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`te:basic:${sessionId}`).setLabel('Información').setStyle(ButtonStyle.Primary).setEmoji('📝'),
        new ButtonBuilder().setCustomId(`te:settings:${sessionId}`).setLabel('Configuración').setStyle(ButtonStyle.Secondary).setEmoji('⚙️'),
        new ButtonBuilder().setCustomId(`te:roles:${sessionId}`).setLabel('Roles').setStyle(ButtonStyle.Secondary).setEmoji('🎭'),
        new ButtonBuilder().setCustomId(`te:groups:0:${sessionId}`).setLabel('Armas').setStyle(ButtonStyle.Secondary).setEmoji('⚔️'),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`te:save:${sessionId}`).setLabel(creating ? 'Crear plantilla' : 'Guardar cambios').setStyle(ButtonStyle.Success).setEmoji('💾'),
        new ButtonBuilder().setCustomId(`te:cancel:${sessionId}`).setLabel('Cancelar').setStyle(ButtonStyle.Danger).setEmoji('❌'),
      ),
    ],
  });
};

const showBasicInfo = async (interaction, sessionId) => {
  const valid = getOwnedSession(interaction, sessionId);
  if (!valid) return safeReply(interaction, { content: 'Sesión de edición expirada o inválida.', ephemeral: true });
  const template = valid.session.data;
  const modal = new ModalBuilder()
    .setCustomId(`te:basic-submit:${valid.sessionId}`)
    .setTitle('Editar información básica')
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId('title').setLabel('Título de la plantilla').setStyle(TextInputStyle.Short)
        .setValue(template.title || '').setRequired(true).setMaxLength(100)),
      new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId('description').setLabel('Descripción').setStyle(TextInputStyle.Paragraph)
        .setValue(template.description || '').setRequired(true).setMaxLength(4000)),
      new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId('image').setLabel('URL de imagen (opcional)').setStyle(TextInputStyle.Short)
        .setValue(template.image || '').setRequired(false).setMaxLength(500)),
    );
  return interaction.showModal(modal);
};

const showSettings = async (interaction, sessionId) => {
  const valid = getOwnedSession(interaction, sessionId);
  if (!valid) return safeReply(interaction, { content: 'Sesión de edición expirada o inválida.', ephemeral: true });
  const template = valid.session.data;
  const modal = new ModalBuilder()
    .setCustomId(`te:settings-submit:${valid.sessionId}`)
    .setTitle('Configuración de la plantilla')
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId('color').setLabel('Color hexadecimal').setStyle(TextInputStyle.Short)
        .setValue(template.color || '#0099ff').setRequired(true).setMaxLength(7)),
      new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId('url').setLabel('Enlace general (opcional)').setStyle(TextInputStyle.Short)
        .setValue(template.url || '').setRequired(false).setMaxLength(500)),
      new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId('reminder').setLabel('Recordatorio: 5m, 2h o 1d').setStyle(TextInputStyle.Short)
        .setValue(template.reminder || '5m').setRequired(true).setMaxLength(5)),
    );
  return interaction.showModal(modal);
};

const showRoles = async (interaction, sessionId) => {
  const valid = getOwnedSession(interaction, sessionId);
  if (!valid) return safeReply(interaction, { content: 'Sesión de edición expirada o inválida.', ephemeral: true });
  const template = valid.session.data;
  const currentRoles = Array.isArray(template.roles) ? template.roles.filter((id) => interaction.guild.roles.cache.has(id)) : [];
  const select = new RoleSelectMenuBuilder()
    .setCustomId(`te:roles-select:${valid.sessionId}`)
    .setPlaceholder('Selecciona hasta 25 roles')
    .setMinValues(0)
    .setMaxValues(25);
  if (currentRoles.length > 0) select.setDefaultRoles(...currentRoles.slice(0, 25));

  const embed = new EmbedBuilder()
    .setTitle('🎭 Roles a notificar')
    .setDescription('Selecciona los roles que se etiquetarán al crear un raid con esta plantilla.')
    .setColor(0x5865f2)
    .addFields({
      name: 'Roles actuales',
      value: currentRoles.length > 0 ? currentRoles.map((id) => `<@&${id}>`).join('\n') : 'Sin roles configurados',
    });
  return respondPanel(interaction, {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(select),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`te:roles-clear:${valid.sessionId}`).setLabel('Quitar todos').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
        backButton(valid.sessionId),
      ),
    ],
  });
};

const toSelectEmoji = (value) => {
  const emoji = toComponentEmoji(value);
  if (emoji && typeof emoji === 'object') return emoji;
  if (typeof emoji === 'string' && /\p{Extended_Pictographic}/u.test(emoji)) return { name: emoji };
  return { name: '⚔️' };
};

const showWeapons = async (interaction, sessionId, requestedPage = 0) => {
  const valid = getOwnedSession(interaction, sessionId);
  if (!valid) return safeReply(interaction, { content: 'Sesión de edición expirada o inválida.', ephemeral: true });
  const template = valid.session.data;
  const groups = getGroupEntries(template.weapons);
  const pageCount = Math.max(1, Math.ceil(groups.length / 25));
  const page = Math.min(Math.max(0, Number(requestedPage) || 0), pageCount - 1);
  const pageStart = page * 25;
  const lines = groups.map(([key, group]) => {
    const name = group?.displayName || group?.name || key;
    return `${renderEmoji(interaction, group?.defaultEmoji)} **${name}** · ${getWeaponCollection(group).length} armas`;
  });
  const list = lines.join('\n');
  const embed = new EmbedBuilder()
    .setTitle('⚔️ Editor de grupos de armas')
    .setDescription('Selecciona un grupo para editarlo o crea uno nuevo.')
    .setColor(0x3498db)
    .addFields({
      name: 'Grupos actuales',
      value: list ? `${list.slice(0, 1021)}${list.length > 1021 ? '...' : ''}` : 'Sin grupos configurados',
    });
  if (groups.length > 25) embed.setFooter({ text: `Página ${page + 1}/${pageCount} · ${groups.length} grupos.` });

  const components = [];
  if (groups.length > 0) {
    const options = groups.slice(pageStart, pageStart + 25).map(([key, group], index) => ({
      label: String(group?.displayName || group?.name || key).slice(0, 100),
      value: String(pageStart + index),
      description: `${getWeaponCollection(group).length} armas`.slice(0, 100),
      emoji: toSelectEmoji(group?.defaultEmoji),
    }));
    components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
      .setCustomId(`te:group-select:${valid.sessionId}`)
      .setPlaceholder('Selecciona un grupo para editar')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options)));
  }
  components.push(new ActionRowBuilder().addComponents(
    ...(page > 0 ? [new ButtonBuilder()
      .setCustomId(`te:groups:${page - 1}:${valid.sessionId}`)
      .setLabel('Anterior')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('⬅️')] : []),
    ...(page + 1 < pageCount ? [new ButtonBuilder()
      .setCustomId(`te:groups:${page + 1}:${valid.sessionId}`)
      .setLabel('Siguiente')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('➡️')] : []),
    new ButtonBuilder()
      .setCustomId(`te:group-new:${valid.sessionId}`)
      .setLabel(groups.length > 0 ? 'Añadir grupo' : 'Añadir primer grupo')
      .setStyle(ButtonStyle.Success)
      .setEmoji('➕'),
    backButton(valid.sessionId),
  ));
  return respondPanel(interaction, { embeds: [embed], components });
};

module.exports = {
  respondPanel,
  showBasicInfo,
  showOverview,
  showRoles,
  showSettings,
  showWeapons,
};
