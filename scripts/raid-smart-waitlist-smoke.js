#!/usr/bin/env node

const assert = require('node:assert/strict');
const raidState = require('../src/services/raidState');
const raidRegistry = require('../src/services/raidRegistry');
const { renderWaitlistSelect } = require('../src/utils/raidRender');
const { routeRaidInteraction } = require('../src/utils/raidInteractions');

const user = (id) => ({ userId: id, username: `user-${id}` });

const repeatedWeaponTemplate = {
  weapons: Object.fromEntries(Array.from({ length: 5 }, (_, index) => [
    `dps_${index + 1}`,
    {
      displayName: `DPS ${index + 1}`,
      defaultEmoji: '⚔️',
      max_players: 1,
      data: [{ name: 'Falce de cristal', units: 1, emoji: '⚔️' }],
    },
  ])),
};

console.log('\n── Deduplicación entre grupos');

const repeatedState = raidState.buildInitialState({ template: repeatedWeaponTemplate });
assert.equal(repeatedState.slots.length, 5, 'la inscripción normal conserva una plaza por grupo');

const choices = raidState.waitlistWeaponChoices(repeatedState);
assert.equal(choices.length, 1, 'la lista de espera debe mostrar una sola falce');
assert.equal(choices[0].label, 'Falce de cristal');
assert.equal(choices[0].slotIds.length, 5, 'la elección representa las cinco plazas compatibles');
assert.equal(choices[0].groupKeys.length, 5);

const oneWeaponRows = renderWaitlistSelect({ eventId: 'SMART1' }, repeatedState);
assert.equal(oneWeaponRows.length, 1);
const oneWeaponOptions = oneWeaponRows[0].toJSON().components[0].options;
assert.equal(oneWeaponOptions.length, 1);
assert.equal(oneWeaponOptions[0].label, 'Falce de cristal');
assert.match(oneWeaponOptions[0].description, /5 grupos/);

const expanded = raidState.expandWaitlistSlotIds(repeatedState, [oneWeaponOptions[0].value]);
assert.deepEqual(expanded, repeatedState.slots.map((slot) => slot.slotId));
console.log('✅ Una falce visible representa las cinco falces compatibles');

console.log('\n── Promoción inteligente');

for (let index = 0; index < repeatedState.slots.length; index += 1) {
  assert.equal(raidState.joinSlot(repeatedState, repeatedState.slots[index].slotId, user(`p${index}`)).ok, true);
}
raidState.addToWaitlist(repeatedState, user('waiting'), expanded);
const released = raidState.setCannotGo(repeatedState, user('p2'));
const promoted = raidState.promoteFromWaitlist(repeatedState, released.freedSlotIds);
assert.equal(promoted.length, 1);
assert.equal(promoted[0].userId, 'waiting');
assert.equal(promoted[0].slotId, 'dps_3~0');
console.log('✅ Un hueco en cualquier grupo promueve a quien eligió la falce única');

const groupCapacityTemplate = {
  weapons: {
    dps: {
      displayName: 'DPS', defaultEmoji: '⚔️', max_players: 1,
      data: [
        { name: 'Espada', units: 1, emoji: '🗡️' },
        { name: 'Falce de cristal', units: 1, emoji: '⚔️' },
      ],
    },
  },
};
const capacityState = raidState.buildInitialState({ template: groupCapacityTemplate });
raidState.joinSlot(capacityState, 'dps~0', user('sword'));
const falceIds = raidState.expandWaitlistSlotIds(capacityState, ['dps~1']);
raidState.addToWaitlist(capacityState, user('falce'), falceIds);
const swordReleased = raidState.setCannotGo(capacityState, user('sword'));
const capacityPromotion = raidState.promoteFromWaitlist(capacityState, swordReleased.freedSlotIds);
assert.equal(capacityPromotion[0]?.slotId, 'dps~1');
console.log('✅ Liberar cupo de grupo puede promover a otra arma compatible del mismo grupo');

console.log('\n── Paginación sin omisiones');

const manyWeaponsTemplate = {
  weapons: Object.fromEntries(Array.from({ length: 130 }, (_, index) => [
    `group_${index}`,
    {
      displayName: `Grupo ${index}`,
      defaultEmoji: '⚔️',
      max_players: 1,
      data: [{ name: `Arma única ${index}`, units: 1, emoji: '⚔️' }],
    },
  ])),
};
const manyState = raidState.buildInitialState({ template: manyWeaponsTemplate });
const values = [];
for (let page = 0; page < 6; page += 1) {
  const rows = renderWaitlistSelect({ eventId: 'SMART2' }, manyState, page);
  assert(rows.length <= 2, 'el panel debe usar un select y, como máximo, una fila de navegación');
  const json = rows[0].toJSON().components[0];
  assert(json.options.length <= 25, 'ningún select puede superar 25 opciones');
  values.push(...json.options.map((option) => option.value));
  if (page < 5) assert.equal(rows.length, 2, 'las páginas deben incluir navegación');
}
assert.equal(values.length, 130);
assert.equal(new Set(values).size, 130, 'la paginación no debe repetir ni omitir armas');
console.log('✅ 130 armas únicas son accesibles en 6 páginas respetando los límites de Discord');

console.log('\n── Flujo completo de interacción');

const interactionFlow = async () => {
  const state = raidState.buildInitialState({ template: repeatedWeaponTemplate });
  Object.assign(state, {
    eventId: 'SMART3',
    guildId: 'guild',
    status: 'active',
    title: 'Raid inteligente',
    templateName: 'Template',
    save: async () => {},
  });
  for (let index = 0; index < state.slots.length; index += 1) {
    raidState.joinSlot(state, state.slots[index].slotId, user(`full-${index}`));
  }
  raidRegistry.register({ raidId: state.eventId, raid: state, message: null, templateName: state.templateName });

  let opened;
  const openHandled = await routeRaidInteraction({
    customId: 'raid:wait:SMART3',
    guild: { id: 'guild' },
    user: { id: 'waiting', username: 'waiting' },
    message: { id: 'message' },
    deferred: false,
    replied: false,
    async reply(payload) { opened = payload; },
  });
  assert.equal(openHandled, true);
  assert.equal(opened.components[0].toJSON().components[0].options.length, 1);

  const representative = opened.components[0].toJSON().components[0].options[0].value;
  let confirmation;
  const pickHandled = await routeRaidInteraction({
    customId: 'raid:waitpick:SMART3:0',
    values: [representative],
    guild: { id: 'guild' },
    user: { id: 'waiting', username: 'waiting' },
    deferred: false,
    replied: false,
    async update(payload) { confirmation = payload; },
  });
  assert.equal(pickHandled, true);
  assert.equal(state.waitlist.length, 1);
  assert.equal(state.waitlist[0].slotIds.length, 5);
  assert.match(confirmation.content, /Falce de cristal/);
  assert.deepEqual(confirmation.components, []);
  raidRegistry.unregister(state.eventId);
  console.log('✅ El selector real guarda todas las posiciones de la única arma elegida');
};

interactionFlow()
  .then(() => console.log('\nLista de espera inteligente verificada.'))
  .catch((error) => {
    raidRegistry.unregister('SMART3');
    console.error(error);
    process.exitCode = 1;
  });
