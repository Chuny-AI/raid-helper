const assert = require('node:assert/strict');
const { ensureCollections } = require('../src/database/bootstrap');
const EconomyBalance = require('../src/database/models/economy/EconomyBalance');
const EconomyContext = require('../src/database/models/economy/EconomyContext');
const EconomyLogChannel = require('../src/database/models/economy/EconomyLogChannel');
const EconomyTransaction = require('../src/database/models/economy/EconomyTransaction');

const models = [
  '../src/database/models/Server',
  '../src/database/models/Template',
  '../src/database/models/AuthorizedRole',
  '../src/database/models/RaidEvent',
  '../src/database/models/Weapon',
  '../src/database/models/NotifyEvent',
  '../src/database/models/economy/EconomyRole',
  '../src/database/models/AuthorizedUser',
  '../src/database/models/UserCategory',
  '../src/database/models/MemberLogConfig',
  '../src/database/models/MemberIdentity',
].map((path) => require(path)).concat([
  EconomyBalance, EconomyContext, EconomyLogChannel, EconomyTransaction,
]);

const saved = models.map((model) => ({
  model,
  createCollection: model.createCollection,
  createIndexes: model.createIndexes,
  indexes: model.collection.indexes,
  dropIndex: model.collection.dropIndex,
}));

(async () => {
  const events = [];
  for (const model of models) {
    model.createCollection = async () => {};
    model.createIndexes = async () => events.push(`create:${model.modelName}`);
  }
  const indexes = new Map([
    [EconomyBalance, [
      { name: '_id_', unique: true, key: { _id: 1 } },
      { name: 'guildId_1_userId_1', unique: true, key: { guildId: 1, userId: 1 } },
      { name: 'guildId_1_contextId_1_userId_1', unique: true, key: { guildId: 1, contextId: 1, userId: 1 } },
      { name: 'guildId_1_channelId_1_contextId_1_userId_1', unique: true, key: { guildId: 1, channelId: 1, contextId: 1, userId: 1 } },
    ]],
    [EconomyContext, [
      { name: 'guildId_1_slug_1', unique: true, key: { guildId: 1, slug: 1 } },
    ]],
    [EconomyLogChannel, [
      { name: 'guildId_1', unique: true, key: { guildId: 1 } },
    ]],
  ]);
  for (const [model, existing] of indexes) {
    model.collection.indexes = async () => existing;
    model.collection.dropIndex = async (name) => events.push(`drop:${model.modelName}:${name}`);
  }
  await ensureCollections();
  assert.deepEqual(events.filter((event) => event.startsWith('drop:')), [
    'drop:EconomyBalance:guildId_1_userId_1',
    'drop:EconomyBalance:guildId_1_contextId_1_userId_1',
    'drop:EconomyContext:guildId_1_slug_1',
    'drop:EconomyLogChannel:guildId_1',
  ]);
  assert.deepEqual(events.filter((event) => event.startsWith('create:')), [
    'create:EconomyBalance',
    'create:EconomyTransaction',
    'create:EconomyContext',
    'create:EconomyLogChannel',
    'create:MemberLogConfig',
    'create:MemberIdentity',
  ]);
  assert(events.indexOf('create:EconomyBalance') > events.indexOf('drop:EconomyLogChannel:guildId_1'));
  console.log('✅ Migración de índices de economía verificada');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  for (const entry of saved) {
    entry.model.createCollection = entry.createCollection;
    entry.model.createIndexes = entry.createIndexes;
    entry.model.collection.indexes = entry.indexes;
    entry.model.collection.dropIndex = entry.dropIndex;
  }
});
