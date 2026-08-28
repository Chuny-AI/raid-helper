/**
 * Configuración de armas por raid (overrides del líder al crear el raid).
 *
 * Un template define grupos de armas; cada grupo tiene un `max_players` y una lista de
 * armas, cada una con sus `units` (cupos). Al crear un raid, el líder puede ajustar esa
 * configuración SIN modificar el template:
 *
 *   - Deshabilitar un grupo completo.
 *   - Cambiar el cupo máximo del grupo.
 *   - Deshabilitar un arma concreta del grupo.
 *   - Cambiar el cupo de un arma concreta del grupo.
 *
 * Estructura de overrides (persistible en Mongo como Mixed):
 * {
 *   groups: {
 *     "group_1": {
 *       disabled: false,
 *       maxPlayers: 6 | null,          // null = usar el max_players del template
 *       weapons: {
 *         "0": { disabled: false, units: 3 | null }  // null = usar units del template
 *       }
 *     }
 *   }
 * }
 *
 * Reglas de coherencia:
 *   - El cupo del grupo SIEMPRE manda sobre el de las armas: la capacidad efectiva de
 *     un grupo es min(maxPlayers, suma de cupos de armas habilitadas), y ningún arma
 *     puede admitir más jugadores que esa capacidad.
 *   - Un grupo sin armas habilitadas (o con capacidad 0) no se publica en el raid.
 *   - Las armas repetidas (mismo nombre dentro de un grupo) son entradas independientes,
 *     identificadas por su índice. Cada una se ajusta o deshabilita por separado y se
 *     materializa como un slot propio del raid.
 *
 * Estos overrides se aplican UNA vez, al construir el estado inicial del raid
 * (`raidState.buildInitialState`). A partir de ahí la fuente de verdad son los
 * `groups[].maxPlayers` y `slots[].units` congelados en el documento del raid.
 */

const { getGroupItems, getItemLabel } = require('./templateShape');

/** @returns {{groups: Object}} Overrides vacíos. */
const emptyOverrides = () => ({ groups: {} });

/** Convierte un valor a entero positivo, o null si no es válido. */
const toPositiveInt = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? Math.trunc(value) : parseInt(String(value).trim(), 10);
  if (isNaN(parsed) || parsed <= 0) return null;
  return parsed;
};

/**
 * Obtiene (creando si hace falta) la entrada de overrides de un grupo.
 * @param {{groups: Object}} overrides
 * @param {string} groupKey
 */
const ensureGroup = (overrides, groupKey) => {
  if (!overrides.groups[groupKey]) {
    overrides.groups[groupKey] = { disabled: false, maxPlayers: null, weapons: {} };
  }
  const group = overrides.groups[groupKey];
  if (!group.weapons || typeof group.weapons !== 'object') group.weapons = {};
  return group;
};

/**
 * Obtiene (creando si hace falta) la entrada de overrides de un arma.
 * @param {{groups: Object}} overrides
 * @param {string} groupKey
 * @param {number|string} index
 */
const ensureWeapon = (overrides, groupKey, index) => {
  const group = ensureGroup(overrides, groupKey);
  const key = String(index);
  if (!group.weapons[key]) {
    group.weapons[key] = { disabled: false, units: null };
  }
  return group.weapons[key];
};

/**
 * Convierte la lista legacy de valores deshabilitados
 * (["group~group_1", "weapon~group_1~0"]) al formato de overrides.
 * @param {string[]} list
 * @returns {{groups: Object}}
 */
const fromDisabledWeapons = (list) => {
  const overrides = emptyOverrides();
  if (!Array.isArray(list)) return overrides;

  for (const raw of list) {
    if (typeof raw !== 'string') continue;
    const parts = raw.split('~');
    if (parts[0] === 'group' && parts[1]) {
      ensureGroup(overrides, parts[1]).disabled = true;
    } else if (parts[0] === 'weapon' && parts[1] && parts[2] !== undefined) {
      ensureWeapon(overrides, parts[1], parts[2]).disabled = true;
    }
  }
  return overrides;
};

/**
 * Normaliza cualquier entrada (overrides serializados, documento Mongoose, lista legacy
 * de armas deshabilitadas o null) a la estructura canónica de overrides.
 * @param {Object|string[]|null} raw
 * @returns {{groups: Object}}
 */
const normalizeOverrides = (raw) => {
  if (!raw) return emptyOverrides();
  if (Array.isArray(raw)) return fromDisabledWeapons(raw);

  // Los subdocumentos Mixed de Mongoose pueden llegar como objetos con prototipo propio
  const source = typeof raw.toObject === 'function' ? raw.toObject() : raw;
  const rawGroups = source && typeof source.groups === 'object' && source.groups ? source.groups : null;
  if (!rawGroups) return emptyOverrides();

  const overrides = emptyOverrides();
  for (const [groupKey, rawGroup] of Object.entries(rawGroups)) {
    if (!rawGroup || typeof rawGroup !== 'object') continue;

    const group = ensureGroup(overrides, groupKey);
    group.disabled = !!rawGroup.disabled;
    group.maxPlayers = toPositiveInt(rawGroup.maxPlayers);

    const rawWeapons = rawGroup.weapons && typeof rawGroup.weapons === 'object' ? rawGroup.weapons : {};
    for (const [index, rawWeapon] of Object.entries(rawWeapons)) {
      if (!rawWeapon || typeof rawWeapon !== 'object') continue;
      const weapon = ensureWeapon(overrides, groupKey, index);
      weapon.disabled = !!rawWeapon.disabled;
      weapon.units = toPositiveInt(rawWeapon.units);
    }
  }
  return overrides;
};

/** Elimina todos los overrides de un grupo (vuelve a los valores del template). */
const resetGroup = (overrides, groupKey) => {
  delete overrides.groups[groupKey];
};

/**
 * Devuelve la lista legacy de valores deshabilitados, para el campo `disabledWeapons`
 * de RaidEvent (se conserva como vista derivada y para raids antiguos).
 * @param {{groups: Object}} overrides
 * @returns {string[]}
 */
const toDisabledWeapons = (overrides) => {
  const result = [];
  const groups = overrides?.groups || {};
  for (const [groupKey, group] of Object.entries(groups)) {
    if (!group) continue;
    if (group.disabled) result.push(`group~${groupKey}`);
    for (const [index, weapon] of Object.entries(group.weapons || {})) {
      if (weapon?.disabled) result.push(`weapon~${groupKey}~${index}`);
    }
  }
  return result;
};

/** @returns {boolean} true si el grupo fue deshabilitado explícitamente. */
const isGroupDisabled = (overrides, groupKey) => !!overrides?.groups?.[groupKey]?.disabled;

/** @returns {boolean} true si el arma fue deshabilitada explícitamente. */
const isWeaponDisabled = (overrides, groupKey, index) =>
  !!overrides?.groups?.[groupKey]?.weapons?.[String(index)]?.disabled;

/**
 * Todas las armas del grupo (habilitadas o no), con el índice estable que usan los
 * slotId (`groupKey~index`). Delega en templateShape para soportar los formatos
 * `data`, `categories` y `weapons` de un grupo.
 * @returns {Array<{index:number, name:string, label:string, units:number, emoji:string, url:string}>}
 */
const getGroupItemsFor = (template, groupKey) => getGroupItems(template?.weapons?.[groupKey]);

/** Nombre visible de un arma (usa `label` si el template lo define). */
const getWeaponLabel = (item) => getItemLabel(item) || 'Arma';

/**
 * Cupos configurados para un arma concreta (override del líder o valor del template).
 * @returns {number}
 */
const getWeaponUnits = (template, overrides, groupKey, index) => {
  const override = toPositiveInt(overrides?.groups?.[groupKey]?.weapons?.[String(index)]?.units);
  if (override !== null) return override;
  const item = getGroupItemsFor(template, groupKey).find((it) => it.index === Number(index));
  return toPositiveInt(item?.units) ?? 1;
};

/**
 * Cupo máximo del grupo (override del líder o `max_players` del template).
 * @returns {number|null} null si el template no define límite (se usa la suma de armas).
 */
const getGroupMaxPlayers = (template, overrides, groupKey) => {
  const override = toPositiveInt(overrides?.groups?.[groupKey]?.maxPlayers);
  if (override !== null) return override;
  return toPositiveInt(template?.weapons?.[groupKey]?.max_players);
};

/**
 * Armas habilitadas de un grupo, conservando el índice original del template
 * y con los cupos ya resueltos (override o template).
 * @returns {Array<{index:number, item:Object, name:string, units:number}>}
 */
const getEnabledItems = (template, overrides, groupKey) => {
  const enabled = [];
  for (const item of getGroupItemsFor(template, groupKey)) {
    if (isWeaponDisabled(overrides, groupKey, item.index)) continue;
    enabled.push({
      index: item.index,
      item,
      name: getWeaponLabel(item),
      units: getWeaponUnits(template, overrides, groupKey, item.index),
    });
  }
  return enabled;
};

/**
 * Capacidad efectiva del grupo: el cupo del grupo manda sobre la suma de las armas.
 * @returns {number}
 */
const getGroupCapacity = (template, overrides, groupKey) => {
  if (isGroupDisabled(overrides, groupKey)) return 0;
  const enabledSum = getEnabledItems(template, overrides, groupKey)
    .reduce((acc, entry) => acc + entry.units, 0);
  const maxPlayers = getGroupMaxPlayers(template, overrides, groupKey);
  return maxPlayers === null ? enabledSum : Math.min(maxPlayers, enabledSum);
};

/**
 * Un grupo se publica en el raid sólo si no está deshabilitado y tiene capacidad > 0.
 * @returns {boolean}
 */
const isGroupVisible = (template, overrides, groupKey) =>
  getGroupCapacity(template, overrides, groupKey) > 0;

/**
 * Límite efectivo de un arma: sus cupos, nunca por encima de la capacidad del grupo.
 * @returns {number}
 */
const getWeaponLimit = (template, overrides, groupKey, index) => {
  if (isWeaponDisabled(overrides, groupKey, index)) return 0;
  return Math.min(
    getWeaponUnits(template, overrides, groupKey, index),
    getGroupCapacity(template, overrides, groupKey)
  );
};

/**
 * Resumen legible de los cambios aplicados sobre el template.
 * @returns {string[]} Una línea por ajuste.
 */
const describeOverrides = (template, overrides) => {
  const lines = [];
  for (const [groupKey, group] of Object.entries(overrides?.groups || {})) {
    const templateGroup = template?.weapons?.[groupKey];
    if (!templateGroup) continue;
    const groupName = templateGroup.displayName || groupKey;
    const items = getGroupItemsFor(template, groupKey);

    if (group.disabled) {
      lines.push(`🚫 Grupo **${groupName}** deshabilitado`);
      continue;
    }
    if (group.maxPlayers !== null && group.maxPlayers !== undefined) {
      lines.push(`✏️ **${groupName}**: cupo del grupo → **${group.maxPlayers}**`);
    }
    for (const [index, weapon] of Object.entries(group.weapons || {})) {
      const item = items.find((it) => it.index === Number(index));
      if (!item) continue;
      const name = getWeaponLabel(item);
      if (weapon.disabled) {
        lines.push(`🚫 **${groupName}** › ${name} deshabilitada`);
      } else if (weapon.units !== null && weapon.units !== undefined) {
        lines.push(`✏️ **${groupName}** › ${name}: cupo → **${weapon.units}**`);
      }
    }
  }
  return lines;
};

/**
 * Capacidad total del raid con la configuración aplicada.
 * @returns {number}
 */
const getTotalCapacity = (template, overrides) =>
  Object.keys(template?.weapons || {})
    .reduce((acc, groupKey) => acc + getGroupCapacity(template, overrides, groupKey), 0);

module.exports = {
  emptyOverrides,
  normalizeOverrides,
  fromDisabledWeapons,
  toDisabledWeapons,
  ensureGroup,
  ensureWeapon,
  resetGroup,
  isGroupDisabled,
  isWeaponDisabled,
  getGroupItemsFor,
  getWeaponLabel,
  getWeaponUnits,
  getGroupMaxPlayers,
  getEnabledItems,
  getGroupCapacity,
  isGroupVisible,
  getWeaponLimit,
  describeOverrides,
  getTotalCapacity,
  toPositiveInt,
};
