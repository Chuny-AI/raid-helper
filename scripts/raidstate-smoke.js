/**
 * Prueba de humo de src/services/raidState.js — sin Discord ni BD.
 * Ejercita el caso exacto pedido por el usuario: un grupo "DPS" con max_players
 * 3 y tres entradas de "Daga doble" (variante A: units 3/3/3, variante B: 1/1/1).
 * Uso: node scripts/raidstate-smoke.js
 */
const assert = require('assert');
const {
  buildInitialState,
  joinSlot,
  setCannotGo,
  addToWaitlist,
  promoteFromWaitlist,
  availableSlots,
  groupOccupancy,
  isRaidFull,
  countActiveParticipants,
} = require('../src/services/raidState');

function makeTemplate(unitsPerItem) {
  return {
    weapons: {
      group_1: {
        displayName: 'DPS',
        defaultEmoji: '123',
        max_players: 3,
        data: [
          { name: 'Daga doble', label: 'Daga doble (Build A)', units: unitsPerItem, emoji: '1', url: 'https://a' },
          { name: 'Daga doble', label: 'Daga doble (Build B)', units: unitsPerItem, emoji: '1', url: 'https://b' },
          { name: 'Daga doble', label: 'Daga doble (Build C)', units: unitsPerItem, emoji: '1', url: 'https://c' },
        ],
      },
    },
  };
}

function u(id) {
  return { userId: id, username: `user-${id}` };
}

function run(unitsPerItem, label) {
  console.log(`\n=== Variante ${label} (units=${unitsPerItem}) ===`);
  const state = buildInitialState({ template: makeTemplate(unitsPerItem), leaderId: 'leader1' });

  assert.strictEqual(state.slots.length, 3, 'debe haber 3 slots (uno por build)');
  assert.strictEqual(state.groups[0].maxPlayers, 3, 'max del grupo debe ser 3');
  assert.strictEqual(availableSlots(state).length, 3, 'las 3 opciones deben estar disponibles al inicio');

  // Tres usuarios se reparten en las tres builds (cada slotId = group_1~0/1/2)
  let r = joinSlot(state, 'group_1~0', u('1'));
  assert.strictEqual(r.ok, true);
  r = joinSlot(state, 'group_1~1', u('2'));
  assert.strictEqual(r.ok, true);
  r = joinSlot(state, 'group_1~2', u('3'));
  assert.strictEqual(r.ok, true);

  assert.deepStrictEqual(groupOccupancy(state, 'group_1'), { current: 3, max: 3 });
  assert.strictEqual(availableSlots(state).length, 0, 'el GRUPO lleno debe ocultar las 3 opciones aunque las armas individuales no estén en su tope');
  assert.strictEqual(isRaidFull(state), true);
  assert.strictEqual(countActiveParticipants(state), 3);

  // Un cuarto no puede entrar (por cupo de grupo, o de arma si además esa arma
  // individual ya está en su propio tope, como ocurre en la variante 1/1/1)
  r = joinSlot(state, 'group_1~0', u('4'));
  assert.strictEqual(r.ok, false);
  assert.ok(['group_full', 'slot_full'].includes(r.reason), `reason inesperado: ${r.reason}`);

  // Cuarto usuario entra a lista de espera pidiendo específicamente la Build B
  addToWaitlist(state, u('4'), ['group_1~1']);

  // El usuario 2 (Build B) marca "no puedo ir" -> libera su slot
  const cannotGoResult = setCannotGo(state, u('2'));
  assert.strictEqual(cannotGoResult.ok, true);
  assert.deepStrictEqual(cannotGoResult.freedSlotIds, ['group_1~1']);
  // Con units=1 por arma, solo la build liberada tiene hueco propio (1 opción).
  // Con units=3 por arma, las 3 builds tenían hueco individual y solo esperaban
  // cupo de GRUPO, así que las 3 reaparecen al liberarse 1 cupo de grupo.
  const expectedAvailable = unitsPerItem === 1 ? 1 : 3;
  assert.strictEqual(availableSlots(state).length, expectedAvailable, 'reaparecen las opciones correctas');

  // Promoción automática desde waitlist
  const promoted = promoteFromWaitlist(state, cannotGoResult.freedSlotIds);
  assert.strictEqual(promoted.length, 1);
  assert.strictEqual(promoted[0].userId, '4');
  assert.strictEqual(promoted[0].slotId, 'group_1~1');
  assert.strictEqual(availableSlots(state).length, 0, 'vuelve a estar lleno tras la promoción');
  assert.strictEqual(countActiveParticipants(state), 3);

  console.log('OK:', label);
}

run(3, '3/3/3');
run(1, '1/1/1');

console.log('\nTodas las verificaciones de raidState pasaron.');
