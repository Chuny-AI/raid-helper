const { Client, Collection, GatewayIntentBits } = require("discord.js");

/**
 * Generamos una instancia de cliente
 */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});
client.commands = new Collection();

/**
 * Exportamos la instancia del cliente para poder usarla en otros archivos
 */
module.exports = {
  client,
};
