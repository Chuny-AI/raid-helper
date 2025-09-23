const { bosses } = require('../utils/dungeonConfig');
const { hexToStr, cleanText } = require('../utils/textDecoder');

/**
 * Servicio para decodificar información de calabozos de Avalon
 */
class DungeonDecoder {
  /**
   * Procesa el texto codificado y retorna la información de los jefes
   * @param {string} encodedData - Datos codificados en hexadecimal
   * @returns {Array} Lista de bosses encontrados
   */
  static decode(encodedData) {
    try {
      const hexData = encodedData.replace(/\s/g, '');
      const stringData = hexToStr(hexData);
      const cleanedText = cleanText(stringData.toLowerCase());

      const bossPositions = [];

      Object.keys(bosses).forEach((boss) => {
        const regex = new RegExp(`${boss}.*?layer(\\d{1,2})`, 'gi');
        let match;

        while ((match = regex.exec(cleanedText)) !== null) {
          bossPositions.push({
            name: bosses[boss].name,
            position: match.index,
            layer: parseInt(match[1], 10),
            color: bosses[boss][parseInt(match[1], 10)],
            bossKey: boss
          });
        }
      });

      return bossPositions.sort((a, b) => (a.position || 0) - (b.position || 0));
    } catch (error) {
      throw new Error('Error al decodificar la información del calabozo');
    }
  }

  /**
   * Valida si el texto parece ser datos hexadecimales válidos
   * @param {string} text - Texto a validar
   * @returns {boolean} true si parece ser hex válido
   */
  static isValidHexData(text) {
    if (!text || typeof text !== 'string') return false;

    const cleanHex = text.replace(/\s/g, '');
    const hexPattern = /^[0-9a-fA-F]+$/;

    return hexPattern.test(cleanHex) && cleanHex.length >= 10 && cleanHex.length % 2 === 0;
  }
}

module.exports = DungeonDecoder;
