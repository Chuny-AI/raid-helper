const {
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');
const setupService = require('../../features/setup/application/setup-service');
const setupUi = require('../../features/setup/presentation/setup-ui');
const { createErrorEmbed, createSuccessEmbed, safeReply } = require('../../utils/errorEmbeds');

const isAdministrator = (interaction) => Boolean(
  interaction.guild
  && interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)
);

const editPanel = async (interaction, payload) => {
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  if (interaction.isMessageComponent?.()) return interaction.update(payload);
  return interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
};

const dashboard = async (interaction) => {
  const status = await setupService.getSetupStatus(interaction.guild, interaction.channelId);
  return editPanel(interaction, setupUi.buildDashboard({
    status,
    userId: interaction.user.id,
    guildId: interaction.guild.id,
    sourceChannelId: interaction.channelId,
  }));
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Abre el asistente de configuración inicial del servidor')
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!isAdministrator(interaction)) {
      return safeReply(interaction, {
        embeds: [createErrorEmbed('Acceso denegado', 'Solo los administradores pueden configurar el bot.')],
        flags: MessageFlags.Ephemeral,
      });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    return dashboard(interaction);
  },

  async handleInteraction(interaction) {
    const route = setupUi.parseComponentId(interaction.customId);
    if (!route) return false;

    if (!isAdministrator(interaction)
      || route.userId !== interaction.user.id
      || route.guildId !== interaction.guild.id) {
      await safeReply(interaction, {
        embeds: [createErrorEmbed('Panel protegido', 'Solo el administrador que abrió este asistente puede utilizarlo.')],
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    try {
      if (route.action === 'home') {
        await dashboard(interaction);
      } else if (route.action === 'roles') {
        const status = await setupService.getSetupStatus(interaction.guild, interaction.channelId);
        await editPanel(interaction, setupUi.buildRolesScreen({ status, userId: route.userId, guildId: route.guildId }));
      } else if (route.action === 'roles-save' && interaction.isRoleSelectMenu?.()) {
        await setupService.saveAuthorizedRoles({ guild: interaction.guild, roleIds: interaction.values, userId: interaction.user.id });
        await dashboard(interaction);
      } else if (route.action === 'economy') {
        const status = await setupService.getSetupStatus(interaction.guild, interaction.channelId);
        await editPanel(interaction, setupUi.buildEconomyScreen({ status, userId: route.userId, guildId: route.guildId, sourceChannelId: interaction.channelId }));
      } else if (route.action === 'economy-roles-save' && interaction.isRoleSelectMenu?.()) {
        await setupService.saveEconomyRoles({ guild: interaction.guild, roleIds: interaction.values, userId: interaction.user.id });
        const status = await setupService.getSetupStatus(interaction.guild, interaction.channelId);
        await editPanel(interaction, setupUi.buildEconomyScreen({ status, userId: route.userId, guildId: route.guildId, sourceChannelId: interaction.channelId }));
      } else if (route.action === 'economy-channel-save' && interaction.isChannelSelectMenu?.()) {
        await setupService.saveEconomyChannel({ guild: interaction.guild, sourceChannelId: interaction.channelId, channelId: interaction.values[0], userId: interaction.user.id });
        const status = await setupService.getSetupStatus(interaction.guild, interaction.channelId);
        await editPanel(interaction, setupUi.buildEconomyScreen({ status, userId: route.userId, guildId: route.guildId, sourceChannelId: interaction.channelId }));
      } else if (route.action === 'economy-clear' && interaction.isButton?.()) {
        await editPanel(interaction, setupUi.buildEconomyClearConfirmation({ userId: route.userId, guildId: route.guildId, sourceChannelId: interaction.channelId }));
      } else if (route.action === 'economy-clear-confirm' && interaction.isButton?.()) {
        await setupService.clearLogChannel(interaction.guild.id, interaction.channelId);
        await dashboard(interaction);
      } else if (route.action === 'economy-roles-clear' && interaction.isButton?.()) {
        await editPanel(interaction, setupUi.buildEconomyRolesClearConfirmation({ userId: route.userId, guildId: route.guildId }));
      } else if (route.action === 'economy-roles-clear-confirm' && interaction.isButton?.()) {
        await setupService.saveEconomyRoles({ guild: interaction.guild, roleIds: [], userId: interaction.user.id });
        await dashboard(interaction);
      } else if (route.action === 'voice') {
        const status = await setupService.getSetupStatus(interaction.guild, interaction.channelId);
        await editPanel(interaction, setupUi.buildTemporaryVoiceScreen({ status, userId: route.userId, guildId: route.guildId }));
      } else if (route.action === 'voice-save' && interaction.isChannelSelectMenu?.()) {
        await setupService.setTemporaryVoiceGenerators({
          guild: interaction.guild,
          channelIds: interaction.values,
          updatedBy: interaction.user.id,
        });
        await dashboard(interaction);
      } else if (route.action === 'voice-clear' && interaction.isButton?.()) {
        await setupService.clearTemporaryVoiceGenerators(interaction.guild.id);
        await dashboard(interaction);
      } else if (route.action === 'check') {
        const permissions = interaction.channel?.permissionsFor?.(interaction.guild.members.me);
        await editPanel(interaction, setupUi.buildPermissionScreen({ permissions, userId: route.userId, guildId: route.guildId }));
      } else if (route.action === 'finish') {
        const status = await setupService.getSetupStatus(interaction.guild, interaction.channelId);
        if (!status.baseReady) return dashboard(interaction);
        await editPanel(interaction, {
          embeds: [createSuccessEmbed(
            'Configuración completada',
            'El bot ya está listo para crear plantillas y raids. Puedes volver a ejecutar `/setup` en cualquier momento para cambiar estos valores.'
          )],
          components: [],
        });
      } else {
        await safeReply(interaction, {
          embeds: [createErrorEmbed('Opción inválida', 'Esta opción del asistente ya no está disponible. Ejecuta `/setup` de nuevo.')],
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (error) {
      console.error('[ERROR] setup interactivo:', error);
      await safeReply(interaction, {
        embeds: [createErrorEmbed('No se pudo guardar', error.message || 'Ocurrió un error durante la configuración.')],
        flags: MessageFlags.Ephemeral,
      });
    }
    return true;
  },

  isAdministrator,
};
