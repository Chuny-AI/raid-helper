const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { createTemplate, getTemplateByName } = require("../../services/templateService");
const { getOrCreateServer } = require("../../services/serverService");
const { createErrorEmbed, createSuccessEmbed, safeReply } = require("../../utils/errorEmbeds");

/**
 * Comando para migrar un template desde JSON a la base de datos
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName("migrate")
    .setDescription("Migra un template desde JSON a la base de datos (solo administradores)")
    .addStringOption((option) =>
      option
        .setName("json")
        .setDescription("JSON del template a migrar")
        .setRequired(true)
    ),

  async execute(interaction) {
    try {
      const guildId = interaction.guild.id;
      const jsonInput = interaction.options.getString("json");

      await getOrCreateServer(guildId, interaction.guild.name);

      try {
        const templateData = JSON.parse(jsonInput);

        // Verificar si el template ya existe
        const existingTemplate = await getTemplateByName(templateData.title, guildId);
        if (existingTemplate) {
          const errorEmbed = createErrorEmbed(
            "Template Duplicado",
            `Ya existe un template con el título "${templateData.title}".`,
            [{
              name: "💡 Solución",
              value: "Usa un título diferente o elimina el template existente primero.",
              inline: false
            }]
          );
          return await safeReply(interaction, {
            embeds: [errorEmbed],
            ephemeral: true,
          });
        }

        // Asegurar que tenga URL
        if (!templateData.url) {
          templateData.url = "";
        }

        // Asegurar que las armas tengan URLs
        if (templateData.weapons) {
          Object.keys(templateData.weapons).forEach(weaponKey => {
            if (templateData.weapons[weaponKey].data) {
              templateData.weapons[weaponKey].data.forEach(weapon => {
                if (!weapon.url) {
                  weapon.url = "";
                }
              });
            }
          });
        }

        // Crear el template
        await createTemplate(templateData, guildId);

        const embed = createSuccessEmbed(
          "Template Migrado Exitosamente",
          `El template "${templateData.title}" ha sido migrado correctamente.`,
          [{
            name: "📋 Información del Template",
            value: `**Título:** ${templateData.title}\n**Descripción:** ${templateData.description ? templateData.description.substring(0, 100) + '...' : 'Sin descripción'}`,
            inline: false
          }, {
            name: "⚔️ Armas Configuradas",
            value: templateData.weapons ? `${Object.keys(templateData.weapons).length} categorías de armas` : "0 armas",
            inline: true
          }, {
            name: "⏰ Tiempo",
            value: templateData.time || "No especificado",
            inline: true
          }]
        );

        await safeReply(interaction, {
          embeds: [embed],
          ephemeral: true,
        });

      } catch (parseError) {
        const errorEmbed = createErrorEmbed(
          "Error Parseando JSON",
          `Error al parsear el JSON proporcionado: ${parseError.message}`,
          [{
            name: "💡 Solución",
            value: "Verifica que el JSON tenga la estructura correcta y vuelve a intentarlo.",
            inline: false
          }, {
            name: "📋 Estructura Esperada",
            value: "```json\n{\n  \"title\": \"Nombre del template\",\n  \"description\": \"Descripción\",\n  \"time\": \"30m\",\n  \"weapons\": {...}\n}\n```",
            inline: false
          }]
        );
        await safeReply(interaction, {
          embeds: [errorEmbed],
          ephemeral: true,
        });
      }

    } catch (error) {
      console.error('[ERROR] Error en comando migrate:', error);
      const errorEmbed = createErrorEmbed(
        "Error del Sistema",
        "Hubo un error ejecutando el comando de migración.",
        [{
          name: "🔧 Solución",
          value: "Intenta ejecutar el comando de nuevo. Si el problema persiste, contacta al soporte.",
          inline: false
        }, {
          name: "🆘 Error Técnico",
          value: `\`${error.message}\``,
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
