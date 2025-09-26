/**
 * Obtiene el tiempo en minutos y lo convierte a milisegundos
 * @param {*} timeString: string - Tiempo en minutos (1-60)
 * @returns: number - Tiempo en milisegundos
 */
const parseTime = (timeString) => {
  if (!timeString || typeof timeString !== 'string') {
    throw new Error('Tiempo inválido: debe ser una cadena de texto');
  }

  const cleanTime = timeString.trim();

  // Solo aceptar números sin letras
  const numberMatch = cleanTime.match(/^(\d+)$/);
  if (!numberMatch) {
    throw new Error(`Formato de tiempo inválido: "${timeString}". Usa solo números de 1 a 60 (minutos)`);
  }

  const minutes = parseInt(numberMatch[1], 10);

  if (isNaN(minutes) || minutes < 1 || minutes > 60) {
    throw new Error(`Tiempo inválido: "${timeString}". Debe ser un número entre 1 y 60 (minutos)`);
  }

  /**
   * Los minutos se multiplican por 60 segundos y 1000 milisegundos
   */
  const totalMs = minutes * 60 * 1000;

  return totalMs;
};

/**
 * Convierte milisegundos a formato de minutos (ej: "30", "45")
 * @param {number} milliseconds - Tiempo en milisegundos
 * @returns {string} - Tiempo formateado en minutos
 */
const formatTime = (milliseconds) => {
  const totalMinutes = Math.floor(milliseconds / (60 * 1000));
  return `${totalMinutes}`;
};

module.exports = {
  parseTime,
  formatTime,
};
