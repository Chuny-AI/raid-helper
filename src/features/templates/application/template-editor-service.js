const sessions = require('./template-edit-session-store');
const domain = require('../domain/template-editor');
const templateService = require('../../../services/templateService');
const weaponService = require('../../../services/weaponService');
const { getOrCreateServer } = require('../../../services/serverService');

const optionalHttpUrl = (value, field) => {
  const text = String(value || '').trim();
  if (!text) return '';
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error(`${field} debe ser una URL válida.`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${field} debe utilizar HTTP o HTTPS.`);
  }
  return parsed.toString().slice(0, 500);
};

const positiveInteger = (value, field) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 999) {
    throw new Error(`${field} debe ser un número entre 1 y 999.`);
  }
  return parsed;
};

const requiredName = (value, field) => {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${field} es obligatorio.`);
  return text.slice(0, 100);
};

const requireOwned = (sessionId, userId, guildId) => {
  const valid = sessions.getValidSession(sessionId, userId, guildId);
  if (!valid) throw new Error('La sesión de edición expiró o no te pertenece.');
  return valid;
};

const mutate = (sessionId, userId, guildId, operation) => {
  const valid = sessions.mutateOwnedSession(sessionId, userId, guildId, (session) => {
    const result = operation(session.data, session);
    session.hasChanges = true;
    return result;
  });
  if (!valid) throw new Error('La sesión de edición expiró o no te pertenece.');
  return valid;
};

const start = async ({ templateName, userId, guildId }) => {
  const template = await templateService.getTemplateByName(templateName, guildId);
  if (!template) throw new Error(`No se encontró la plantilla "${templateName}".`);
  return sessions.createEditSession({ userId, guildId, template });
};

const startCreate = async ({ userId, guildId, title, description, image }) => {
  const cleanTitle = String(title || '').trim();
  const cleanDescription = String(description || '').trim();
  if (!cleanTitle) throw new Error('El título es obligatorio.');
  if (!cleanDescription) throw new Error('La descripción es obligatoria.');
  if (await templateService.getTemplateByName(cleanTitle, guildId)) {
    throw new Error(`Ya existe una plantilla llamada "${cleanTitle}".`);
  }
  return sessions.createDraftSession({
    userId,
    guildId,
    data: {
      title: cleanTitle.slice(0, 100),
      description: cleanDescription.slice(0, 4000),
      image: optionalHttpUrl(image, 'La imagen'),
      color: '#0099ff',
      url: '',
      roles: [],
      notifyAll: false,
      reminder: '5m',
      weapons: {},
    },
  });
};

const get = ({ sessionId, userId, guildId }) => requireOwned(sessionId, userId, guildId);

const updateBasic = ({ sessionId, userId, guildId, title, description, image }) => mutate(
  sessionId,
  userId,
  guildId,
  (data) => {
    const cleanTitle = String(title || '').trim();
    const cleanDescription = String(description || '').trim();
    if (!cleanTitle) throw new Error('El título es obligatorio.');
    if (!cleanDescription) throw new Error('La descripción es obligatoria.');
    data.title = cleanTitle.slice(0, 100);
    data.description = cleanDescription.slice(0, 4000);
    data.image = optionalHttpUrl(image, 'La imagen');
  },
);

const updateSettings = ({ sessionId, userId, guildId, color, url, reminder, notifyAll }) => mutate(
  sessionId,
  userId,
  guildId,
  (data) => {
    const cleanColor = String(color || '').trim();
    if (cleanColor && !/^#[0-9a-f]{6}$/i.test(cleanColor)) {
      throw new Error('El color debe tener formato hexadecimal, por ejemplo #3498DB.');
    }
    const cleanReminder = String(reminder || '5m').trim().toLowerCase();
    if (!/^[1-9]\d{0,3}[mhd]$/.test(cleanReminder)) {
      throw new Error('El recordatorio debe usar un formato como 5m, 2h o 1d.');
    }
    data.color = cleanColor || '#0099ff';
    data.url = optionalHttpUrl(url, 'El enlace');
    data.reminder = cleanReminder;
    data.notifyAll = ['sí', 'si', 's', 'true', '1', 'yes', 'y'].includes(
      String(notifyAll || '').trim().toLowerCase(),
    );
  },
);

const updateRoles = ({ sessionId, userId, guildId, roleIds, guild }) => mutate(
  sessionId,
  userId,
  guildId,
  (data) => {
    data.roles = [...new Set(roleIds || [])]
      .filter((roleId) => {
        const role = guild.roles.cache.get(roleId);
        return role && role.id !== guild.id && !role.managed;
      })
      .slice(0, 25);
  },
);

const addGroup = ({ sessionId, userId, guildId, displayName, defaultEmoji, maxPlayers }) => mutate(
  sessionId,
  userId,
  guildId,
  (data) => domain.addGroup(data, {
    displayName: requiredName(displayName, 'El nombre del grupo'),
    defaultEmoji,
    max_players: positiveInteger(maxPlayers, 'El cupo máximo'),
    data: [],
  }),
);

const updateGroup = ({ sessionId, userId, guildId, groupIndex, displayName, defaultEmoji, maxPlayers }) => mutate(
  sessionId,
  userId,
  guildId,
  (data) => {
    if (!domain.updateGroup(data, groupIndex, {
      displayName: requiredName(displayName, 'El nombre del grupo'),
      defaultEmoji,
      max_players: positiveInteger(maxPlayers, 'El cupo máximo'),
    })) throw new Error('El grupo seleccionado ya no existe.');
  },
);

const deleteGroup = ({ sessionId, userId, guildId, groupIndex }) => mutate(
  sessionId,
  userId,
  guildId,
  (data) => {
    const removed = domain.removeGroup(data, groupIndex);
    if (!removed) throw new Error('El grupo seleccionado ya no existe.');
    return removed;
  },
);

const catalogCategories = () => weaponService.getWeaponCategories();
const catalogWeapons = (category) => weaponService.getWeaponsByCategory(category);

const addCatalogWeapons = async ({ sessionId, userId, guildId, groupIndex, emojiIds }) => {
  const uniqueIds = [...new Set(emojiIds || [])].slice(0, 25);
  const found = await weaponService.getWeaponsByEmojiIds(uniqueIds);
  const byId = new Map(found.map((weapon) => [String(weapon.emojiId), weapon]));
  const ordered = uniqueIds.map((id) => byId.get(String(id))).filter(Boolean);
  if (ordered.length === 0) throw new Error('No se encontraron armas activas para añadir.');
  return mutate(sessionId, userId, guildId, (data) => {
    const added = domain.addWeaponsToGroup(data, groupIndex, ordered);
    if (!added) throw new Error('El grupo seleccionado ya no existe.');
    return added;
  });
};

const updateWeapon = ({ sessionId, userId, guildId, groupIndex, weaponIndex, name, units, emoji, url }) => mutate(
  sessionId,
  userId,
  guildId,
  (data) => {
    if (!domain.updateWeapon(data, groupIndex, weaponIndex, {
      name: requiredName(name, 'El nombre del arma'),
      units: positiveInteger(units, 'La cantidad de plazas'),
      emoji,
      url: optionalHttpUrl(url, 'El enlace del arma'),
    })) throw new Error('El arma seleccionada ya no existe.');
  },
);

const removeWeapons = ({ sessionId, userId, guildId, groupIndex, weaponIndices }) => mutate(
  sessionId,
  userId,
  guildId,
  (data) => {
    const removed = domain.removeWeapons(data, groupIndex, weaponIndices);
    if (!removed) throw new Error('No se seleccionaron armas válidas para eliminar.');
    return removed;
  },
);

const validateBeforeSave = (data) => {
  if (!String(data.title || '').trim()) throw new Error('La plantilla necesita un título.');
  if (!String(data.description || '').trim()) throw new Error('La plantilla necesita una descripción.');
  const groups = domain.getGroupEntries(data.weapons);
  if (groups.length === 0) throw new Error('La plantilla necesita al menos un grupo de armas.');
  if (groups.some(([, group]) => domain.getWeaponCollection(group).length === 0)) {
    throw new Error('Todos los grupos deben contener al menos un arma antes de guardar.');
  }
};

const save = async ({ sessionId, userId, guildId, guildName }) => {
  const valid = requireOwned(sessionId, userId, guildId);
  validateBeforeSave(valid.session.data);
  const payload = domain.cleanForMongoDB(valid.session.data);
  let template;
  let created = false;
  if (valid.session.mode === 'create') {
    await getOrCreateServer(guildId, guildName || guildId);
    if (await templateService.getTemplateByName(payload.title, guildId)) {
      throw new Error(`Ya existe una plantilla llamada "${payload.title}".`);
    }
    template = await templateService.createTemplate(payload, guildId);
    created = true;
  } else {
    const conflicting = await templateService.getTemplateByName(payload.title, guildId);
    if (conflicting && String(conflicting._id) !== String(valid.session.templateId)) {
      throw new Error(`Ya existe una plantilla llamada "${payload.title}".`);
    }
    template = await templateService.updateTemplate(
      valid.session.templateId,
      payload,
      guildId,
      valid.session.originalData?.updatedAt || null,
    );
  }
  sessions.deleteOwnedSession(valid.sessionId, userId, guildId);
  return { template, created };
};

const cancel = ({ sessionId, userId, guildId }) =>
  sessions.deleteOwnedSession(sessionId, userId, guildId);

module.exports = {
  addCatalogWeapons,
  addGroup,
  cancel,
  catalogCategories,
  catalogWeapons,
  deleteGroup,
  get,
  removeWeapons,
  save,
  start,
  startCreate,
  updateBasic,
  updateGroup,
  updateRoles,
  updateSettings,
  updateWeapon,
  validateBeforeSave,
};
