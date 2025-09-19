const { SlashCommandBuilder } = require("discord.js");
const { createEmbed, embedsMap } = require("../../utils/embed");
const { parseTime } = require("../../utils/time");
const { isValidHex } = require("../../utils/regex");
const { createSelect } = require("../../utils/select");
const { getTemplateNames, getTemplateByName } = require("../../services/templateService");
const { getOrCreateServer } = require("../../services/serverService");
const { checkPremium } = require("../../middleware/premiumCheck");

const pingRoles = (template) => {
  const roles = template.roles;
  if (roles && roles.length > 0) {
    return roles.map((roleId) => `<@&${roleId}>`).join(", ");
  }
};

/**
 * Comando para crear raids usando templates del servidor
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName("raid")
    .setDescription(
      "Envía una notificación para una actividad basada en una plantilla previamente creada con /add."
    )
    .addStringOption((option) =>
      option
        .setName("template")
        .setDescription("Selecciona la plantilla para esta actividad")
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      option
        .setName("title")
        .setDescription(
          "Especifica un título personalizado para la actividad (opcional)"
        )
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("description")
        .setDescription(
          "Especifica una descripción personalizada para la actividad (opcional)"
        )
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("time")
        .setDescription(
          'Indica el tiempo restante para la actividad en formato "1h 30m" (opcional)'
        )
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("color")
        .setDescription(
          "Especifica el color del embed en formato hexadecimal (#FFFFFF) (opcional)"
        )
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("image")
        .setDescription(
          "Proporciona una URL para la imagen del embed (opcional)"
        )
        .setRequired(false)
    ),

  async autocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    
    if (focusedOption.name === 'template') {
      try {
        const guildId = interaction.guild.id;
        const templates = await getTemplateNames(guildId);
        
        const filtered = templates
          .filter(template => 
            template.name.toLowerCase().includes(focusedOption.value.toLowerCase())
          )
          .slice(0, 25); // Discord limita a 25 opciones
        
        await interaction.respond(
          filtered.map(template => ({
            name: template.name,
            value: template.name
          }))
        );
      } catch (error) {
        console.error('[ERROR] Error en autocomplete:', error);
        await interaction.respond([]);
      }
    }
  },

  async execute(interaction) {
    try {
      /**
       * Verificar estado premium del servidor
       */
      const hasPremium = await checkPremium(interaction);
      if (!hasPremium) {
        return;
      }

      /**
       * Obtener los parámetros del comando slash
       */
      const templateName = interaction.options.getString("template");
      const title = interaction.options.getString("title");
      const time = interaction.options.getString("time");
      const color = interaction.options.getString("color");
      const image = interaction.options.getString("image");
      const description = interaction.options.getString("description");
      const user = interaction.user;
      const guildId = interaction.guild.id;

      /**
       * Asegurar que el servidor existe en la base de datos
       */
      await getOrCreateServer(guildId, interaction.guild.name);

      /**
       * Obtener la plantilla de la base de datos
       */
      const template = await getTemplateByName(templateName, guildId);
      
      if (!template) {
        return interaction.reply({
          content: `No se encontró la plantilla "${templateName}" en este servidor.`,
          ephemeral: true,
        });
      }

      const delayTime = parseTime(time ?? template.time);

      if (color && !isValidHex(color)) {
        return interaction.reply({
          content:
            "El color proporcionado no es válido. Usa el formato hexadecimal (#FFFFFF).",
          ephemeral: true,
        });
      }

      const row = createSelect(template, templateName, interaction);
      const embed = createEmbed({ title, delayTime, template, color, image, description, user });

      if (!embedsMap[templateName]) {
        embedsMap[templateName] = [];
      }

      embedsMap[templateName].push({ id: interaction.id, embed });

      /**
       * Interactuar con el usuario
       */
      await interaction.reply({
        embeds: [embed],
        components: [row],
        content: `${pingRoles(template)}`,
      });
    } catch (error) {
      console.error('[ERROR] Error en comando raid:', error);
      await interaction.reply({
        content: "Hubo un error ejecutando el comando. Inténtalo de nuevo.",
        ephemeral: true,
      });
    }
  },
};
