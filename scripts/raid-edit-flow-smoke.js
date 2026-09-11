const assert = require('node:assert');
const raidCommand = require('../src/commands/utility/raid');
const raidRegistry = require('../src/services/raidRegistry');
const raidState = require('../src/services/raidState');
const reminderManager = require('../src/utils/reminderManager');

const template = {
  title: 'Raid base',
  description: 'Descripción base',
  weapons: {
    dps: {
      displayName: 'DPS', defaultEmoji: '⚔️', max_players: 2,
      data: [{ name: 'Espada', emoji: '⚔️', units: 2, url: '' }],
    },
  },
};

const makeRuntime = ({ withMember = false, editFails = false } = {}) => {
  const state = raidState.buildInitialState({ template, lootersMax: 1, leaderId: 'leader' });
  if (withMember) state.slots[0].users.push({ userId: 'member', username: 'Member' });
  let saves = 0;
  let edits = 0;
  const raid = {
    eventId: 'EDIT01', guildId: 'guild', channelId: 'channel', messageId: 'message',
    templateName: 'Raid base', title: 'Raid base', description: 'Descripción base',
    time: '20:00', eventTimestamp: Math.floor(Date.now() / 1000) + 7200,
    color: '#00FFFF', image: null, reminder: null, rolesToNotify: [],
    threadEnabled: false, threadId: null, stateVersion: 2, status: 'active',
    disabledWeapons: [], weaponOverrides: { groups: {} }, attendance: { absent: [] },
    ...state,
    async save() { saves += 1; },
  };
  const message = {
    id: 'message',
    async edit() {
      edits += 1;
      if (editFails) throw new Error('fallo simulado de Discord');
      return message;
    },
  };
  raidRegistry.register({ raidId: raid.eventId, raid, message, templateName: raid.templateName });
  return { raid, get saves() { return saves; }, get edits() { return edits; } };
};

const makeInteraction = () => {
  const calls = { update: null, reply: null, deferred: false };
  return {
    customId: 'raid_confirm_edit-session',
    user: { id: 'leader', toString: () => '<@leader>' },
    member: { id: 'leader', permissions: { has: () => false } },
    guild: {
      id: 'guild', name: 'Guild',
      roles: { cache: new Map() },
      channels: { fetch: async () => null },
      members: { fetch: async () => new Map() },
    },
    deferred: false,
    replied: false,
    async deferUpdate() { this.deferred = true; calls.deferred = true; },
    async editReply(payload) { calls.update = payload; },
    async update(payload) { calls.update = payload; },
    async reply(payload) { calls.reply = payload; },
    calls,
  };
};

const setEditSession = (runtime, changes = {}) => {
  const overrides = JSON.parse(JSON.stringify(runtime.raid.weaponOverrides));
  raidCommand.pendingRaids.set('session', {
    mode: 'edit', raidId: runtime.raid.eventId, templateName: runtime.raid.templateName,
    template, eventTimestamp: runtime.raid.eventTimestamp, time: runtime.raid.time,
    title: 'Raid editado', color: '#123456', image: 'https://example.com/raid.png',
    description: 'Descripción editada', finalReminder: null, finalNotificationRoles: [],
    shouldSendMassDm: false, looters: 2, currentLooterCount: 0,
    threadEnabled: false, guildId: 'guild', user: { id: 'leader' },
    weaponOverrides: overrides, originalWeaponOverrides: JSON.stringify(overrides),
    weaponsLocked: false, ...changes,
  });
};

(async () => {
  const runtime = makeRuntime();
  setEditSession(runtime);
  const interaction = makeInteraction();
  await raidCommand.handleConfirmRaidEdit(interaction);
  assert.strictEqual(interaction.calls.deferred, true);
  assert.ok(interaction.calls.update.content.includes('actualizado correctamente'));
  assert.strictEqual(runtime.raid.title, 'Raid editado');
  assert.strictEqual(runtime.raid.description, 'Descripción editada');
  assert.strictEqual(runtime.raid.image, 'https://example.com/raid.png');
  assert.strictEqual(runtime.raid.looters.max, 2);
  assert.ok(runtime.saves >= 1);
  assert.ok(runtime.edits >= 1);
  assert.strictEqual(raidCommand.pendingRaids.has('session'), false);
  raidRegistry.unregister(runtime.raid.eventId);

  const renderFailure = makeRuntime({ editFails: true });
  setEditSession(renderFailure);
  const renderFailureInteraction = makeInteraction();
  await raidCommand.handleConfirmRaidEdit(renderFailureInteraction);
  assert.ok(renderFailureInteraction.calls.update.content.includes('los datos se guardaron'));
  assert.strictEqual(renderFailure.raid.title, 'Raid editado');
  assert.strictEqual(raidCommand.pendingRaids.has('session'), false);
  raidRegistry.unregister(renderFailure.raid.eventId);

  const occupied = makeRuntime({ withMember: true });
  setEditSession(occupied, {
    weaponOverrides: { groups: { dps: { disabled: true, weapons: {} } } },
  });
  const protectedInteraction = makeInteraction();
  await raidCommand.handleConfirmRaidEdit(protectedInteraction);
  assert.ok(protectedInteraction.calls.update.content.includes('restablecieron automáticamente'));
  assert.strictEqual(occupied.raid.slots[0].users.length, 1);
  assert.deepStrictEqual(raidCommand.pendingRaids.get('session').weaponOverrides, { groups: {} });
  raidCommand.pendingRaids.delete('session');
  raidRegistry.unregister(occupied.raid.eventId);

  const lateEnrollment = makeRuntime();
  setEditSession(lateEnrollment, {
    weaponOverrides: { groups: { dps: { maxPlayers: 1, weapons: {} } } },
  });
  const originalWithRaidLock = raidRegistry.withRaidLock;
  raidRegistry.withRaidLock = async (_raidId, operation) => {
    lateEnrollment.raid.slots[0].users.push({ userId: 'late', username: 'Late' });
    return operation();
  };
  const lateInteraction = makeInteraction();
  try {
    await raidCommand.handleConfirmRaidEdit(lateInteraction);
  } finally {
    raidRegistry.withRaidLock = originalWithRaidLock;
  }
  assert.ok(
    lateInteraction.calls.update.content.includes('mientras se guardaba'),
    lateInteraction.calls.update.content
  );
  assert.strictEqual(lateEnrollment.raid.slots[0].users.length, 1);
  assert.deepStrictEqual(raidCommand.pendingRaids.get('session').weaponOverrides, { groups: {} });
  raidCommand.pendingRaids.delete('session');
  raidRegistry.unregister(lateEnrollment.raid.eventId);

  let unauthorizedPublish = false;
  raidCommand.pendingRaids.set('create-session', { mode: 'create', user: { id: 'leader' } });
  const foreignInteraction = {
    customId: 'raid_confirm_create-create-session', user: { id: 'other' },
    channel: { async send() { unauthorizedPublish = true; } },
    async reply(payload) { this.response = payload; },
  };
  await raidCommand.handleConfirmRaidCreate(foreignInteraction);
  assert.ok(foreignInteraction.response.content.includes('Solo quien inició'));
  assert.strictEqual(unauthorizedPublish, false);
  raidCommand.pendingRaids.delete('create-session');

  const reminderRaid = {
    eventId: 'REMIND', reminder: '10m', eventTimestamp: Math.floor(Date.now() / 1000) + 7200,
    templateName: 'Raid', channelId: 'channel', guildId: 'guild', title: 'Título anterior',
    leaderId: 'leader', status: 'active',
  };
  const firstTimer = reminderManager.rescheduleRaidReminder(reminderRaid);
  reminderRaid.title = 'Título nuevo';
  reminderRaid.eventTimestamp += 3600;
  const secondTimer = reminderManager.rescheduleRaidReminder(reminderRaid);
  assert.ok(firstTimer && secondTimer && firstTimer !== secondTimer);
  assert.strictEqual(firstTimer._destroyed, true);
  assert.strictEqual(reminderManager.getActiveReminders().get('REMIND').activityTitle, 'Título nuevo');
  reminderManager.clearAllReminders();

  console.log('✅ Flujo de edición y reprogramación verificado');
})().catch((error) => {
  console.error(error);
  reminderManager.clearAllReminders();
  process.exitCode = 1;
});
