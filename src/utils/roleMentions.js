/**
 * Utilidades para interpretar un campo de texto libre que contiene varios roles.
 *
 * Discord no permite opciones de tipo rol con múltiples valores, así que la
 * alternativa para no quedarse limitado a un número fijo de opciones
 * (role_to_notify_1, _2, _3...) es una única opción de texto que acepta:
 *
 *   - menciones:  <@&123456789012345678>
 *   - IDs:        123456789012345678
 *   - nombres:    Tank, @Heal, "Raid Leader"
 *
 * Los tokens se separan por coma; si no hay ninguna coma se separan por
 * espacios. La coma es lo que permite usar nombres con espacios.
 */

/** Máximo de roles admitidos en una sola notificación. */
const MAX_ROLES_TO_NOTIFY = 20;

const ROLE_MENTION_REGEX = /<@&(\d{17,20})>/g;
const SNOWFLAKE_REGEX = /^\d{17,20}$/;

/**
 * Limpia un token suelto: espacios, comillas envolventes y el '@' inicial.
 * @param {string} token
 * @returns {string}
 */
function cleanToken(token) {
  return token
    .trim()
    .replace(/^["'`]|["'`]$/g, '')
    .replace(/^@/, '')
    .trim();
}

/**
 * Divide la entrada en tokens, extrayendo primero las menciones literales.
 * @param {string} input
 * @returns {{ mentionIds: string[], tokens: string[] }}
 */
function tokenize(input) {
  const mentionIds = [];
  const remainder = input.replace(ROLE_MENTION_REGEX, (_match, id) => {
    mentionIds.push(id);
    return ' ';
  });

  // Con comas se respetan los nombres con espacios; sin comas basta el espacio.
  const rawTokens = remainder.includes(',')
    ? remainder.split(',')
    : remainder.split(/\s+/);

  const tokens = rawTokens.map(cleanToken).filter((token) => token.length > 0);

  return { mentionIds, tokens };
}

/**
 * Resuelve un token que no es una mención literal contra los roles del servidor.
 * Prueba ID, nombre exacto y, como último recurso, una única coincidencia parcial.
 * @param {string} token
 * @param {import('discord.js').Guild} guild
 * @returns {import('discord.js').Role | null}
 */
function resolveRoleToken(token, guild) {
  if (SNOWFLAKE_REGEX.test(token)) {
    return guild.roles.cache.get(token) || null;
  }

  const needle = token.toLowerCase();

  const exact = guild.roles.cache.find((role) => role.name.toLowerCase() === needle);
  if (exact) return exact;

  // Solo se acepta la coincidencia parcial si es inequívoca: si "tan" casa con
  // dos roles distintos es preferible avisar al usuario a elegir uno por él.
  const partial = guild.roles.cache.filter((role) => role.name.toLowerCase().includes(needle));
  return partial.size === 1 ? partial.first() : null;
}

/**
 * Interpreta el contenido de la opción `roles_to_notify`.
 *
 * @everyone se rechaza de forma explícita. Su rol tiene el mismo id que el
 * servidor, así que se colaba escribiendo el id del gremio o incluso la palabra
 * "everyone" (que casa parcialmente con el nombre del rol) y acababa en la lista
 * de roles del raid. Ahí no ping'aba —una mención a @everyone requiere permiso
 * aparte y `allowed_mentions`—, con lo que el raid decía avisar a todo el
 * servidor y en realidad no avisaba a nadie. Se avisa en vez de aceptarlo en
 * silencio, y no se habilita el ping masivo: eso es una decisión del servidor,
 * no un efecto secundario de escribir una palabra en un campo de texto.
 *
 * @param {string | null | undefined} input Texto tal cual lo escribió el usuario.
 * @param {import('discord.js').Guild} guild Servidor donde se resuelven los roles.
 * @returns {{ roleIds: string[], unresolved: string[], exceededLimit: boolean, blockedEveryone: boolean }}
 */
function parseRolesToNotify(input, guild) {
  const result = { roleIds: [], unresolved: [], exceededLimit: false, blockedEveryone: false };

  if (!input || typeof input !== 'string' || !input.trim()) return result;

  const { mentionIds, tokens } = tokenize(input);
  const seen = new Set();

  const push = (roleId) => {
    if (seen.has(roleId)) return;
    // El rol @everyone comparte id con el servidor.
    if (roleId === guild.id) {
      result.blockedEveryone = true;
      return;
    }
    if (result.roleIds.length >= MAX_ROLES_TO_NOTIFY) {
      result.exceededLimit = true;
      return;
    }
    seen.add(roleId);
    result.roleIds.push(roleId);
  };

  for (const id of mentionIds) {
    const role = guild.roles.cache.get(id);
    if (role) push(role.id);
    else result.unresolved.push(`<@&${id}>`);
  }

  for (const token of tokens) {
    const role = resolveRoleToken(token, guild);
    if (role) push(role.id);
    else result.unresolved.push(token);
  }

  return result;
}

/**
 * Construye las sugerencias de autocompletado para un campo multi-rol.
 *
 * Conserva lo que el usuario ya escribió y solo completa el último tramo, de
 * forma que cada selección va acumulando roles en el mismo campo.
 * @param {string} value Valor actual del campo.
 * @param {import('discord.js').Guild} guild
 * @returns {{ name: string, value: string }[]} Máximo 25 opciones (límite de Discord).
 */
function buildRolesAutocompleteChoices(value, guild) {
  const raw = typeof value === 'string' ? value : '';
  const lastComma = raw.lastIndexOf(',');
  const prefix = lastComma === -1 ? '' : `${raw.slice(0, lastComma + 1)} `;
  const search = (lastComma === -1 ? raw : raw.slice(lastComma + 1)).trim().replace(/^@/, '').toLowerCase();

  const alreadyPicked = new Set(parseRolesToNotify(prefix, guild).roleIds);

  const choices = [];
  for (const role of guild.roles.cache.values()) {
    if (choices.length >= 25) break;
    if (role.id === guild.id) continue; // @everyone se menciona aparte, no por rol
    if (alreadyPicked.has(role.id)) continue;
    if (search && !role.name.toLowerCase().includes(search)) continue;

    const nextValue = `${prefix}${role.name}`;
    // Discord rechaza los valores de autocompletado de más de 100 caracteres.
    if (nextValue.length > 100) continue;

    choices.push({ name: nextValue.length > 100 ? role.name : nextValue, value: nextValue });
  }

  return choices;
}

module.exports = {
  MAX_ROLES_TO_NOTIFY,
  parseRolesToNotify,
  buildRolesAutocompleteChoices,
};
