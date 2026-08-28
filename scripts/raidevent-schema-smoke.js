/**
 * Verifica que el shape producido por raidState.buildInitialState valida
 * correctamente contra el schema de mongoose de RaidEvent (sin tocar la BD).
 */
const RaidEvent = require('../src/database/models/RaidEvent');
const { buildInitialState, joinSlot } = require('../src/services/raidState');

const template = {
  weapons: {
    group_1: {
      displayName: 'DPS',
      defaultEmoji: '111',
      max_players: 3,
      data: [
        { name: 'Daga doble', label: 'Daga doble (A)', units: 3, emoji: '1', url: 'https://a' },
        { name: 'Daga doble', label: 'Daga doble (B)', units: 3, emoji: '1', url: 'https://b' },
        { name: 'Daga doble', label: 'Daga doble (C)', units: 3, emoji: '1', url: 'https://c' },
      ],
    },
  },
};

const initial = buildInitialState({ template, leaderId: '123', lootersMax: 2 });
joinSlot(initial, 'group_1~0', { userId: '999', username: 'tester' });

const doc = new RaidEvent({
  eventId: 'ABC123',
  guildId: 'g1',
  channelId: 'c1',
  templateName: 'Test',
  title: 'Raid de prueba',
  description: 'desc',
  time: '17:00',
  eventTimestamp: Math.floor(Date.now() / 1000) + 3600,
  leaderId: '123',
  stateVersion: 2,
  groups: initial.groups,
  slots: initial.slots,
  waitlist: [],
  cannotGo: [],
  looters: initial.looters,
  fullNotificationSent: false,
  disabledWeapons: [],
  status: 'active',
});

const err = doc.validateSync();
if (err) {
  console.error('Validación FALLÓ:', err);
  process.exit(1);
}
console.log('Validación OK. Documento:');
console.log(JSON.stringify(doc.toObject(), null, 2));
