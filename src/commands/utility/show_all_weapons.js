const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getAllWeapons, getWeaponCategories } = require("../../services/weaponService");
const { createInfoEmbed, createErrorEmbed, safeReply } = require("../../utils/errorEmbeds");

/**
 * Comando para mostrar todas las armas en la base de datos
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName("show_all_weapons")
    .setDescription("Lista todas las armas en la base de datos"),

  async execute(interaction) {
    try {
      // JERARQUÍA DE VALIDACIONES:
      // 1. Verificar estado premium del servidor
      // 2. Proceder con la ejecución del comando

      const guildId = interaction.guild.id;

      // Ejecutar el comando
      await interaction.deferReply({ ephemeral: true });

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

      const weaponsByCategory = {};
      weapons.forEach(weapon => {
        if (!weaponsByCategory[weapon.category]) {
          weaponsByCategory[weapon.category] = [];
        }
        weaponsByCategory[weapon.category].push(weapon);
      });

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

      if (interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else {
        await safeReply(interaction, { embeds: [errorEmbed], ephemeral: true });
      }
    }
  },
};
