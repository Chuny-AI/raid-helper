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
  for (const [groupKey, weapon] of entries) {
    const weaponCategory = weapon.displayName;

    if (!weapon.data || !Array.isArray(weapon.data)) {
      console.error('Error: weapon.data no es un array:', weapon);
      continue;
    }

    for (let itemGroupIndex = 0; itemGroupIndex < weapon.data.length; itemGroupIndex++) {
      const item = weapon.data[itemGroupIndex];
      const emojiId = item.emojiId || item.emoji; // Usar emojiId si existe, sino emoji como fallback
      const weaponName = item.name || weaponCategory; // Usar displayName si name está vacío
      // Encode group key + per-group item index for accurate weapon lookup (no ID dependency)
      const uniqueValue = `${groupKey}~${itemGroupIndex}`;
      
      // Solo añadir emoji si existe y es válido
      const optionBuilder = new StringSelectMenuOptionBuilder()
        .setLabel(`${weaponName} - ${weaponCategory}`)
        .setValue(uniqueValue);
        
      if (emojiId) {
        optionBuilder.setEmoji(emojiId);
      }
      
      select.addOptions(optionBuilder);
    }
  }

  return new ActionRowBuilder().addComponents(select);
};

module.exports = {
  createSelect,
};
