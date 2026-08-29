/**
 * Entorno de ejecución del bot.
 *
 * El criterio es la presencia de GUILD_ID:
 *  - Con GUILD_ID  -> DESARROLLO. Los comandos se registran solo en ese
 *    servidor (ver index.js), así que un GUILD_ID configurado ya significa
 *    "estoy trabajando contra mi servidor de pruebas".
 *  - Sin GUILD_ID  -> PRODUCCIÓN. Los comandos se registran globalmente.
 *
 * Tener una sola variable evita que el registro de comandos, la conexión a
 * MongoDB y el catálogo de armas puedan quedar en entornos distintos.
 */

/** true si hay un GUILD_ID configurado (con contenido, no solo espacios). */
const isDev = () => String(process.env.GUILD_ID ?? '').trim() !== '';

/** true si no hay GUILD_ID: el bot corre en producción. */
const isProd = () => !isDev();

/** Etiqueta legible del entorno, para logs y menús. */
const environmentName = () => (isProd() ? 'PRODUCCIÓN' : 'DESARROLLO');

module.exports = { isDev, isProd, environmentName };
