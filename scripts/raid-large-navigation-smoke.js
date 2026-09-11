const assert = require('node:assert/strict');
const raidState = require('../src/services/raidState');
const raidRegistry = require('../src/services/raidRegistry');
const { routeRaidInteraction } = require('../src/utils/raidInteractions');

const template = (groups, weapons) => ({
  title: 'Raid masivo',
  weapons: Object.fromEntries(Array.from({ length: groups }, (_, groupIndex) => [
    `group_${groupIndex}`,
    {
      displayName: `DPS ${groupIndex + 1}`,
      defaultEmoji: '1543135270474620968',
      max_players: weapons,
      data: Array.from({ length: weapons }, (_, weaponIndex) => ({
        name: `Arma ${weaponIndex + 1}`,
        units: 1,
        emoji: '1543135270474620968',
      })),
    },
  ])),
});

const component = (customId, extra = {}) => ({
  customId,
  guild: { id: 'guild-large' },
  user: { id: 'user-1', username: 'Jugador' },
  member: { id: 'leader-1', permissions: { has: () => false } },
  message: { id: 'message-large' },
  deferred: false,
  replied: false,
  ...extra,
});

const selectOptions = (payload) => payload.components[0].toJSON().components[0].options;

const run = async () => {
  const raid = raidState.buildInitialState({ template: template(50, 10), leaderId: 'leader-1' });
  Object.assign(raid, {
    eventId: 'LARGE1', guildId: 'guild-large', status: 'active',
    title: 'Raid masivo', templateName: 'Masivo',
    async save() {},
  });
  raidRegistry.register({ raidId: raid.eventId, raid, message: null, templateName: raid.templateName });

  let payload;
  await routeRaidInteraction(component('raid:browse:LARGE1', {
    async reply(value) { payload = value; },
  }));
  assert.equal(selectOptions(payload).length, 25);
  assert.equal(selectOptions(payload)[0].value, 'group_0');

  await routeRaidInteraction(component('raid:grouppage:LARGE1:1', {
    async update(value) { payload = value; },
  }));
  assert.equal(selectOptions(payload).length, 25);
  assert.equal(selectOptions(payload)[0].value, 'group_25');
  assert.equal(selectOptions(payload).at(-1).value, 'group_49');

  await routeRaidInteraction(component('raid:grouppick:LARGE1', {
    values: ['group_49'],
    async update(value) { payload = value; },
  }));
  assert.match(payload.content, /DPS 50/);
  assert.equal(selectOptions(payload).length, 10);

  const selectedSlotId = selectOptions(payload)[9].value;
  await routeRaidInteraction(component('raid:joinpick:LARGE1', {
    values: [selectedSlotId],
    async update(value) { payload = value; },
  }));
  assert.match(payload.content, /Te uniste al raid/);
  assert.equal(raidState.findUserSlot(raid, 'user-1')?.groupKey, 'group_49');
  assert.equal(raidState.findUserSlot(raid, 'user-1')?.slotId, selectedSlotId);

  let modal;
  await routeRaidInteraction(component('raid:groupsearch:LARGE1', {
    async showModal(value) { modal = value; },
  }));
  assert.equal(modal.data.custom_id, 'raid:groupsearchsubmit:LARGE1');

  await routeRaidInteraction(component('raid:groupsearchsubmit:LARGE1', {
    fields: { getTextInputValue: () => 'DPS 50' },
    async update(value) { payload = value; },
  }));
  assert.match(payload.content, /DPS 50/);
  assert.equal(selectOptions(payload).length, 9);
  assert.ok(!selectOptions(payload).some((option) => option.value === selectedSlotId));

  const attendanceRaid = raidState.buildInitialState({ template: template(20, 10), leaderId: 'leader-1' });
  Object.assign(attendanceRaid, {
    eventId: 'LARGE2', guildId: 'guild-large', status: 'closed',
    title: 'Asistencia masiva', templateName: 'Masivo',
  });
  let userIndex = 0;
  for (const slot of attendanceRaid.slots) {
    raidState.joinSlot(attendanceRaid, slot.slotId, {
      userId: `user-${userIndex}`,
      username: `Jugador ${userIndex}`,
    });
    userIndex += 1;
  }
  raidRegistry.register({ raidId: attendanceRaid.eventId, raid: attendanceRaid, message: null });

  await routeRaidInteraction(component('raid:attpage:LARGE2:7', {
    async update(value) { payload = value; },
  }));
  assert.match(payload.content, /Página \*\*8\/8\*\*/);
  assert.equal(selectOptions(payload).length, 25);
  assert.equal(selectOptions(payload)[0].value, 'user-175');
  assert.equal(selectOptions(payload).at(-1).value, 'user-199');

  raidRegistry.unregister('LARGE1');
  raidRegistry.unregister('LARGE2');
  console.log('Large raid navigation smoke tests passed.');
};

run().catch((error) => {
  raidRegistry.unregister('LARGE1');
  raidRegistry.unregister('LARGE2');
  console.error(error);
  process.exitCode = 1;
});
