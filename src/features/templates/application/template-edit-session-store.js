/**
 * Almacén de sesiones del editor de plantillas.
 *
 * Centraliza propiedad, expiración, lectura y mutación. El Map nunca se expone:
 * los controladores deben validar usuario y servidor en cada interacción.
 */

const { randomBytes } = require('node:crypto');

const SESSION_TIMEOUT_MS = 12 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const templateEditSessions = new Map();

const clone = (value) => JSON.parse(JSON.stringify(value));

const createEditSession = ({ userId, guildId, template }, now = Date.now()) => {
  const sessionId = randomBytes(12).toString('hex');
  templateEditSessions.set(sessionId, {
    mode: 'edit',
    userId: String(userId),
    guildId: String(guildId),
    templateId: template._id,
    originalData: clone(template.toObject?.() || template),
    lastActivity: now,
    data: {
      title: template.title,
      description: template.description,
      image: template.image,
      color: template.color || '',
      url: template.url || '',
      roles: Array.isArray(template.roles) ? [...template.roles] : [],
      notifyAll: template.notifyAll === true,
      reminder: template.reminder || '5m',
      weapons: clone(template.weapons || {}),
    },
    hasChanges: false,
    step: 'overview',
  });
  return sessionId;
};

const createDraftSession = ({ userId, guildId, data }, now = Date.now()) => {
  const sessionId = randomBytes(12).toString('hex');
  templateEditSessions.set(sessionId, {
    mode: 'create',
    userId: String(userId),
    guildId: String(guildId),
    templateId: null,
    originalData: null,
    lastActivity: now,
    data: clone(data),
    hasChanges: true,
    step: 'overview',
  });
  return sessionId;
};

const mutateOwnedSession = (sessionId, userId, guildId, mutator, now = Date.now()) => {
  const valid = getValidSession(sessionId, userId, guildId, now);
  if (!valid) return null;
  const result = mutator(valid.session);
  valid.session.lastActivity = now;
  return { ...valid, result };
};

const deleteOwnedSession = (sessionId, userId, guildId) => {
  const session = templateEditSessions.get(sessionId);
  if (!ownsSession(session, userId, guildId)) return false;
  return templateEditSessions.delete(sessionId);
};

const clearAllSessions = () => templateEditSessions.clear();

const ownsSession = (session, userId, guildId) =>
  Boolean(session)
  && String(session.userId) === String(userId)
  && String(session.guildId) === String(guildId);

const isExpired = (session, now = Date.now()) =>
  Boolean(session?.lastActivity) && now - session.lastActivity > SESSION_TIMEOUT_MS;

const cleanupExpiredSessions = (now = Date.now()) => {
  let removed = 0;
  for (const [sessionId, session] of templateEditSessions.entries()) {
    if (!isExpired(session, now)) continue;
    templateEditSessions.delete(sessionId);
    removed += 1;
  }
  return removed;
};

const getValidSession = (sessionId, userId, guildId, now = Date.now()) => {
  const direct = templateEditSessions.get(sessionId);
  if (!direct || !ownsSession(direct, userId, guildId)) return null;
  if (isExpired(direct, now)) {
    templateEditSessions.delete(sessionId);
    return null;
  }
  direct.lastActivity = now;
  return { session: direct, sessionId };
};

const cleanupTimer = setInterval(() => {
  const removed = cleanupExpiredSessions();
  if (removed > 0) console.log(`[TEMPLATE] ${removed} sesión(es) de edición expiradas eliminadas`);
}, CLEANUP_INTERVAL_MS);
cleanupTimer.unref?.();

module.exports = {
  CLEANUP_INTERVAL_MS,
  SESSION_TIMEOUT_MS,
  clearAllSessions,
  cleanupExpiredSessions,
  createDraftSession,
  createEditSession,
  deleteOwnedSession,
  getValidSession,
  isExpired,
  mutateOwnedSession,
  ownsSession,
};
