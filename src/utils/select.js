const {
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

/**
 * Crea una lista de opciones para un menú de selección, basado en los datos de un template.
 * @param {*} template - Template de armas
 * @param {*} templateName - Nombre del template
 * @param {*} interaction - Interacción de Discord
 * @param {string[]} disabledWeaponValues - Valores de armas/grupos deshabilitados
 * @returns: ActionRowBuilder - Lista de opciones para un menú de selección
 */
const createSelect = (template, templateName, interaction, disabledWeaponValues = []) => {
  const options = [];
  const entries = Object.entries(template.weapons);

  for (const [groupKey, weapon] of entries) {
    if (disabledWeaponValues.includes(`group~${groupKey}`)) continue;

    const weaponCategory = weapon.displayName;

    if (!weapon.data || !Array.isArray(weapon.data)) {
      console.error('Error: weapon.data no es un array:', weapon);
      continue;
    }

    for (let itemGroupIndex = 0; itemGroupIndex < weapon.data.length; itemGroupIndex++) {
      if (options.length >= 25) break;
      if (disabledWeaponValues.includes(`weapon~${groupKey}~${itemGroupIndex}`)) continue;

      const item = weapon.data[itemGroupIndex];
      const emojiId = item.emojiId || item.emoji;
      const weaponName = item.name || weaponCategory;
      const uniqueValue = `${groupKey}~${itemGroupIndex}`;

      const optionBuilder = new StringSelectMenuOptionBuilder()
        .setLabel(`${weaponName} - ${weaponCategory}`)
        .setValue(uniqueValue);

      if (emojiId) {
        optionBuilder.setEmoji(emojiId);
      }

      options.push(optionBuilder);
    }
    if (options.length >= 25) break;
  }

  // Si no hay opciones disponibles, agregar un placeholder
  if (options.length === 0) {
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel('Sin armas disponibles')
        .setValue('none')
    );
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(`weapons-${templateName}-${interaction.id}`)
    .setPlaceholder("¡Selecciona tu opción!")
    .addOptions(options);

  return new ActionRowBuilder().addComponents(select);
};

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

      const groupEmoji = groupData.defaultEmoji;
      if (groupEmoji && /^\d+$/.test(groupEmoji)) {
        groupOptBuilder.setEmoji(groupEmoji);
      }
      options.push(groupOptBuilder);
      if (options.length >= 25) break;
    }

    // Añadir armas individuales
    for (let i = 0; i < items.length; i++) {
      if (options.length >= 25) break;
      const item = items[i];
      const itemName = (item.name || groupData.displayName).slice(0, 100);
      const emojiId = item.emojiId || item.emoji;

      const optBuilder = new StringSelectMenuOptionBuilder()
        .setLabel(itemName)
        .setValue(`weapon~${groupKey}~${i}`)
        .setDescription(`Grupo: ${groupData.displayName}`.slice(0, 100));

      if (emojiId && /^\d+$/.test(String(emojiId))) {
        optBuilder.setEmoji(String(emojiId));
      }
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

/**
 * Crea el menú de selección de armas para la lista de espera.
 * Solo muestra armas habilitadas en el raid.
 * @param {Object} template - Template de armas
 * @param {string[]} disabledWeaponValues - Armas/grupos deshabilitados en este raid
 * @param {string} templateName - Nombre del template
 * @param {string} embedId - ID de la interacción original del raid (clave en embedsMap)
 * @returns {ActionRowBuilder|null}
 */
const createWaitlistWeaponsSelect = (template, disabledWeaponValues, templateName, embedId) => {
  const options = [];

  for (const [groupKey, groupData] of Object.entries(template.weapons)) {
    if (options.length >= 25) break;
    if (disabledWeaponValues.includes(`group~${groupKey}`)) continue;

    const items = groupData.data || [];
    for (let i = 0; i < items.length; i++) {
      if (options.length >= 25) break;
      if (disabledWeaponValues.includes(`weapon~${groupKey}~${i}`)) continue;

      const item = items[i];
      const itemName = (item.name || groupData.displayName).slice(0, 100);
      const emojiId = item.emojiId || item.emoji;

      const optBuilder = new StringSelectMenuOptionBuilder()
        .setLabel(itemName)
        .setValue(`${groupKey}~${i}`)
        .setDescription(`Grupo: ${groupData.displayName}`.slice(0, 100));

      if (emojiId && /^\d+$/.test(String(emojiId))) {
        optBuilder.setEmoji(String(emojiId));
      }
      options.push(optBuilder);
    }
  }

  if (options.length === 0) return null;

  const select = new StringSelectMenuBuilder()
    .setCustomId(`raid_waitlist_weapons-${templateName}-${embedId}`)
    .setPlaceholder('Selecciona las armas para las que quieres esperar')
    .setMinValues(1)
    .setMaxValues(options.length)
    .addOptions(options);

  return new ActionRowBuilder().addComponents(select);
};

module.exports = {
  createSelect,
  createDisableWeaponsConfig,
  createWaitlistWeaponsSelect,
};
