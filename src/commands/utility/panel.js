const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, InteractionContextType, MessageFlags,
  ModalBuilder, PermissionFlagsBits, SlashCommandBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const registration = require('../../services/albionRegistrationService');
const register = require('./register');

const data = new SlashCommandBuilder()
  .setName('panel')
  .setDescription('Publica el panel permanente de registro de Albion en este canal')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

const panelPayload = (config) => ({
  embeds: [new EmbedBuilder()
    .setTitle('⚔️ Registro de Albion Online')
    .setColor(0x5865f2)
    .setDescription([
      'Pulsa **Registrar personaje** e indica el nombre exacto de tu personaje de Albion Online.',
      `Servidor de Albion: **${config.region}**.`,
      'El bot comprueba tu gremio y alianza, asigna los roles configurados y los revisa periódicamente.',
      'Si sales del gremio, los roles correspondientes se retirarán después de confirmar el cambio.',
      'El personaje quedará vinculado a tu cuenta de Discord en este servidor.',
    ].join('\n\n'))],
  components: [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('albion-register:open').setLabel('Registrar personaje').setEmoji('⚔️').setStyle(ButtonStyle.Primary),
  )],
  allowedMentions: { parse: [] },
});

const execute = async (interaction) => {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (!interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
    return interaction.editReply('Solo un administrador puede publicar este panel.');
  }
  try {
    const config = await registration.getConfig(interaction.guildId);
    if (!config?.enabled || !(await registration.getRules(interaction.guildId)).length) {
      return interaction.editReply('Configura la región y al menos un gremio o alianza con `/register-setup` antes de publicar el panel.');
    }
    const permissions = interaction.channel.permissionsFor(interaction.guild.members.me);
    if (!interaction.channel?.send || !permissions?.has([
      PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks,
    ])) return interaction.editReply('El bot necesita ver, escribir y enviar embeds en este canal.');
    const message = await interaction.channel.send(panelPayload(config));
    return interaction.editReply(`✅ Panel publicado en ${interaction.channel}: ${message.url}`);
  } catch (error) {
    console.error('[ERROR] /panel:', error);
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
      .setPlaceholder('Escribe tu nombre de Albion')
      .setStyle(TextInputStyle.Short).setMinLength(1).setMaxLength(100).setRequired(true)));
    await interaction.showModal(modal);
    return true;
  }
  if (interaction.customId === 'albion-register:submit' && interaction.isModalSubmit?.()) {
    await register.registerName(interaction, interaction.fields.getTextInputValue('player-name'));
    return true;
  }
  return false;
};

module.exports = { data, execute, handleInteraction, panelPayload };
