/**
 * Normaliza la forma de un "grupo de armas" dentro de `Template.weapons`.
 *
 * Históricamente coexisten dos formatos para el mismo grupo:
 *  - Formato canónico:  { displayName, defaultEmoji, max_players, data: [ {name, units, emoji/emojiId, url, label?} ] }
 *  - Formato legacy:     { displayName, categories: [ { name, weapons: [ {...} ] } ] }
 *
 * Este módulo centraliza la lectura/cálculo que antes estaba duplicado en:
 *  - scripts/migrate-max-players.js
 *  - src/lib/template/template-create-handlers.js (handleFinishGroup)
 *  - src/commands/utility/template.js (saveTemplateChanges)
 *  - src/utils/embed.js (setCategoriesAndUnitsFromTemplate)
 */

/**
 * Aplana el arma cruda del template a un shape uniforme.
 * @param {Object} item
 */
function flattenItem(item) {
  const units = parseInt(item?.units ?? item?.quantity, 10);
  return {
    name: item?.name || '',
    label: (item?.label && String(item.label).trim()) || '',
    units: Number.isFinite(units) && units > 0 ? units : 1,
    emoji: item?.emojiId || item?.emoji || '',
    url: item?.url || item?.link || '',
    image: item?.image || '',
  };
}

/**
 * Devuelve las armas de un grupo como una lista plana con índice estable,
 * sin importar si el grupo está en formato `data` o `categories`.
 * El `index` es el mismo que usan los customId de los selects (`groupKey~index`).
 * @param {Object} group
 * @returns {Array<{index:number, name:string, label:string, units:number, emoji:string, url:string, image:string, raw:Object}>}
 */
function getGroupItems(group) {
  if (!group) return [];

  if (Array.isArray(group.data)) {
    return group.data.map((item, index) => ({ index, raw: item, ...flattenItem(item) }));
  }

  if (Array.isArray(group.categories)) {
    const items = [];
    let index = 0;
    for (const category of group.categories) {
      const weapons = Array.isArray(category.weapons) ? category.weapons : [];
      for (const item of weapons) {
        items.push({ index, raw: item, ...flattenItem(item) });
        index++;
      }
    }
    return items;
  }

  if (Array.isArray(group.weapons)) {
    return group.weapons.map((item, index) => ({ index, raw: item, ...flattenItem(item) }));
  }

  return [];
}

/**
 * Etiqueta visible de una entrada de arma: usa `label` si está definido,
 * si no cae al nombre de catálogo.
 * @param {{name:string,label:string}} item
 */
function getItemLabel(item) {
  return (item?.label && String(item.label).trim()) || item?.name || '';
}

/**
 * Calcula el cupo máximo efectivo de un grupo.
 * Si el grupo define `max_players`, se usa como tope (nunca por encima de la
 * suma de cupos de las armas habilitadas). Si no, el tope es esa suma.
 * @param {Object} group
 * @param {Set<number>|null} disabledIndexes - índices de armas deshabilitadas para este raid
 */
function computeGroupMaxPlayers(group, disabledIndexes = null) {
  const items = getGroupItems(group);
  const enabled = disabledIndexes ? items.filter((it) => !disabledIndexes.has(it.index)) : items;
  const sum = enabled.reduce((acc, it) => acc + (it.units || 1), 0);

  const explicit = parseInt(group?.max_players, 10);
  if (Number.isFinite(explicit) && explicit > 0) {
    return Math.min(explicit, sum);
  }
  return sum;
}

/**
 * Reescribe un grupo (en cualquier formato) al formato canónico `data`.
 * Preserva `label` si estaba presente. No muta el objeto de entrada.
 * @param {Object} group
 */
function normalizeGroupToData(group) {
  if (!group) return group;
  const items = getGroupItems(group);
  const data = items.map((it) => {
    const entry = {
      name: it.name,
      units: it.units,
      emoji: it.emoji,
      url: it.url,
      image: it.image,
    };
    if (it.label) entry.label = it.label;
    return entry;
  });

  const normalized = {
    displayName: group.displayName || group.name || '',
    defaultEmoji: group.defaultEmoji || '⚔️',
    data,
  };
  if (group.max_players !== undefined && group.max_players !== null) {
    normalized.max_players = group.max_players;
  }
  return normalized;
}

module.exports = {
  getGroupItems,
  getItemLabel,
  computeGroupMaxPlayers,
  normalizeGroupToData,
};
