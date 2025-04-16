const { SlashCommandBuilder } = require("discord.js");
const { createEmbed, embedsMap } = require("../../utils/embed");
const {
  getAllNameTemplates,
  getDataFromTemplate,
} = require("../../utils/template");
const { parseTime } = require("../../utils/time");
const { isValidHex } = require("../../utils/regex");
const { createSelect } = require("../../utils/select");

const pingRoles = (template) => {
  const roles = template.roles;
  if (roles && roles.length > 0) {
    return roles.map((roleId) => `<@&${roleId}>`).join(", ");
  }
};

/**
 * Se debe exportar un objeto con la estructura data y execute, donde data es un objeto de tipo SlashCommandBuilder y execute es una función que recibe un objeto interaction con la información de la interacción.
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription(
      "Envía una notificación para una actividad basada en una plantilla previamente creada con /add."
    )
    .addStringOption((option) =>
      option
        .setName("template")
        .setDescription("Selecciona la plantilla para esta actividad")
        .setRequired(true)
        .addChoices(getAllNameTemplates())
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

  async execute(interaction) {
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

    /**
     * Obtener la plantilla de la carpeta de plantillas
     */
    const template = getDataFromTemplate(templateName);
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
  },
};
