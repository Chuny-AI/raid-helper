const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, InteractionContextType, MessageFlags,
  ModalBuilder, PermissionFlagsBits, SlashCommandBuilder, TextInputBuilder, TextInputStyle, escapeMarkdown,
} = require('discord.js');
const albionApi = require('../../services/albionApiService');
const registration = require('../../services/albionRegistrationService');

const data = new SlashCommandBuilder()
  .setName('registro-panel')
  .setDescription('Publica el panel de registro automático de Albion en este canal')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

const panelPayload = (config, client) => ({
  embeds: [new EmbedBuilder()
    .setTitle('⚔️ Registro de Albion Online')
    .setColor(0x5865f2)
    .setThumbnail(client?.user?.displayAvatarURL?.() || null)
    .setDescription([
      'Pulsa **Registrar personaje** y escribe el nombre exacto de tu personaje.',
      `Servidor: **${config.region}**. El bot comprobará tu gremio y asignará sus roles automáticamente.`,
      'Tu apodo mostrará la etiqueta del gremio. El bot revisará tu pertenencia periódicamente y retirará los roles si sales del gremio.',
      'Albion puede responder lentamente: la verificación puede tardar varios minutos. Espera la respuesta del bot antes de volver a intentarlo.',
    ].join('\n\n'))
    .setFooter({ text: 'Chuny BOT · Registro de gremios' })],
  components: [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('albion-register:open').setLabel('Registrar personaje').setEmoji('⚔️').setStyle(ButtonStyle.Primary),
  )],
  allowedMentions: { parse: [] },
});

const execute = async (interaction) => {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (!interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) return interaction.editReply('Solo un administrador puede publicar este panel.');
  try {
    const config = await registration.getConfig(interaction.guildId);
    if (!config?.enabled || !(await registration.getRules(interaction.guildId)).length) {
      return interaction.editReply('Configura la región y al menos un gremio con `/setup-registro`.');
    }
    const permissions = interaction.channel.permissionsFor(interaction.guild.members.me);
    if (!interaction.channel?.send || !permissions?.has([
      PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks,
    ])) return interaction.editReply('El bot necesita ver, escribir y enviar embeds en este canal.');
    const message = await interaction.channel.send(panelPayload(config, interaction.client));
    return interaction.editReply(`✅ Panel publicado en ${interaction.channel}: ${message.url}`);
  } catch (error) {
    console.error('[ERROR] /registro-panel:', error);
    return interaction.editReply('❌ No se pudo publicar el panel. Revisa la configuración y permisos.');
  }
};

const handleInteraction = async (interaction) => {
  if (interaction.customId === 'albion-register:open' && interaction.isButton?.()) {
    const config = await registration.getConfig(interaction.guildId);
    if (!config?.enabled) return interaction.reply({ content: 'El registro no está disponible en este momento.', flags: MessageFlags.Ephemeral });
    const modal = new ModalBuilder().setCustomId('albion-register:submit').setTitle('Registro de Albion Online');
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder()
      .setCustomId('player-name').setLabel('Nombre exacto de tu personaje')
      .setPlaceholder('Tu nombre en Albion Online')
      .setStyle(TextInputStyle.Short).setMinLength(1).setMaxLength(100).setRequired(true)));
    await interaction.showModal(modal);
    return true;
  }
  if (interaction.customId === 'albion-register:submit' && interaction.isModalSubmit?.()) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const { player, result } = await registration.registerPlayer({ member, playerName: interaction.fields.getTextInputValue('player-name') });
      const suffix = result.nicknameUpdated ? ' Tu apodo también se actualizó.' : ' El bot no pudo cambiar tu apodo; revisa su permiso y jerarquía.';
      await interaction.editReply({
        content: `✅ **${escapeMarkdown(player.name)}** registrado en **${escapeMarkdown(player.guildName || 'Sin gremio')}**. Roles: ${[...result.desired].map((id) => `<@&${id}>`).join(', ')}.${suffix}`,
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      console.error('[WARN] Registro Albion:', error);
      const message = error instanceof registration.RegistrationError || error instanceof albionApi.AlbionApiError
        ? error.message : 'No se pudo completar el registro. Inténtalo de nuevo más tarde.';
      await interaction.editReply({ content: `❌ ${message}`, allowedMentions: { parse: [] } });
    }
    return true;
  }
  return false;
};

module.exports = { data, execute, handleInteraction, panelPayload };
