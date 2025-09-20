const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { updateServerPremium, isServerPremium, getPremiumServers } = require("../../services/serverService");
const { getOrCreateServer } = require("../../services/serverService");
const { checkOwner } = require("../../middleware/ownerCheck");
const { createErrorEmbed, createSuccessEmbed, createInfoEmbed, safeReply } = require("../../utils/errorEmbeds");

/**
 * Comando para gestionar el estado premium de servidores
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName("premium")
    .setDescription("Gestiona el estado premium del servidor (solo propietario del bot)")
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
      // Verificar si es el propietario del bot
      const isOwner = await checkOwner(interaction);
      if (!isOwner) {
        return;
      }

      const subcommand = interaction.options.getSubcommand();
      const targetServerId = interaction.options.getString("server_id");
      const guildId = targetServerId || interaction.guild.id;

      // Obtener información del servidor objetivo
      let targetGuild;
      if (targetServerId) {
        targetGuild = interaction.client.guilds.cache.get(targetServerId);
        if (!targetGuild) {
          const errorEmbed = createErrorEmbed(
            "Servidor No Encontrado",
            `No se encontró el servidor con ID: ${targetServerId}`,
            [{
              name: "Solución",
              value: "Verifica que el ID del servidor sea correcto y que el bot esté en ese servidor.",
              inline: false
            }]
          );
          return await safeReply(interaction, {
            embeds: [errorEmbed],
            ephemeral: true,
          });
        }
      } else {
        targetGuild = interaction.guild;
      }

      // Asegurar que el servidor existe en la base de datos
      await getOrCreateServer(guildId, targetGuild.name);

      let embed;

      if (subcommand === "set") {
        const status = interaction.options.getBoolean("status");
        
        await updateServerPremium(guildId, status);
        
        embed = createSuccessEmbed(
          "Gestión Premium",
          `Estado premium ${status ? "activado" : "desactivado"} para el servidor.`,
          [{
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
          }]
        );

      } else if (subcommand === "check") {
        const isPremium = await isServerPremium(guildId);
        
        embed = createInfoEmbed(
          "Estado Premium",
          `Estado premium del servidor: ${isPremium ? "Activo" : "Inactivo"}`,
          [{
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
          }]
        );

      } else if (subcommand === "list") {
        const premiumServers = await getPremiumServers();
        
        embed = createInfoEmbed(
          "Lista de Servidores Premium",
          `Servidores premium: ${premiumServers.length}`,
          [{
            name: "Servidores Premium",
            value: premiumServers.length > 0 
              ? premiumServers.map(server => `• ${server.guildName} (${server.guildId})`).join("\n")
              : "No hay servidores premium",
            inline: false
          }]
        );
      }

      await safeReply(interaction, {
        embeds: [embed],
        ephemeral: true,
      });
    } catch (error) {
      console.error('[ERROR] Error en comando premium:', error);
      const errorEmbed = createErrorEmbed(
        "Error del Sistema",
        "Hubo un error ejecutando el comando de gestión premium.",
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
