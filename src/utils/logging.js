const logDiscordError = (context, error) => {
  const code = error?.code || 'unknown';
  const message = error?.message || String(error);
  console.error(`[DISCORD] ${context}: (${code}) ${message}`);
};

const logDatabaseError = (context, error) => {
  const message = error?.message || String(error);
  console.error(`[DB] ${context}: ${message}`);
};

const logInteractionError = (context, error) => {
  const code = error?.code || 'unknown';
  const message = error?.message || String(error);
  console.error(`[INTERACTION] ${context}: (${code}) ${message}`);
};

module.exports = {
  logDiscordError,
  logDatabaseError,
  logInteractionError,
};
