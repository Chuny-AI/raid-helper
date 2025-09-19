const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getTemplateNames, getTemplatesByServer } = require("../../services/templateService");
const { getServer, isServerPremium } = require("../../services/serverService");

/**
 * Comando de debug para verificar el estado de la base de datos
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName("debug")
    .setDescription("Información de debug sobre el servidor y templates"),

  async execute(interaction) {
    try {
      const guildId = interaction.guild.id;
      
      // Obtener información del servidor
      const server = await getServer(guildId);
      const templates = await getTemplatesByServer(guildId);
      const isPremium = await isServerPremium(guildId);
      
      const embed = new EmbedBuilder()
        .setTitle("🔧 Debug Information")
        .setColor("#FFA500")
        .addFields(
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
        )
        .setTimestamp();

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

      await interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });
    } catch (error) {
      console.error('[ERROR] Error en comando debug:', error);
      await interaction.reply({
        content: `Error en debug: ${error.message}`,
        ephemeral: true,
      });
    }
  },
};
