/** Prueba de humo de raidRender.js (embed + components). No requiere BD ni bot. */
const assert = require('assert');
const { buildInitialState, joinSlot } = require('../src/services/raidState');
const { renderRaidEmbed, renderRaidComponents } = require('../src/utils/raidRender');

const template = {
  weapons: {
    group_1: {
      displayName: 'DPS',
      defaultEmoji: '123',
      max_players: 3,
      data: [
        { name: 'Daga doble', label: 'Daga doble (A)', units: 1, emoji: '1' },
        { name: 'Daga doble', label: 'Daga doble (B)', units: 1, emoji: '1' },
        { name: 'Daga doble', label: 'Daga doble (C)', units: 1, emoji: '1' },
      ],
    },
    group_2: {
      displayName: 'Tank',
      defaultEmoji: '456',
      data: [{ name: 'Maza incubo', units: 2, emoji: '2' }],
    },
  },
};

const state = buildInitialState({ template, leaderId: 'L1', lootersMax: 2 });
joinSlot(state, 'group_1~0', { userId: 'U1', username: 'u1' });

const raid = {
  eventId: 'AB3K9F',
  title: 'Raid de prueba',
  description: 'desc',
  color: '#00ff00',
  status: 'active',
  eventTimestamp: Math.floor(Date.now() / 1000) + 3600,
  rolesToNotify: [],
};

const embed = renderRaidEmbed(raid, state);
console.log(JSON.stringify(embed.data, null, 2));
const components = renderRaidComponents(raid, state);
console.log('rows:', components.length);
for (const row of components) {
  console.log(JSON.stringify(row.toJSON()));
}

// Raid cerrado: solo el botón de registrar asistencia
const closedRaid = { ...raid, status: 'closed', closedBy: 'L1', closedAt: new Date() };
const closedEmbed = renderRaidEmbed(closedRaid, state);
console.log('closed title:', closedEmbed.data.title);
console.log('closed components:', renderRaidComponents(closedRaid, state).length);

// La lista "No puedo ir" debe conservar y mostrar la hora UTC de la baja.
state.cannotGo = [{ userId: 'U2', username: 'u2', at: new Date('2026-09-30T18:07:00.000Z') }];
const cannotGoEmbed = renderRaidEmbed(raid, state);
const cannotGoField = cannotGoEmbed.data.fields.find((field) => field.name === '🚫 No puedo ir');
assert.ok(cannotGoField, 'debe incluir el campo de no puedo ir');
assert.equal(cannotGoField.value, '<@U2> — 18:07 UTC');
console.log('cannot-go UTC timestamp: OK');
