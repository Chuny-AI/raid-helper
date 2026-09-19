const {
  ChannelType,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');
const {
  clearMemberLogConfig,
  getMemberLogConfig,
  setMemberLogConfig,
  syncGuildMembers,
} = require('../../services/memberLogService');
const { createErrorEmbed, createSuccessEmbed, createInfoEmbed, safeReply } = require('../../utils/errorEmbeds');
const { UserError, isUserError } = require('../../utils/userError');

const channelOption = (name, description) => (option) => option
  .setName(name)
  .setDescription(description)
  .setRequired(true)
  .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);

const data = new SlashCommandBuilder()
  .setName('registro-miembros')
  .setDescription('Configura los canales de bienvenida y despedida')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((subcommand) => subcommand
    .setName('configurar')
    .setDescription('Define los canales de entrada y salida de miembros')
    .addChannelOption(channelOption('bienvenida', 'Canal para registrar a quienes entran'))
    .addChannelOption(channelOption('despedida', 'Canal para registrar a quienes salen')))
  .addSubcommand((subcommand) => subcommand
    .setName('estado')
    .setDescription('Muestra los canales configurados'))
  .addSubcommand((subcommand) => subcommand
    .setName('desactivar')
    .setDescription('Desactiva los registros de entrada y salida'));

const isAdministrator = (interaction) => Boolean(
  interaction.guild
  && interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)
);

const validateChannel = (interaction, channel) => {
  const permissions = channel.permissionsFor?.(interaction.guild.members.me);
  if (!channel.isTextBased?.() || typeof channel.send !== 'function') {
    throw new UserError(`${channel} no es un canal de texto válido.`);
  }
  if (!permissions?.has([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
  ])) {
    throw new UserError(`El bot necesita ver, escribir e insertar enlaces en ${channel}.`);
  }
};

const execute = async (interaction) => {
  if (!isAdministrator(interaction)) {
    return safeReply(interaction, {
      embeds: [createErrorEmbed('Acceso denegado', 'Solo los administradores pueden configurar estos canales.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const action = interaction.options.getSubcommand();
    if (action === 'configurar') {
      const welcomeChannel = interaction.options.getChannel('bienvenida', true);
      const farewellChannel = interaction.options.getChannel('despedida', true);
      if (welcomeChannel.id === farewellChannel.id) {
        throw new UserError('Selecciona dos canales diferentes: uno de bienvenida y otro de despedida.');
      }
      validateChannel(interaction, welcomeChannel);
      validateChannel(interaction, farewellChannel);
      await setMemberLogConfig({
        guildId: interaction.guildId,
        welcomeChannelId: welcomeChannel.id,
        farewellChannelId: farewellChannel.id,
        updatedBy: interaction.user.id,
      });
      let syncResult = '';
      try {
        const synced = await syncGuildMembers(interaction.guild);
        syncResult = `\nNombres actuales sincronizados: **${synced}**.`;
      } catch (error) {
        console.error('[WARN] La configuración se guardó, pero no se pudieron sincronizar los nombres actuales:', error);
        syncResult = '\n⚠️ La configuración quedó guardada, pero no se pudieron sincronizar todos los nombres actuales. El bot seguirá actualizándolos cuando Discord informe cambios.';
      }
      return safeReply(interaction, {
        embeds: [createSuccessEmbed(
          'Registro de miembros configurado',
          `Bienvenidas: ${welcomeChannel}\nDespedidas: ${farewellChannel}${syncResult}`
        )],
      });
    }

    if (action === 'estado') {
      const config = await getMemberLogConfig(interaction.guildId);
      return safeReply(interaction, {
        embeds: [config
          ? createInfoEmbed(
            'Registro de miembros',
            `Bienvenidas: <#${config.welcomeChannelId}>\nDespedidas: <#${config.farewellChannelId}>`
          )
          : createInfoEmbed('Registro de miembros', 'No hay canales configurados.')],
      });
    }

    if (action === 'desactivar') {
      await clearMemberLogConfig(interaction.guildId);
      return safeReply(interaction, {
        embeds: [createSuccessEmbed('Registro desactivado', 'Se retiró la configuración de bienvenida y despedida.')],
      });
    }

    throw new UserError('Opción desconocida.');
  } catch (error) {
    console.error('[ERROR] Comando registro-miembros:', error);
    return safeReply(interaction, {
      embeds: [createErrorEmbed(
        'No se pudo guardar',
        isUserError(error) ? error.message : 'Ocurrió un error al configurar los canales.'
      )],
    });
  }
};

module.exports = { data, execute, isAdministrator, validateChannel };
