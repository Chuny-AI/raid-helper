/**
 * Convierte un string hexadecimal a texto
 */
function hexToStr(hex) {
  try {
    let str = '';
    for (let i = 0; i < hex.length; i += 2) {
      str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    }
    return str;
  } catch (error) {
    throw new Error('Error al decodificar texto hexadecimal');
  }
}

/**
 * Limpia el texto de caracteres especiales
 */
function cleanText(text) {
  return text.replace(/[^a-zA-Z0-9]/g, '');
}

module.exports = {
  hexToStr,
  cleanText
};