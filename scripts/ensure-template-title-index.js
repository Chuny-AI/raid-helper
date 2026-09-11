#!/usr/bin/env node
/**
 * Audita nombres duplicados y crea el índice único de plantillas por servidor.
 *
 * No modifica plantillas. Si encuentra duplicados, termina con error para que
 * se resuelvan manualmente antes de crear el índice.
 *
 * Uso:
 *   node --env-file=.env scripts/ensure-template-title-index.js
 */

const mongoose = require('mongoose');
const Template = require('../src/database/models/Template');

const INDEX_NAME = 'uniq_template_server_title_ci';
const COLLATION = { locale: 'es', strength: 2 };

const findDuplicates = () => Template.aggregate([
  {
    $project: {
      serverId: 1,
      normalizedTitle: { $toLower: { $trim: { input: '$title' } } },
    },
  },
  {
    $group: {
      _id: { serverId: '$serverId', title: '$normalizedTitle' },
      count: { $sum: 1 },
    },
  },
  { $match: { count: { $gt: 1 } } },
]).collation(COLLATION);

const main = async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI no está configurado.');
  await mongoose.connect(process.env.MONGODB_URI);

  const duplicates = await findDuplicates();
  if (duplicates.length > 0) {
    console.error(`[INDEX] Se encontraron ${duplicates.length} nombre(s) duplicado(s).`);
    for (const duplicate of duplicates) {
      console.error(`- Servidor ${duplicate._id.serverId}: "${duplicate._id.title}" (${duplicate.count})`);
    }
    throw new Error('Resuelve los duplicados antes de crear el índice único.');
  }

  const name = await Template.collection.createIndex(
    { serverId: 1, title: 1 },
    { unique: true, name: INDEX_NAME, collation: COLLATION },
  );
  console.log(`[INDEX] Auditoría superada e índice activo: ${name}`);
};

main()
  .catch((error) => {
    console.error(`[INDEX] ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
