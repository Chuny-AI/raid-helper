const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getWeaponCategories } = require("../../services/weaponService");
const { createInfoEmbed, createErrorEmbed, safeReply } = require("../../utils/errorEmbeds");

/**
 * Comando para mostrar todas las categorías de armas
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName("show_all_categories")
    .setDescription("Lista todas las categorías de armas"),

  async execute(interaction) {
    try {
      // JERARQUÍA DE VALIDACIONES:
      // 1. Verificar estado premium del servidor
      // 2. Proceder con la ejecución del comando

      const guildId = interaction.guild.id;

      // Ejecutar el comando
      const categories = await getWeaponCategories();

      let embed;
      if (categories.length === 0) {
        embed = createInfoEmbed(
          "Categorías de Armas",
          "No hay categorías de armas disponibles.",
          [{
            name: "Solución",
            value: "Usa el CLI para cargar las armas y categorías primero.",
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
