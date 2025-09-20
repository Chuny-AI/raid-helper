const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

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
 * Función para registrar comandos globalmente
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
 * Función para registrar comandos en un servidor específico
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
 * Función principal
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'global':
      console.log('[INFO] Registrando comandos globalmente...');
      await registerGlobalCommands();
      break;
    case 'guild':
      console.log('[INFO] Registrando comandos en servidor específico...');
      await registerGuildCommands();
      break;
    case 'clear-global':
      console.log('[INFO] Limpiando comandos globales...');
      await clearGlobalCommands();
      break;
    case 'clear-guild':
      console.log('[INFO] Limpiando comandos de servidor...');
      await clearGuildCommands();
      break;
    default:
      console.log(`
[INFO] Uso: node register-commands.js <comando>

Comandos disponibles:
  global        - Registrar comandos globalmente
  guild         - Registrar comandos en servidor específico
  clear-global  - Limpiar comandos globales
  clear-guild   - Limpiar comandos de servidor

Variables de entorno requeridas:
  DISCORD_TOKEN - Token del bot de Discord
  CLIENT_ID     - ID del cliente de la aplicación
  GUILD_ID      - ID del servidor (solo para comandos de guild)
      `);
      break;
  }
}

/**
 * Función para limpiar comandos globales
 */
async function clearGlobalCommands() {
  try {
    const token = process.env.DISCORD_TOKEN || process.env.TOKEN;
    const rest = new REST().setToken(token);

    console.log('[INFO] Limpiando comandos globales...');

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: [] },
    );

    console.log('[SUCCESS] Comandos globales limpiados exitosamente.');
    return true;
  } catch (error) {
    console.error('[ERROR] Error limpiando comandos globales:', error);
    return false;
  }
}

/**
 * Función para limpiar comandos de servidor
 */
async function clearGuildCommands() {
  try {
    const token = process.env.DISCORD_TOKEN || process.env.TOKEN;
    const rest = new REST().setToken(token);
    const guildId = process.env.GUILD_ID;

    if (!guildId) {
      console.error('[ERROR] GUILD_ID no está definido en las variables de entorno');
      return false;
    }

    console.log(`[INFO] Limpiando comandos del servidor ${guildId}...`);

    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
      { body: [] },
    );

    console.log('[SUCCESS] Comandos de servidor limpiados exitosamente.');
    return true;
  } catch (error) {
    console.error('[ERROR] Error limpiando comandos de servidor:', error);
    return false;
  }
}

// Ejecutar función principal
main().catch(console.error);
