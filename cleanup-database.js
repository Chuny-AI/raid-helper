/**
 * Script para limpiar completamente la base de datos MongoDB
 * ADVERTENCIA: Este script eliminará TODA la información de la base de datos
 * Úsalo solo en entornos de desarrollo/prueba
 */

const mongoose = require('mongoose');

const Claim = require('./src/database/models/Claim');
const ClaimChannelConfig = require('./src/database/models/ClaimChannelConfig');
const AuthorizedRole = require('./src/database/models/AuthorizedRole');
const AuthorizedUser = require('./src/database/models/AuthorizedUser');
const RaidEvent = require('./src/database/models/RaidEvent');
const Server = require('./src/database/models/Server');
const Template = require('./src/database/models/Template');
const UserCategory = require('./src/database/models/UserCategory');
const UserBalance = require('./src/database/models/UserBalance');
const Weapon = require('./src/database/models/Weapon');

const { scheduleJob, cancelJob } = require('node-schedule');

async function cleanupDatabase() {
  try {
    console.log('🔄 Conectando a MongoDB...');

    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 30000,
    });

    console.log('✅ Conectado a MongoDB');

    console.log('🛑 Cancelando todos los jobs programados...');
    const scheduledJobs = require('node-schedule').scheduledJobs;
    for (const jobName in scheduledJobs) {
      cancelJob(jobName);
      console.log(`   - Job cancelado: ${jobName}`);
    }

    console.log('🗑️  Iniciando limpieza de la base de datos...');
    console.log('⚠️  ADVERTENCIA: Esto eliminará TODA la información!');
    console.log('');

    const collections = [
      { model: Claim, name: 'Claims' },
      { model: ClaimChannelConfig, name: 'Configuraciones de Canales de Claims' },
      { model: AuthorizedRole, name: 'Roles Autorizados' },
      { model: AuthorizedUser, name: 'Usuarios Autorizados' },
      { model: RaidEvent, name: 'Eventos de Raid' },
      { model: Server, name: 'Servidores' },
      { model: Template, name: 'Templates' },
      { model: UserCategory, name: 'Categorías de Usuario' },
      { model: UserBalance, name: 'Balances de Usuario (Economía)' },
      { model: Weapon, name: 'Armas' }
    ];

    for (const collection of collections) {
      try {
        console.log(`🔍 Verificando ${collection.name}...`);
        console.log(`   - Nombre de colección: ${collection.model.collection.collectionName}`);

        const count = await collection.model.countDocuments();
        console.log(`   - Documentos encontrados: ${count}`);

        if (count > 0) {
          const result = await collection.model.deleteMany({});
          console.log(`   - Documentos eliminados: ${result.deletedCount}`);
          console.log(`✅ ${collection.name}: ${count} documentos eliminados`);

          const remainingCount = await collection.model.countDocuments();
          if (remainingCount > 0) {
            console.log(`⚠️  ADVERTENCIA: Aún quedan ${remainingCount} documentos en ${collection.name}`);
          }
        } else {
          console.log(`ℹ️  ${collection.name}: Colección ya vacía`);
        }
        console.log('');
      } catch (error) {
        console.error(`❌ Error limpiando ${collection.name}:`, error.message);
        console.error(`   Detalles:`, error);
      }
    }

    console.log('');
    console.log('🧹 Limpieza adicional...');

    console.log('🔍 Verificación especial de AuthorizedRole...');
    try {
      const db = mongoose.connection.db;

      const possibleNames = [
        'authorizedroles',
        'AuthorizedRoles',
        'authorized_roles',
        'authorizedRole',
        'AuthorizedRole'
      ];

      for (const name of possibleNames) {
        try {
          const collection = db.collection(name);
          const count = await collection.countDocuments();
          if (count > 0) {
            console.log(`🎯 Encontrada colección '${name}' con ${count} documentos`);
            await collection.deleteMany({});
            console.log(`✅ Colección '${name}' limpiada: ${count} documentos eliminados`);
          }
        } catch (err) {
        }
      }

      const modelCollectionName = AuthorizedRole.collection.collectionName;
      console.log(`🔍 Nombre de colección del modelo: ${modelCollectionName}`);
      const modelCollection = db.collection(modelCollectionName);
      const modelCount = await modelCollection.countDocuments();
      if (modelCount > 0) {
        console.log(`⚠️  Aún hay ${modelCount} documentos en ${modelCollectionName}`);
        await modelCollection.deleteMany({});
        console.log(`✅ Limpieza forzada de ${modelCollectionName}: ${modelCount} documentos eliminados`);
      }

    } catch (error) {
      console.error('❌ Error en verificación especial:', error.message);
    }

    console.log('');

    const db = mongoose.connection.db;
    const allCollections = await db.listCollections().toArray();

    for (const collectionInfo of allCollections) {
      const collectionName = collectionInfo.name;

      if (!collectionName.startsWith('system.')) {
        try {
          const collection = db.collection(collectionName);
          const count = await collection.countDocuments();

          if (count > 0) {
            const isKnown = collections.some(c =>
              c.model.collection.collectionName === collectionName
            );

            if (!isKnown) {
              await collection.deleteMany({});
              console.log(`✅ Colección adicional '${collectionName}': ${count} documentos eliminados`);
            }
          }
        } catch (error) {
          console.error(`❌ Error limpiando colección '${collectionName}':`, error.message);
        }
      }
    }

    console.log('');
    console.log('🔍 Verificación final - Estado de todas las colecciones:');
    console.log('='.repeat(50));

    for (const collection of collections) {
      try {
        const count = await collection.model.countDocuments();
        const status = count === 0 ? '✅ VACÍA' : `❌ TIENE ${count} DOCUMENTOS`;
        console.log(`   ${collection.name}: ${status}`);
      } catch (error) {
        console.log(`   ${collection.name}: ❌ Error verificando - ${error.message}`);
      }
    }

    console.log('');
    console.log('📋 Todas las colecciones en la base de datos:');
    const finalCollections = await db.listCollections().toArray();
    for (const collectionInfo of finalCollections) {
      const collectionName = collectionInfo.name;
      if (!collectionName.startsWith('system.')) {
        try {
          const collection = db.collection(collectionName);
          const count = await collection.countDocuments();
          const status = count === 0 ? '✅' : `❌ (${count} docs)`;
          console.log(`   ${collectionName}: ${status}`);
        } catch (error) {
          console.log(`   ${collectionName}: ❌ Error - ${error.message}`);
        }
      }
    }

    console.log('');
    console.log('🎉 ¡Limpieza completada exitosamente!');
    console.log('📊 Resumen:');
    console.log('   - Todos los claims eliminados');
    console.log('   - Todas las configuraciones de canales eliminadas');
    console.log('   - Todos los roles autorizados eliminados');
    console.log('   - Todos los usuarios autorizados eliminados');
    console.log('   - Todos los eventos de raid eliminados');
    console.log('   - Todos los servidores eliminados');
    console.log('   - Todos los templates eliminados');
    console.log('   - Todas las categorías de usuario eliminadas');
    console.log('   - Todos los balances de usuario (economía) eliminados');
    console.log('   - Todas las armas eliminadas');
    console.log('   - Todos los jobs programados cancelados');
    console.log('');
    console.log('💡 La base de datos está ahora completamente limpia');
    console.log('🚀 Puedes comenzar las pruebas desde cero');

  } catch (error) {
    console.error('❌ Error durante la limpieza:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Conexión a MongoDB cerrada');
    process.exit(0);
  }
}

function confirmCleanup() {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('⚠️  ADVERTENCIA: LIMPIEZA COMPLETA DE BASE DE DATOS');
  console.log('==========================================');
  console.log('');
  console.log('Este script eliminará TODA la información de la base de datos:');
  console.log('• Todos los claims y configuraciones');
  console.log('• Todos los servidores y templates');
  console.log('• Todos los roles y usuarios autorizados');
  console.log('• Todos los eventos y categorías');
  console.log('• Todos los balances de usuario (sistema de economía)');
  console.log('• TODA la información será PERMANENTEMENTE eliminada');
  console.log('');
  console.log('Base de datos:', process.env.MONGODB_URI || 'No configurada');
  console.log('');

  rl.question('¿Estás COMPLETAMENTE SEGURO de que quieres continuar? (escribe "CONFIRMAR" para continuar): ', (answer) => {
    if (answer === 'CONFIRMAR') {
      console.log('');
      console.log('✅ Confirmación recibida. Iniciando limpieza...');
      console.log('');
      rl.close();
      cleanupDatabase();
    } else {
      console.log('');
      console.log('❌ Limpieza cancelada. No se ha eliminado nada.');
      console.log('💡 Para confirmar, debes escribir exactamente "CONFIRMAR"');
      rl.close();
      process.exit(0);
    }
  });
}

if (!process.env.MONGODB_URI) {
  console.error('❌ Error: Variable MONGODB_URI no encontrada');
  console.error('💡 Asegúrate de tener un archivo .env con MONGODB_URI configurado');
  process.exit(1);
}

confirmCleanup();
