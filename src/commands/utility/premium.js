const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { updateServerPremium, isServerPremium, getPremiumServers } = require("../../services/serverService");
const { getOrCreateServer } = require("../../services/serverService");

/**
 * Comando para gestionar el estado premium de servidores
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName("premium")
    .setDescription("Gestiona el estado premium del servidor (solo desarrolladores)")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set")
        .setDescription("Establece el estado premium del servidor")
        .addBooleanOption((option) =>
          option
            .setName("status")
            .setDescription("Estado premium (true/false)")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("server_id")
            .setDescription("ID del servidor (opcional, usa el servidor actual si no se especifica)")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("check")
        .setDescription("Verifica el estado premium del servidor")
        .addStringOption((option) =>
          option
            .setName("server_id")
            .setDescription("ID del servidor (opcional, usa el servidor actual si no se especifica)")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("Lista todos los servidores premium")
    ),

  async execute(interaction) {
    try {
      // Verificar si es el propietario del bot (solo para desarrollo)
      let botOwnerId;
      
      // Intentar obtener el ID del propietario desde la aplicación
      const application = interaction.client.application;
      if (application && application.owner) {
        botOwnerId = application.owner.id;
      } else {
        // Fallback: usar variable de entorno
        botOwnerId = process.env.BOT_OWNER_ID;
        if (!botOwnerId) {
          return interaction.reply({
            content: "❌ No se pudo verificar la información del propietario del bot.",
            ephemeral: true,
          });
        }
      }

      if (interaction.user.id !== botOwnerId) {
        return interaction.reply({
          content: "❌ Solo el propietario del bot puede usar este comando.",
          ephemeral: true,
        });
      }

      const subcommand = interaction.options.getSubcommand();
      const targetServerId = interaction.options.getString("server_id");
      const guildId = targetServerId || interaction.guild.id;

      // Obtener información del servidor objetivo
      let targetGuild;
      if (targetServerId) {
        targetGuild = interaction.client.guilds.cache.get(targetServerId);
        if (!targetGuild) {
          return interaction.reply({
            content: `❌ No se encontró el servidor con ID: ${targetServerId}`,
            ephemeral: true,
          });
        }
      } else {
        targetGuild = interaction.guild;
      }

      // Asegurar que el servidor existe en la base de datos
      await getOrCreateServer(guildId, targetGuild.name);

      let embed = new EmbedBuilder()
        .setTitle("💎 Gestión Premium")
        .setTimestamp();

      if (subcommand === "set") {
        const status = interaction.options.getBoolean("status");
        
        await updateServerPremium(guildId, status);
        
        embed.setColor(status ? "#FFD700" : "#808080")
          .setDescription(`Estado premium ${status ? "activado" : "desactivado"} para el servidor.`)
          .addFields({
            name: "Servidor",
            value: targetGuild.name,
            inline: true
          }, {
            name: "ID del Servidor",
            value: guildId,
            inline: true
          }, {
            name: "Estado Premium",
            value: status ? "✅ Activo" : "❌ Inactivo",
            inline: true
          });

      } else if (subcommand === "check") {
        const isPremium = await isServerPremium(guildId);
        
        embed.setColor(isPremium ? "#FFD700" : "#808080")
          .setDescription(`Estado premium del servidor: ${isPremium ? "Activo" : "Inactivo"}`)
          .addFields({
            name: "Servidor",
            value: targetGuild.name,
            inline: true
          }, {
            name: "ID del Servidor",
            value: guildId,
            inline: true
          }, {
            name: "Estado Premium",
            value: isPremium ? "✅ Activo" : "❌ Inactivo",
            inline: true
          });

      } else if (subcommand === "list") {
        const premiumServers = await getPremiumServers();
        
        embed.setColor("#FFD700")
          .setDescription(`Servidores premium: ${premiumServers.length}`)
          .addFields({
            name: "Servidores Premium",
            value: premiumServers.length > 0 
              ? premiumServers.map(server => `• ${server.guildName} (${server.guildId})`).join("\n")
              : "No hay servidores premium",
            inline: false
          });
      }

      await interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });
    } catch (error) {
      console.error('[ERROR] Error en comando premium:', error);
      await interaction.reply({
        content: `Error en gestión premium: ${error.message}`,
        ephemeral: true,
      });
    }
  },
};
