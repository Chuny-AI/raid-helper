/**
 * Reglas de dominio del editor de plantillas.
 *
 * Este módulo no conoce Discord, MongoDB ni sesiones. Trabaja únicamente con
 * objetos y arrays, de modo que sus reglas se puedan probar y reutilizar sin
 * levantar el bot.
 */

const getGroupEntries = (weapons) => {
  if (Array.isArray(weapons)) return weapons.map((group, index) => [String(index), group]);
  if (weapons && typeof weapons === 'object') return Object.entries(weapons);
  return [];
};

const asPositiveInteger = (value, fallback = 1) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const groupName = (group, fallback = 'Nuevo grupo') =>
  String(group?.displayName || group?.name || fallback).trim().slice(0, 100) || fallback;

const normalizeEmoji = (value, fallback = '⚔️') => {
  const text = String(value || '').trim();
  if (/^\d{17,20}$/.test(text) || /^<a?:\w{2,32}:\d{17,20}>$/.test(text)) return text;
  if (/\p{Extended_Pictographic}/u.test(text) && text.length <= 16) return text;
  return fallback;
};

const normalizeWeapon = (weapon = {}) => {
  const normalized = {
    name: String(weapon.name || 'Arma').trim().slice(0, 100) || 'Arma',
    units: asPositiveInteger(weapon.units ?? weapon.quantity, 1),
    image: String(weapon.image || '').trim().slice(0, 500),
    emoji: normalizeEmoji(weapon.emoji || weapon.emojiId),
    url: String(weapon.url || weapon.link || '').trim().slice(0, 500),
  };
  if (weapon.label) normalized.label = String(weapon.label).trim().slice(0, 100);
  if (weapon.private !== undefined) normalized.private = Boolean(weapon.private);
  return normalized;
};

const normalizeGroup = (group = {}) => {
  const data = getWeaponCollection(group).map(normalizeWeapon);
  const requestedCapacity = Number.parseInt(group.max_players, 10);
  const capacity = Number.isInteger(requestedCapacity) && requestedCapacity > 0
    ? requestedCapacity
    : data.reduce((total, weapon) => total + weapon.units, 0) || 1;
  return {
    displayName: groupName(group),
    defaultEmoji: normalizeEmoji(group.defaultEmoji || group.emoji),
    max_players: capacity,
    data,
  };
};

const uniqueGroupKey = (weapons, displayName) => {
  const used = new Set(getGroupEntries(weapons).map(([key]) => key));
  const base = String(displayName || 'group')
    .trim().replace(/[.$]/g, '_')
    .slice(0, 40) || 'group';
  let key = base;
  let suffix = 2;
  while (used.has(key)) key = `${base}_${suffix++}`;
  return key;
};

const replaceGroupAt = (templateData, groupIndex, replacement) => {
  const entries = getGroupEntries(templateData?.weapons);
  const index = Number(groupIndex);
  if (!Number.isInteger(index) || index < 0 || index >= entries.length) return false;
  if (Array.isArray(templateData.weapons)) templateData.weapons[index] = replacement;
  else templateData.weapons[entries[index][0]] = replacement;
  return true;
};

const addGroup = (templateData, group) => {
  if (!templateData || typeof templateData !== 'object') return -1;
  const normalized = normalizeGroup(group);
  if (Array.isArray(templateData.weapons)) {
    templateData.weapons.push(normalized);
    return templateData.weapons.length - 1;
  }
  if (!templateData.weapons || typeof templateData.weapons !== 'object') templateData.weapons = {};
  templateData.weapons[uniqueGroupKey(templateData.weapons, normalized.displayName)] = normalized;
  return getGroupEntries(templateData.weapons).length - 1;
};

const updateGroup = (templateData, groupIndex, updates = {}) => {
  const current = getWeaponGroupFromSession({ data: templateData }, groupIndex);
  if (!current) return false;
  const next = normalizeGroup({ ...current, ...updates, data: getWeaponCollection(current) });
  return replaceGroupAt(templateData, groupIndex, next);
};

const removeGroup = (templateData, groupIndex) => {
  const entries = getGroupEntries(templateData?.weapons);
  const index = Number(groupIndex);
  if (!Number.isInteger(index) || index < 0 || index >= entries.length) return null;
  const removed = entries[index][1];
  if (Array.isArray(templateData.weapons)) templateData.weapons.splice(index, 1);
  else delete templateData.weapons[entries[index][0]];
  return removed;
};

const addWeaponsToGroup = (templateData, groupIndex, weapons) => {
  const group = getWeaponGroupFromSession({ data: templateData }, groupIndex);
  if (!group || !Array.isArray(weapons) || weapons.length === 0) return 0;
  const normalized = normalizeGroup(group);
  normalized.data.push(...weapons.map(normalizeWeapon));
  replaceGroupAt(templateData, groupIndex, normalized);
  return weapons.length;
};

const updateWeapon = (templateData, groupIndex, weaponIndex, updates) => {
  const group = getWeaponGroupFromSession({ data: templateData }, groupIndex);
  const weapons = getWeaponCollection(group);
  const index = Number(weaponIndex);
  if (!group || !Number.isInteger(index) || index < 0 || index >= weapons.length) return false;
  const normalized = normalizeGroup(group);
  normalized.data[index] = normalizeWeapon({ ...normalized.data[index], ...updates });
  return replaceGroupAt(templateData, groupIndex, normalized);
};

const removeWeapons = (templateData, groupIndex, weaponIndices) => {
  const group = getWeaponGroupFromSession({ data: templateData }, groupIndex);
  if (!group) return 0;
  const normalized = normalizeGroup(group);
  const indices = [...new Set((weaponIndices || []).map(Number))]
    .filter((index) => Number.isInteger(index) && index >= 0 && index < normalized.data.length)
    .sort((a, b) => b - a);
  for (const index of indices) normalized.data.splice(index, 1);
  if (normalized.data.length > 0) {
    normalized.max_players = Math.min(
      normalized.max_players,
      normalized.data.reduce((total, weapon) => total + weapon.units, 0),
    );
  }
  replaceGroupAt(templateData, groupIndex, normalized);
  return indices.length;
};

const getWeaponGroupFromSession = (session, groupIndex) => {
  const entries = getGroupEntries(session?.data?.weapons);
  return entries[Number(groupIndex)]?.[1] || null;
};

const getWeaponCollection = (weaponGroup) => {
  if (!weaponGroup) return [];
  if (Array.isArray(weaponGroup.data)) return weaponGroup.data;
  if (Array.isArray(weaponGroup.weapons)) return weaponGroup.weapons;
  if (Array.isArray(weaponGroup.categories)) {
    return weaponGroup.categories.flatMap((category) =>
      Array.isArray(category?.weapons) ? category.weapons : []
    );
  }
  return [];
};

const getWeaponFromGroup = (weaponGroup, weaponIndex) => {
  const index = Number(weaponIndex);
  if (!Number.isInteger(index) || index < 0) return null;
  return getWeaponCollection(weaponGroup)[index] || null;
};

const updateWeaponInGroup = (weaponGroup, weaponIndex, updatedData) => {
  const index = Number(weaponIndex);
  if (!weaponGroup || !Number.isInteger(index) || index < 0
    || !updatedData || typeof updatedData !== 'object') return false;

  if (Array.isArray(weaponGroup.data) && weaponGroup.data[index]) {
    weaponGroup.data[index] = { ...weaponGroup.data[index], ...updatedData };
    return true;
  }

  if (Array.isArray(weaponGroup.weapons) && weaponGroup.weapons[index]) {
    weaponGroup.weapons[index] = { ...weaponGroup.weapons[index], ...updatedData };
    return true;
  }

  if (Array.isArray(weaponGroup.categories)) {
    let offset = 0;
    for (const category of weaponGroup.categories) {
      const weapons = Array.isArray(category?.weapons) ? category.weapons : [];
      if (index >= offset && index < offset + weapons.length) {
        const localIndex = index - offset;
        weapons[localIndex] = { ...weapons[localIndex], ...updatedData };
        return true;
      }
      offset += weapons.length;
    }
  }

  return false;
};

const validateWeaponGroup = (session, groupIndex) => {
  const entries = getGroupEntries(session?.data?.weapons);
  const index = Number(groupIndex);
  const groupNames = entries.map(([key, group], currentIndex) =>
    `${currentIndex}: ${group?.displayName || group?.name || key}`
  );

  if (!session?.data?.weapons) {
    return {
      success: false,
      error: 'No hay datos de armas en la sesión.',
      suggestion: 'Reinicia la edición del template con /template edit.',
    };
  }

  if (!Number.isInteger(index) || index < 0 || index >= entries.length) {
    return {
      success: false,
      error: `Grupo de armas no encontrado. Índice ${groupIndex} está fuera de rango (0-${entries.length - 1}).`,
      suggestion: `Grupos disponibles: ${groupNames.join(', ')}`,
    };
  }

  const group = entries[index]?.[1];
  if (!group) {
    return {
      success: false,
      error: 'No se pudo obtener el grupo de armas.',
      suggestion: 'El grupo podría estar corrupto. Reinicia la edición.',
    };
  }

  if (!Array.isArray(group.data) && !Array.isArray(group.weapons) && !Array.isArray(group.categories)) {
    return {
      success: false,
      error: 'El grupo de armas no tiene una estructura válida.',
      suggestion: 'El grupo podría estar corrupto. Contacta al soporte.',
    };
  }

  return {
    success: true,
    group,
    totalGroups: entries.length,
    groupName: group.displayName || group.name || `Grupo ${index}`,
  };
};

const cleanWeapon = normalizeWeapon;

const cleanForMongoDB = (data) => {
  if (!data) return data;
  const cleaned = JSON.parse(JSON.stringify(data));
  delete cleaned._id;
  delete cleaned.__v;

  const groups = {};
  const sourceIsArray = Array.isArray(cleaned.weapons);
  for (const [originalKey, group] of getGroupEntries(cleaned.weapons)) {
    const normalized = normalizeGroup(group);
    const key = uniqueGroupKey(groups, sourceIsArray ? normalized.displayName : (originalKey || normalized.displayName));
    groups[key] = normalized;
  }
  cleaned.weapons = groups;

  return cleaned;
};

module.exports = {
  addGroup,
  addWeaponsToGroup,
  cleanForMongoDB,
  getGroupEntries,
  getWeaponCollection,
  getWeaponFromGroup,
  getWeaponGroupFromSession,
  normalizeGroup,
  normalizeEmoji,
  normalizeWeapon,
  removeGroup,
  removeWeapons,
  replaceGroupAt,
  updateGroup,
  updateWeapon,
  updateWeaponInGroup,
  uniqueGroupKey,
  validateWeaponGroup,
};
