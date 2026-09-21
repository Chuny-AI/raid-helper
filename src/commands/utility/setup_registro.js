const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType,
  EmbedBuilder, InteractionContextType, MessageFlags, ModalBuilder, PermissionFlagsBits,
  RoleSelectMenuBuilder, SlashCommandBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
  escapeMarkdown,
} = require('discord.js');
const albionApi = require('../../services/albionApiService');
const registration = require('../../services/albionRegistrationService');

const data = new SlashCommandBuilder()
  .setName('setup-registro')
  .setDescription('Abre el panel privado de configuración de gremios de Albion')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

const pending = new Map();
const cid = (action, userId, guildId, entityId = '') => `regcfg:${action}:${userId}:${guildId}${entityId ? `:${entityId}` : ''}`;
const parseId = (value) => {
  const [prefix, action, userId, guildId, entityId, extra] = String(value || '').split(':');
  return prefix === 'regcfg' && action && userId && guildId && extra === undefined
    ? { action, userId, guildId, entityId } : null;
};
const row = (...components) => new ActionRowBuilder().addComponents(...components);
const button = (label, action, userId, guildId, entityId, style = ButtonStyle.Secondary) => new ButtonBuilder()
  .setCustomId(cid(action, userId, guildId, entityId)).setLabel(label).setStyle(style);
const isAdmin = (interaction) => interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
const safeName = (value) => escapeMarkdown(String(value || '').slice(0, 100));

const embedsFor = (config, rules, guild) => {
  const bot = guild.members.me;
  const permissions = [
    ['Gestionar roles', PermissionFlagsBits.ManageRoles],
    ['Gestionar apodos', PermissionFlagsBits.ManageNicknames],
  ].map(([label, flag]) => `${bot?.permissions?.has(flag) ? '✅' : '❌'} ${label}`).join(' · ');
  const embeds = [new EmbedBuilder().setTitle('🛡️ Configuración de registro Albion')
    .setColor(0x5865f2)
    .setDescription('Cada gremio tiene un rol principal, una etiqueta para el apodo y hasta 24 roles adicionales. La asignación y retirada se sincronizan automáticamente.')
    .addFields(
      { name: 'Servidor Albion', value: config?.region || 'Sin configurar', inline: true },
      { name: 'Auditoría', value: config?.auditChannelId ? `<#${config.auditChannelId}>` : 'Sin configurar', inline: true },
      { name: 'Permisos del bot', value: permissions },
    )];
  if (!rules.length) embeds[0].addFields({ name: 'Gremios', value: 'Aún no hay gremios configurados.' });
  for (let offset = 0; offset < rules.length; offset += 8) {
    const embed = new EmbedBuilder().setTitle(`⚔️ Gremios configurados ${offset + 1}–${Math.min(offset + 8, rules.length)} de ${rules.length}`)
      .setColor(0x2b2d31);
    for (const rule of rules.slice(offset, offset + 8)) {
      const roles = registration.ruleRoles(rule);
      embed.addFields({
        name: safeName(rule.entityName),
        value: [
          `Rol: ${roles[0] ? `<@&${roles[0]}>` : 'Sin rol'}`,
          `Tag: \`${registration.ruleTag(rule)}\``,
          `Roles adicionales: ${roles.slice(1).map((id) => `<@&${id}>`).join(', ') || 'Ninguno'}`,
        ].join('\n'),
      });
    }
    embeds.push(embed);
  }
  return embeds;
};

const render = ({ config, rules, guild, userId, screen = 'home', entityId = null, candidate = null }) => {
  const embeds = embedsFor(config, rules, guild);
  const selected = rules.find((rule) => rule.entityId === entityId);
  const components = [];
  if (screen === 'pending' && candidate) {
    embeds.push(new EmbedBuilder().setTitle(`➕ ${safeName(candidate.entity.name)}`)
      .setDescription(`Tag: \`${candidate.tag}\`. Selecciona el rol principal para guardar el gremio.`).setColor(0x57f287));
    components.push(row(new RoleSelectMenuBuilder().setCustomId(cid('create-role', userId, guild.id))
      .setPlaceholder('Rol principal del gremio').setMinValues(1).setMaxValues(1)));
    components.push(row(button('Cancelar', 'home', userId, guild.id)));
  } else if (screen === 'detail' && selected) {
    embeds.push(new EmbedBuilder().setTitle(`✏️ ${safeName(selected.entityName)}`)
      .setDescription('Cambia el rol principal, los roles adicionales o la etiqueta. Los cambios se guardan al seleccionar.').setColor(0x57f287));
    const roles = registration.ruleRoles(selected);
    const primary = new RoleSelectMenuBuilder().setCustomId(cid('primary', userId, guild.id, selected.entityId))
      .setPlaceholder('Rol principal').setMinValues(1).setMaxValues(1);
    if (roles[0]) primary.setDefaultRoles(roles[0]);
    const additional = new RoleSelectMenuBuilder().setCustomId(cid('additional', userId, guild.id, selected.entityId))
      .setPlaceholder('Roles adicionales (hasta 24)').setMinValues(1).setMaxValues(24);
    if (roles.length > 1) additional.setDefaultRoles(...roles.slice(1));
    components.push(row(primary), row(additional));
    components.push(row(
      button('Editar tag', 'tag', userId, guild.id, selected.entityId),
      button('Quitar adicionales', 'clear-extra', userId, guild.id, selected.entityId),
      button('Eliminar gremio', 'remove', userId, guild.id, selected.entityId, ButtonStyle.Danger),
      button('Volver', 'home', userId, guild.id),
    ));
  } else if (screen === 'confirm' && selected) {
    embeds.push(new EmbedBuilder().setTitle('⚠️ Eliminar gremio')
      .setDescription(`Se eliminará **${safeName(selected.entityName)}**. Los roles se retirarán en la próxima verificación confirmada.`).setColor(0xed4245));
    components.push(row(
      button('Sí, eliminar', 'remove-confirm', userId, guild.id, selected.entityId, ButtonStyle.Danger),
      button('Cancelar', 'detail', userId, guild.id, selected.entityId),
    ));
  } else {
    components.push(row(new StringSelectMenuBuilder().setCustomId(cid('region', userId, guild.id))
      .setPlaceholder('Servidor de Albion')
      .addOptions(['americas', 'europe', 'asia'].map((value) => ({ label: value[0].toUpperCase() + value.slice(1), value, default: config?.region === value })))));
    const channel = new ChannelSelectMenuBuilder().setCustomId(cid('audit', userId, guild.id))
      .setPlaceholder('Canal de auditoría').setChannelTypes(ChannelType.GuildText).setMinValues(1).setMaxValues(1);
    if (config?.auditChannelId) channel.setDefaultChannels(config.auditChannelId);
    components.push(row(channel));
    if (rules.length) components.push(row(new StringSelectMenuBuilder().setCustomId(cid('select', userId, guild.id))
      .setPlaceholder('Editar un gremio').addOptions(rules.map((rule) => ({
        label: rule.entityName.slice(0, 100), description: `Tag: ${registration.ruleTag(rule)}`, value: rule.entityId,
      })))));
    components.push(row(
      button('Añadir gremio', 'add', userId, guild.id, '', ButtonStyle.Primary).setDisabled(!config?.enabled || rules.length >= registration.MAX_RULES),
      button('Desvincular usuario', 'unlink', userId, guild.id),
      button('Actualizar', 'home', userId, guild.id),
    ));
  }
  return { embeds, components, allowedMentions: { parse: [] } };
};

const load = async (interaction) => ({
  config: await registration.getConfig(interaction.guildId),
  rules: await registration.getRules(interaction.guildId),
  guild: interaction.guild,
  userId: interaction.user.id,
});

const execute = async (interaction) => {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (!isAdmin(interaction)) return interaction.editReply('Solo un administrador puede configurar el registro.');
  return interaction.editReply(render(await load(interaction)));
};

const modal = (customId, title, fields) => {
  const builder = new ModalBuilder().setCustomId(customId).setTitle(title);
  for (const field of fields) builder.addComponents(row(new TextInputBuilder()
    .setCustomId(field.id).setLabel(field.label).setStyle(TextInputStyle.Short)
    .setMinLength(field.min || 1).setMaxLength(field.max || 100).setRequired(true)
    .setValue(field.value || '')));
  return builder;
};

const respondError = async (interaction, error) => {
  console.error('[WARN] /setup-registro:', error);
  const message = error instanceof registration.RegistrationError || error instanceof albionApi.AlbionApiError
    ? error.message : 'No se pudo guardar el cambio. Revisa la API de Albion y los permisos.';
  if (interaction.deferred) return interaction.followUp({ content: `❌ ${message}`, flags: MessageFlags.Ephemeral });
  return interaction.reply({ content: `❌ ${message}`, flags: MessageFlags.Ephemeral });
};

const handleInteraction = async (interaction) => {
  const parsed = parseId(interaction.customId);
  if (!parsed) return false;
  if (interaction.guildId !== parsed.guildId || interaction.user.id !== parsed.userId || !isAdmin(interaction)) {
    await interaction.reply({ content: 'Este panel pertenece a otro administrador o servidor.', flags: MessageFlags.Ephemeral });
    return true;
  }
  const { action, entityId } = parsed;
  if (['add', 'tag', 'unlink'].includes(action) && interaction.isButton?.()) {
    if (action === 'add') await interaction.showModal(modal(cid('add-submit', parsed.userId, parsed.guildId), 'Añadir gremio', [
      { id: 'name', label: 'Nombre exacto del gremio' }, { id: 'tag', label: 'Etiqueta para el apodo', max: 12 },
    ]));
    if (action === 'tag') {
      const rule = (await registration.getRules(interaction.guildId)).find((item) => item.entityId === entityId);
      if (!rule) return interaction.reply({ content: 'Gremio no encontrado. Actualiza el panel.', flags: MessageFlags.Ephemeral });
      await interaction.showModal(modal(cid('tag-submit', parsed.userId, parsed.guildId, entityId), 'Editar etiqueta', [
        { id: 'tag', label: 'Etiqueta para el apodo', max: 12, value: registration.ruleTag(rule) },
      ]));
    }
    if (action === 'unlink') await interaction.showModal(modal(cid('unlink-submit', parsed.userId, parsed.guildId), 'Desvincular usuario', [
      { id: 'user-id', label: 'ID del usuario de Discord', min: 15, max: 22 },
    ]));
    return true;
  }
  await interaction.deferUpdate();
  try {
    const state = await load(interaction);
    const rule = state.rules.find((item) => item.entityId === entityId);
    if (action === 'region' && interaction.isStringSelectMenu?.()) {
      await registration.configure({ guildId: state.guild.id, region: interaction.values[0], auditChannelId: state.config?.auditChannelId || null, updatedBy: state.userId });
    } else if (action === 'audit' && interaction.isChannelSelectMenu?.()) {
      if (!state.config?.region) throw new registration.RegistrationError('Selecciona primero el servidor de Albion.');
      const channel = state.guild.channels.cache.get(interaction.values[0]) || await state.guild.channels.fetch(interaction.values[0]);
      if (!channel?.send || !channel.permissionsFor(state.guild.members.me)?.has([
        PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks,
      ])) throw new registration.RegistrationError('El bot necesita ver, escribir y enviar embeds en el canal de auditoría.');
      await registration.configure({ guildId: state.guild.id, region: state.config.region, auditChannelId: channel.id, updatedBy: state.userId });
    } else if (action === 'add-submit' && interaction.isModalSubmit?.()) {
      if (!state.config?.region) throw new registration.RegistrationError('Selecciona primero el servidor de Albion.');
      const name = interaction.fields.getTextInputValue('name').trim();
      const tag = interaction.fields.getTextInputValue('tag').trim().toUpperCase();
      if (!/^[A-Z0-9]{1,12}$/.test(tag)) throw new registration.RegistrationError('La etiqueta debe tener entre 1 y 12 letras o números.');
      const entity = await albionApi.findGuildByName(state.config.region, name);
      const candidate = { entity, tag, expiresAt: Date.now() + 10 * 60_000 };
      pending.set(`${state.guild.id}:${state.userId}`, candidate);
      return interaction.editReply(render({ ...state, screen: 'pending', candidate }));
    } else if (action === 'create-role' && interaction.isRoleSelectMenu?.()) {
      const key = `${state.guild.id}:${state.userId}`;
      const candidate = pending.get(key);
      if (!candidate || candidate.expiresAt < Date.now()) throw new registration.RegistrationError('La selección expiró. Pulsa Añadir gremio de nuevo.');
      await registration.saveGuildRule({ guild: state.guild, entity: candidate.entity, tag: candidate.tag,
        primaryRoleId: interaction.values[0], createdBy: state.userId });
      pending.delete(key);
    } else if (action === 'select' && interaction.isStringSelectMenu?.()) {
      return interaction.editReply(render({ ...state, screen: 'detail', entityId: interaction.values[0] }));
    } else if (action === 'primary' && interaction.isRoleSelectMenu?.()) {
      if (!rule) throw new registration.RegistrationError('Gremio no encontrado. Actualiza el panel.');
      await registration.saveGuildRule({ guild: state.guild, entity: { id: rule.entityId, name: rule.entityName },
        tag: registration.ruleTag(rule), primaryRoleId: interaction.values[0],
        additionalRoleIds: registration.ruleRoles(rule).slice(1).filter((id) => id !== interaction.values[0]), createdBy: state.userId });
    } else if (action === 'additional' && interaction.isRoleSelectMenu?.()) {
      if (!rule) throw new registration.RegistrationError('Gremio no encontrado. Actualiza el panel.');
      const primaryRoleId = registration.ruleRoles(rule)[0];
      await registration.saveGuildRule({ guild: state.guild, entity: { id: rule.entityId, name: rule.entityName },
        tag: registration.ruleTag(rule), primaryRoleId,
        additionalRoleIds: interaction.values.filter((id) => id !== primaryRoleId), createdBy: state.userId });
    } else if (action === 'tag-submit' && interaction.isModalSubmit?.()) {
      if (!rule) throw new registration.RegistrationError('Gremio no encontrado. Actualiza el panel.');
      await registration.saveGuildRule({ guild: state.guild, entity: { id: rule.entityId, name: rule.entityName },
        tag: interaction.fields.getTextInputValue('tag'), primaryRoleId: registration.ruleRoles(rule)[0],
        additionalRoleIds: registration.ruleRoles(rule).slice(1), createdBy: state.userId });
    } else if (action === 'clear-extra') {
      if (!rule) throw new registration.RegistrationError('Gremio no encontrado. Actualiza el panel.');
      await registration.saveGuildRule({ guild: state.guild, entity: { id: rule.entityId, name: rule.entityName },
        tag: registration.ruleTag(rule), primaryRoleId: registration.ruleRoles(rule)[0], createdBy: state.userId });
    } else if (action === 'remove-confirm') {
      if (!rule) throw new registration.RegistrationError('Gremio no encontrado. Actualiza el panel.');
      await registration.removeGuildRule({ guildId: state.guild.id, entityId });
    } else if (action === 'unlink-submit' && interaction.isModalSubmit?.()) {
      const userId = interaction.fields.getTextInputValue('user-id').trim();
      if (!/^\d{15,22}$/.test(userId)) throw new registration.RegistrationError('Escribe un ID válido de Discord.');
      if (!(await registration.removeRegistration(state.guild, userId))) throw new registration.RegistrationError('El usuario no tiene un personaje vinculado.');
    } else if (!['home', 'detail', 'remove'].includes(action)) {
      throw new registration.RegistrationError('Acción desconocida. Abre `/setup-registro` de nuevo.');
    }
    const updated = await load(interaction);
    const nextScreen = ['primary', 'additional', 'tag-submit', 'clear-extra', 'detail'].includes(action) ? 'detail'
      : action === 'remove' ? 'confirm' : 'home';
    return interaction.editReply(render({ ...updated, screen: nextScreen, entityId }));
  } catch (error) {
    return respondError(interaction, error);
  }
};

module.exports = { data, execute, handleInteraction, render, embedsFor, parseId };
