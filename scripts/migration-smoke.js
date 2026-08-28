/**
 * Prueba de humo de src/services/raidStateMigration.js contra un snapshot
 * legacy sintético (mismo formato de texto que producía el events.js
 * pre-refactor). No requiere BD ni Discord: se stubea templateService.
 */
const assert = require('assert');
const path = require('path');
const Module = require('module');

// --- Stub de templateService.getTemplateByName (evita tocar la BD real) ---
const template = {
  weapons: {
    group_1: {
      displayName: 'DPS',
      defaultEmoji: '111',
      max_players: 2,
      data: [
        { name: 'Daga doble', label: 'Daga doble (A)', units: 1, emoji: '1' },
        { name: 'Daga doble', label: 'Daga doble (B)', units: 1, emoji: '1' },
      ],
    },
    group_2: {
      displayName: 'Tank',
      defaultEmoji: '222',
      data: [{ name: 'Maza íncubo', units: 1, emoji: '2' }],
    },
  },
};

const templateServicePath = require.resolve('../src/services/templateService');
require.cache[templateServicePath] = new Module(templateServicePath);
require.cache[templateServicePath].exports = {
  getTemplateByName: async () => template,
};

const { migrateFromSnapshot } = require('../src/services/raidStateMigration');
const raidState = require('../src/services/raidState');

const ZWSP = '​';

const snapshot = {
  fields: [
    { name: 'Líder de la actividad:', value: '<@111111111111111111>' },
    { name: 'Hora de la actividad:', value: '<t:1:F>' },
    { name: 'Armas a utilizar:', value: 'Revisa la lista de armas en el mensaje anclado.' },
    // El renderer legacy (pre-refactor) escribía siempre el nombre de catálogo
    // ("Daga doble"), nunca la etiqueta — las etiquetas son un campo nuevo que
    // no existía cuando se generó este snapshot. La migración debe repartir
    // ambas líneas entre los dos slots homónimos por orden de llegada (FIFO).
    {
      name: '<:111:111> DPS (2/2):',
      value: '<:weapon:1> Daga doble <@222222222222222222>\n<:weapon:1> Daga doble <@333333333333333333>',
    },
    { name: '<:222:222> Tank (0/1):', value: ZWSP },
    { name: '👥 Participantes', value: '2' },
    {
      name: '🕒 Lista de espera',
      value: `<:weapon:2> Maza íncubo — <@444444444444444444>\n<@555555555555555555>`,
    },
    { name: '🚫 No puedo ir', value: '<@666666666666666666>' },
  ],
};

async function run() {
  const raidDoc = {
    templateName: 'Test Template',
    guildId: 'guild1',
    disabledWeapons: [],
    embedSnapshot: snapshot,
    stateVersion: 1,
  };

  const result = await migrateFromSnapshot(raidDoc);
  console.log('resultado:', JSON.stringify(result, null, 2));
  assert.strictEqual(result.ok, true, 'la migración debe tener éxito');
  assert.strictEqual(raidDoc.stateVersion, 2);
  assert.strictEqual(raidDoc.leaderId, '111111111111111111');

  // Las dos builds de "Daga doble" deben tener EXACTAMENTE un usuario cada una,
  // no un conteo cruzado (esto es lo que estaba roto antes del refactor).
  const slotA = raidDoc.slots.find(s => s.groupKey === 'group_1' && s.itemIndex === 0);
  const slotB = raidDoc.slots.find(s => s.groupKey === 'group_1' && s.itemIndex === 1);
  assert.strictEqual(slotA.users.length, 1);
  assert.strictEqual(slotA.users[0].userId, '222222222222222222');
  assert.strictEqual(slotB.users.length, 1);
  assert.strictEqual(slotB.users[0].userId, '333333333333333333');

  const { current, max } = raidState.groupOccupancy(raidDoc, 'group_1');
  assert.strictEqual(current, 2);
  assert.strictEqual(max, 2);

  // Waitlist: la línea con nombre de arma resuelve slotIds; la línea legacy
  // (solo mención) queda como comodín (slotIds: []).
  assert.strictEqual(raidDoc.waitlist.length, 2);
  const withPref = raidDoc.waitlist.find(w => w.userId === '444444444444444444');
  const wildcard = raidDoc.waitlist.find(w => w.userId === '555555555555555555');
  assert.ok(withPref.slotIds.includes('group_2~0'));
  assert.deepStrictEqual(wildcard.slotIds, []);

  assert.strictEqual(raidDoc.cannotGo.length, 1);
  assert.strictEqual(raidDoc.cannotGo[0].userId, '666666666666666666');

  assert.strictEqual(result.orphanCount, 0);
  assert.strictEqual(result.discardedLines, 0);

  console.log('\nTodas las verificaciones de la migración pasaron.');
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
