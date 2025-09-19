/**
 * Obtiene el tiempo en formato 1h 30m y lo convierte a milisegundos
 * @param {*} timeString: string - Tiempo en formato 1h 30m
 * @returns: number - Tiempo en milisegundos
 */
const parseTime = (timeString) => {
  if (!timeString || typeof timeString !== 'string') {
    throw new Error('Tiempo inválido: debe ser una cadena de texto');
  }

  // Limpiar el string y convertir a minúsculas
  const cleanTime = timeString.trim().toLowerCase();
  
  // Regex mejorado para capturar horas y minutos
  const regex = /^(\d+)h?\s*(\d+)?m?$/;
  const matches = cleanTime.match(regex);

  if (!matches) {
    throw new Error(`Formato de tiempo inválido: "${timeString}". Usa formato como "1h", "30m", "1h 30m"`);
  }

  let hours = 0;
  let minutes = 0;
  
  // Si tiene 'h' o es un número grande, asumir horas
  if (cleanTime.includes('h') || (matches[1] && parseInt(matches[1]) > 12)) {
    hours = parseInt(matches[1], 10);
    if (matches[2]) {
      minutes = parseInt(matches[2], 10);
    }
  } else {
    // Si no tiene 'h' y es un número pequeño, asumir minutos
    minutes = parseInt(matches[1], 10);
  }

  // Validar valores
  if (isNaN(hours) || isNaN(minutes) || hours < 0 || minutes < 0) {
    throw new Error(`Valores de tiempo inválidos: horas=${hours}, minutos=${minutes}`);
  }

  if (minutes >= 60) {
    throw new Error('Los minutos no pueden ser 60 o más. Usa horas en su lugar.');
  }

  /**
   * Las horas se multiplican por 60 minutos, 60 segundos y 1000 milisegundos
   * Los minutos se multiplican por 60 segundos y 1000 milisegundos
   */
  const totalMs = hours * 60 * 60 * 1000 + minutes * 60 * 1000;
  
  if (totalMs <= 0) {
    throw new Error('El tiempo debe ser mayor a 0');
  }

  return totalMs;
};

/**
 * Convierte milisegundos a formato legible (ej: "30m", "1h 15m")
 * @param {number} milliseconds - Tiempo en milisegundos
 * @returns {string} - Tiempo formateado
 */
const formatTime = (milliseconds) => {
  const totalMinutes = Math.floor(milliseconds / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  } else {
    return `${minutes}m`;
  }
};

module.exports = {
  parseTime,
  formatTime,
};
