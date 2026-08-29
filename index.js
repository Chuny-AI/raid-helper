const { client } = require("./src/utils/client");
const { installProcessGuards } = require("./src/utils/processGuards");
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

// Red de seguridad: un fallo dentro de un manejador no puede tumbar el bot.
// Se instala antes que nada para cubrir también el arranque.
installProcessGuards(client);

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
 * Si existe GUILD_ID se registran solo en ese servidor, si no, globalmente.
 */
async function registerCommands() {
  if (process.env.GUILD_ID) {
    console.log(`[INFO] GUILD_ID detectado: registrando comandos en servidor ${process.env.GUILD_ID}`);
    return await registerGuildCommands();
  } else {
    console.log('[INFO] Sin GUILD_ID: registrando comandos globalmente');
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

    // Cargar las armas del catálogo del entorno actual (weapons.json en
    // producción, weapons_dev.json en desarrollo) que aún no estén en la BD.
    //
    // Solo inserta lo que falta: las armas ya existentes no se tocan. Sin esto,
    // /show_all_weapons y /show_all_categories consultan Mongo directamente
    // (sin fallback al JSON) y muestran "0 armas". Además desactiva las que ya
    // no figuran en ningún catálogo (la propia función lo registra en el log).
    try {
      const { seedWeaponsFromCatalog } = require('./src/services/weaponService');
      const { getWeaponsPath } = require('./src/weapons/weaponsSource');
      const armas = await seedWeaponsFromCatalog();
      const catalogo = path.basename(getWeaponsPath());
      if (armas.insertadas > 0) {
        console.log(`[INFO] ${armas.insertadas} arma(s) cargadas desde ${catalogo} (${armas.total} en el catálogo)`);
      } else {
        console.log(`[INFO] Armas ya cargadas desde ${catalogo}: ${armas.total} en la base de datos`);
      }
    } catch (weaponError) {
      console.error('[ERROR] No se pudieron cargar las armas:', weaponError);
    }

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
