const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getTemplateNames, getTemplatesByServer } = require("../../services/templateService");
const { getServer, isServerPremium } = require("../../services/serverService");
const { createErrorEmbed, createInfoEmbed, safeReply } = require("../../utils/errorEmbeds");
// El comando status es visible para todos los usuarios

/**
 * Comando de status para verificar el estado de la base de datos
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName("status")
    .setDescription("Información de estado del servidor y templates"),

  async execute(interaction) {
    try {
      // El comando status es visible para todos los usuarios

      const guildId = interaction.guild.id;
      
      // Obtener información del servidor
      const server = await getServer(guildId);
      const templates = await getTemplatesByServer(guildId);
      const isPremium = await isServerPremium(guildId);
      
      const embed = createInfoEmbed(
        "Status Information",
        "Información del estado del servidor y templates",
        [
          {
            name: "Server ID",
            value: guildId,
            inline: true
          },
          {
            name: "Server Name",
            value: interaction.guild.name,
            inline: true
          },
          {
            name: "Server in DB",
            value: server ? "✅ Yes" : "❌ No",
            inline: true
          },
          {
            name: "Templates Count",
            value: templates.length.toString(),
            inline: true
          },
          {
            name: "Premium Status",
            value: isPremium ? "✅ Premium" : "❌ Free",
            inline: true
          },
          {
            name: "Bot Latency",
            value: `${interaction.client.ws.ping}ms`,
            inline: true
          },
          {
            name: "Uptime",
            value: `${Math.floor(interaction.client.uptime / 1000)}s`,
            inline: true
          }
        ]
      );

      if (templates.length > 0) {
        const templateNames = templates.map(t => t.title).join(", ");
        embed.addFields({
          name: "Available Templates",
          value: templateNames.length > 1000 ? 
            templateNames.substring(0, 1000) + "..." : 
            templateNames,
          inline: false
        });
      }

      await safeReply(interaction, {
        embeds: [embed],
        ephemeral: true,
      });
    } catch (error) {
      console.error('[ERROR] Error en comando status:', error);
      const errorEmbed = createErrorEmbed(
        "Error del Sistema",
        "Hubo un error ejecutando el comando de status.",
        [{
          name: "Solución",
          value: "Intenta ejecutar el comando de nuevo. Si el problema persiste, contacta al soporte.",
          inline: false
        }]
      );
      await safeReply(interaction, {
        embeds: [errorEmbed],
        ephemeral: true,
      });
    }
  },
};
