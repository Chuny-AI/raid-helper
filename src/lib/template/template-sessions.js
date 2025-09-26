/**
 * Módulo compartido para manejar las sesiones de creación de templates
 * Evita referencias circulares entre archivos
 */

// Store global para las sesiones de creación de templates
const templateCreationSessions = new Map();

// Store para mapear sessionIds cortos a sessionIds originales
const shortToOriginalSessionIdMap = new Map();

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

  // Si el sessionId es muy largo, crear un mapeo corto
  if (sessionId.length > 50) {
    const shortSessionId = sessionId.slice(-20);
    shortToOriginalSessionIdMap.set(shortSessionId, sessionId);
    console.log(`[SESSIONS] Created short mapping: ${shortSessionId} -> ${sessionId}`);
  }

  console.log(`[SESSIONS] Created session ${sessionId}. Total sessions: ${templateCreationSessions.size}`);
  return sessionWithTimestamp;
}

/**
 * Obtiene una sesión específica
 */
function getSession(sessionId) {
  let session = templateCreationSessions.get(sessionId);
  let actualSessionId = sessionId;

  // Si no se encuentra directamente, intentar con el mapeo de sessionId corto
  if (!session && shortToOriginalSessionIdMap.has(sessionId)) {
    actualSessionId = shortToOriginalSessionIdMap.get(sessionId);
    session = templateCreationSessions.get(actualSessionId);
    console.log(`[SESSIONS] Using short mapping: ${sessionId} -> ${actualSessionId}`);
  }

  if (session) {
    // Verificar si la sesión ha expirado
    const now = Date.now();
    if (now - session.lastAccessed > SESSION_TIMEOUT) {
      console.log(`[SESSIONS] Session ${actualSessionId} expired, removing`);
      templateCreationSessions.delete(actualSessionId);
      // También limpiar el mapeo si existe
      if (actualSessionId !== sessionId) {
        shortToOriginalSessionIdMap.delete(sessionId);
      }
      return null;
    }
    // Actualizar último acceso
    session.lastAccessed = now;
    console.log(`[SESSIONS] Accessed session ${actualSessionId}. Age: ${Math.floor((now - session.createdAt) / 1000)}s`);
  } else {
    console.log(`[SESSIONS] Session ${sessionId} not found. Available sessions: [${Array.from(templateCreationSessions.keys()).join(', ')}]`);
  }
  return session;
}

/**
 * Actualiza una sesión
 */
function updateSession(sessionId, sessionData) {
  let existingSession = templateCreationSessions.get(sessionId);
  let actualSessionId = sessionId;

  // Si no se encuentra directamente, intentar con el mapeo de sessionId corto
  if (!existingSession && shortToOriginalSessionIdMap.has(sessionId)) {
    actualSessionId = shortToOriginalSessionIdMap.get(sessionId);
    existingSession = templateCreationSessions.get(actualSessionId);
    console.log(`[SESSIONS] Using short mapping for update: ${sessionId} -> ${actualSessionId}`);
  }

  if (!existingSession) {
    console.log(`[SESSIONS] Warning: Trying to update non-existent session ${sessionId}`);
    console.log(`[SESSIONS] Available sessions: [${Array.from(templateCreationSessions.keys()).join(', ')}]`);
    console.log(`[SESSIONS] Short mappings: [${Array.from(shortToOriginalSessionIdMap.entries()).map(([k, v]) => `${k}->${v}`).join(', ')}]`);
    return null;
  }

  const updatedSession = {
    ...existingSession,
    ...sessionData,
    lastAccessed: Date.now()
  };
  templateCreationSessions.set(actualSessionId, updatedSession);
  console.log(`[SESSIONS] Updated session ${actualSessionId}. Step: ${updatedSession.step}`);
  return updatedSession;
}

/**
 * Elimina una sesión
 */
function deleteSession(sessionId) {
  // Si es un sessionId largo, también eliminar el mapeo corto
  if (sessionId.length > 50) {
    const shortSessionId = sessionId.slice(-20);
    shortToOriginalSessionIdMap.delete(shortSessionId);
  }

  // Si es un sessionId corto, buscar y eliminar el original
  if (shortToOriginalSessionIdMap.has(sessionId)) {
    const originalSessionId = shortToOriginalSessionIdMap.get(sessionId);
    shortToOriginalSessionIdMap.delete(sessionId);
    return templateCreationSessions.delete(originalSessionId);
  }

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