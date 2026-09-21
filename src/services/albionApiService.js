const REGION_BASE_URLS = Object.freeze({
  americas: 'https://gameinfo.albiononline.com/api/gameinfo',
  europe: 'https://gameinfo-ams.albiononline.com/api/gameinfo',
  asia: 'https://gameinfo-sgp.albiononline.com/api/gameinfo',
});

class AlbionApiError extends Error {
  constructor(message, code = 'api_error', status = null) {
    super(message);
    this.name = 'AlbionApiError';
    this.code = code;
    this.status = status;
  }
}

const normalizeRegion = (region) => (
  Object.hasOwn(REGION_BASE_URLS, region) ? region : 'americas'
);

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const inFlight = new Map();
const cache = new Map();
const queue = [];
let activeRequests = 0;
let nextRequestAt = 0;
const MAX_CONCURRENT = 2;
const BACKGROUND_OPTIONS = Object.freeze({ timeoutMs: 20_000, retries: 2, queueTimeoutMs: 30_000 });
const INTERACTIVE_OPTIONS = Object.freeze({ timeoutMs: 45_000, retries: 3, queueTimeoutMs: 120_000 });
const cacheTtl = (path) => path.startsWith('/players/') ? 30_000 : path.startsWith('/guilds/') ? 600_000 : 120_000;

const runQueued = async (work, queueTimeoutMs) => {
  if (activeRequests >= MAX_CONCURRENT) {
    if (queue.length >= 20) throw new AlbionApiError('Albion está ocupado. Inténtalo en unos minutos.', 'busy');
    await new Promise((resolve, reject) => {
      let timer;
      const entry = { resolve: () => { clearTimeout(timer); resolve(); } };
      timer = setTimeout(() => {
        const index = queue.indexOf(entry);
        if (index !== -1) queue.splice(index, 1);
        reject(new AlbionApiError('La cola de Albion tardó demasiado. Inténtalo de nuevo.', 'busy'));
      }, queueTimeoutMs);
      queue.push(entry);
    });
  }
  else activeRequests += 1;
  try {
    const delay = Math.max(0, nextRequestAt - Date.now());
    nextRequestAt = Math.max(Date.now(), nextRequestAt) + 250;
    if (delay) await wait(delay);
    return await work();
  } finally {
    if (queue.length) queue.shift().resolve();
    else activeRequests -= 1;
  }
};

const fetchJson = async (region, path, { timeoutMs, retries, queueTimeoutMs }) => {
  const baseUrl = REGION_BASE_URLS[normalizeRegion(region)];
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let retryDelay = Math.min(500 * 2 ** attempt, 8_000);
    const controller = new AbortController();
    let timer;
    try {
      const response = await runQueued(() => {
        timer = setTimeout(() => controller.abort(), timeoutMs);
        return fetch(`${baseUrl}${path}`, {
          headers: { Accept: 'application/json', 'User-Agent': 'Chuny-Discord-Bot/1.0' },
          signal: controller.signal,
        });
      }, queueTimeoutMs);
      if (!response.ok) {
        const error = new AlbionApiError(
          response.status === 404 ? 'El recurso no existe en Albion.' : `Albion respondió HTTP ${response.status}.`,
          response.status === 404 ? 'not_found' : 'http_error',
          response.status,
        );
        if (response.status !== 429 && response.status < 500) throw error;
        if (response.status === 429) {
          const header = Number(response.headers?.get?.('retry-after'));
          retryDelay = Number.isFinite(header) && header > 0
            ? Math.min(header * 1000, 30_000) : 1_500 * (attempt + 1);
        }
        lastError = error;
      } else {
        const payload = await response.json().catch(() => null);
        if (!payload || typeof payload !== 'object') {
          throw new AlbionApiError('Albion devolvió una respuesta inválida.', 'invalid_response');
        }
        return payload;
      }
    } catch (error) {
      if (error instanceof AlbionApiError && (error.code === 'busy'
        || (error.status && error.status < 500 && error.status !== 429))) throw error;
      lastError = error?.name === 'AbortError'
        ? new AlbionApiError('Albion tardó demasiado en responder.', 'timeout')
        : error;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) await wait(retryDelay);
  }
  if (lastError instanceof AlbionApiError && lastError.code === 'timeout') {
    throw new AlbionApiError(`Albion no respondió después de ${retries + 1} intentos. Inténtalo de nuevo más tarde.`, 'timeout');
  }
  if (lastError instanceof AlbionApiError) throw lastError;
  throw new AlbionApiError(lastError?.message || 'No se pudo contactar la API de Albion.', 'network_error');
};

const requestJson = async (region, path, options = {}) => {
  const settings = { ...BACKGROUND_OPTIONS, ...options };
  const key = `${normalizeRegion(region)}:${path}`;
  const existing = cache.get(key);
  if (existing && existing.expiresAt > Date.now()) return existing.payload;
  const flightKey = `${key}:${settings.timeoutMs}:${settings.retries}:${settings.queueTimeoutMs}`;
  if (inFlight.has(flightKey)) return inFlight.get(flightKey);
  const promise = fetchJson(region, path, settings).then((payload) => {
    if (cache.size > 500) cache.clear();
    cache.set(key, { payload, expiresAt: Date.now() + cacheTtl(path) });
    return payload;
  }).finally(() => inFlight.delete(flightKey));
  inFlight.set(flightKey, promise);
  return promise;
};

const value = (object, ...keys) => {
  for (const key of keys) {
    if (object?.[key] !== undefined && object?.[key] !== null) return object[key];
  }
  return null;
};

const normalizePlayer = (raw) => ({
  id: String(value(raw, 'Id', 'id') || ''),
  name: String(value(raw, 'Name', 'name') || ''),
  guildId: value(raw, 'GuildId', 'guildId') ? String(value(raw, 'GuildId', 'guildId')) : null,
  guildName: value(raw, 'GuildName', 'guildName') ? String(value(raw, 'GuildName', 'guildName')) : null,
  allianceId: value(raw, 'AllianceId', 'allianceId') ? String(value(raw, 'AllianceId', 'allianceId')) : null,
  allianceName: value(raw, 'AllianceName', 'allianceName') ? String(value(raw, 'AllianceName', 'allianceName')) : null,
  allianceTag: value(raw, 'AllianceTag', 'allianceTag') ? String(value(raw, 'AllianceTag', 'allianceTag')) : '',
});

const exactName = (left, right) => String(left || '').localeCompare(String(right || ''), 'en', { sensitivity: 'accent' }) === 0;

const getPlayer = async (region, playerId, options = BACKGROUND_OPTIONS) => {
  const raw = await requestJson(region, `/players/${encodeURIComponent(playerId)}`, options);
  const player = normalizePlayer(raw);
  if (!player.id || player.id !== String(playerId) || !player.name
    || !['GuildId', 'guildId'].some((key) => Object.hasOwn(raw, key))) {
    throw new AlbionApiError('La ficha del personaje está incompleta.', 'invalid_response');
  }
  return player;
};

const findPlayerByName = async (region, playerName) => {
  const name = String(playerName || '').trim();
  if (!name || name.length > 100) throw new AlbionApiError('Escribe un nombre de personaje válido.', 'invalid_name');
  const payload = await requestJson(region, `/search?q=${encodeURIComponent(name)}`, INTERACTIVE_OPTIONS);
  const players = value(payload, 'players', 'Players') || [];
  const match = players.find((player) => exactName(value(player, 'Name', 'name'), name));
  if (!match) throw new AlbionApiError(`No se encontró el personaje exacto **${name}** en esa región.`, 'player_not_found');
  const playerId = value(match, 'Id', 'id');
  if (!playerId) throw new AlbionApiError('Albion no devolvió el ID del personaje.', 'invalid_response');
  return getPlayer(region, playerId, INTERACTIVE_OPTIONS);
};

const getGuild = async (region, guildId, options = BACKGROUND_OPTIONS) => requestJson(region, `/guilds/${encodeURIComponent(guildId)}`, options);

const findGuildByName = async (region, guildName) => {
  const name = String(guildName || '').trim();
  if (!name || name.length > 100) throw new AlbionApiError('Escribe un nombre de gremio válido.', 'invalid_name');
  const payload = await requestJson(region, `/search?q=${encodeURIComponent(name)}`, INTERACTIVE_OPTIONS);
  const guilds = value(payload, 'guilds', 'Guilds') || [];
  const match = guilds.find((guild) => exactName(value(guild, 'Name', 'name'), name));
  if (!match) throw new AlbionApiError(`No se encontró el gremio exacto **${name}** en esa región.`, 'guild_not_found');
  const guildId = value(match, 'Id', 'id');
  const raw = await getGuild(region, guildId, INTERACTIVE_OPTIONS);
  return {
    id: String(value(raw, 'Id', 'id') || guildId),
    name: String(value(raw, 'Name', 'name') || name),
    allianceId: value(raw, 'AllianceId', 'allianceId') ? String(value(raw, 'AllianceId', 'allianceId')) : null,
    allianceName: value(raw, 'AllianceName', 'allianceName') ? String(value(raw, 'AllianceName', 'allianceName')) : null,
    allianceTag: value(raw, 'AllianceTag', 'allianceTag') ? String(value(raw, 'AllianceTag', 'allianceTag')) : '',
  };
};

const getAlliance = async (region, allianceId) => requestJson(region, `/alliances/${encodeURIComponent(allianceId)}`);

const findAllianceFromPlayer = async (region, playerName) => {
  const player = await findPlayerByName(region, playerName);
  if (!player.allianceId) {
    throw new AlbionApiError(`**${player.name}** no pertenece a ninguna alianza.`, 'alliance_not_found');
  }
  const raw = await getAlliance(region, player.allianceId).catch(() => ({}));
  return {
    id: player.allianceId,
    name: String(value(raw, 'AllianceName', 'Name', 'name') || player.allianceName || player.allianceId),
    tag: String(value(raw, 'AllianceTag', 'Tag', 'tag') || player.allianceTag || ''),
    referencePlayer: player,
  };
};

module.exports = {
  AlbionApiError,
  REGION_BASE_URLS,
  findAllianceFromPlayer,
  findGuildByName,
  findPlayerByName,
  getAlliance,
  getGuild,
  getPlayer,
  normalizePlayer,
  normalizeRegion,
  requestJson,
};
