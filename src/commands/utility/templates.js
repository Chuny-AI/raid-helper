const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { getTemplateNames } = require("../../services/templateService");
const { getOrCreateServer } = require("../../services/serverService");
const { checkPremiumAccessWithOwnerBypass } = require("../../middleware/roleCheck");
const { createErrorEmbed, createInfoEmbed, safeReply } = require("../../utils/errorEmbeds");

/**
 * Comando para listar los templates disponibles en el servidor
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName("templates")
    .setDescription("Lista todos los templates disponibles en este servidor"),

  async execute(interaction) {
    try {
      // Verificar acceso premium con bypass para el propietario
      const hasAccess = await checkPremiumAccessWithOwnerBypass(interaction);
      if (!hasAccess) {
        return;
      }

      const guildId = interaction.guild.id;

      /**
       * Asegurar que el servidor existe en la base de datos
       */
      await getOrCreateServer(guildId, interaction.guild.name);

      /**
       * Obtener los nombres de los templates
       */
      const templates = await getTemplateNames(guildId);

      if (templates.length === 0) {
        const infoEmbed = createInfoEmbed(
          "No Hay Templates",
          "No hay templates disponibles en este servidor.",
          [{
            name: "Solución",
            value: "Contacta a un administrador para crear templates o activar premium en este servidor.",
            inline: false
          }]
        );
        return await safeReply(interaction, {
          embeds: [infoEmbed],
          ephemeral: true,
        });
      }

      const embed = createInfoEmbed(
        "Templates Disponibles",
        "Lista de templates disponibles en este servidor:",
        templates.map((template, index) => ({
          name: `${index + 1}. ${template.name}`,
          value: `Usa \`/raid template:${template.name}\` para crear una actividad`,
          inline: false
        }))
      );

      await safeReply(interaction, {
        embeds: [embed],
        ephemeral: true,
      });
    } catch (error) {
      console.error('[ERROR] Error en comando templates:', error);
      const errorEmbed = createErrorEmbed(
        "Error del Sistema",
        "Hubo un error ejecutando el comando de templates.",
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
