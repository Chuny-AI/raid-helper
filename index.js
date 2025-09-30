const { client } = require("./src/utils/client");
const { getCommands } = require("./src/utils/commands");
const { getEvents } = require("./src/utils/events");
const { connectDB } = require("./src/database/connection");
const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.json({
    status: "✅ Chuny BOT está funcionando correctamente",
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
    version: "1.0.0"
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    bot: global.discordClient?.isReady() ? "connected" : "disconnected",
    uptime: process.uptime()
  });
});

app.listen(PORT, () => {
  console.log(`[INFO] Servidor HTTP corriendo en puerto ${PORT}`);
});

global.discordClient = client;

/**
 * Función para cargar todos los comandos desde los archivos
 */
function loadCommands() {
  const commands = [];
  const foldersPath = path.join(__dirname, 'src/commands');
  const commandFolders = fs.readdirSync(foldersPath);

  for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs
      .readdirSync(commandsPath)
      .filter((file) => file.endsWith('.js'));

    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      const command = require(filePath);

      if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
        console.log(`[INFO] Comando cargado: ${command.data.name}`);
      } else {
        console.log(`[WARNING] El comando en ${filePath} requiere de las propiedades de "data" o "execute".`);
      }
    }
  }

  return commands;
}

/**
 * Función para registrar comandos globalmente en Discord
 */
async function registerGlobalCommands() {
  try {
    const commands = loadCommands();
    const token = process.env.DISCORD_TOKEN || process.env.TOKEN;
    const rest = new REST().setToken(token);

    console.log(`[INFO] Iniciando registro de ${commands.length} comandos globales...`);

    const data = await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands },
    );

    console.log(`[SUCCESS] Se registraron exitosamente ${data.length} comandos slash globalmente.`);
    return true;
  } catch (error) {
    console.error('[ERROR] Error registrando comandos globales:', error);
    return false;
  }
}

/**
 * Función para registrar comandos en un servidor específico (guild)
 */
async function registerGuildCommands() {
  try {
    const commands = loadCommands();
    const token = process.env.DISCORD_TOKEN || process.env.TOKEN;
    const rest = new REST().setToken(token);
    const guildId = process.env.GUILD_ID;

    if (!guildId) {
      console.error('[ERROR] GUILD_ID no está definido en las variables de entorno');
      return false;
    }

    console.log(`[INFO] Iniciando registro de ${commands.length} comandos en el servidor ${guildId}...`);

    const data = await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
      { body: commands },
    );

    console.log(`[SUCCESS] Se registraron exitosamente ${data.length} comandos slash en el servidor ${guildId}.`);
    return true;
  } catch (error) {
    console.error('[ERROR] Error registrando comandos de guild:', error);
    return false;
  }
}

/**
 * Función para registrar comandos según la configuración
 */
async function registerCommands() {
  const useGuildCommands = process.env.GUILD_COMMANDS === 'true';

  if (useGuildCommands) {
    console.log('[INFO] Modo de desarrollo: Registrando comandos en servidor específico');
    return await registerGuildCommands();
  } else {
    console.log('[INFO] Modo de producción: Registrando comandos globalmente');
    return await registerGlobalCommands();
  }
}

/**
 * Función principal para inicializar el bot
 */
async function initializeBot() {
  try {
    await connectDB();

    // Asegurar colecciones en BD (crear si no existen)
    const { ensureCollections } = require('./src/database/bootstrap');
    await ensureCollections();

    getCommands();

    getEvents();

    const commandsRegistered = await registerCommands();

    if (commandsRegistered) {
      console.log('[INFO] Comandos registrados correctamente, iniciando bot...');
    } else {
      console.log('[WARNING] Error registrando comandos, pero iniciando bot de todas formas...');
    }

    global.discordClient = client;

    const token = process.env.DISCORD_TOKEN || process.env.TOKEN;
    await client.login(token);
  } catch (error) {
    console.error('[ERROR] Error inicializando el bot:', error);
    process.exit(1);
  }
}

initializeBot();
