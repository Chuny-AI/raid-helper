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
  let optionIndex = 0; // Para asegurar valores únicos
  for (const [, weapon] of entries) {
    const weaponCategory = weapon.displayName;

    if (!weapon.data || !Array.isArray(weapon.data)) {
      console.error('Error: weapon.data no es un array:', weapon);
      continue;
    }

    for (const item of weapon.data) {
      const emojiId = item.emojiId || item.emoji; // Usar emojiId si existe, sino emoji como fallback
      const weaponName = item.name || weaponCategory; // Usar displayName si name está vacío
      const weaponId = item.id;
      // Create unique value by combining weaponId with category and index to avoid duplicates
      const uniqueValue = `${weaponId}-${weaponCategory.replace(/\s+/g, '_')}-${optionIndex}`;
      
      // Solo añadir emoji si existe y es válido
      const optionBuilder = new StringSelectMenuOptionBuilder()
        .setLabel(`${weaponName} - ${weaponCategory}`)
        .setValue(uniqueValue);
        
      if (emojiId) {
        optionBuilder.setEmoji(emojiId);
      }
      
      select.addOptions(optionBuilder);
      optionIndex++;
    }
  }

  return new ActionRowBuilder().addComponents(select);
};

module.exports = {
  createSelect,
};
