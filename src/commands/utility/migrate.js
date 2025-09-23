const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { migrateTemplatesFromFiles, createTemplate, getTemplateByName } = require("../../services/templateService");
const { getOrCreateServer } = require("../../services/serverService");
const { checkPremium } = require("../../middleware/premiumCheck");
const { checkPremiumAccessWithOwnerBypass } = require("../../middleware/roleCheck");
const { createErrorEmbed, createSuccessEmbed, createInfoEmbed, safeReply } = require("../../utils/errorEmbeds");

/**
 * Comando para migrar templates manualmente desde JSON o archivos
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName("migrate")
    .setDescription("Migra templates desde JSON o archivos a la base de datos (solo administradores)")
    .addStringOption((option) =>
      option
        .setName("json")
        .setDescription("JSON del template a migrar (opcional)")
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName("from_files")
        .setDescription("Migrar desde archivos JSON en /src/templates (opcional)")
        .setRequired(false)
    ),

  async execute(interaction) {
    try {
      // Verificar acceso premium - SIN BYPASS PARA EL DUEÑO
      const { isServerPremium } = require('../../services/serverService');
      const isPremium = await isServerPremium(interaction.guild.id);

      if (!isPremium) {
        const premiumEmbed = new EmbedBuilder()
          .setTitle("💎 Servidor Premium Requerido")
          .setDescription("Este comando solo está disponible en servidores premium. ¡Contacta a un administrador para activar premium en este servidor!")
          .setColor("#FFD700")
          .setThumbnail("https://i.imgur.com/AfFp7pu.png")
          .setTimestamp()
          .setFooter({
            text: "Avalon Raid Helper - Premium",
            iconURL: "https://i.imgur.com/AfFp7pu.png",
          })
          .setAuthor({
            name: "Chuny Dev",
            iconURL: "https://i.imgur.com/AfFp7pu.png",
            url: "https://www.twitch.tv/chuny_dev",
          })
          .addFields(
            {
              name: "🔗 Mis Redes Sociales",
              value: "¡Sígueme para estar al día con las últimas actualizaciones!",
              inline: false
            },
            {
              name: "🎮 Twitch",
              value: "[@chuny_dev](https://www.twitch.tv/chuny_dev)",
              inline: true
            },
            {
              name: "💬 Discord",
              value: "[Mi Canal](https://discord.gg/6fFHsmewSn)",
              inline: true
            },
            {
              name: "👤 Contacto Directo",
              value: "<@464241835930419210>",
              inline: true
            },
            {
              name: "💡 ¿Cómo obtener Premium?",
              value: "Contacta directamente a <@464241835930419210> o únete a mi [servidor de Discord](https://discord.gg/6fFHsmewSn) para más información.",
              inline: false
            }
          );

        return await interaction.reply({ embeds: [premiumEmbed], ephemeral: true });
      }

      const guildId = interaction.guild.id;
      const jsonInput = interaction.options.getString("json");
      const fromFiles = interaction.options.getBoolean("from_files");

      // Asegurar que el servidor existe en la base de datos
      await getOrCreateServer(guildId, interaction.guild.name);

      let migratedTemplates = [];
      let embed;

      if (jsonInput) {
        // Migrar desde JSON proporcionado
        try {
          const templateData = JSON.parse(jsonInput);

          // Verificar si el template ya existe
          const existingTemplate = await getTemplateByName(templateData.title, guildId);
          if (existingTemplate) {
            const errorEmbed = createErrorEmbed(
              "Template Duplicado",
              `Ya existe un template con el título "${templateData.title}".`,
              [{
                name: "Solución",
                value: "Usa un título diferente o elimina el template existente primero.",
                inline: false
              }]
            );
            return await safeReply(interaction, {
              embeds: [errorEmbed],
              ephemeral: true,
            });
          }

          // Añadir URL vacía si no existe
          if (!templateData.url) {
            templateData.url = "";
          }

          // Añadir URL a cada arma si no existe
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

          const template = await createTemplate(templateData, guildId);
          migratedTemplates = [template];

          embed = createSuccessEmbed(
            "Template Migrado Exitosamente",
            `Template "${templateData.title}" migrado exitosamente desde JSON.`,
            [{
              name: "Template Migrado",
              value: templateData.title,
              inline: false
            }]
          );

        } catch (parseError) {
          const errorEmbed = createErrorEmbed(
            "Error Parseando JSON",
            `Error al parsear el JSON proporcionado: ${parseError.message}`,
            [{
              name: "Solución",
              value: "Verifica que el JSON tenga la estructura correcta y vuelve a intentar.",
              inline: false
            }]
          );
          return await safeReply(interaction, {
            embeds: [errorEmbed],
            ephemeral: true,
          });
        }
      } else if (fromFiles) {
        // Migrar desde archivos
        migratedTemplates = await migrateTemplatesFromFiles(guildId);

        embed = createSuccessEmbed(
          "Templates Migrados desde Archivos",
          `Se migraron ${migratedTemplates.length} templates desde archivos JSON.`,
          [{
            name: "Templates Migrados",
            value: migratedTemplates.length > 0
              ? migratedTemplates.map(t => t.title).join(", ")
              : "No se encontraron templates para migrar",
            inline: false
          }]
        );
      } else {
        const errorEmbed = createErrorEmbed(
          "Parámetros Faltantes",
          "Debes proporcionar JSON o usar la opción from_files.",
          [{
            name: "Opciones Disponibles",
            value: "• Usa `json:` para migrar un template específico\n• Usa `from_files: true` para migrar desde archivos JSON",
            inline: false
          }]
        );
        return await safeReply(interaction, {
          embeds: [errorEmbed],
          ephemeral: true,
        });
      }

      await safeReply(interaction, {
        embeds: [embed],
        ephemeral: true,
      });
    } catch (error) {
      console.error('[ERROR] Error en comando migrate:', error);
      const errorEmbed = createErrorEmbed(
        "Error del Sistema",
        "Hubo un error ejecutando el comando de migración.",
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
