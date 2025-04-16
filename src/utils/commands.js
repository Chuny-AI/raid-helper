const fs = require("node:fs");
const path = require("node:path");
const { client } = require("./client");

/**
 * Obtiene los comandos de la carpeta de commands, y los añade al cliente
 */
const getCommands = () => {
  const foldersPath = path.join(__dirname, "../commands");
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
        client.commands.set(command.data.name, command);
      } else {
        console.log(
          `[WARNING] El comando en ${filePath} requiere de las propiedades de "data" o "execute".`
        );
      }
    }
  }
};

module.exports = {
  getCommands,
};
