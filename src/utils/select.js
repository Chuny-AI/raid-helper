const {
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
} = require("discord.js");

/**
 * Crea una lista de opciones para un menú de selección, basado en los datos de un template.
 * @param {*} template - Template de armas
 * @param {*} templateName - Nombre del template
 * @returns: ActionRowBuilder - Lista de opciones para un menú de selección
 */
const createSelect = (template, templateName, interaction) => {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`weapons-${templateName}-${interaction.id}`)
    .setPlaceholder("¡Selecciona tu opción!");

  const entries = Object.entries(template.weapons);
  for (const [, weapon] of entries) {
    const weaponCategory = weapon.displayName;
    for (const item of weapon.data) {
      const emojiId = item.emoji;
      const weaponName = item.name;
      const weaponId = item.id;
      select.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(`${weaponName} - ${weaponCategory}`)
          .setValue(
            `${templateName}-${emojiId}-${weaponName}-${weaponCategory}-${weaponId}`
          )
          .setEmoji(emojiId)
      );
    }
  }

  return new ActionRowBuilder().addComponents(select);
};

module.exports = {
  createSelect,
};
