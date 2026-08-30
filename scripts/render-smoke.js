/** Prueba de humo de raidRender.js (embed + components). No requiere BD ni bot. */
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
