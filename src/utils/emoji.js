/**
 * Utilidades para formatear emojis de Discord de forma consistente.
 *
 * Discord (y discord.js, en `parseEmoji`) exige que el nombre de un emoji
 * personalizado cumpla `\w{2,32}`. Formatos como `<:w:ID>` o `<:e:ID>` no
 * cumplen ese mínimo de 2 caracteres: en texto se muestran literalmente y en
 * `setEmoji()` revientan con "Expected the value to not be null". Por eso todo
 * el bot debe construir los tags desde aquí y nunca a mano.
 */

/**
 * Nombre de relleno para los tags. El nombre no afecta a la imagen que Discord
 * renderiza (solo manda el ID), pero debe ser válido. Se conserva `weapon`
 * porque es el que el bot usó siempre y ya aparece en mensajes publicados.
 */
const CUSTOM_EMOJI_NAME = 'weapon';

/** IDs de Discord: 17-20 dígitos, con margen para snowflakes futuros. */
const CUSTOM_EMOJI_ID_REGEX = /^\d{17,20}$/;

/** Tag ya formateado, animado o no. */
const CUSTOM_EMOJI_TAG_REGEX = /^<(a)?:(\w{2,32}):(\d{17,20})>$/;

/**
 * Normaliza cualquier entrada a string. Acepta también objetos tipo emoji de
 * discord.js ({id, name, animated}), que de otro modo caerían en
 * "[object Object]".
 */
function toText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if (value.id) {
      const name = /^\w{2,32}$/.test(String(value.name || '')) ? value.name : CUSTOM_EMOJI_NAME;
      return `<${value.animated ? 'a' : ''}:${name}:${value.id}>`;
    }
    if (value.name) return String(value.name).trim();
    return '';
  }
  return String(value).trim();
}

/** ¿Es un ID de emoji personalizado suelto? */
function isCustomEmojiId(value) {
  return CUSTOM_EMOJI_ID_REGEX.test(toText(value));
}

/**
 * Extrae el ID de un emoji personalizado, venga suelto o dentro de un tag.
 * @returns {?{id: string, name: string, animated: boolean}}
 */
function parseCustomEmoji(value) {
  const text = toText(value);
  if (isCustomEmojiId(text)) {
    return { id: text, name: CUSTOM_EMOJI_NAME, animated: false };
  }
  const match = text.match(CUSTOM_EMOJI_TAG_REGEX);
  if (!match) return null;
  return { id: match[3], name: match[2], animated: Boolean(match[1]) };
}

/**
 * Formatea un emoji para incrustarlo en texto (embeds, contenido de mensajes).
 * Acepta IDs sueltos, tags ya formados y emojis Unicode.
 * @param {*} value Emoji o ID.
 * @param {string} [fallback=''] Valor si no hay emoji utilizable.
 * @returns {string}
 */
function formatEmoji(value, fallback = '') {
  const text = toText(value);
  if (!text) return fallback;

  const custom = parseCustomEmoji(text);
  if (custom) {
    return `<${custom.animated ? 'a' : ''}:${custom.name}:${custom.id}>`;
  }

  // Un tag mal formado (nombre de 1 carácter, ID fuera de rango) se rescata
  // quedándonos con el ID en lugar de escupir el literal roto.
  const salvaged = text.match(/^<a?:[^:\s]*:(\d{17,20})>$/);
  if (salvaged) return `<:${CUSTOM_EMOJI_NAME}:${salvaged[1]}>`;

  // Cualquier otra cosa que no parezca un intento de tag se asume Unicode.
  if (text.startsWith('<') && text.endsWith('>')) return fallback;
  return text;
}

/**
 * Devuelve un valor apto para `setEmoji()` de un builder, o `undefined` si no
 * hay emoji utilizable. Se usa la forma de objeto `{ id }` porque evita el
 * límite interno de discord.js de 17-19 dígitos que degrada silenciosamente un
 * ID largo a nombre de emoji.
 * @param {*} value Emoji o ID.
 * @returns {{id: string, name?: string, animated?: boolean}|string|undefined}
 */
function toComponentEmoji(value) {
  const text = toText(value);
  if (!text) return undefined;

  const custom = parseCustomEmoji(text);
  if (custom) return { id: custom.id, animated: custom.animated };

  const salvaged = text.match(/^<a?:[^:\s]*:(\d{17,20})>$/);
  if (salvaged) return { id: salvaged[1] };

  if (text.startsWith('<') && text.endsWith('>')) return undefined;
  return text;
}

/**
 * Aplica el emoji a un builder solo si es utilizable, evitando que un valor
 * inválido tumbe la construcción del componente.
 * @param {{setEmoji: Function}} builder
 * @param {*} value
 * @returns {{setEmoji: Function}} el mismo builder, para encadenar.
 */
function applyEmoji(builder, value) {
  const emoji = toComponentEmoji(value);
  if (emoji === undefined) return builder;
  try {
    builder.setEmoji(emoji);
  } catch {
    // Un emoji irrecuperable nunca debe impedir que se muestre la opción.
  }
  return builder;
}

module.exports = {
  CUSTOM_EMOJI_NAME,
  isCustomEmojiId,
  parseCustomEmoji,
  formatEmoji,
  toComponentEmoji,
  applyEmoji,
};
