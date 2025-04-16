/**
 * Script para actualizar los comandos de la aplicación en Discord
 */
const { REST, Routes } = require("discord.js");
const fs = require("node:fs");
const path = require("node:path");

const { TOKEN, CLIENT_ID, GUILD_ID } = process.env;

const commands = [];
const foldersPath = path.join(__dirname, "src/commands");
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
  const commandsPath = path.join(foldersPath, folder);
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith(".js"));
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ("data" in command && "execute" in command) {
      commands.push(command.data.toJSON());
    } else {
      console.log(
        `[WARNING] El comando en ${filePath} requiere de las propiedades de "data" o "execute".`
      );
    }
  }
}

/**
 * Generamos una instancia de REST de la librería de discord.js
 */
const rest = new REST().setToken(TOKEN);

/**
 * Método para actualizar los comandos de la aplicación en Discord, IIFE para ejecutarlo inmediatamente
 */
(async () => {
  try {
    console.log(`[INFO] Iniciando actualizacion de comandos en la aplicación.`);
    await rest
      .put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
        body: commands,
      })
      .then(() => {
        console.log(`[INFO] Comandos de la aplicación fueron actualizados.`);
      });
  } catch (error) {
    console.error(error);
  }
})();
