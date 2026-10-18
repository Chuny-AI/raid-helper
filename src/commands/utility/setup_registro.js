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
const searches = new Map();
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
const safeName = (value, max = 100) => escapeMarkdown(String(value || '')).slice(0, max) || 'Sin nombre';
const pendingKey = (interaction) => `${interaction.guildId}:${interaction.user.id}:${interaction.message?.id || ''}`;
const logStep = (interaction, stage, details = {}) => console.info('[INFO] /setup-registro:', {
  action: parseId(interaction.customId)?.action, stage,
  guildId: interaction.guildId, userId: interaction.user.id, messageId: interaction.message?.id,
  ...details,
});

const embedsFor = (config, rules, guild) => {
  const bot = guild.members.me;
  const permissions = [
    ['Gestionar roles', PermissionFlagsBits.ManageRoles],
    ['Gestionar apodos', PermissionFlagsBits.ManageNicknames],
    ['Expulsar miembros', PermissionFlagsBits.KickMembers],
  ].map(([label, flag]) => `${bot?.permissions?.has(flag) ? '✅' : '❌'} ${label}`).join(' · ');
  const embeds = [new EmbedBuilder().setTitle('🛡️ Configuración de registro Albion')
    .setColor(0x5865f2)
    .setDescription('Cada gremio tiene un rol principal, etiqueta y hasta 24 roles adicionales. El bot confirma las salidas por la API de Albion: si alguien deja su gremio de registro, retira sus roles y lo expulsa, aunque pase a otro gremio configurado.')
    .addFields(
      { name: 'Servidor Albion', value: config?.region || 'Sin configurar', inline: true },
      { name: 'Auditoría', value: config?.auditChannelId ? `<#${config.auditChannelId}>` : 'Sin configurar', inline: true },
      { name: 'Permisos del bot', value: permissions },
    )];
  if (!rules.length) embeds[0].addFields({ name: 'Gremios', value: 'Aún no hay gremios configurados.' });
  // Discord limita a 6000 caracteres la suma de todos los embeds del mensaje.
  // Los paneles grandes muestran el detalle de roles al seleccionar el gremio.
  const compact = rules.length > 4;
  for (let offset = 0; offset < rules.length; offset += 8) {
    const embed = new EmbedBuilder().setTitle(`⚔️ Gremios configurados ${offset + 1}–${Math.min(offset + 8, rules.length)} de ${rules.length}`)
      .setColor(0x2b2d31);
    for (const rule of rules.slice(offset, offset + 8)) {
      const roles = registration.ruleRoles(rule);
      const extras = roles.slice(1);
      const extraSummary = compact && extras.length
        ? `${extras.length} configurados` : extras.map((id) => `<@&${id}>`).join(', ') || 'Ninguno';
      embed.addFields({
        name: safeName(rule.entityName, compact ? 70 : 100),
        value: [
          `Rol: ${roles[0] ? `<@&${roles[0]}>` : 'Sin rol'}`,
          `Tag: \`${registration.ruleTag(rule)}\``,
          `Roles adicionales: ${extraSummary}`,
        ].join('\n'),
      });
    }
    embeds.push(embed);
  }
  return embeds;
};

const render = ({ config, rules, guild, userId, screen = 'home', entityId = null, candidate = null, query = null, errorMessage = '', notice = '', savedGuild = false }) => {
  // Los estados de búsqueda/error reemplazan el resumen para que la respuesta
  // siga siendo visible incluso en servidores con el máximo de gremios.
  const embeds = ['search', 'error', 'pending'].includes(screen) ? [] : embedsFor(config, rules, guild);
  const selected = rules.find((rule) => rule.entityId === entityId);
  const components = [];
  if (screen === 'search') {
    embeds.push(new EmbedBuilder().setTitle('🔎 Buscando gremio en Albion')
      .setDescription(`Buscando **${safeName(query?.name)}** y verificando su ficha en la API de Albion.\nCuando termine, selecciona el rol principal para guardar el gremio.`)
      .setColor(0x5865f2));
    components.push(row(button('Cancelar', 'home', userId, guild.id)));
  } else if (screen === 'error') {
    embeds.push(new EmbedBuilder().setTitle(savedGuild ? '✅ Gremio guardado' : '❌ No se pudo añadir el gremio')
      .setDescription(savedGuild ? 'Pulsa Volver para actualizar la configuración.'
        : 'Pulsa Reintentar para abrir el formulario de nuevo o Volver para regresar a la configuración.')
      .setColor(0xed4245));
    const recovery = [button('Volver', 'home', userId, guild.id)];
    if (!savedGuild) recovery.unshift(button('Reintentar', 'add', userId, guild.id, '', ButtonStyle.Primary));
    components.push(row(...recovery));
  } else if (screen === 'pending' && candidate) {
    embeds.push(new EmbedBuilder().setTitle(`✅ Gremio encontrado: ${safeName(candidate.entity.name)}`)
      .setDescription(`Tag: \`${candidate.tag}\`. Selecciona el rol principal para guardar el gremio.\nEl gremio se registra al elegir el rol.`).setColor(0x57f287));
    components.push(row(new RoleSelectMenuBuilder().setCustomId(cid('create-role', userId, guild.id))
      .setPlaceholder('Rol principal del gremio').setMinValues(1).setMaxValues(1)));
    components.push(row(button('Cancelar', 'home', userId, guild.id)));
  } else if (screen === 'detail' && selected) {
    const roles = registration.ruleRoles(selected);
    embeds.push(new EmbedBuilder().setTitle(`✏️ ${safeName(selected.entityName)}`)
      .setDescription('Cambia el rol principal, los roles adicionales o la etiqueta. Los cambios se guardan al seleccionar.').setColor(0x57f287)
      .addFields({ name: 'Roles adicionales', value: roles.slice(1).map((id) => `<@&${id}>`).join(', ') || 'Ninguno' }));
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
  return { content: (errorMessage ? `${savedGuild ? '⚠️' : '❌'} ${errorMessage}` : notice).slice(0, 1500), embeds, components, allowedMentions: { parse: [] } };
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
  for (const field of fields) {
    const input = new TextInputBuilder().setCustomId(field.id).setLabel(field.label).setStyle(TextInputStyle.Short)
      .setMinLength(field.min || 1).setMaxLength(field.max || 100).setRequired(true);
    if (field.value) input.setValue(field.value);
    builder.addComponents(row(input));
  }
  return builder;
};

const respondError = async (interaction, error, { openingModal = false, panelState = null, candidate = null, savedGuild = false } = {}) => {
  const action = parseId(interaction.customId)?.action;
  // DiscordAPIError incluye la URL del token; registrar solo datos de diagnóstico.
  console.error('[WARN] /setup-registro:', {
    action, code: error?.code, name: error?.name,
    message: error instanceof registration.RegistrationError || error instanceof albionApi.AlbionApiError ? error.message.slice(0, 300) : undefined,
  });
  // Un token caducado ya no permite reply ni showModal. Reintentarlo oculta
  // el error original con una segunda respuesta fallida.
  if (error?.code === 10062 || error?.code === 10015) return;
  let message = error instanceof registration.RegistrationError || error instanceof albionApi.AlbionApiError
    ? error.message : openingModal
      ? 'No se pudo abrir el formulario de registro. Abre `/setup-registro` de nuevo e inténtalo otra vez.'
      : 'No se pudo guardar el cambio. Revisa la API de Albion y los permisos.';
  if (error?.code === 50035) message = openingModal
    ? 'Discord rechazó el formulario de registro. Abre `/setup-registro` de nuevo; si persiste, revisa el registro de errores del bot.'
    : 'Discord rechazó la actualización del panel. Abre `/setup-registro` de nuevo.';
  if (error?.code === 50013) message = 'Discord no permitió el cambio. Revisa los permisos y la jerarquía del bot.';
  if (savedGuild) message = 'El gremio se guardó, pero no se pudo actualizar el panel. Pulsa Volver para ver la configuración actual.';
  if (panelState && (interaction.deferred || interaction.replied)) {
    try {
      return await interaction.editReply(render({
        ...panelState, screen: candidate ? 'pending' : 'error', candidate, errorMessage: message, savedGuild,
      }));
    } catch (panelError) {
      console.error('[WARN] /setup-registro: no se pudo mostrar el error en el panel', {
        action, code: panelError?.code, name: panelError?.name,
      });
      if (panelError?.code === 10062 || panelError?.code === 10015) return;
    }
  }
  const payload = { content: `❌ ${message}`, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } };
  if (interaction.deferred || interaction.replied) return interaction.followUp(payload);
  return interaction.reply(payload);
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
    try {
      // showModal debe ser la primera respuesta; las consultas se hacen al enviar.
      if (action === 'add') {
        pending.delete(pendingKey(interaction));
        searches.delete(pendingKey(interaction));
        await interaction.showModal(modal(cid('add-submit', parsed.userId, parsed.guildId), 'Añadir gremio', [
          { id: 'name', label: 'Nombre exacto del gremio' }, { id: 'tag', label: 'Etiqueta para el apodo', max: 12 },
        ]));
      }
      if (action === 'tag') await interaction.showModal(modal(cid('tag-submit', parsed.userId, parsed.guildId, entityId), 'Editar etiqueta', [
        { id: 'tag', label: 'Nueva etiqueta para el apodo', max: 12 },
      ]));
      if (action === 'unlink') await interaction.showModal(modal(cid('unlink-submit', parsed.userId, parsed.guildId), 'Desvincular usuario', [
        { id: 'user-id', label: 'ID del usuario de Discord', min: 15, max: 22 },
      ]));
    } catch (error) {
      await respondError(interaction, error, { openingModal: true });
    }
    return true;
  }
  const key = pendingKey(interaction);
  const isGuildSearch = action === 'add-submit' && interaction.isModalSubmit?.();
  const searchToken = isGuildSearch ? {} : null;
  const currentSearch = () => searches.get(key) === searchToken;
  if (action === 'home' || isGuildSearch) {
    pending.delete(key);
    searches.delete(key);
  }
  if (searchToken) searches.set(key, searchToken);
  let state;
  let notice = '';
  let savedGuild = false;
  const startedAt = Date.now();
  try {
    await interaction.deferUpdate();
    if (isGuildSearch) {
      logStep(interaction, 'submit-received');
      // El modal se cierra con deferUpdate. Sustituir el panel antes de esperar
      // la base de datos o Albion evita que parezca que no ocurrió nada.
      await interaction.editReply(render({ config: null, rules: [], guild: interaction.guild, userId: parsed.userId,
        screen: 'search', query: { name: interaction.fields.getTextInputValue('name').trim() } }));
    }
    state = await load(interaction);
    if (searchToken && !currentSearch()) return true;
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
      if (!state.config?.enabled || !state.config?.region) throw new registration.RegistrationError('Selecciona primero el servidor de Albion.');
      if (state.rules.length >= registration.MAX_RULES) throw new registration.RegistrationError(`Este servidor alcanzó el límite de ${registration.MAX_RULES} gremios.`);
      const name = interaction.fields.getTextInputValue('name').trim();
      const tag = interaction.fields.getTextInputValue('tag').trim().toUpperCase();
      if (!/^[A-Z0-9]{1,12}$/.test(tag)) throw new registration.RegistrationError('La etiqueta debe tener entre 1 y 12 letras o números.');
      logStep(interaction, 'search-start', { region: state.config.region });
      const entity = await albionApi.findGuildByName(state.config.region, name);
      // Cancelar o abrir una búsqueda nueva invalida la respuesta anterior.
      if (!currentSearch()) return true;
      logStep(interaction, 'search-success', { region: state.config.region, entityId: entity.id, elapsedMs: Date.now() - startedAt });
      if (state.rules.some((item) => item.entityId === entity.id)) throw new registration.RegistrationError('Ese gremio ya está configurado. Selecciónalo en el panel para editarlo.');
      const candidate = { entity, tag, region: state.config.region, expiresAt: Date.now() + 10 * 60_000 };
      for (const [key, value] of pending) if (value.expiresAt < Date.now()) pending.delete(key);
      pending.set(key, candidate);
      return await interaction.editReply(render({ ...state, screen: 'pending', candidate }));
    } else if (action === 'create-role' && interaction.isRoleSelectMenu?.()) {
      const candidate = pending.get(key);
      if (!candidate || candidate.expiresAt < Date.now()) throw new registration.RegistrationError('La selección expiró. Pulsa Añadir gremio de nuevo.');
      if (candidate.region !== state.config?.region) throw new registration.RegistrationError('Cambió el servidor de Albion. Pulsa Añadir gremio y busca el gremio de nuevo.');
      if (state.rules.some((item) => item.entityId === candidate.entity.id)) throw new registration.RegistrationError('Ese gremio ya está configurado. Selecciónalo en el panel para editarlo.');
      logStep(interaction, 'role-selected', { entityId: candidate.entity.id, roleId: interaction.values[0] });
      await registration.saveGuildRule({ guild: state.guild, entity: candidate.entity, tag: candidate.tag,
        primaryRoleId: interaction.values[0], createdBy: state.userId });
      pending.delete(key);
      savedGuild = true;
      notice = `✅ Gremio **${safeName(candidate.entity.name)}** guardado con el rol principal <@&${interaction.values[0]}>.`;
      logStep(interaction, 'guild-saved', { entityId: candidate.entity.id, elapsedMs: Date.now() - startedAt });
    } else if (action === 'select' && interaction.isStringSelectMenu?.()) {
      return await interaction.editReply(render({ ...state, screen: 'detail', entityId: interaction.values[0] }));
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
    return await interaction.editReply(render({ ...updated, screen: nextScreen, entityId, notice }));
  } catch (error) {
    if (searchToken && !currentSearch()) return true;
    if (isGuildSearch || action === 'create-role') {
      const candidate = action === 'create-role' ? pending.get(key) : null;
      const reusableCandidate = candidate && candidate.expiresAt >= Date.now()
        && candidate.region === state?.config?.region ? candidate : null;
      if (!reusableCandidate) pending.delete(key);
      return respondError(interaction, error, {
        panelState: state || { config: null, rules: [], guild: interaction.guild, userId: parsed.userId },
        candidate: reusableCandidate, savedGuild,
      });
    }
    return respondError(interaction, error);
  } finally {
    if (searchToken && currentSearch()) searches.delete(key);
  }
};

module.exports = { data, execute, handleInteraction, render, embedsFor, parseId };
