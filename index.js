const { client } = require("./src/utils/client");
const { getCommands } = require("./src/utils/commands");
const { getEvents } = require("./src/utils/events");

/**
 * Obtener los comandos de la aplicación
 */
getCommands();

/**
 * Setear los eventos de la aplicación
 */
getEvents();

/**
 * Iniciar el bot
 */
client.login(process.env.TOKEN);
