/**
 * Script para verificar el estado actual de la colección AuthorizedRole
 */

const mongoose = require('mongoose');

const AuthorizedRole = require('./src/database/models/AuthorizedRole');

async function checkAuthorizedRoles() {
  try {
    console.log('🔄 Conectando a MongoDB...');

    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('✅ Conectado a MongoDB');
    console.log('🔍 Base de datos:', process.env.MONGODB_URI);
    console.log('');

    const collectionName = AuthorizedRole.collection.collectionName;
    console.log(`📋 Nombre de colección: ${collectionName}`);

    const count = await AuthorizedRole.countDocuments();
    console.log(`📊 Total de documentos: ${count}`);

    if (count > 0) {
      console.log('');
      console.log('📄 Documentos encontrados:');
      console.log('='.repeat(50));

      const docs = await AuthorizedRole.find().limit(10);
      docs.forEach((doc, index) => {
        console.log(`${index + 1}. ID: ${doc._id}`);
        console.log(`   Role ID: ${doc.roleId}`);
        console.log(`   Role Name: ${doc.roleName}`);
        console.log(`   Server ID: ${doc.serverId}`);
        console.log(`   Added By: ${doc.addedBy}`);
        console.log(`   Added At: ${doc.addedAt}`);
        console.log('');
      });

      if (count > 10) {
        console.log(`... y ${count - 10} documentos más`);
      }
    } else {
      console.log('✅ La colección está vacía');
    }

    console.log('');
    console.log('🔍 Verificación directa en MongoDB:');
    const db = mongoose.connection.db;
    const collection = db.collection(collectionName);
    const directCount = await collection.countDocuments();
    console.log(`📊 Conteo directo: ${directCount}`);

    if (directCount > 0) {
      const directDocs = await collection.find().limit(5).toArray();
      console.log('📄 Primeros documentos (acceso directo):');
      directDocs.forEach((doc, index) => {
        console.log(`${index + 1}. ${JSON.stringify(doc, null, 2)}`);
      });
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Conexión cerrada');
    process.exit(0);
  }
}

if (!process.env.MONGODB_URI) {
  console.error('❌ Error: Variable MONGODB_URI no encontrada');
  process.exit(1);
}

checkAuthorizedRoles();
