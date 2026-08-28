/**
 * Registro en memoria de los raids activos. Reemplaza a `embedsMap`
 * (src/utils/embed.js). Indexa por raidId (estable, usado en los customId) y
 * por messageId (para resolver customId legacy tras un reinicio).
 *
 * Cada entrada guarda directamente el documento mongoose de `RaidEvent`, que
 * ya contiene el estado estructurado (groups/slots/waitlist/...) además de
 * los metadatos del raid — es, a la vez, el "raid" y el "state" que consumen
 * raidState.js y raidRender.js.
 */
const { renderRaidEmbed, renderRaidComponents } = require('../utils/raidRender');

/** @type {Map<string, {raidId:string, raid:Object, message:Object|null, templateName:string}>} */
const byRaidId = new Map();
/** @type {Map<string, string>} messageId -> raidId */
const byMessageId = new Map();
/** @type {Map<string, Promise>} raidId -> cola de mutex */
const locks = new Map();

/**
 * @param {{raidId:string, raid:Object, message:Object|null, templateName:string}} runtime
 */
function register(runtime) {
  byRaidId.set(runtime.raidId, runtime);
  if (runtime.message?.id) byMessageId.set(runtime.message.id, runtime.raidId);
}

function unregister(raidId) {
  const entry = byRaidId.get(raidId);
  if (entry?.message?.id) byMessageId.delete(entry.message.id);
  byRaidId.delete(raidId);
  locks.delete(raidId);
}

function getByRaidId(raidId) {
  return byRaidId.get(raidId) || null;
}

function getByMessageId(messageId) {
  const raidId = byMessageId.get(messageId);
  return raidId ? byRaidId.get(raidId) || null : null;
}

function setMessage(raidId, message) {
  const entry = byRaidId.get(raidId);
  if (!entry) return;
  entry.message = message;
  if (message?.id) byMessageId.set(message.id, raidId);
}

/**
 * Serializa el acceso concurrente al estado de un mismo raid: dos
 * interacciones simultáneas (dos usuarios pulsando a la vez) se ejecutan una
 * tras otra en vez de leer/escribir el mismo estado en carrera.
 * @template T
 * @param {string} raidId
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
function withRaidLock(raidId, fn) {
  const tail = locks.get(raidId) || Promise.resolve();
  const result = tail.then(fn, fn);
  locks.set(raidId, result.catch(() => {}));
  return result;
}

/**
 * Re-renderiza embed+componentes y edita el mensaje de Discord. Si ya hay una
 * edición en vuelo para este raid, marca "dirty" en vez de lanzar otro
 * `message.edit` en paralelo, y esa edición en vuelo vuelve a renderizar al
 * terminar — así nunca se pierden ediciones ni se dispara más de una a la vez
 * (protege del rate limit de Discord en raids muy activos).
 * @param {string} raidId
 */
async function renderAndEdit(raidId) {
  const entry = byRaidId.get(raidId);
  if (!entry || !entry.message) return;

  if (entry._editing) {
    entry._dirty = true;
    return;
  }
  entry._editing = true;
  try {
    do {
      entry._dirty = false;
      const embed = renderRaidEmbed(entry.raid, entry.raid);
      const components = renderRaidComponents(entry.raid, entry.raid);
      try {
        entry.message = await entry.message.edit({ embeds: [embed], components });
      } catch (e) {
        console.error(`[ERROR] raidRegistry.renderAndEdit: fallo al editar el mensaje del raid #${raidId}:`, e);
      }
    } while (entry._dirty);
  } finally {
    entry._editing = false;
  }
}

/** Persiste el documento del raid en BD, sin bloquear al llamador. */
function persistRaid(raidId) {
  const entry = byRaidId.get(raidId);
  if (!entry) return;
  setImmediate(async () => {
    try {
      await entry.raid.save();
    } catch (e) {
      console.error(`[WARN] raidRegistry.persistRaid: error guardando raid #${raidId}:`, e);
    }
  });
}

module.exports = {
  register,
  unregister,
  getByRaidId,
  getByMessageId,
  setMessage,
  withRaidLock,
  renderAndEdit,
  persistRaid,
};
