const { bosses } = require('../utils/dungeonConfig');
const { hexToStr, cleanText } = require('../utils/textDecoder');

/**
 * Longitud máxima (en caracteres hexadecimales) que se acepta decodificar.
 *
 * Hoy la entrada siempre viene de un mensaje de Discord, que ya está acotado a
 * 2000/4000 caracteres, pero ese límite es de Discord y no de este servicio: el
 * tope explícito evita que un futuro origen (un adjunto, un comando) meta aquí
 * una entrada arbitrariamente grande.
 */
const MAX_HEX_LENGTH = 20000;

/** Busca la capa asociada a un jefe. Se reutiliza fijando `lastIndex`. */
const LAYER_REGEX = /layer(\d{1,2})/g;

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

      // Búsqueda por posición en vez de un regex `jefe.*?layer(\d{1,2})` por
      // jefe: aquel construía la expresión concatenando la clave del jefe (si
      // alguna llevara un metacarácter, cambiaría el patrón) y su `.*?` recorría
      // el texto entero desde cada coincidencia, con coste cuadrático. Aquí se
      // localiza el jefe con indexOf y se busca su `layer` a partir de ahí, que
      // da exactamente el mismo resultado: `cleanText` deja solo alfanuméricos,
      // así que no hay saltos de línea que el `.` pudiera excluir.
      for (const boss of Object.keys(bosses)) {
        const needle = boss.toLowerCase();
        let from = 0;
        let idx;

        while ((idx = cleanedText.indexOf(needle, from)) !== -1) {
          LAYER_REGEX.lastIndex = idx + needle.length;
          const match = LAYER_REGEX.exec(cleanedText);
          if (!match) break; // ya no queda ninguna capa más adelante

          const layer = parseInt(match[1], 10);
          bossPositions.push({
            name: bosses[boss].name,
            position: idx,
            layer,
            color: bosses[boss][layer],
            bossKey: boss
          });
          from = LAYER_REGEX.lastIndex;
        }
      }

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

    if (cleanHex.length > MAX_HEX_LENGTH) return false;

    return hexPattern.test(cleanHex) && cleanHex.length >= 10 && cleanHex.length % 2 === 0;
  }
}

DungeonDecoder.MAX_HEX_LENGTH = MAX_HEX_LENGTH;

module.exports = DungeonDecoder;
