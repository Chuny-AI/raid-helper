#!/usr/bin/env node
/**
 * Migración de templates existentes:
 *  1. Normaliza cada grupo al formato canónico "data" (un grupo guardado en
 *     formato legacy "categories" es ilegible para el renderizador del raid
 *     y desaparece del embed en silencio — ver src/utils/templateShape.js).
 *  2. Si un grupo NO tiene max_players definido, lo calcula como la suma de
 *     los cupos (units) de todas sus armas.
 *
 * Uso:
 *   node scripts/migrate-max-players.js
 */

const { connectDB } = require('../src/database/connection');
const Template = require('../src/database/models/Template');
const { normalizeGroupToData, computeGroupMaxPlayers } = require('../src/utils/templateShape');

async function migrateMaxPlayers() {
  await connectDB();

  console.log('[MIGRATE] Conectado a la base de datos.');

  const templates = await Template.find({});
  console.log(`[MIGRATE] Templates encontrados: ${templates.length}`);

  let templatesUpdated = 0;
  let groupsNormalized = 0;
  let groupsMaxPlayersSet = 0;

  for (const template of templates) {
    let templateChanged = false;
    const weapons = template.weapons;

    if (!weapons || typeof weapons !== 'object') continue;

    const entries = Array.isArray(weapons)
      ? weapons.map((g, i) => [String(i), g])
      : Object.entries(weapons);

    for (const [key, group] of entries) {
      if (!group || typeof group !== 'object') continue;

      const wasCategoriesFormat = Array.isArray(group.categories) && !Array.isArray(group.data);
      const hadMaxPlayers = group.max_players !== undefined && group.max_players !== null;

      const normalized = normalizeGroupToData(group);
      if (!hadMaxPlayers) {
        normalized.max_players = computeGroupMaxPlayers(normalized);
        groupsMaxPlayersSet++;
        console.log(
          `[MIGRATE] Template "${template.title}" (${template._id}) — grupo "${normalized.displayName || key}": max_players = ${normalized.max_players}`
        );
      } else {
        normalized.max_players = group.max_players;
      }

      if (wasCategoriesFormat) {
        groupsNormalized++;
        console.log(
          `[MIGRATE] Template "${template.title}" (${template._id}) — grupo "${normalized.displayName || key}": convertido de "categories" a "data" (${normalized.data.length} arma(s))`
        );
      }

      if (Array.isArray(weapons)) {
        weapons[parseInt(key, 10)] = normalized;
      } else {
        template.weapons[key] = normalized;
      }
      templateChanged = true;
    }

    if (templateChanged) {
      template.markModified('weapons');
      await template.save();
      templatesUpdated++;
    }
  }

  console.log(`[MIGRATE] Migración completada.`);
  console.log(`[MIGRATE] Templates actualizados: ${templatesUpdated}`);
  console.log(`[MIGRATE] Grupos convertidos de "categories" a "data": ${groupsNormalized}`);
  console.log(`[MIGRATE] Grupos con max_players calculado: ${groupsMaxPlayersSet}`);

  process.exit(0);
}

migrateMaxPlayers().catch(err => {
  console.error('[MIGRATE] Error durante la migración:', err);
  process.exit(1);
});
