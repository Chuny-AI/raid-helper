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

/**
 * Conserva temporalmente los datos del modal mientras el usuario elige un
 * icono del catálogo. El grupo no se modifica hasta confirmar un arma válida.
 */
const stageGroupChange = ({ sessionId, userId, guildId, groupIndex, displayName, maxPlayers }) => {
  const normalizedIndex = groupIndex === null || groupIndex === undefined
    ? null
    : Number(groupIndex);
  const valid = sessions.mutateOwnedSession(sessionId, userId, guildId, (session) => {
    if (normalizedIndex !== null && !domain.getWeaponGroupFromSession(session, normalizedIndex)) {
      throw new Error('El grupo seleccionado ya no existe.');
    }
    session.pendingGroupChange = {
      mode: normalizedIndex === null ? 'create' : 'edit',
      groupIndex: normalizedIndex,
      displayName: requiredName(displayName, 'El nombre del grupo'),
      maxPlayers: positiveInteger(maxPlayers, 'El cupo máximo'),
    };
    return session.pendingGroupChange;
  });
  if (!valid) throw new Error('La sesión de edición expiró o no te pertenece.');
  return valid;
};

/** Confirma el borrador usando exclusivamente un emoji del JSON activo. */
const applyStagedGroupEmoji = async ({ sessionId, userId, guildId, mode, groupIndex, emojiId }) => {
  const weapon = await weaponService.getWeaponByEmojiId(String(emojiId || ''));
  if (!weapon) {
    throw new Error('Ese emoji no pertenece al catálogo de armas del entorno actual.');
  }

  const expectedIndex = mode === 'create' ? null : Number(groupIndex);
  return mutate(sessionId, userId, guildId, (data, session) => {
    const pending = session.pendingGroupChange;
    if (!pending || pending.mode !== mode || pending.groupIndex !== expectedIndex) {
      throw new Error('La selección del icono expiró. Abre de nuevo la edición del grupo.');
    }

    let resultIndex = pending.groupIndex;
    if (pending.mode === 'create') {
      resultIndex = domain.addGroup(data, {
        displayName: pending.displayName,
        defaultEmoji: weapon.emojiId,
        max_players: pending.maxPlayers,
        data: [],
      });
    } else if (!domain.updateGroup(data, pending.groupIndex, {
      displayName: pending.displayName,
      defaultEmoji: weapon.emojiId,
      max_players: pending.maxPlayers,
    })) {
      throw new Error('El grupo seleccionado ya no existe.');
    }

    delete session.pendingGroupChange;
    return resultIndex;
  });
};

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

/**
 * Conserva el arma elegida hasta que el usuario confirme su configuracion en
 * el modal. No se modifica el grupo todavia: cerrar el modal no debe dejar un
 * arma añadida a medias.
 */
const stageCatalogWeapon = async ({ sessionId, userId, guildId, groupIndex, emojiId }) => {
  const weapon = await weaponService.getWeaponByEmojiId(String(emojiId || ''));
  if (!weapon) throw new Error('No se encontró el arma seleccionada en el catálogo actual.');

  const normalizedIndex = Number(groupIndex);
  const valid = sessions.mutateOwnedSession(sessionId, userId, guildId, (session) => {
    if (!domain.getWeaponGroupFromSession(session, normalizedIndex)) {
      throw new Error('El grupo seleccionado ya no existe.');
    }
    session.pendingCatalogWeapon = {
      groupIndex: normalizedIndex,
      weapon: {
        name: weapon.name,
        emojiId: weapon.emojiId,
        image: weapon.image || '',
        url: weapon.url || '',
        units: weapon.units || 1,
      },
    };
    return session.pendingCatalogWeapon;
  });
  if (!valid) throw new Error('La sesión de edición expiró o no te pertenece.');
  return valid;
};

/** Añade el arma únicamente después de confirmar su configuración inicial. */
const confirmCatalogWeapon = ({
  sessionId,
  userId,
  guildId,
  groupIndex,
  units,
  url,
  label,
}) => mutate(sessionId, userId, guildId, (data, session) => {
  const normalizedIndex = Number(groupIndex);
  const pending = session.pendingCatalogWeapon;
  if (!pending || pending.groupIndex !== normalizedIndex) {
    throw new Error('La selección del arma expiró. Selecciónala de nuevo desde el catálogo.');
  }

  const group = domain.getWeaponGroupFromSession(session, normalizedIndex);
  if (!group) throw new Error('El grupo seleccionado ya no existe.');

  const cleanUrl = optionalHttpUrl(url, 'El enlace del arma');
  const cleanLabel = String(label || '').trim().slice(0, 100);
  const existingCount = domain.getWeaponCollection(group)
    .filter((weapon) => weapon.name === pending.weapon.name)
    .length;
  const finalLabel = cleanLabel
    || (existingCount > 0 ? `${pending.weapon.name} (${existingCount + 1})` : '');
  const added = domain.addWeaponsToGroup(data, normalizedIndex, [{
    ...pending.weapon,
    units: positiveInteger(units, 'La cantidad de plazas'),
    url: cleanUrl,
    label: finalLabel,
    private: Boolean(cleanUrl),
  }]);
  if (!added) throw new Error('No se pudo añadir el arma al grupo seleccionado.');

  delete session.pendingCatalogWeapon;
  return added;
});

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
  addGroup,
  applyStagedGroupEmoji,
  cancel,
  catalogCategories,
  catalogWeapons,
  confirmCatalogWeapon,
  deleteGroup,
  get,
  removeWeapons,
  save,
  stageCatalogWeapon,
  stageGroupChange,
  start,
  startCreate,
  updateBasic,
  updateGroup,
  updateRoles,
  updateSettings,
  updateWeapon,
  validateBeforeSave,
};
