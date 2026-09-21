const {
  ChannelType, InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder,
  escapeMarkdown,
} = require('discord.js');
const albionApi = require('../../services/albionApiService');
const registration = require('../../services/albionRegistrationService');
const AlbionRegistration = require('../../database/models/AlbionRegistration');

const data = new SlashCommandBuilder()
  .setName('register-setup')
  .setDescription('Configura gremios, alianzas y roles del registro Albion')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) => sub.setName('configurar')
    .setDescription('Selecciona la región de Albion y el canal de auditoría')
    .addStringOption((option) => option.setName('region').setDescription('Servidor de Albion').setRequired(true)
      .addChoices(
        { name: 'Americas', value: 'americas' },
        { name: 'Europe', value: 'europe' },
        { name: 'Asia', value: 'asia' },
      ))
    .addChannelOption((option) => option.setName('auditoria').setDescription('Canal privado para cambios de roles')
      .addChannelTypes(ChannelType.GuildText).setRequired(true)))
  .addSubcommand((sub) => sub.setName('gremio')
    .setDescription('Asocia un gremio con entre 1 y 25 roles de Discord')
    .addStringOption((option) => option.setName('nombre').setDescription('Nombre exacto del gremio en Albion').setRequired(true))
    .addStringOption((option) => option.setName('roles').setDescription('Menciones o IDs de roles separados por espacio').setRequired(true)))
  .addSubcommand((sub) => sub.setName('alianza')
    .setDescription('Asocia la alianza de un personaje con roles de Discord')
    .addStringOption((option) => option.setName('jugador').setDescription('Personaje que pertenezca a esa alianza').setRequired(true))
    .addStringOption((option) => option.setName('roles').setDescription('Menciones o IDs de roles separados por espacio').setRequired(true)))
  .addSubcommand((sub) => sub.setName('reglas').setDescription('Muestra las reglas de gremios y alianzas'))
  .addSubcommand((sub) => sub.setName('quitar')
    .setDescription('Elimina una regla por ID de gremio o alianza')
    .addStringOption((option) => option.setName('tipo').setDescription('Tipo de regla').setRequired(true)
      .addChoices({ name: 'Gremio', value: 'guild' }, { name: 'Alianza', value: 'alliance' }))
    .addStringOption((option) => option.setName('id').setDescription('ID de Albion mostrado en /register-setup reglas').setRequired(true)))
  .addSubcommand((sub) => sub.setName('desvincular')
    .setDescription('Desvincula el personaje de un miembro y retira los roles asignados')
    .addUserOption((option) => option.setName('usuario').setDescription('Usuario de Discord').setRequired(true)));

const parseRoleIds = (value) => {
  const tokens = String(value || '').trim().split(/[\s,;]+/).filter(Boolean);
  if (!tokens.length || tokens.length > 25) throw new registration.RegistrationError('Indica entre 1 y 25 menciones o IDs de roles.');
  const ids = tokens.map((token) => token.replace(/^<@&(\d+)>$/, '$1'));
  if (ids.some((id) => !/^\d{15,22}$/.test(id))) {
    throw new registration.RegistrationError('Escribe únicamente menciones de roles o IDs numéricos, separados por espacios.');
  }
  return ids;
};

const execute = async (interaction) => {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    if (!interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
      throw new registration.RegistrationError('Solo un administrador puede configurar el registro Albion.');
    }
    const action = interaction.options.getSubcommand();
    if (action === 'configurar') {
      const channel = interaction.options.getChannel('auditoria', true);
      if (!channel?.send || !channel.permissionsFor(interaction.guild.members.me)?.has([
        PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks,
      ])) {
        throw new registration.RegistrationError('El bot necesita ver, escribir y enviar embeds al canal de auditoría.');
      }
      const config = await registration.configure({
        guildId: interaction.guildId,
        region: interaction.options.getString('region', true),
        auditChannelId: channel.id,
        updatedBy: interaction.user.id,
      });
      return interaction.editReply(`✅ Registro configurado en **${config.region}**. Auditoría: ${channel}. Añade reglas y publica el panel con `/panel`.`);
    }
    if (action === 'reglas') {
      const [config, rules] = await Promise.all([registration.getConfig(interaction.guildId), registration.getRules(interaction.guildId)]);
      if (!config) return interaction.editReply('Configura primero `/register-setup configurar`.');
      const lines = rules.map((rule) => `${rule.entityType === 'guild' ? '🏰 Gremio' : '🤝 Alianza'} **${escapeMarkdown(rule.entityName)}** · ID \`${rule.entityId}\` → ${rule.roleIds.map((id) => `<@&${id}>`).join(', ')}`);
      return interaction.editReply({ content: `**Región:** ${config.region} · **Auditoría:** <#${config.auditChannelId}>\n${lines.join('\n').slice(0, 1750) || 'Aún no hay reglas.'}`, allowedMentions: { parse: [] } });
    }
    if (action === 'desvincular') {
      const user = interaction.options.getUser('usuario', true);
      const removed = await registration.removeRegistration(interaction.guild, user.id);
      return interaction.editReply(removed ? `✅ Se desvinculó a <@${user.id}> y se retiraron los roles asignados por el registro.` : 'Ese miembro no tiene un personaje vinculado.');
    }
    if (action === 'quitar') {
      const type = interaction.options.getString('tipo', true);
      const entityId = interaction.options.getString('id', true).trim();
      const AlbionMembershipRule = require('../../database/models/AlbionMembershipRule');
      const removed = await AlbionMembershipRule.findOneAndDelete({ guildId: interaction.guildId, entityType: type, entityId });
      if (!removed) throw new registration.RegistrationError('No existe esa regla en este servidor.');
      await AlbionRegistration.updateMany({ guildId: interaction.guildId }, { $set: { nextCheckAt: new Date() } });
      return interaction.editReply('✅ Regla eliminada. Los roles existentes se revisarán en la siguiente sincronización.');
    }
    const config = await registration.getConfig(interaction.guildId);
    if (!config) throw new registration.RegistrationError('Configura primero `/register-setup configurar`.');
    const roleIds = parseRoleIds(interaction.options.getString('roles', true));
    registration.validateRoles(interaction.guild, roleIds);
    const entity = action === 'gremio'
      ? await albionApi.findGuildByName(config.region, interaction.options.getString('nombre', true))
      : await albionApi.findAllianceFromPlayer(config.region, interaction.options.getString('jugador', true));
    const rule = await registration.saveRule({
      guild: interaction.guild,
      entityType: action === 'gremio' ? 'guild' : 'alliance',
      entity,
      roleIds,
      createdBy: interaction.user.id,
    });
    return interaction.editReply({
      content: `✅ ${action === 'gremio' ? 'Gremio' : 'Alianza'} **${escapeMarkdown(rule.entityName)}** configurado. ID: \`${rule.entityId}\`\nRoles: ${rule.roleIds.map((id) => `<@&${id}>`).join(', ')}`,
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    console.error('[ERROR] register-setup:', error);
    const message = error instanceof registration.RegistrationError || error instanceof albionApi.AlbionApiError
      ? error.message : 'No se pudo completar la configuración. Revisa permisos y conexión con Albion.';
    return interaction.editReply({ content: `❌ ${message}`, allowedMentions: { parse: [] } });
  }
};

module.exports = { data, execute, parseRoleIds };
