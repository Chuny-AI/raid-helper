const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getTemplateNames } = require("../../services/templateService");
const { getOrCreateServer } = require("../../services/serverService");

/**
 * Comando para listar los templates disponibles en el servidor
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName("templates")
    .setDescription("Lista todos los templates disponibles en este servidor"),

  async execute(interaction) {
    try {
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
        return interaction.reply({
          content: "No hay templates disponibles en este servidor. Usa `/add` para crear uno.",
          ephemeral: true,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("📋 Templates Disponibles")
        .setDescription("Lista de templates disponibles en este servidor:")
        .setColor("#00FFFF")
        .setTimestamp();

      templates.forEach((template, index) => {
        embed.addFields({
          name: `${index + 1}. ${template.name}`,
          value: `Usa \`/raid template:${template.name}\` para crear una actividad`,
          inline: false
        });
      });

      await interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });
    } catch (error) {
      console.error('[ERROR] Error en comando templates:', error);
      await interaction.reply({
        content: "Hubo un error ejecutando el comando. Inténtalo de nuevo.",
        ephemeral: true,
      });
    }
  },
};
