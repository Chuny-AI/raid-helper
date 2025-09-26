/**
 * Módulo compartido para manejar las sesiones de creación de templates
 * Evita referencias circulares entre archivos
 */

// Store global para las sesiones de creación de templates
const templateCreationSessions = new Map();

// Timeout de sesiones (30 minutos)
const SESSION_TIMEOUT = 30 * 60 * 1000;

/**
 * Obtiene el Map de sesiones
 */
function getTemplateCreationSessions() {
  return templateCreationSessions;
}

/**
 * Crea una nueva sesión
 */
function createSession(sessionId, sessionData) {
  const sessionWithTimestamp = {
    ...sessionData,
    createdAt: Date.now(),
    lastAccessed: Date.now()
  };
  templateCreationSessions.set(sessionId, sessionWithTimestamp);
  console.log(`[SESSIONS] Created session ${sessionId}. Total sessions: ${templateCreationSessions.size}`);
  return sessionWithTimestamp;
}

/**
 * Obtiene una sesión específica
 */
function getSession(sessionId) {
  const session = templateCreationSessions.get(sessionId);
  if (session) {
    // Verificar si la sesión ha expirado
    const now = Date.now();
    if (now - session.lastAccessed > SESSION_TIMEOUT) {
      console.log(`[SESSIONS] Session ${sessionId} expired, removing`);
      templateCreationSessions.delete(sessionId);
      return null;
    }
    // Actualizar último acceso
    session.lastAccessed = now;
    console.log(`[SESSIONS] Accessed session ${sessionId}. Age: ${Math.floor((now - session.createdAt) / 1000)}s`);
  } else {
    console.log(`[SESSIONS] Session ${sessionId} not found. Available sessions: [${Array.from(templateCreationSessions.keys()).join(', ')}]`);
  }
  return session;
}

/**
 * Actualiza una sesión
 */
function updateSession(sessionId, sessionData) {
  const existingSession = templateCreationSessions.get(sessionId);
  if (!existingSession) {
    console.log(`[SESSIONS] Warning: Trying to update non-existent session ${sessionId}`);
    return null;
  }

  const updatedSession = {
    ...existingSession,
    ...sessionData,
    lastAccessed: Date.now()
  };
  templateCreationSessions.set(sessionId, updatedSession);
  console.log(`[SESSIONS] Updated session ${sessionId}. Step: ${updatedSession.step}`);
  return updatedSession;
}

/**
 * Elimina una sesión
 */
function deleteSession(sessionId) {
  return templateCreationSessions.delete(sessionId);
}

/**
 * Obtiene todas las sesiones (para debug)
 */
function getAllSessions() {
  return Array.from(templateCreationSessions.entries());
}

/**
 * Busca una sesión por userId y guildId
 */
function findSessionByUser(userId, guildId) {
  for (const [sessionId, session] of templateCreationSessions.entries()) {
    if (session.userId === userId && session.guildId === guildId) {
      console.log(`[SESSIONS] Found existing session for user ${userId}: ${sessionId}`);
      return { sessionId, session };
    }
  }
  return null;
}

/**
 * Busca una sesión por criterios flexibles
 */
function findSessionByCriteria(userId, guildId, step = null) {
  for (const [sessionId, session] of templateCreationSessions.entries()) {
    if (session.userId === userId && session.guildId === guildId) {
      if (!step || session.step === step) {
        console.log(`[SESSIONS] Found session by criteria for user ${userId}, step ${step}: ${sessionId}`);
        return { sessionId, session };
      }
    }
  }
  return null;
}

/**
 * Limpia sesiones expiradas
 */
function cleanupExpiredSessions() {
  const now = Date.now();
  let cleaned = 0;

  for (const [sessionId, session] of templateCreationSessions.entries()) {
    if (now - session.lastAccessed > SESSION_TIMEOUT) {
      templateCreationSessions.delete(sessionId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`[SESSIONS] Cleaned up ${cleaned} expired sessions`);
  }

  return cleaned;
}

module.exports = {
  getTemplateCreationSessions,
  createSession,
  getSession,
  updateSession,
  deleteSession,
  getAllSessions,
  findSessionByUser,
  findSessionByCriteria,
  cleanupExpiredSessions
};