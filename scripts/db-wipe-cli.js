#!/usr/bin/env node
const mongoose = require('mongoose');
const readline = require('readline');

// Utilidades de consola
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (q) => new Promise(res => rl.question(q, ans => res(ans.trim())));

function parseDbName(uri) {
  try {
    // Soporta mongodb+srv y mongodb estándar
    // Tomar la parte después del último '/', antes del '?'
    const noParams = uri.split('?')[0];
    const parts = noParams.split('/');
    const dbName = parts[parts.length - 1];
    return dbName || '(desconocida)';
  } catch (_) {
    return '(desconocida)';
  }
}

async function confirmDestructiveAction(dbName) {
  console.log('\n⚠️  ADVERTENCIA CRÍTICA: Esta acción eliminará TODOS los datos de la base de datos.');
  console.log('   • Base de datos objetivo: ' + dbName);
  console.log('   • Se realizará un DROP completo de la base de datos.');
  console.log('   • Esta acción es irreversible.');
  console.log('\nPara continuar, escribe exactamente: DROP ' + dbName + '\n');

  const phrase = await question('Confirmación #1: ');
  if (phrase !== `DROP ${dbName}`) {
    console.log('❌ Confirmación incorrecta. Abortando.');
    return false;
  }

  console.log('\nSegunda confirmación requerida. Escribe: YES I UNDERSTAND');
  const second = await question('Confirmación #2: ');
  if (second !== 'YES I UNDERSTAND') {
    console.log('❌ Confirmación incorrecta. Abortando.');
    return false;
  }
  return true;
}

async function dropAllCollections(connection) {
  const db = connection.connection.db;
  const collections = await db.listCollections().toArray();
  if (collections.length === 0) {
    console.log('ℹ️  No hay colecciones que eliminar.');
    return;
  }
  console.log(`Eliminando ${collections.length} colecciones...`);
  for (const c of collections) {
    try {
      await db.dropCollection(c.name);
      console.log(`✔️  Drop collection: ${c.name}`);
    } catch (err) {
      console.error(`❌ Error eliminando ${c.name}:`, err.message);
    }
  }
}

async function main() {
  try {
    const mongoURI = process.env.MONGODB_URI;
    if (!mongoURI) {
      console.error('❌ MONGODB_URI no está definido en el entorno. Configure .env y ejecute con --env-file=.env');
      process.exit(1);
    }

    const dbName = parseDbName(mongoURI);
    console.log('Chuny BOT • DB Wipe CLI');
    console.log('Conexión: ' + mongoURI.replace(/:[^@]*@/, ':***@'));
    console.log('Base de datos: ' + dbName);

    const ok = await confirmDestructiveAction(dbName);
    if (!ok) {
      rl.close();
      process.exit(0);
    }

    console.log('\nConectando a MongoDB...');
    await mongoose.connect(mongoURI);
    console.log('✔️  Conectado.');

    // Intentar dropDatabase primero
    try {
      await mongoose.connection.dropDatabase();
      console.log('✔️  dropDatabase ejecutado correctamente.');
    } catch (err) {
      console.warn('⚠️  dropDatabase falló:', err.message);
      console.log('Intentando eliminar colecciones individualmente...');
      await dropAllCollections(mongoose);
    }

    // Verificación post-drop
    const remaining = await mongoose.connection.db.listCollections().toArray();
    if (remaining.length === 0) {
      console.log('\n✅ Base de datos limpiada completamente.');
    } else {
      console.log(`\n⚠️  Aún quedan ${remaining.length} colecciones: ${remaining.map(c => c.name).join(', ')}`);
      console.log('Intenta ejecutar nuevamente o verifica permisos del usuario de MongoDB.');
    }

    await mongoose.disconnect();
    rl.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error durante el proceso de borrado:', error);
    try { await mongoose.disconnect(); } catch (_) {}
    rl.close();
    process.exit(1);
  }
}

main();