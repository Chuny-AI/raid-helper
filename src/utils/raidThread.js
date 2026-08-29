/**
 * Hilo privado de coordinación de un raid.
 *
 * El requisito es que solo escriban los que están anotados en el embed
 * (participantes de los grupos y looters). Discord no permite restringir por
 * usuario un hilo público creado desde un mensaje: cualquiera que pueda
 * escribir en el canal padre puede escribir ahí. La única variante que sí lo
 * garantiza es el hilo PRIVADO, cuya lista de miembros es la lista de acceso.
 * Por eso el hilo se crea en el canal (no colgando del mensaje) y su membresía
 * se sincroniza con el estado del raid en cada cambio.
 *
 * Nada de lo que hay aquí puede tumbar un raid: si el hilo no se puede crear,
 * sincronizar o borrar, se registra el fallo y el raid sigue su curso.
 */
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { logDiscordError } = require('./logging');

/** Minutos de inactividad tras los que Discord archiva el hilo (24 h). */
const AUTO_ARCHIVE_MINUTES = 1440;
/** Límite de Discord para el nombre de un canal/hilo. */
const THREAD_NAME_MAX = 100;

/**
 * Permisos que el bot necesita en el canal padre. `ManageThreads` entra en la
 * lista porque el hilo se borra al finalizar el evento: sin ese permiso el hilo
 * quedaría huérfano, así que es mejor no crearlo y avisar al líder.
 */
const REQUIRED_PERMISSIONS = [
  [PermissionFlagsBits.ViewChannel, 'Ver canal'],
  [PermissionFlagsBits.CreatePrivateThreads, 'Crear hilos privados'],
  [PermissionFlagsBits.SendMessagesInThreads, 'Enviar mensajes en hilos'],
  [PermissionFlagsBits.ManageThreads, 'Gestionar hilos'],
];

/** @type {Map<string, Promise<unknown>>} raidId -> cola de sincronizaciones */
const syncQueues = new Map();

/**
 * Serializa las sincronizaciones de un mismo raid: dos usuarios apuntándose a
 * la vez dispararían dos diffs en paralelo sobre la misma lista de miembros.
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
function enqueue(key, fn) {
  const tail = syncQueues.get(key) || Promise.resolve();
  const run = tail.then(fn, fn);
  const guarded = run.catch(() => {});
  syncQueues.set(key, guarded);
  guarded.then(() => {
    if (syncQueues.get(key) === guarded) syncQueues.delete(key);
  });
  return run;
}

/**
 * Usuarios con derecho a estar en el hilo: los anotados en un slot, los looters
 * y el líder (que coordina aunque no ocupe plaza). Lista de espera y "no puedo
 * ir" quedan fuera: no están anotados en el evento.
 * @param {Object} raid Documento RaidEvent (o plano con la misma forma).
 * @returns {Set<string>} ids de usuario.
 */
function collectAllowedMemberIds(raid) {
  const ids = new Set();
  if (raid?.leaderId) ids.add(raid.leaderId);

  for (const slot of raid?.slots || []) {
    for (const user of slot?.users || []) {
      if (user?.userId) ids.add(user.userId);
    }
  }

  for (const looter of raid?.looters?.users || []) {
    if (looter?.userId) ids.add(looter.userId);
  }

  return ids;
}

/**
 * Nombre del hilo. El id del raid se conserva siempre; lo que se recorta es el
 * título, para que el hilo siga siendo identificable.
 * @param {Object} raid
 */
function buildThreadName(raid) {
  const suffix = raid?.eventId ? ` · #${raid.eventId}` : '';
  const title = String(raid?.title || '').trim() || 'Raid';
  return `${title.slice(0, THREAD_NAME_MAX - suffix.length)}${suffix}`;
}

/**
 * Permisos que le faltan al bot en el canal para sostener el hilo.
 * Si no se pueden evaluar devuelve [] y se deja que falle la llamada real:
 * suponer que faltan permisos impediría crear hilos perfectamente válidos.
 * @param {Object} channel
 * @param {Object} guild
 * @returns {string[]} nombres legibles de los permisos que faltan.
 */
function missingThreadPermissions(channel, guild) {
  const me = guild?.members?.me;
  if (!me || typeof channel?.permissionsFor !== 'function') return [];

  const perms = channel.permissionsFor(me);
  if (!perms || typeof perms.has !== 'function') return [];

  return REQUIRED_PERMISSIONS.filter(([flag]) => !perms.has(flag)).map(([, label]) => label);
}

/**
 * Recupera el hilo por id. Un hilo borrado a mano no es un error: devuelve null.
 * @param {Object} guild
 * @param {string} threadId
 */
async function fetchThread(guild, threadId) {
  if (!guild || !threadId) return null;
  try {
    const channel = await guild.channels.fetch(threadId);
    return channel && typeof channel.isThread === 'function' && channel.isThread() ? channel : null;
  } catch (error) {
    // 10003 = Unknown Channel: alguien borró el hilo, no hay nada que reportar.
    if (error?.code !== 10003) {
      logDiscordError(`raidThread.fetchThread: no se pudo obtener el hilo ${threadId}`, error);
    }
    return null;
  }
}

/**
 * Crea el hilo privado del raid en el canal donde se publicó el embed.
 * @param {{channel: Object, guild: Object, raid: Object}} params
 * @returns {Promise<{ok: true, thread: Object} | {ok: false, reason: string, missing?: string[]}>}
 */
async function createRaidThread({ channel, guild, raid }) {
  if (typeof channel?.threads?.create !== 'function') {
    return { ok: false, reason: 'unsupported_channel' };
  }

  const missing = missingThreadPermissions(channel, guild);
  if (missing.length > 0) return { ok: false, reason: 'missing_permissions', missing };

  let thread;
  try {
    thread = await channel.threads.create({
      name: buildThreadName(raid),
      type: ChannelType.PrivateThread,
      // Sin esto cualquier miembro del hilo podría meter a quien quisiera y la
      // lista de acceso dejaría de coincidir con el embed.
      invitable: false,
      autoArchiveDuration: AUTO_ARCHIVE_MINUTES,
      reason: `Hilo privado del raid #${raid?.eventId}`,
    });
  } catch (error) {
    logDiscordError('raidThread.createRaidThread: Discord rechazó la creación del hilo', error);
    return { ok: false, reason: 'api_error' };
  }

  try {
    await thread.send({
      content:
        `💬 Hilo privado del raid **#${raid?.eventId}**.\n` +
        'Solo pueden verlo y escribir aquí quienes estén anotados en el embed ' +
        '(participantes y looters) y el líder de la actividad.\n' +
        'Al finalizar el evento este hilo se borrará automáticamente.',
    });
  } catch (error) {
    // Un hilo sin mensaje de bienvenida sigue sirviendo; no se aborta por esto.
    logDiscordError('raidThread.createRaidThread: no se pudo enviar el mensaje inicial', error);
  }

  return { ok: true, thread };
}

/**
 * Deja la membresía del hilo igual a la lista de anotados: añade a los que
 * faltan y saca a los que ya no están en el embed.
 * @param {Object} guild
 * @param {Object} raid
 * @returns {Promise<{ok: boolean, reason?: string, added?: string[], removed?: string[]}>}
 */
async function syncRaidThread(guild, raid) {
  if (!raid?.threadId) return { ok: false, reason: 'no_thread' };

  return enqueue(raid.eventId || raid.threadId, async () => {
    const thread = await fetchThread(guild, raid.threadId);
    if (!thread) return { ok: false, reason: 'gone' };

    // Un hilo archivado no acepta cambios de membresía.
    if (thread.archived) {
      try {
        await thread.setArchived(false, `Raid #${raid.eventId} sigue activo`);
      } catch (error) {
        logDiscordError(`raidThread.syncRaidThread: no se pudo desarchivar el hilo del raid #${raid.eventId}`, error);
        return { ok: false, reason: 'archived' };
      }
    }

    let current;
    try {
      current = await thread.members.fetch();
    } catch (error) {
      logDiscordError(`raidThread.syncRaidThread: no se pudieron leer los miembros del hilo del raid #${raid.eventId}`, error);
      return { ok: false, reason: 'members_unavailable' };
    }

    const allowed = collectAllowedMemberIds(raid);
    const botId = guild?.client?.user?.id;
    const added = [];
    const removed = [];

    for (const userId of allowed) {
      if (current.has(userId)) continue;
      try {
        await thread.members.add(userId);
        added.push(userId);
      } catch (error) {
        logDiscordError(`raidThread.syncRaidThread: no se pudo añadir a ${userId} al hilo del raid #${raid.eventId}`, error);
      }
    }

    for (const userId of current.keys()) {
      // El bot es el dueño del hilo: sacarlo lo dejaría inmanejable.
      if (userId === botId || allowed.has(userId)) continue;
      try {
        await thread.members.remove(userId);
        removed.push(userId);
      } catch (error) {
        logDiscordError(`raidThread.syncRaidThread: no se pudo sacar a ${userId} del hilo del raid #${raid.eventId}`, error);
      }
    }

    return { ok: true, added, removed };
  });
}

/**
 * Borra el hilo del raid. Que ya no exista cuenta como éxito: el objetivo es
 * que no quede hilo, no que lo borre precisamente esta llamada.
 * @param {Object} guild
 * @param {string} threadId
 * @param {string} raidId
 */
async function deleteRaidThread(guild, threadId, raidId) {
  if (!threadId) return { ok: true, reason: 'no_thread' };

  const thread = await fetchThread(guild, threadId);
  if (!thread) return { ok: true, reason: 'already_gone' };

  try {
    await thread.delete(`Raid #${raidId} finalizado`);
    return { ok: true };
  } catch (error) {
    logDiscordError(`raidThread.deleteRaidThread: no se pudo borrar el hilo del raid #${raidId}`, error);
    return { ok: false, reason: 'api_error' };
  }
}

/**
 * Traduce un fallo de creación al aviso que ve el líder en su mensaje efímero.
 * @param {{reason: string, missing?: string[]}} result
 */
function describeThreadFailure(result) {
  switch (result?.reason) {
    case 'missing_permissions':
      return `no se creó el hilo privado: al bot le faltan permisos en el canal (${(result.missing || []).join(', ')})`;
    case 'unsupported_channel':
      return 'no se creó el hilo privado: este canal no admite hilos';
    default:
      return 'no se creó el hilo privado: Discord rechazó la creación';
  }
}

module.exports = {
  AUTO_ARCHIVE_MINUTES,
  THREAD_NAME_MAX,
  collectAllowedMemberIds,
  buildThreadName,
  missingThreadPermissions,
  createRaidThread,
  syncRaidThread,
  deleteRaidThread,
  describeThreadFailure,
};
