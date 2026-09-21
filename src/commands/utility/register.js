const { InteractionContextType, MessageFlags, SlashCommandBuilder, escapeMarkdown } = require('discord.js');
const albionApi = require('../../services/albionApiService');
const registration = require('../../services/albionRegistrationService');

const data = new SlashCommandBuilder()
  .setName('register')
  .setDescription('Vincula tu personaje de Albion y sincroniza tus roles')
  .setContexts(InteractionContextType.Guild)
  .addStringOption((option) => option.setName('jugador').setDescription('Nombre exacto de tu personaje en Albion').setRequired(true).setMaxLength(100));

const registerName = async (interaction, playerName) => {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const { player, result } = await registration.registerPlayer({ member, playerName });
    return interaction.editReply({
      content: `✅ **${escapeMarkdown(player.name)}** registrado. Gremio: **${escapeMarkdown(player.guildName || 'Sin gremio')}**. Alianza: **${escapeMarkdown(player.allianceName || 'Sin alianza')}**. Roles asignados: ${[...result.desired].map((id) => `<@&${id}>`).join(', ') || 'ninguno'}.`,
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    console.error('[WARN] Registro Albion:', error);
    const message = error instanceof registration.RegistrationError || error instanceof albionApi.AlbionApiError
      ? error.message : 'No se pudo completar el registro. Inténtalo de nuevo más tarde.';
    return interaction.editReply({ content: `❌ ${message}`, allowedMentions: { parse: [] } });
  }
};

module.exports = { data, execute: (interaction) => registerName(interaction, interaction.options.getString('jugador', true)), registerName };
