const {
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { getItemLabel } = require('./templateShape');
const { applyEmoji } = require('./emoji');

/**
 * Crea el menú de selección de armas a deshabilitar al crear un raid.
 * Los usuarios marcan cuáles quieren EXCLUIR del raid.
 * @param {Object} template - Template de armas
 * @param {string} interactionId - ID de la interacción original del slash command
 * @returns {{ selectRow: ActionRowBuilder|null, confirmRow: ActionRowBuilder }} - Filas de componentes
 */
const createDisableWeaponsConfig = (template, interactionId) => {
  const options = [];

  for (const [groupKey, groupData] of Object.entries(template.weapons)) {
    if (options.length >= 25) break;
    const items = groupData.data || [];

    // Si el grupo tiene múltiples armas, añadir la opción de deshabilitar el grupo completo
    if (items.length > 1) {
      const groupOptBuilder = new StringSelectMenuOptionBuilder()
        .setLabel(`[Grupo completo] ${groupData.displayName}`.slice(0, 100))
        .setValue(`group~${groupKey}`)
        .setDescription('Deshabilitar todo este grupo'.slice(0, 100));

      applyEmoji(groupOptBuilder, groupData.defaultEmoji);
      options.push(groupOptBuilder);
      if (options.length >= 25) break;
    }

    // Añadir armas individuales
    for (let i = 0; i < items.length; i++) {
      if (options.length >= 25) break;
      const item = items[i];
      const itemName = (getItemLabel(item) || groupData.displayName).slice(0, 100);
      const emojiId = item.emojiId || item.emoji;

      const optBuilder = new StringSelectMenuOptionBuilder()
        .setLabel(itemName)
        .setValue(`weapon~${groupKey}~${i}`)
        .setDescription(`Grupo: ${groupData.displayName}`.slice(0, 100));

      applyEmoji(optBuilder, emojiId);
      options.push(optBuilder);
    }
  }

  const confirmButton = new ButtonBuilder()
    .setCustomId(`raid_confirm_create-${interactionId}`)
    .setLabel('✅ Confirmar y publicar raid')
    .setStyle(ButtonStyle.Success);

  const confirmRow = new ActionRowBuilder().addComponents(confirmButton);

  if (options.length === 0) {
    return { selectRow: null, confirmRow };
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(`raid_config_weapons-${interactionId}`)
    .setPlaceholder('Selecciona armas a DESHABILITAR (o confirma sin cambios)')
    .setMinValues(0)
    .setMaxValues(options.length)
    .addOptions(options);

  return {
    selectRow: new ActionRowBuilder().addComponents(select),
    confirmRow,
  };
};

module.exports = {
  createDisableWeaponsConfig,
};