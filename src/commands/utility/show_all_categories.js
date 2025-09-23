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
      // Verificar acceso premium - SIN BYPASS PARA EL DUEÑO
      const { isServerPremium } = require('../../services/serverService');
      const isPremium = await isServerPremium(interaction.guild.id);

      if (!isPremium) {
        const { EmbedBuilder } = require('discord.js');
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
