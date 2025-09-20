const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getWeaponCategories } = require("../../services/weaponService");
const { checkPremiumAccessWithOwnerBypass } = require("../../middleware/roleCheck");
const { createErrorEmbed, createInfoEmbed, safeReply } = require("../../utils/errorEmbeds");

/**
 * Comando para mostrar todas las categorías de armas
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName("show_all_categories")
    .setDescription("Lista todas las categorías de armas"),

  async execute(interaction) {
    try {
      // Verificar acceso premium con bypass para el propietario
      const hasAccess = await checkPremiumAccessWithOwnerBypass(interaction);
      if (!hasAccess) {
        return;
      }

      try {
        const categories = await getWeaponCategories();
        
        let embed;
        if (categories.length === 0) {
          embed = createInfoEmbed(
            "Categorías de Armas",
            "No hay categorías de armas disponibles.",
            [{
              name: "Solución",
              value: "Ejecuta `/upload_weapons` primero para cargar las armas y categorías.",
              inline: false
            }]
          );
        } else {
          const categoryList = categories.map(cat => 
            `• ${cat.displayName} (${cat.key})`
          ).join('\n');
          
          embed = createInfoEmbed(
            "Categorías de Armas",
            `**Categorías disponibles:**\n\n${categoryList}`,
            [{
              name: "Total de Categorías",
              value: categories.length.toString(),
              inline: true
            }]
          );
        }

        await safeReply(interaction, { embeds: [embed], ephemeral: true });
      } catch (error) {
        const errorEmbed = createErrorEmbed(
          "Error Obteniendo Categorías",
          `Ocurrió un error al obtener las categorías: ${error.message}`,
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
    } catch (error) {
      console.error('[ERROR] Error en comando show_all_categories:', error);
      const errorEmbed = createErrorEmbed(
        "Error del Sistema",
        "Hubo un error ejecutando el comando de categorías.",
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
