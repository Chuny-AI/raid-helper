#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const readline = require('readline');
const mongoose = require('mongoose');
const { connectDB } = require('../src/database/connection');
const { getPremiumServers, updateServerPremium, getOrCreateServer } = require('../src/services/serverService');
const AuthorizedUserService = require('../src/services/authorizedUserService');
const Weapon = require('../src/database/models/Weapon');
const { REST, Routes } = require('discord.js');

// Utilities for TUI
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
readline.emitKeypressEvents(process.stdin, rl);
if (process.stdin.isTTY) process.stdin.setRawMode(true);

const clear = () => process.stdout.write('\x1Bc');
const cursorHide = () => process.stdout.write('\x1B[?25l');
const cursorShow = () => process.stdout.write('\x1B[?25h');

const question = (q) => new Promise(res => rl.question(q, ans => res(ans.trim())));

async function selectMenu(title, options) {
  let idx = 0;
  cursorHide();
  clear();
  process.stdout.write(`${title}\n\n`);
  const render = () => {
    clear();
    process.stdout.write(`${title}\n\n`);
    options.forEach((opt, i) => {
      const marker = i === idx ? '> ' : '  ';
      process.stdout.write(`${marker}${opt}\n`);
    });
    process.stdout.write('\nUse ↑/↓ y Enter • Esc para volver\n');
  };
  render();
  return new Promise((resolve) => {
    const onKey = (str, key) => {
      if (key.name === 'up') { idx = (idx - 1 + options.length) % options.length; render(); }
      else if (key.name === 'down') { idx = (idx + 1) % options.length; render(); }
      else if (key.name === 'return') { process.stdin.off('keypress', onKey); cursorShow(); resolve(options[idx]); }
      else if (key.name === 'escape') { process.stdin.off('keypress', onKey); cursorShow(); resolve(null); }
    };
    process.stdin.on('keypress', onKey);
  });
}

// Helpers para DB Wipe
function parseDbName(uri) {
  try {
    const noParams = uri.split('?')[0];
    const parts = noParams.split('/');
    return parts[parts.length - 1] || '(desconocida)';
  } catch (_) {
    return '(desconocida)';
  }
}

async function confirmDestructiveAction(dbName) {
  clear();
  console.log('⚠️  ADVERTENCIA: Esta acción eliminará TODOS los datos.');
  console.log('Base de datos objetivo: ' + dbName);
  console.log('Se realizará un DROP completo de la base de datos.\n');
  console.log('Escribe exactamente: DROP ' + dbName);
  const first = await question('Confirmación #1: ');
  if (first !== `DROP ${dbName}`) { console.log('❌ Confirmación incorrecta. Abortando.'); return false; }
  console.log('\nSegunda confirmación requerida. Escribe: YES I UNDERSTAND');
  const second = await question('Confirmación #2: ');
  if (second !== 'YES I UNDERSTAND') { console.log('❌ Confirmación incorrecta. Abortando.'); return false; }
  return true;
}

async function dropAllCollections(conn) {
  const db = conn.connection.db;
  const collections = await db.listCollections().toArray();
  if (collections.length === 0) {
    console.log('ℹ️  No hay colecciones.');
    return;
  }
  console.log(`Eliminando ${collections.length} colecciones...`);
  for (const c of collections) {
    try {
      await db.dropCollection(c.name);
      console.log(`✔️  Drop: ${c.name}`);
    } catch (err) {
      console.error(`❌ Error en ${c.name}:`, err.message);
    }
  }
}

// Premium servers handlers
async function handlePremiumServers() {
  while (true) {
    const choice = await selectMenu('Servidores Premium', [
      'Listar servidores premium',
      'Agregar servidor premium',
      'Eliminar servidor premium',
      'Volver'
    ]);
    if (!choice || choice === 'Volver') return;
    if (choice === 'Listar servidores premium') {
      const servers = await getPremiumServers();
      clear();
      console.log('Servidores premium:');
      servers.forEach(s => console.log(`• ${s.guildName} (${s.guildId})`));
      await question('\nEnter para continuar...');
    } else if (choice === 'Agregar servidor premium') {
      const guildId = await question('Guild ID: ');
      const guildName = await question('Nombre del servidor: ');
      await getOrCreateServer(guildId, guildName);
      await updateServerPremium(guildId, true);
      console.log('Servidor marcado como premium.');
      await question('Enter para continuar...');
    } else if (choice === 'Eliminar servidor premium') {
      const guildId = await question('Guild ID: ');
      await updateServerPremium(guildId, false);
      console.log('Servidor desmarcado como premium.');
      await question('Enter para continuar...');
    }
  }
}

// Upload weapons handler - Migrated from Discord command
async function handleUploadWeapons() {
  clear();
  console.log('🔄 Iniciando carga de armas desde weapons.json...\n');
  
  const weaponsPath = path.join(__dirname, '../src/weapons/weapons.json');
  
  if (!fs.existsSync(weaponsPath)) {
    console.error('❌ Archivo de armas no encontrado:', weaponsPath);
    console.log('\n💡 Solución: Asegúrate de que el archivo weapons.json existe en la carpeta correcta.');
    await question('\nEnter para continuar...');
    return;
  }

  try {
    console.log('📖 Leyendo archivo weapons.json...');
    const jsonContent = fs.readFileSync(weaponsPath, 'utf8');
    const weaponsData = JSON.parse(jsonContent);

    if (!weaponsData.weapons || typeof weaponsData.weapons !== 'object') {
      throw new Error("La estructura del JSON debe contener una propiedad 'weapons' como objeto.");
    }

    let createdCount = 0;
    let deletedCount = 0;
    let failedCount = 0;

    console.log('🗑️  Eliminando armas existentes...');
    const deleteResult = await Weapon.deleteMany({});
    deletedCount = deleteResult.deletedCount;
    console.log(`   Eliminadas: ${deletedCount} armas`);

    console.log('\n📥 Procesando categorías de armas...');
    
    for (const categoryKey in weaponsData.weapons) {
      const categoryData = weaponsData.weapons[categoryKey];
      const categoryDisplayName = categoryData.displayName;
      const categoryDefaultEmoji = categoryData.defaultEmoji;

      console.log(`   Procesando categoría: ${categoryDisplayName} (${categoryKey})`);

      for (const weaponItem of categoryData.data) {
        const { emoji, name, image = "", url = "" } = weaponItem;
        const emojiId = emoji;

        if (!emojiId || !name) {
          console.warn(`   ⚠️  Arma inválida (sin emojiId o nombre):`, weaponItem);
          failedCount++;
          continue;
        }

        try {
          await Weapon.create({
            emojiId,
            name,
            category: categoryKey,
            categoryDisplayName,
            categoryDefaultEmoji,
            image,
            url,
            isActive: true
          });
          createdCount++;
        } catch (dbError) {
          console.error(`   ❌ Error al procesar arma ${name} (${emojiId}):`, dbError.message);
          failedCount++;
        }
      }
    }

    console.log('\n✅ Carga de armas completada:');
    console.log(`   • Armas creadas: ${createdCount}`);
    console.log(`   • Armas eliminadas: ${deletedCount}`);
    console.log(`   • Armas fallidas: ${failedCount}`);
    
    if (failedCount > 0) {
      console.log('\n⚠️  Algunas armas no pudieron ser procesadas. Revisa los logs anteriores.');
    }

  } catch (error) {
    console.error('\n❌ Error durante la carga de armas:', error.message);
    console.log('\n💡 Solución: Verifica que el archivo weapons.json tenga la estructura correcta.');
    console.log('   Estructura esperada:');
    console.log('   {');
    console.log('     "weapons": {');
    console.log('       "categoria": {');
    console.log('         "displayName": "Nombre",');
    console.log('         "defaultEmoji": "emojiId",');
    console.log('         "data": [');
    console.log('           { "name": "Arma", "emoji": "emojiId", "image": "", "url": "" }');
    console.log('         ]');
    console.log('       }');
    console.log('     }');
    console.log('   }');
  }
  
  await question('\nEnter para continuar...');
}

// Authorized users handlers
async function handleAuthorizedUsers() {
  while (true) {
    const choice = await selectMenu('Usuarios autorizados (scanner)', [
      'Listar usuarios',
      'Autorizar usuario',
      'Revocar usuario',
      'Importar lista de IDs',
      'Volver'
    ]);
    if (!choice || choice === 'Volver') return;
    if (choice === 'Listar usuarios') {
      const users = await AuthorizedUserService.getAuthorizedUsers(true);
      clear();
      console.log('Usuarios autorizados activos:');
      users.forEach(u => console.log(`• ${u.username || '-'} (${u.userId})`));
      await question('\nEnter para continuar...');
    } else if (choice === 'Autorizar usuario') {
      const userId = await question('User ID: ');
      const username = await question('Username (opcional): ');
      const reason = await question('Razón (opcional): ');
      const by = process.env.CLIENT_ID || 'cli';
      const res = await AuthorizedUserService.authorizeUser(userId, by, username || null, reason || null);
      console.log(res.success ? 'Usuario autorizado.' : `Error: ${res.message}`);
      await question('Enter para continuar...');
    } else if (choice === 'Revocar usuario') {
      const userId = await question('User ID: ');
      const by = process.env.CLIENT_ID || 'cli';
      const res = await AuthorizedUserService.revokeUser(userId, by);
      console.log(res.success ? 'Usuario revocado.' : `Error: ${res.message}`);
      await question('Enter para continuar...');
    } else if (choice === 'Importar lista de IDs') {
      const ids = await question('IDs separados por coma: ');
      const reason = await question('Razón (opcional): ');
      const by = process.env.CLIENT_ID || 'cli';
      const arr = ids.split(',').map(s => s.trim()).filter(Boolean);
      const res = await AuthorizedUserService.importUsers(arr, by, reason || undefined);
      console.log(`Importación: ${res.success} nuevos, ${res.existing} existentes, ${res.failed} fallos.`);
      if (res.errors?.length) console.log('Errores:', res.errors.join('; '));
      await question('Enter para continuar...');
    }
  }
}

// DB Wipe handler
async function handleDbWipe() {
  const mongoURI = process.env.MONGODB_URI;
  if (!mongoURI) {
    clear();
    console.error('❌ MONGODB_URI no está definido en el entorno. Configure .env y ejecute el CLI con --env-file=.env');
    await question('Enter para continuar...');
    return;
  }
  const dbName = parseDbName(mongoURI);
  const ok = await confirmDestructiveAction(dbName);
  if (!ok) return;

  clear();
  console.log('Conexión actual establecida. Ejecutando dropDatabase...');
  try {
    await mongoose.connection.dropDatabase();
    console.log('✔️  dropDatabase ejecutado correctamente.');
  } catch (err) {
    console.warn('⚠️  dropDatabase falló:', err.message);
    console.log('Intentando eliminar colecciones individualmente...');
    await dropAllCollections(mongoose);
  }

  const remaining = await mongoose.connection.db.listCollections().toArray();
  if (remaining.length === 0) {
    console.log('\n✅ Base de datos limpiada completamente.');
  } else {
    console.log(`\n⚠️  Aún quedan ${remaining.length} colecciones: ${remaining.map(c => c.name).join(', ')}`);
  }
  await question('Enter para continuar...');
}

// Delete all global commands
async function handleDeleteGlobalCommands() {
  clear();
  const token = process.env.DISCORD_TOKEN || process.env.TOKEN;
  const clientId = process.env.CLIENT_ID;
  if (!token || !clientId) {
    console.error('DISCORD_TOKEN y CLIENT_ID son requeridos.');
    await question('Enter para continuar...');
    return;
  }
  const rest = new REST({ version: '10' }).setToken(token);
  await rest.put(Routes.applicationCommands(clientId), { body: [] });
  console.log('Todos los comandos globales han sido eliminados.');
  await question('Enter para continuar...');
}

async function main() {
  try {
    await connectDB();
    while (true) {
      const choice = await selectMenu('Chuny CLI - Gestión del BOT', [
        'Servidores Premium',
        'Subir armas a la base de datos',
        'Usuarios autorizados (scanner)',
        'Eliminar TODA la base de datos (DROP)',
        'Eliminar comandos globales',
        'Salir'
      ]);
      if (!choice || choice === 'Salir') break;
      if (choice === 'Servidores Premium') await handlePremiumServers();
      else if (choice === 'Subir armas a la base de datos') await handleUploadWeapons();
      else if (choice === 'Usuarios autorizados (scanner)') await handleAuthorizedUsers();
      else if (choice === 'Eliminar TODA la base de datos (DROP)') await handleDbWipe();
      else if (choice === 'Eliminar comandos globales') await handleDeleteGlobalCommands();
    }
  } catch (error) {
    console.error('[CLI] Error:', error);
  } finally {
    cursorShow();
    rl.close();
    process.exit(0);
  }
}

main();