const USER_COOLDOWN_MS = 5 * 60 * 1000;
const GUILD_COOLDOWN_MS = 60 * 1000;

const userCooldowns = new Map();
const guildCooldowns = new Map();
const guildQueues = new Map();

function consumeNotificationPermit(guildId, userId, now = Date.now()) {
  const guildKey = String(guildId);
  const userKey = `${guildKey}:${userId}`;
  const userRemaining = USER_COOLDOWN_MS - (now - (userCooldowns.get(userKey) || 0));
  const guildRemaining = GUILD_COOLDOWN_MS - (now - (guildCooldowns.get(guildKey) || 0));
  const retryAfterMs = Math.max(userRemaining, guildRemaining, 0);

  if (retryAfterMs > 0) return { ok: false, retryAfterMs };

  userCooldowns.set(userKey, now);
  guildCooldowns.set(guildKey, now);
  return { ok: true, retryAfterMs: 0 };
}

function enqueueDmBatch(guildId, job) {
  const key = String(guildId);
  const previous = guildQueues.get(key) || Promise.resolve();
  const current = previous.catch(() => undefined).then(job);
  const tracked = current.catch(() => undefined).finally(() => {
    if (guildQueues.get(key) === tracked) guildQueues.delete(key);
  });
  guildQueues.set(key, tracked);
  return current;
}

function formatRetryAfter(retryAfterMs) {
  return Math.max(1, Math.ceil(retryAfterMs / 60_000));
}

function resetForTests() {
  userCooldowns.clear();
  guildCooldowns.clear();
  guildQueues.clear();
}

module.exports = {
  consumeNotificationPermit,
  enqueueDmBatch,
  formatRetryAfter,
  resetForTests,
  USER_COOLDOWN_MS,
  GUILD_COOLDOWN_MS,
};
