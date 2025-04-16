const { Client, Collection, GatewayIntentBits } = require("discord.js");

/**
 * Generamos una instancia de cliente
 */
const client = new Client({ intents: [53608447] });
client.commands = new Collection();

/**
 * Exportamos la instancia del cliente para poder usarla en otros archivos
 */
module.exports = {
  client,
};
