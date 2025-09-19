const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { migrateTemplatesFromFiles, createTemplate, getTemplateByName } = require("../../services/templateService");
const { getOrCreateServer } = require("../../services/serverService");
const { checkPremium } = require("../../middleware/premiumCheck");

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
      // Verificar permisos de administrador
      if (!interaction.member.permissions.has('Administrator')) {
        return interaction.reply({
          content: "❌ Solo los administradores pueden usar este comando.",
          ephemeral: true,
        });
      }

      /**
       * Verificar estado premium del servidor
       */
      const hasPremium = await checkPremium(interaction);
      if (!hasPremium) {
        return;
      }

      const guildId = interaction.guild.id;
      const jsonInput = interaction.options.getString("json");
      const fromFiles = interaction.options.getBoolean("from_files");

      // Asegurar que el servidor existe en la base de datos
      await getOrCreateServer(guildId, interaction.guild.name);

      let migratedTemplates = [];
      let embed = new EmbedBuilder()
        .setTitle("🔄 Migración de Templates")
        .setColor("#00FF00")
        .setTimestamp();

      if (jsonInput) {
        // Migrar desde JSON proporcionado
        try {
          const templateData = JSON.parse(jsonInput);
          
          // Verificar si el template ya existe
          const existingTemplate = await getTemplateByName(templateData.title, guildId);
          if (existingTemplate) {
            return interaction.reply({
              content: `❌ Ya existe un template con el título "${templateData.title}".`,
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

          embed.setDescription(`✅ Template "${templateData.title}" migrado exitosamente desde JSON.`)
            .addFields({
              name: "Template Migrado",
              value: templateData.title,
              inline: false
            });

        } catch (parseError) {
          return interaction.reply({
            content: `❌ Error al parsear JSON: ${parseError.message}`,
            ephemeral: true,
          });
        }
      } else if (fromFiles) {
        // Migrar desde archivos
        migratedTemplates = await migrateTemplatesFromFiles(guildId);
        
        embed.setDescription(`Se migraron ${migratedTemplates.length} templates desde archivos JSON.`)
          .addFields({
            name: "Templates Migrados",
            value: migratedTemplates.length > 0 
              ? migratedTemplates.map(t => t.title).join(", ")
              : "No se encontraron templates para migrar",
            inline: false
          });
      } else {
        return interaction.reply({
          content: "❌ Debes proporcionar JSON o usar la opción from_files.",
          ephemeral: true,
        });
      }

      await interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });
    } catch (error) {
      console.error('[ERROR] Error en comando migrate:', error);
      await interaction.reply({
        content: `Error en migración: ${error.message}`,
        ephemeral: true,
      });
    }
  },
};
