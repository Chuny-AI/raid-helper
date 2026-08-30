/**
 * Lógica pura del estado de un raid, por slot. Sin dependencias de discord.js.
 * Opera sobre un "state" que tiene la forma { groups, slots, waitlist, cannotGo,
 * looters, leaderId }. En producción ese "state" es el propio documento de
 * RaidEvent (stateVersion 2); en tests/migración puede ser un objeto plano con
 * la misma forma.
 *
 * Invariante: un usuario ocupa como máximo UN slot en todo el raid. Unirse a un
 * slot nuevo libera automáticamente el anterior (si lo había).
 */

const { getGroupItems, getItemLabel } = require('../utils/templateShape');
const {
  normalizeOverrides,
  isGroupDisabled,
  isWeaponDisabled,
  getGroupCapacity,
  getWeaponUnits,
} = require('../utils/raidWeaponConfig');

/**
 * Construye el estado inicial (todos los slots vacíos) a partir de un template.
 *
 * La configuración de armas que el líder define en `/raid create` (grupos y armas
 * deshabilitados, cupo del grupo y cupos por arma) se aplica AQUÍ y sólo aquí:
 * a partir de este punto la fuente de verdad son los `groups[].maxPlayers` y
 * `slots[].units` congelados en el documento del raid.
 *
 * @param {Object} params
 * @param {Object} params.template - Template de Mongo (con .weapons)
 * @param {Object} [params.weaponOverrides] - Configuración del raid (ver raidWeaponConfig)
 * @param {string[]} [params.disabledWeapons] - Formato legacy: "group~key" / "weapon~key~i".
 *   Sólo se usa si no se pasa `weaponOverrides`.
 * @param {number} [params.lootersMax]
 * @param {string|null} [params.leaderId]
 */
function buildInitialState({
  template,
  weaponOverrides = null,
  disabledWeapons = [],
  lootersMax = 0,
  leaderId = null,
}) {
  const overrides = normalizeOverrides(weaponOverrides ?? disabledWeapons);
  const groups = [];
  const slots = [];
  let order = 0;

  const entries = Object.entries(template?.weapons || {});
  for (const [groupKey, group] of entries) {
    if (isGroupDisabled(overrides, groupKey)) continue;

    const items = getGroupItems(group);
    const enabledItems = items.filter((it) => !isWeaponDisabled(overrides, groupKey, it.index));
    if (enabledItems.length === 0) continue;

    // El cupo del grupo manda sobre la suma de las armas habilitadas
    const maxPlayers = getGroupCapacity(template, overrides, groupKey);
    if (maxPlayers <= 0) continue;

    groups.push({
      groupKey,
      displayName: group.displayName || groupKey,
      emoji: group.defaultEmoji || '',
      maxPlayers,
      order: order++,
    });

    for (const it of enabledItems) {
      slots.push({
        slotId: `${groupKey}~${it.index}`,
        groupKey,
        itemIndex: it.index,
        weaponName: it.name,
        label: getItemLabel(it),
        emoji: it.emoji,
        // Cupo del arma: override del líder si lo hay, si no el del template.
        // Nunca por encima del cupo del grupo, que es el que manda.
        units: Math.min(getWeaponUnits(template, overrides, groupKey, it.index), maxPlayers),
        url: it.url,
        disabled: false,
        users: [],
      });
    }
  }

  return {
    groups,
    slots,
    waitlist: [],
    cannotGo: [],
    looters: { max: lootersMax || 0, users: [] },
    leaderId,
    fullNotificationSent: false,
  };
}

function findSlot(state, slotId) {
  return state.slots.find((s) => s.slotId === slotId) || null;
}

function findUserSlot(state, userId) {
  return state.slots.find((s) => (s.users || []).some((u) => u.userId === userId)) || null;
}

function slotOccupancy(state, slotId) {
  const slot = findSlot(state, slotId);
  if (!slot) return { current: 0, max: 0 };
  return { current: (slot.users || []).length, max: slot.units };
}

function groupOccupancy(state, groupKey) {
  const group = state.groups.find((g) => g.groupKey === groupKey);
  const current = state.slots
    .filter((s) => s.groupKey === groupKey)
    .reduce((acc, s) => acc + (s.users || []).length, 0);
  return { current, max: group ? group.maxPlayers : 0 };
}

/**
 * Slots que se pueden ofrecer para unirse ahora mismo: no deshabilitados,
 * con hueco en el slot Y con hueco en el grupo al que pertenecen.
 */
function availableSlots(state) {
  return state.slots.filter((slot) => {
    if (slot.disabled) return false;
    const { current: sc, max: sm } = slotOccupancy(state, slot.slotId);
    if (sc >= sm) return false;
    const group = state.groups.find((g) => g.groupKey === slot.groupKey);
    if (group) {
      const { current: gc } = groupOccupancy(state, slot.groupKey);
      if (gc >= group.maxPlayers) return false;
    }
    return true;
  });
}

/** Quita al usuario de slots, waitlist y cannotGo. No toca looters. */
function clearMembership(state, userId) {
  const freedSlotIds = [];
  for (const slot of state.slots) {
    const idx = (slot.users || []).findIndex((u) => u.userId === userId);
    if (idx !== -1) {
      slot.users.splice(idx, 1);
      freedSlotIds.push(slot.slotId);
    }
  }
  state.waitlist = state.waitlist.filter((w) => w.userId !== userId);
  state.cannotGo = state.cannotGo.filter((c) => c.userId !== userId);
  return { freedSlotIds };
}

/**
 * Intenta unir a un usuario a un slot. Valida cupo del arma y, si el usuario
 * no viene ya del mismo grupo, cupo del grupo. Si pasa, libera cualquier
 * posición anterior del usuario (slot/waitlist/cannotGo) y lo asigna.
 * @returns {{ok:boolean, reason?:string, freedSlotIds?:string[]}}
 */
function joinSlot(state, slotId, user) {
  const slot = findSlot(state, slotId);
  if (!slot) return { ok: false, reason: 'not_found' };
  if (slot.disabled) return { ok: false, reason: 'disabled' };

  const alreadyHere = (slot.users || []).some((u) => u.userId === user.userId);
  if (alreadyHere) return { ok: false, reason: 'already_here' };

  const currentSlot = findUserSlot(state, user.userId);
  const sameGroup = !!currentSlot && currentSlot.groupKey === slot.groupKey;

  const { current: slotCurrent, max: slotMax } = slotOccupancy(state, slotId);
  if (slotCurrent >= slotMax) return { ok: false, reason: 'slot_full' };

  const group = state.groups.find((g) => g.groupKey === slot.groupKey);
  if (!sameGroup && group) {
    const { current: groupCurrent } = groupOccupancy(state, slot.groupKey);
    if (groupCurrent >= group.maxPlayers) return { ok: false, reason: 'group_full' };
  }

  const { freedSlotIds } = clearMembership(state, user.userId);
  slot.users.push({ userId: user.userId, username: user.username, joinedAt: new Date() });
  return { ok: true, freedSlotIds };
}

function leaveAll(state, userId) {
  return clearMembership(state, userId);
}

function setCannotGo(state, user) {
  const already = state.cannotGo.some((c) => c.userId === user.userId);
  if (already) return { ok: false, reason: 'already' };
  const { freedSlotIds } = clearMembership(state, user.userId);
  state.cannotGo.push({ userId: user.userId, username: user.username, at: new Date() });
  return { ok: true, freedSlotIds };
}

function removeCannotGo(state, userId) {
  const before = state.cannotGo.length;
  state.cannotGo = state.cannotGo.filter((c) => c.userId !== userId);
  return { ok: state.cannotGo.length !== before };
}

function toggleCannotGo(state, user) {
  const already = state.cannotGo.some((c) => c.userId === user.userId);
  if (already) return { ...removeCannotGo(state, user.userId), toggled: 'removed' };
  return { ...setCannotGo(state, user), toggled: 'added' };
}

function addToWaitlist(state, user, slotIds = []) {
  const { freedSlotIds } = clearMembership(state, user.userId);
  state.waitlist.push({
    userId: user.userId,
    username: user.username,
    slotIds: slotIds || [],
    createdAt: new Date(),
  });
  return { ok: true, freedSlotIds };
}

function removeFromWaitlist(state, userId) {
  const before = state.waitlist.length;
  state.waitlist = state.waitlist.filter((w) => w.userId !== userId);
  return { ok: state.waitlist.length !== before };
}

function isRaidFull(state) {
  const hasSlots = state.slots.some((s) => !s.disabled);
  if (!hasSlots) return false;
  return availableSlots(state).length === 0;
}

function joinLooter(state, user) {
  if (!state.looters || !state.looters.max) return { ok: false, reason: 'no_looters' };
  if (!isRaidFull(state)) return { ok: false, reason: 'raid_not_full' };
  const already = state.looters.users.some((u) => u.userId === user.userId);
  if (already) return { ok: false, reason: 'already' };
  if (state.looters.users.length >= state.looters.max) return { ok: false, reason: 'looters_full' };
  state.looters.users.push({ userId: user.userId, username: user.username, at: new Date() });
  return { ok: true };
}

function leaveLooter(state, userId) {
  const idx = state.looters.users.findIndex((u) => u.userId === userId);
  if (idx === -1) return { ok: false };
  state.looters.users.splice(idx, 1);
  return { ok: true };
}

/** Saca al usuario de todo (slot, waitlist, cannotGo, looter). Para /raid kick. */
function kickUser(state, userId) {
  const { freedSlotIds } = clearMembership(state, userId);
  const wasLooter = !!state.looters?.users?.some((u) => u.userId === userId);
  if (wasLooter) leaveLooter(state, userId);
  return { wasInSlot: freedSlotIds.length > 0, freedSlotIds, wasLooter };
}

/**
 * Promueve candidatos de la waitlist a los slots recién liberados, en orden
 * de llegada (createdAt). slotIds vacío en la entrada de waitlist = comodín.
 * @returns {Array<{userId:string, slotId:string, weaponLabel:string}>}
 */
function promoteFromWaitlist(state, freedSlotIds) {
  const promoted = [];
  const sortedWaitlist = () => [...state.waitlist].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  for (const slotId of freedSlotIds || []) {
    const slot = findSlot(state, slotId);
    if (!slot || slot.disabled) continue;

    const { current, max } = slotOccupancy(state, slotId);
    if (current >= max) continue;

    const group = state.groups.find((g) => g.groupKey === slot.groupKey);
    if (group) {
      const { current: groupCurrent } = groupOccupancy(state, slot.groupKey);
      if (groupCurrent >= group.maxPlayers) continue;
    }

    const candidate = sortedWaitlist().find(
      (w) => !w.slotIds || w.slotIds.length === 0 || w.slotIds.includes(slotId)
    );
    if (!candidate) continue;

    state.waitlist = state.waitlist.filter((w) => w.userId !== candidate.userId);
    slot.users.push({ userId: candidate.userId, username: candidate.username, joinedAt: new Date() });
    promoted.push({ userId: candidate.userId, slotId, weaponLabel: slot.label || slot.weaponName });
  }

  return promoted;
}

function countActiveParticipants(state) {
  return state.slots.reduce((acc, s) => acc + (s.users || []).length, 0);
}

/**
 * Quiénes formaron parte del raid: los que ocuparon plaza más los looters, sin
 * duplicados y en el mismo orden en que salen en el embed (orden de grupo, luego
 * índice de arma, luego orden de llegada).
 *
 * Es la lista sobre la que se decide la asistencia: la waitlist y `cannotGo`
 * quedan fuera a propósito, porque esa gente nunca llegó a tener plaza.
 *
 * @returns {Array<{userId:string, username:string, slotId:string|null,
 *   groupKey:string|null, label:string, emoji:string, isLooter:boolean}>}
 */
function raidRoster(state) {
  const roster = [];
  const index = new Map();

  const order = new Map((state.groups || []).map((g) => [g.groupKey, g.order]));
  const slots = [...(state.slots || [])].sort(
    (a, b) =>
      (order.get(a.groupKey) ?? 0) - (order.get(b.groupKey) ?? 0) || a.itemIndex - b.itemIndex
  );

  for (const slot of slots) {
    for (const u of slot.users || []) {
      if (index.has(u.userId)) continue;
      const entry = {
        userId: u.userId,
        username: u.username || '',
        slotId: slot.slotId,
        groupKey: slot.groupKey,
        label: slot.label || slot.weaponName || '',
        emoji: slot.emoji || '',
        isLooter: false,
      };
      index.set(u.userId, entry);
      roster.push(entry);
    }
  }

  // Un looter puede además tener plaza (joinLooter no libera el slot): en ese
  // caso no se duplica, solo se marca.
  for (const u of state.looters?.users || []) {
    const existing = index.get(u.userId);
    if (existing) {
      existing.isLooter = true;
      continue;
    }
    const entry = {
      userId: u.userId,
      username: u.username || '',
      slotId: null,
      groupKey: null,
      label: 'Looter',
      emoji: '',
      isLooter: true,
    };
    index.set(u.userId, entry);
    roster.push(entry);
  }

  return roster;
}

/** Ids marcados como ausentes. @returns {Set<string>} */
function getAbsentIds(state) {
  return new Set((state.attendance?.absent || []).map((a) => a.userId));
}

/**
 * Informe de asistencia. Todo el que participó y no está marcado como ausente
 * cuenta como asistente, así que un raid recién cerrado empieza con todos
 * presentes sin que nadie tenga que tocar nada.
 * @returns {{attended:Array, absent:Array}} entradas de `raidRoster`
 */
function attendanceReport(state) {
  const roster = raidRoster(state);
  const absentIds = getAbsentIds(state);
  return {
    attended: roster.filter((r) => !absentIds.has(r.userId)),
    absent: roster.filter((r) => absentIds.has(r.userId)),
  };
}

/**
 * Aplica la selección de ausentes de UNA página del selector.
 *
 * La página es la unidad de verdad: los ausentes quedan como
 * `(ausentes actuales - página) + (seleccionados de la página)`. Así deseleccionar
 * a alguien lo devuelve a "asistió" y no hace falta guardar estado intermedio en
 * memoria: la BD es el único sitio donde vive la selección, y el panel se puede
 * reabrir o el bot reiniciarse sin perder nada.
 *
 * Se ignoran los ids que no participaron en el raid.
 *
 * @param {Object} state documento del raid
 * @param {{pageUserIds:string[], selectedUserIds:string[], actorId?:string|null}} params
 * @returns {{attended:number, absent:number}}
 */
function applyAbsenceSelection(state, { pageUserIds = [], selectedUserIds = [], actorId = null }) {
  const roster = raidRoster(state);
  const byId = new Map(roster.map((r) => [r.userId, r]));
  const position = new Map(roster.map((r, i) => [r.userId, i]));

  const page = new Set(pageUserIds.filter((id) => byId.has(id)));
  const chosen = new Set(selectedUserIds.filter((id) => page.has(id)));

  // Se conserva la marca previa (con su fecha) de quien ya estaba ausente.
  const previous = new Map((state.attendance?.absent || []).map((a) => [a.userId, a]));
  const untouched = [...previous.values()].filter((a) => !page.has(a.userId) && byId.has(a.userId));
  const fromPage = [...chosen].map(
    (id) => previous.get(id) || { userId: id, username: byId.get(id).username, at: new Date() }
  );

  const absent = [...untouched, ...fromPage].sort(
    (a, b) => (position.get(a.userId) ?? 0) - (position.get(b.userId) ?? 0)
  );

  if (!state.attendance) state.attendance = { absent: [] };
  state.attendance.absent = absent;
  state.attendance.updatedBy = actorId;
  state.attendance.updatedAt = new Date();
  // `attendance` es un objeto anidado: sin esto mongoose puede no ver el cambio.
  if (typeof state.markModified === 'function') state.markModified('attendance');

  return { attended: roster.length - absent.length, absent: absent.length };
}

function participantMentions(state) {
  const ids = new Set();
  for (const slot of state.slots) for (const u of slot.users || []) ids.add(u.userId);
  return Array.from(ids).map((id) => `<@${id}>`);
}

/** líder del raid o Administrator. Misma regla para el botón y los comandos. */
function canManageRaid(raid, member) {
  if (!raid || !member) return false;
  if (raid.leaderId && member.id === raid.leaderId) return true;
  return member.permissions?.has?.('Administrator') === true;
}

module.exports = {
  buildInitialState,
  findSlot,
  findUserSlot,
  slotOccupancy,
  groupOccupancy,
  availableSlots,
  joinSlot,
  leaveAll,
  setCannotGo,
  removeCannotGo,
  toggleCannotGo,
  addToWaitlist,
  removeFromWaitlist,
  isRaidFull,
  joinLooter,
  leaveLooter,
  kickUser,
  promoteFromWaitlist,
  countActiveParticipants,
  participantMentions,
  canManageRaid,
  raidRoster,
  getAbsentIds,
  attendanceReport,
  applyAbsenceSelection,
};
