const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getAllWeapons, getWeaponCategories } = require("../../services/weaponService");
const { checkPremiumAccessWithOwnerBypass } = require("../../middleware/roleCheck");
const { createErrorEmbed, createInfoEmbed, safeReply } = require("../../utils/errorEmbeds");

/**
 * Comando para mostrar todas las armas en la base de datos
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName("show_all_weapons")
    .setDescription("Lista todas las armas en la base de datos"),

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

      await interaction.deferReply({ ephemeral: true });

      try {
        const weapons = await getAllWeapons();
        const categories = await getWeaponCategories();

        const embed = createInfoEmbed(
          "Armas en la Base de Datos",
          "Lista completa de todas las armas disponibles en el sistema",
          [
            {
              name: "Total de Armas",
              value: weapons.length.toString(),
              inline: true
            },
            {
              name: "Categorías",
              value: categories.length.toString(),
              inline: true
            }
          ]
        );

        // Agrupar armas por categoría
        const weaponsByCategory = {};
        weapons.forEach(weapon => {
          if (!weaponsByCategory[weapon.category]) {
            weaponsByCategory[weapon.category] = [];
          }
          weaponsByCategory[weapon.category].push(weapon);
        });

        // Agregar campos para cada categoría
        for (const category of categories) {
          const categoryWeapons = weaponsByCategory[category.key] || [];
          const weaponList = categoryWeapons
            .slice(0, 10)
            .map(w => `• ${w.name}`)
            .join('\n');

          const moreText = categoryWeapons.length > 10 ? `\n... y ${categoryWeapons.length - 10} más` : '';

          embed.addFields({
            name: `${category.displayName} (${categoryWeapons.length})`,
            value: weaponList + moreText,
            inline: true
          });
        }

        await safeReply(interaction, { embeds: [embed] });
      } catch (error) {
        const errorEmbed = createErrorEmbed(
          "Error Obteniendo Armas",
          `Ocurrió un error al obtener la lista de armas: ${error.message}`,
          [{
            name: "Solución",
            value: "Intenta ejecutar el comando de nuevo. Si el problema persiste, contacta al soporte.",
            inline: false
          }]
        );

        await safeReply(interaction, {
          embeds: [errorEmbed],
        });
      }
    } catch (error) {
      console.error('[ERROR] Error en comando show_all_weapons:', error);
      const errorEmbed = createErrorEmbed(
        "Error del Sistema",
        "Hubo un error ejecutando el comando de armas.",
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
