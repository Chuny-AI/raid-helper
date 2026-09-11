const assert = require('node:assert/strict');
const AuthorizedRole = require('../src/database/models/AuthorizedRole');
const EconomyRole = require('../src/database/models/economy/EconomyRole');
const authorized = require('../src/services/authorizedRoleService');
const economy = require('../src/services/economy/economyRoleService');

const exerciseSync = async ({ model, sync, guildKey }) => {
  const originals = {
    bulkWrite: model.bulkWrite,
    deleteMany: model.deleteMany,
    find: model.find,
  };
  const calls = [];
  model.bulkWrite = async (operations) => { calls.push(['bulk', operations]); };
  model.deleteMany = async (query) => { calls.push(['delete', query]); };
  model.find = () => ({ sort: async () => [] });

  try {
    await sync([
      { id: 'role-1', name: 'Líder' },
      { id: 'role-1', name: 'Líder duplicado' },
      { id: 'role-2', name: 'Economía' },
    ]);
    assert.equal(calls[0][0], 'bulk', 'primero se aseguran los roles elegidos');
    assert.equal(calls[0][1].length, 2, 'los roles duplicados se colapsan');
    assert.equal(calls[1][0], 'delete', 'después se eliminan referencias obsoletas');
    assert.deepEqual(calls[1][1][guildKey], 'guild-1');
    assert.deepEqual(calls[1][1].roleId.$nin, ['role-1', 'role-2']);

    calls.length = 0;
    await sync([]);
    assert.deepEqual(calls, [['delete', { [guildKey]: 'guild-1' }]]);
  } finally {
    model.bulkWrite = originals.bulkWrite;
    model.deleteMany = originals.deleteMany;
    model.find = originals.find;
  }
};

(async () => {
  await exerciseSync({
    model: AuthorizedRole,
    guildKey: 'serverId',
    sync: (roles) => authorized.syncAuthorizedRoles({ serverId: 'guild-1', roles, addedBy: 'admin-1' }),
  });
  await exerciseSync({
    model: EconomyRole,
    guildKey: 'guildId',
    sync: (roles) => economy.syncEconomyRoles({ guildId: 'guild-1', roles, addedBy: 'admin-1' }),
  });
  console.log('Setup role synchronization smoke tests passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
