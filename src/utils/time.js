/**
 * Obtiene el tiempo en formato 1h 30m y lo convierte a milisegundos
 * @param {*} timeString: string - Tiempo en formato 1h 30m
 * @returns: number - Tiempo en milisegundos
 */
const parseTime = (timeString) => {
  const regex = /(\d+h)?\s*(\d+m)?/;
  const matches = timeString.match(regex);

  let hours = 0;
  let minutes = 0;
  if (matches[1]) hours = parseInt(matches[1].replace("h", ""), 10);
  if (matches[2]) minutes = parseInt(matches[2].replace("m", ""), 10);

  /**
   * Las horas se multiplican por 60 minutos, 60 segundos y 1000 milisegundos
   * Los minutos se multiplican por 60 segundos y 1000 milisegundos
   */
  return hours * 60 * 60 * 1000 + minutes * 60 * 1000;
};

module.exports = {
  parseTime,
};
