/**
 * Migra un RaidEvent legacy (stateVersion 1, estado como texto de embed) al
 * estado estructurado por slot (stateVersion 2). Se ejecuta una vez por raid
 * activo al arrancar el bot (ver ClientReady en src/utils/events.js).
 *
 * Nunca lanza hacia arriba: si algo no encaja, degrada (descarta líneas que no
 * parsean, crea "slots huérfanos" para armas que ya no existen en el template)
 * y reporta warnings — nunca deja el raid en un estado peor que antes.
 */
const raidState = require('./raidState');
const { getTemplateByName } = require('./templateService');

const WAITLIST_FIELD_NAME = '🕒 Lista de espera';
const CANNOTGO_FIELD_NAME = '🚫 No puedo ir';
const MENTION_RE = /<@!?(\d+)>/;
// "{emoji} {nombre del arma} {@mención}" — formato con el que el código legacy
// escribía cada línea de un grupo (src/utils/events.js:1127, ya eliminado).
const WEAPON_LINE_RE = /^(?:<:[^:]+:\d+>\s*)?(.+?)\s+<@!?\d+>\s*$/;
// "{emoji} {nombre del arma} — {@mención}" — formato de línea de waitlist legacy.
const WAITLIST_LINE_RE = /^(?:<:[^:]+:\d+>\s*)?(.+?)\s+—\s+<@!?\d+>\s*$/;

function isEmptyFieldValue(value) {
  if (!value || typeof value !== 'string') return true;
  // ​ = zero-width space, usado como placeholder de "campo vacío" en el
  // formato legacy (Discord no admite un value realmente vacío).
  const stripped = value.replace(/​/g, '').trim();
  return stripped.length === 0;
}

/**
 * @param {Object} raidDoc - Documento mongoose de RaidEvent (stateVersion 1)
 * @returns {Promise<{ok:boolean, reason?:string, warnings?:string[], discardedLines?:number, orphanCount?:number}>}
 */
async function migrateFromSnapshot(raidDoc) {
  const warnings = [];

  const template = await getTemplateByName(raidDoc.templateName, raidDoc.guildId);
  if (!template) {
    return { ok: false, reason: 'template_not_found' };
  }

  const snapshot = raidDoc.embedSnapshot;
  const fields = snapshot?.fields || [];
  if (fields.length === 0) {
    return { ok: false, reason: 'empty_snapshot' };
  }

  const leaderField = fields.find((f) => f.name === 'Líder de la actividad:');
  const leaderMatch = leaderField?.value?.match(MENTION_RE);
  const leaderId = leaderMatch ? leaderMatch[1] : null;

  const lootersField = fields.find((f) => typeof f.name === 'string' && f.name.startsWith('👑 Looters'));
  const lootersCapMatch = lootersField?.name?.match(/\((\d+)\/(\d+)\)/);
  const lootersMax = lootersCapMatch ? parseInt(lootersCapMatch[2], 10) : 0;

  const initial = raidState.buildInitialState({
    template,
    disabledWeapons: raidDoc.disabledWeapons || [],
    lootersMax,
    leaderId,
  });

  const groupFields = fields.filter(
    (f) => typeof f.name === 'string' && /\(\d+\/\d+\):/.test(f.name) && !f.name.startsWith('👑 Looters')
  );
  const sortedGroups = [...initial.groups].sort((a, b) => a.order - b.order);

  const orphanSlots = [];
  let discardedLines = 0;

  sortedGroups.forEach((group, idx) => {
    const field = groupFields[idx];
    if (!field) {
      warnings.push(`grupo ${group.groupKey} ("${group.displayName}") sin field correspondiente en el snapshot`);
      return;
    }
    if (!field.name.includes(group.displayName)) {
      warnings.push(`grupo ${group.groupKey}: displayName no coincide ("${group.displayName}" vs field "${field.name}")`);
    }
    if (isEmptyFieldValue(field.value)) return;

    const groupSlots = initial.slots
      .filter((s) => s.groupKey === group.groupKey)
      .sort((a, b) => a.itemIndex - b.itemIndex);

    for (const rawLine of field.value.split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;
      const m = line.match(WEAPON_LINE_RE);
      if (!m) {
        discardedLines++;
        continue;
      }
      const weaponName = m[1].trim();
      const userIdMatch = line.match(MENTION_RE);
      if (!userIdMatch) {
        discardedLines++;
        continue;
      }
      const userId = userIdMatch[1];

      const candidate = groupSlots.find((s) => s.weaponName === weaponName && s.users.length < s.units);
      if (candidate) {
        candidate.users.push({ userId, username: null, joinedAt: new Date() });
      } else {
        orphanSlots.push({
          slotId: `orphan~${orphanSlots.length}`,
          groupKey: group.groupKey,
          itemIndex: -1,
          weaponName,
          label: weaponName,
          emoji: '',
          units: 1,
          url: '',
          disabled: true,
          users: [{ userId, username: null, joinedAt: new Date() }],
        });
      }
    }
  });

  const waitlistField = fields.find((f) => f.name === WAITLIST_FIELD_NAME);
  const waitlist = [];
  if (waitlistField && !isEmptyFieldValue(waitlistField.value)) {
    const seen = new Set();
    for (const rawLine of waitlistField.value.split('\n')) {
      const line = rawLine.trim();
      const mention = line.match(MENTION_RE);
      if (!mention) continue;
      const userId = mention[1];
      if (seen.has(userId)) continue;
      seen.add(userId);

      const wm = line.match(WAITLIST_LINE_RE);
      const slotIds = wm
        ? initial.slots.filter((s) => s.weaponName === wm[1].trim()).map((s) => s.slotId)
        : []; // sin match -> comodín (acepta cualquier arma liberada)
      waitlist.push({ userId, username: null, slotIds, createdAt: new Date() });
    }
  }

  const cannotGoField = fields.find((f) => f.name === CANNOTGO_FIELD_NAME);
  const cannotGo = [];
  if (cannotGoField && !isEmptyFieldValue(cannotGoField.value)) {
    for (const rawLine of cannotGoField.value.split('\n')) {
      const mention = rawLine.match(MENTION_RE);
      if (mention) cannotGo.push({ userId: mention[1], username: null, at: new Date() });
    }
  }

  const lootersUsers = [];
  if (lootersField && !isEmptyFieldValue(lootersField.value)) {
    for (const rawLine of lootersField.value.split('\n')) {
      const mention = rawLine.match(MENTION_RE);
      if (mention) lootersUsers.push({ userId: mention[1], username: null, at: new Date() });
    }
  }

  raidDoc.stateVersion = 2;
  raidDoc.leaderId = leaderId;
  raidDoc.groups = initial.groups;
  raidDoc.slots = [...initial.slots, ...orphanSlots];
  raidDoc.waitlist = waitlist;
  raidDoc.cannotGo = cannotGo;
  raidDoc.looters = { max: lootersMax, users: lootersUsers };
  raidDoc.fullNotificationSent = false;

  if (discardedLines > 0) warnings.push(`${discardedLines} línea(s) del snapshot no se pudieron interpretar y se descartaron`);
  if (orphanSlots.length > 0) warnings.push(`${orphanSlots.length} usuario(s) en arma(s) que ya no existen en el template (slots huérfanos, deshabilitados)`);

  return { ok: true, warnings, discardedLines, orphanCount: orphanSlots.length };
}

module.exports = { migrateFromSnapshot };
