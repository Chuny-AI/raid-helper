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
  joinLooter,
  leaveLooter,
  toggleCannotGo,
  kickUser,
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

/**
 * Un usuario ocupa un único estado a la vez: plaza, lista de espera, "no puedo
 * ir" o looter. Antes ser looter se pegaba a cualquier otro estado y quien
 * decía "no puedo ir" seguía apareciendo en la lista de looters.
 */
function runLooterExclusivity() {
  console.log('\n=== Looter como estado excluyente ===');

  /** Raid completo (3/3) con cupo para 2 looters. */
  const fullRaid = () => {
    const state = buildInitialState({
      template: makeTemplate(1),
      leaderId: 'leader1',
      lootersMax: 2,
    });
    joinSlot(state, 'group_1~0', u('1'));
    joinSlot(state, 'group_1~1', u('2'));
    joinSlot(state, 'group_1~2', u('3'));
    assert.strictEqual(isRaidFull(state), true, 'el raid debe estar lleno para poder ser looter');
    return state;
  };
  const looterIds = (state) => state.looters.users.map((l) => l.userId);

  // Un looter que dice "no puedo ir" deja de ser looter.
  let state = fullRaid();
  assert.strictEqual(joinLooter(state, u('9')).ok, true);
  assert.deepStrictEqual(looterIds(state), ['9']);
  toggleCannotGo(state, u('9'));
  assert.deepStrictEqual(looterIds(state), [], 'el looter debe salir de looters al marcar "no puedo ir"');
  assert.deepStrictEqual(state.cannotGo.map((c) => c.userId), ['9']);

  // Un looter que se pasa a la lista de espera deja de ser looter.
  state = fullRaid();
  joinLooter(state, u('9'));
  addToWaitlist(state, u('9'), ['group_1~0']);
  assert.deepStrictEqual(looterIds(state), [], 'el looter debe salir de looters al pasar a lista de espera');
  assert.deepStrictEqual(state.waitlist.map((w) => w.userId), ['9']);

  // Un looter que consigue plaza deja de ser looter.
  state = fullRaid();
  joinLooter(state, u('9'));
  toggleCannotGo(state, u('2')); // libera group_1~1
  assert.strictEqual(joinSlot(state, 'group_1~1', u('9')).ok, true);
  assert.deepStrictEqual(looterIds(state), [], 'el looter debe salir de looters al ocupar plaza');

  // Y al revés: quien tiene plaza y se pasa a looter la suelta, y ese hueco
  // sirve para promover a alguien de la lista de espera.
  state = fullRaid();
  addToWaitlist(state, u('4'), ['group_1~0']);
  const result = joinLooter(state, u('1'));
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.freedSlotIds, ['group_1~0'], 'pasar a looter libera la plaza');
  assert.strictEqual(countActiveParticipants(state), 2, 'el nuevo looter ya no ocupa plaza');
  const promoted = promoteFromWaitlist(state, result.freedSlotIds);
  assert.deepStrictEqual(promoted.map((p) => p.userId), ['4'], 'el hueco liberado se promueve');
  assert.strictEqual(isRaidFull(state), true, 'el raid vuelve a estar lleno tras la promoción');
  assert.deepStrictEqual(looterIds(state), ['1']);

  // /raid kick sigue informando de que el expulsado era looter.
  state = fullRaid();
  joinLooter(state, u('9'));
  assert.deepStrictEqual(kickUser(state, '9'), { wasInSlot: false, freedSlotIds: [], wasLooter: true });
  assert.deepStrictEqual(looterIds(state), []);

  // Raids antiguos sin sección de looters no deben romper nada.
  const sinLooters = buildInitialState({ template: makeTemplate(1), leaderId: 'leader1' });
  delete sinLooters.looters;
  assert.strictEqual(leaveLooter(sinLooters, '1').ok, false);
  assert.strictEqual(joinSlot(sinLooters, 'group_1~0', u('1')).ok, true);

  console.log('OK: looter excluyente');
}

run(3, '3/3/3');
run(1, '1/1/1');
runLooterExclusivity();

console.log('\nTodas las verificaciones de raidState pasaron.');
