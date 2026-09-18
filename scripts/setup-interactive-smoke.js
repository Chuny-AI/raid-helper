const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ComponentType, PermissionFlagsBits } = require('discord.js');
const setup = require('../src/commands/utility/setup');
const setupService = require('../src/features/setup/application/setup-service');
const ui = require('../src/features/setup/presentation/setup-ui');

const command = setup.data.toJSON();
assert.equal(command.name, 'setup');
assert.deepEqual(command.contexts, [0]);
assert.equal(command.default_member_permissions, String(PermissionFlagsBits.Administrator));
assert.equal(fs.existsSync(path.join(__dirname, '../src/commands/utility/economy.js')), false);

const id = ui.componentId('roles', 'user-1', 'guild-1');
assert.deepEqual(ui.parseComponentId(id), { action: 'roles', userId: 'user-1', guildId: 'guild-1' });
assert.equal(ui.parseComponentId('setup:roles:user:guild:extra'), null);

const status = {
  authorizedRoleIds: ['111111111111111'],
  economyRoleIds: ['222222222222222'],
  economyChannelId: '333333333333333',
  staleAuthorizedRoles: 0,
  staleEconomyRoles: 0,
  baseReady: true,
  economyReady: true,
};
const dashboard = ui.buildDashboard({ status, userId: 'user-1', guildId: 'guild-1', sourceChannelId: 'source-1' });
assert.equal(dashboard.components.length, 2);
assert.equal(dashboard.components[1].components[0].data.disabled, false);
assert.match(dashboard.embeds[0].data.fields[1].name, /source-1/);

const roles = ui.buildRolesScreen({ status, userId: 'user-1', guildId: 'guild-1' });
assert.equal(roles.components[0].components[0].data.type, ComponentType.RoleSelect);
assert.equal(roles.components[0].components[0].data.max_values, 25);

const economy = ui.buildEconomyScreen({ status, userId: 'user-1', guildId: 'guild-1', sourceChannelId: 'source-1' });
assert.equal(economy.components.length, 3);
assert.equal(economy.components[1].components[0].data.type, ComponentType.ChannelSelect);
assert.match(economy.embeds[0].data.description, /source-1/);
assert(economy.components[2].components.some((button) => button.data.custom_id.includes('roles-clear')));
const clearConfirmation = ui.buildEconomyClearConfirmation({ userId: 'user-1', guildId: 'guild-1', sourceChannelId: 'source-1' });
assert.match(clearConfirmation.embeds[0].data.description, /balances y movimientos existentes no se borrarán/);
assert(clearConfirmation.components[0].components.some((button) => button.data.custom_id.includes('clear-confirm')));
const rolesClearConfirmation = ui.buildEconomyRolesClearConfirmation({ userId: 'user-1', guildId: 'guild-1' });
assert.match(rolesClearConfirmation.embeds[0].data.description, /todos los canales/);
assert(rolesClearConfirmation.components[0].components.some((button) => button.data.custom_id.includes('roles-clear-confirm')));

const permissionScreen = ui.buildPermissionScreen({
  permissions: { has: (permission) => permission !== PermissionFlagsBits.ManageThreads },
  userId: 'user-1',
  guildId: 'guild-1',
});
assert.match(permissionScreen.embeds[0].data.description, /❌ Gestionar hilos/);

const everyone = { id: 'guild-1', name: '@everyone', managed: false };
const managed = { id: 'role-bot', name: 'Bot', managed: true };
const valid = { id: 'role-ok', name: 'Raid Leader', managed: false };
const guild = { id: 'guild-1', roles: { cache: new Map([[everyone.id, everyone], [managed.id, managed], [valid.id, valid]]) } };
assert.deepEqual(setupService.resolveSelectableRoles(guild, ['guild-1', 'role-bot', 'role-ok', 'missing']), [valid]);

assert.equal(setup.isAdministrator({
  guild: { id: 'guild-1' },
  member: { permissions: { has: (flag) => flag === PermissionFlagsBits.Administrator } },
}), true);
assert.equal(setup.isAdministrator({ guild: null }), false);

const originalStatus = setupService.getSetupStatus;
const originalSaveRoles = setupService.saveEconomyRoles;
const originalClearLog = setupService.clearLogChannel;
(async () => {
  const calls = [];
  setupService.getSetupStatus = async () => status;
  setupService.saveEconomyRoles = async (args) => calls.push(['roles', args]);
  setupService.clearLogChannel = async (...args) => calls.push(['log', args]);
  const interact = async (action) => {
    const interaction = {
      customId: ui.componentId(action, 'user-1', 'guild-1'),
      guild: { id: 'guild-1' }, channelId: 'source-1',
      member: { permissions: { has: (flag) => flag === PermissionFlagsBits.Administrator } },
      user: { id: 'user-1' },
      isButton: () => true, isMessageComponent: () => true,
      update: async () => {},
    };
    assert.equal(await setup.handleInteraction(interaction), true);
  };
  await interact('economy-clear-confirm');
  assert.deepEqual(calls, [['log', ['guild-1', 'source-1']]]);
  calls.length = 0;
  await interact('economy-roles-clear-confirm');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'roles');
  assert.deepEqual(calls[0][1].roleIds, []);
  assert.equal(calls[0][1].guild.id, 'guild-1');
  console.log('Interactive setup smoke tests passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  setupService.getSetupStatus = originalStatus;
  setupService.saveEconomyRoles = originalSaveRoles;
  setupService.clearLogChannel = originalClearLog;
});
