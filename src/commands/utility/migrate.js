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
    .setDescription("Migra un template desde un archivo JSON adjunto (solo administradores)")
    .addAttachmentOption(option =>
      option
        .setName('file')
        .setDescription('Archivo .json con la definición del template')
        .setRequired(true)
    ),

  async execute(interaction) {
    try {
      const guildId = interaction.guild.id;
      const attachment = interaction.options.getAttachment('file');

      await getOrCreateServer(guildId, interaction.guild.name);

      try {
        // Validar extensión y tamaño
        if (!attachment.name.match(/\.json$/i)) {
          const errorEmbed = createErrorEmbed(
            'Archivo Inválido',
            'Debes adjuntar un archivo con extensión .json',
            [{ name: '📁 Archivo recibido', value: `Nombre: \`${attachment.name}\``, inline: false }]
          );
          return await safeReply(interaction, { embeds: [errorEmbed], ephemeral: true });
        }

        if (attachment.size > 2 * 1024 * 1024) { // 2MB límite razonable
          const errorEmbed = createErrorEmbed(
            'Archivo Muy Grande',
            'El archivo excede el tamaño máximo permitido (2MB).',
            [{ name: '📏 Tamaño', value: `${Math.round(attachment.size / 1024)} KB`, inline: true }]
          );
          return await safeReply(interaction, { embeds: [errorEmbed], ephemeral: true });
        }

        // Descargar contenido
        const response = await fetch(attachment.url);
        if (!response.ok) {
          throw new Error(`No se pudo descargar el archivo (${response.status})`);
        }
        const jsonText = await response.text();

        // Parsear JSON
        const templateData = JSON.parse(jsonText);

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

        // Defaults de URL
        if (!templateData.url) templateData.url = "";
        if (templateData.weapons) {
          Object.keys(templateData.weapons).forEach(weaponKey => {
            const w = templateData.weapons[weaponKey];
            if (w && Array.isArray(w.data)) {
              w.data.forEach(weapon => {
                if (!weapon.url) weapon.url = "";
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
          'Error Parseando JSON',
          `Error al procesar el archivo: ${parseError.message}`,
          [
            { name: '💡 Solución', value: 'Asegúrate de que el archivo contenga JSON válido.', inline: false },
            { name: '� Archivo', value: attachment ? `\`${attachment.name}\`` : 'N/D', inline: true }
          ]
        );
        await safeReply(interaction, { embeds: [errorEmbed], ephemeral: true });
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
