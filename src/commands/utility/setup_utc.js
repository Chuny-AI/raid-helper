const {
  MessageFlags,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');
const { setupUtcClock } = require('../../services/utcClockService');
const { createErrorEmbed, createSuccessEmbed, safeReply } = require('../../utils/errorEmbeds');

const data = new SlashCommandBuilder()
  .setName('setup-utc')
  .setDescription('Crea un canal de voz que muestra la hora UTC')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

const execute = async (interaction) => {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const { channel, created } = await setupUtcClock({
      guild: interaction.guild,
      updatedBy: interaction.user.id,
      client: interaction.client,
    });

    return safeReply(interaction, {
      embeds: [createSuccessEmbed(
        created ? 'Reloj UTC creado' : 'Reloj UTC actualizado',
        `${channel} mostrará la hora UTC y se actualizará automáticamente cada minuto.`
      )],
    });
  } catch (error) {
    console.error('[ERROR] Comando setup-utc:', error);
    return safeReply(interaction, {
      embeds: [createErrorEmbed(
        'No se pudo configurar el reloj UTC',
        'Comprueba que el bot tenga los permisos **Gestionar canales** y **Establecer estado del canal de voz**.'
      )],
    });
  }
};

module.exports = { data, execute };
