const { EmbedBuilder } = require("discord.js");

const embedsMap = {};

/**
 * Crear un objeto EmbedBuilder
 */
const createEmbed = ({
  title,
  delayTime,
  template,
  color,
  image,
  description,
  user,
}) => {
  const embed = new EmbedBuilder(); // Crear una nueva instancia aquí

  setTile(embed, title, template);
  setLeader(embed, user);
  setColor(embed, color, template);
  setDescription(embed, description, template);
  showTime(embed, delayTime);
  setFooter(embed);
  setAuthor(embed);
  setTitleWeapons(embed);
  setCategoriesAndUnitsFromTemplate(embed, template);
  setImage(embed, image, template);
  pingRoles(embed, template);
  return embed;
};

/**
 * Setear el título del embed
 */
const setTile = (embed, title, template) => {
  embed.setTitle(title ?? template.title);
};

/**
 * Setear el color del embed
 */
const setColor = (embed, color, template) => {
  embed.setColor(color ?? template.color);
};

/**
 * Setea el footer del embed
 */
const setFooter = (embed) => {
  embed
    .setFooter({
      text: "Creado con ❤️ por Chuny",
      iconURL: "https://i.imgur.com/AfFp7pu.png",
    })
    .setTimestamp();
};

/**
 * Setea la descripción según el template
 */
const setDescription = (embed, description, template) => {
  embed.setDescription(description ?? template.description);
};

/**
 * Setea el autor del embed
 */
const setAuthor = (embed) => {
  embed.setAuthor({
    name: "Chuny",
    iconURL: "https://i.imgur.com/AfFp7pu.png",
    url: "https://www.linkedin.com/in/edwinjpa/",
  });
};

/**
 * Crea los campos del embed a partir de un template
 * @param {*} embed - EmbedBuilder
 * @param {*} template - Template
 */
const setCategoriesAndUnitsFromTemplate = (embed, template) => {
  const fieldsArray = [];
  const entries = Object.entries(template.weapons);
  for (const [key, data] of entries) {
    const emojiId = data.defaultEmoji;
    const displayName = data.displayName;
    const initialValue = 0;
    
    // Verificar que data.data existe y es un array
    if (!data.data || !Array.isArray(data.data)) {
      console.error('Error: data.data no es un array:', data);
      continue;
    }
    
    const units = data.data.reduce(
      (acc, current) => acc + current.units,
      initialValue
    );
    if (displayName && emojiId) {
      const name = `<:${emojiId}:${emojiId}> ${displayName} (0/${units}):`;
      fieldsArray.push({
        name: name,
        value: " ",
        inline: true,
      });
    }
  }

  // Solo añadir campos si hay alguno
  if (fieldsArray.length > 0) {
    embed.addFields(fieldsArray);
  }
};

/**
 * Setea la imagen del embed
 */
const setImage = (embed, url, template) => {
  embed.setImage(url ?? template?.image);
};

/**
 * Pinear a los roles en el embed
 * @param {*} embed
 * @param {*} template
 */
const pingRoles = (embed, template) => {
  const roles = template.roles;
  if (roles && roles.length > 0) {
    const rolesString = roles.map((roleId) => `<@&${roleId}>`).join(", ");
    embed.addFields({ name: "Roles válidos:", value: rolesString });
  }
};

/**
 * Mostrar la hora de inicio de la actividad en horario UTC
 */
const showTime = (embed, delayTime) => {
  const date = new Date(Date.now() + delayTime);

  const day = date.getUTCDate(); // Día del mes (1-31)
  const hours = String(date.getUTCHours()).padStart(2, "0"); // Horas (00-23)
  const minutes = String(date.getUTCMinutes()).padStart(2, "0"); // Minutos (00-59)

  const formattedTime = `__Día ${day} - A las ${hours}:${minutes} UTC__`;

  embed.addFields({
    name: `Hora de la actividad:`,
    value: formattedTime,
  });
};

/**
 * Etiqueta dentro del embed al lider de la actividad
 */
const setLeader = (embed, user) => {
  embed.addFields({
    name: "Líder de la actividad:",
    value: `${user}`,
  });
};

/**
 * Muestra información de las armas
 */
const setTitleWeapons = (embed) => {
  embed.addFields({
    name: "Armas a utilizar:",
    value: "Revisa la lista de armas en el mensaje anclado.",
  });
};

module.exports = {
  createEmbed,
  embedsMap,
};
