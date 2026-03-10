/**
 * Parsea una hora en formato HH:MM (UTC) y devuelve un Unix timestamp en segundos.
 * Si la hora ya pasó hoy en UTC, usa la misma hora del día siguiente.
 * @param {string} timeString - Tiempo en formato HH:MM (ej: "17:00", "21:30")
 * @returns {number} - Unix timestamp en segundos
 */
const parseUTCTime = (timeString) => {
  if (!timeString || typeof timeString !== 'string') {
    throw new Error('Tiempo inválido: debe ser una cadena de texto en formato HH:MM');
  }

  const clean = timeString.trim();
  const match = clean.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    throw new Error(`Formato de tiempo inválido: "${timeString}". Usa el formato HH:MM (ej: 17:00, 21:30)`);
  }

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);

  if (hours < 0 || hours > 23) {
    throw new Error(`Hora inválida: "${hours}". Debe ser entre 0 y 23`);
  }
  if (minutes < 0 || minutes > 59) {
    throw new Error(`Minutos inválidos: "${minutes}". Debe ser entre 0 y 59`);
  }

  const now = new Date();
  const event = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
    hours, minutes, 0, 0
  ));

  // Si la hora ya pasó hoy en UTC, programar para mañana
  if (event.getTime() <= Date.now()) {
    event.setUTCDate(event.getUTCDate() + 1);
  }

  return Math.floor(event.getTime() / 1000); // Unix timestamp en segundos
};

/**
 * Parsea un número de minutos como string y devuelve milisegundos.
 * @param {string} minuteString - Minutos como string (ej: "30", "10", "60")
 * @returns {number} - Milisegundos
 */
const parseMinutes = (minuteString) => {
  if (!minuteString || typeof minuteString !== 'string') {
    throw new Error('Tiempo inválido: debe ser una cadena de texto');
  }

  const match = minuteString.trim().match(/^(\d+)$/);
  if (!match) {
    throw new Error(`Formato inválido: "${minuteString}". Usa un número de minutos (ej: 10, 30, 60)`);
  }

  const minutes = parseInt(match[1], 10);
  if (isNaN(minutes) || minutes < 1) {
    throw new Error(`Minutos inválidos: "${minuteString}". Debe ser un número mayor a 0`);
  }

  return minutes * 60 * 1000;
};

/**
 * Formatea milisegundos en una cadena de minutos legible (ej: "30 min")
 * @param {number} milliseconds - Tiempo en milisegundos
 * @returns {string} - Texto formateado
 */
const formatMinutes = (milliseconds) => {
  const total = Math.floor(milliseconds / (60 * 1000));
  return `${total} min`;
};

module.exports = {
  parseUTCTime,
  parseMinutes,
  formatMinutes,
};
