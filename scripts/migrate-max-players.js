#!/usr/bin/env node
/**
 * Migración: añade max_players a todos los grupos de templates existentes.
 *
 * Si un grupo NO tiene max_players definido, se calcula como:
 *   max_players = suma de los cupos (units) de todas las armas del grupo
 *
 * Uso:
 *   node scripts/migrate-max-players.js
 */

const { connectDB } = require('../src/database/connection');
const Template = require('../src/database/models/Template');

async function migrateMaxPlayers() {
  await connectDB();

  console.log('[MIGRATE] Conectado a la base de datos.');

  const templates = await Template.find({});
  console.log(`[MIGRATE] Templates encontrados: ${templates.length}`);

  let templatesUpdated = 0;
  let groupsUpdated = 0;

  for (const template of templates) {
    let templateChanged = false;
    const weapons = template.weapons;

    if (!weapons || typeof weapons !== 'object') continue;

    const entries = Array.isArray(weapons)
      ? weapons.map((g, i) => [String(i), g])
      : Object.entries(weapons);

    for (const [key, group] of entries) {
      if (!group || typeof group !== 'object') continue;

      if (group.max_players === undefined || group.max_players === null) {
        const weaponsArray = Array.isArray(group.data) ? group.data : [];
        const computed = weaponsArray.reduce((acc, w) => acc + (parseInt(w.units) || 0), 0);

        console.log(
          `[MIGRATE] Template "${template.title}" (${template._id}) — grupo "${group.displayName || key}": max_players = ${computed}`
        );

        // Modificar directamente el documento mixed usando markModified
        if (Array.isArray(weapons)) {
          weapons[parseInt(key)].max_players = computed;
        } else {
          template.weapons[key].max_players = computed;
        }

        templateChanged = true;
        groupsUpdated++;
      }
    }

    if (templateChanged) {
      template.markModified('weapons');
      await template.save();
      templatesUpdated++;
    }
  }

  console.log(`[MIGRATE] Migración completada.`);
  console.log(`[MIGRATE] Templates actualizados: ${templatesUpdated}`);
  console.log(`[MIGRATE] Grupos actualizados: ${groupsUpdated}`);

  process.exit(0);
}

migrateMaxPlayers().catch(err => {
  console.error('[MIGRATE] Error durante la migración:', err);
  process.exit(1);
});
