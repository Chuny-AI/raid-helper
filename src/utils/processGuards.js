/**
 * Red de seguridad del proceso.
 *
 * Los manejadores de discord.js son `async`, y discord.js no espera ni captura
 * la promesa que devuelven: si uno lanza, queda una promesa rechazada sin
 * capturar y, desde Node 15, eso mata el proceso entero. El bot no puede caerse
 * porque un raid concreto falle, así que aquí se registran esos fallos con su
 * stack y se sigue atendiendo al resto de servidores.
 *
 * Esto es la última barrera, no la primera: cada manejador debe seguir
 * capturando sus propios errores para poder avisar al usuario. Lo que llegue
 * aquí es un fallo que nadie controló y que hay que corregir en su sitio, por
 * eso se registra con toda la traza.
 */

/** Ventana y tope de errores registrados, para no inundar los logs en un bucle. */
const LOG_WINDOW_MS = 60 * 1000;
const MAX_LOGS_PER_WINDOW = 30;

let windowStart = 0;
let loggedInWindow = 0;
let suppressed = 0;

/**
 * Limita el volumen de logs: un fallo que se repite miles de veces por segundo
 * llenaría el disco del host sin aportar información nueva.
 * @returns {boolean} true si este error se debe registrar.
 */
const shouldLog = () => {
  const now = Date.now();

  if (now - windowStart > LOG_WINDOW_MS) {
    if (suppressed > 0) {
      console.error(`[GUARD] ${suppressed} error(es) adicionales omitidos en el último minuto`);
    }
    windowStart = now;
    loggedInWindow = 0;
    suppressed = 0;
  }

  if (loggedInWindow >= MAX_LOGS_PER_WINDOW) {
    suppressed += 1;
    return false;
  }

  loggedInWindow += 1;
  return true;
};

/**
 * Registra un error con su stack completo; los códigos de Discord se conservan
 * porque son lo primero que identifica el fallo (50013 permisos, 10062 token
 * caducado, etc.).
 * @param {string} origin Etiqueta de dónde vino el fallo.
 * @param {unknown} error
 */
const logUncontrolledError = (origin, error) => {
  if (!shouldLog()) return;

  const code = error?.code !== undefined ? ` (code ${error.code})` : '';
  const message = error?.message || String(error);
  console.error(`[GUARD] ${origin}${code}: ${message}`);

  if (error?.stack) {
    console.error(error.stack);
  }
};

/**
 * Instala los guardas del proceso y del cliente de Discord.
 * Es idempotente: llamarlo dos veces no duplica los listeners.
 * @param {import('discord.js').Client} [client] Cliente al que engancharse.
 */
const installProcessGuards = (client) => {
  if (!global.__processGuardsInstalled) {
    global.__processGuardsInstalled = true;

    // Promesa rechazada que nadie capturó: la causa habitual de que el bot se
    // caiga en medio de un comando. Se registra y el proceso sigue vivo.
    process.on('unhandledRejection', (reason) => {
      logUncontrolledError('Promesa rechazada sin capturar', reason);
    });

    // Excepción síncrona fuera de todo try/catch. Node deja el proceso en un
    // estado impredecible, pero para un bot es preferible seguir sirviendo al
    // resto de servidores que morir por un solo evento roto.
    process.on('uncaughtException', (error) => {
      logUncontrolledError('Excepción sin capturar', error);
    });

    process.on('SIGTERM', () => {
      console.log('[INFO] SIGTERM recibido, cerrando el bot...');
      process.exit(0);
    });
  }

  if (!client || client.__processGuardsInstalled) return;
  client.__processGuardsInstalled = true;

  // Errores del websocket: reconecta solo, no hay que hacer nada más que verlo.
  client.on('error', (error) => logUncontrolledError('Error del cliente de Discord', error));
  client.on('shardError', (error) => logUncontrolledError('Error del shard', error));

  client.on('shardDisconnect', (event, shardId) => {
    console.warn(`[WARN] Shard ${shardId} desconectado (${event?.code}); discord.js intentará reconectar`);
  });

  client.on('shardReconnecting', (shardId) => {
    console.log(`[INFO] Shard ${shardId} reconectando...`);
  });

  client.on('shardResume', (shardId) => {
    console.log(`[INFO] Shard ${shardId} reconectado`);
  });

  // Sesión invalidada: el cliente ya no puede recuperarse por sí mismo. Aquí sí
  // hay que salir para que el host levante el proceso de nuevo.
  client.on('invalidated', () => {
    console.error('[GUARD] Sesión de Discord invalidada, no es recuperable. Saliendo para que el host reinicie.');
    process.exit(1);
  });
};

module.exports = {
  installProcessGuards,
  logUncontrolledError,
};
