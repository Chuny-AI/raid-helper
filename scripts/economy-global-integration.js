// Requiere MONGODB_URI. Crea y elimina exclusivamente una base temporal propia.
// Ejecutar: node --env-file=.env scripts/economy-global-integration.js
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const Balance = require('../src/database/models/economy/EconomyBalance');
const Context = require('../src/database/models/economy/EconomyContext');
const Transaction = require('../src/database/models/economy/EconomyTransaction');
const Log = require('../src/database/models/economy/EconomyLogChannel');
const { migrateEconomyGlobalContexts } = require('../src/database/migrations/economy-global-contexts');
const economy = require('../src/services/economy/economyService');
const contexts = require('../src/services/economy/economyContextService');

const dbName = `codex_economy_test_${randomUUID().replaceAll('-', '')}`;
(async () => {
  assert.ok(process.env.MONGODB_URI, 'Configura MONGODB_URI para la prueba de integración');
  await mongoose.connect(process.env.MONGODB_URI, { dbName, autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 5000 });
  const scope = { guildId: 'guild', contextId: 'avalonianas', userId: 'member' };
  await Balance.collection.insertMany([
    { ...scope, channelId: 'channel-a', balance: 100 },
    { ...scope, channelId: 'thread-b', balance: 7 },
    { ...scope, balance: -12 },
    { ...scope, guildId: 'other-guild', channelId: 'channel-a', balance: 999 },
    { guildId: 'guild', userId: 'legacy', balance: 8 },
  ]);
  await Context.collection.insertMany([
    { guildId: 'guild', slug: 'avalonianas', name: 'Avalonianas', channelId: 'channel-a', createdBy: 'admin' },
    { guildId: 'guild', slug: 'avalonianas', name: 'Avalonianas', channelId: 'thread-b', createdBy: 'admin' },
    { guildId: 'other-guild', slug: 'avalonianas', name: 'Avalonianas', createdBy: 'admin' },
  ]);
  await Log.collection.insertMany([
    { guildId: 'guild', sourceChannelId: 'channel-a', channelId: 'old-logs', setBy: 'admin', setAt: new Date('2025-01-01') },
    { guildId: 'guild', sourceChannelId: 'thread-b', channelId: 'logs', setBy: 'admin', setAt: new Date('2026-01-01') },
  ]);
  await Transaction.collection.insertMany([
    { ...scope, channelId: 'channel-a', type: 'add', amount: 100, affectedUserIds: ['member'], executorId: 'admin', createdAt: new Date('2026-01-01') },
    { ...scope, channelId: 'thread-b', type: 'add', amount: 7, affectedUserIds: ['member'], executorId: 'admin', createdAt: new Date('2026-01-02') },
  ]);
  const history = await Transaction.collection.find({}).toArray();
  await migrateEconomyGlobalContexts();
  await Promise.all([Balance.createIndexes(), Context.createIndexes(), Log.createIndexes(), Transaction.createIndexes()]);
  assert.equal(await economy.getBalance('guild', 'avalonianas', 'member'), 95);
  assert.equal(await economy.getBalance('other-guild', 'avalonianas', 'member'), 999);
  assert.equal((await contexts.listContexts('guild')).length, 1);
  assert.equal(await economy.getLogChannel('guild'), 'logs');
  assert.equal(await Balance.countDocuments(scope), 1);
  assert.equal((await Balance.collection.findOne({ userId: 'legacy' })).balance, 8);
  assert.deepEqual(await Transaction.collection.find({}).toArray(), history);
  const journal = mongoose.connection.collection('economy_scope_migrations');
  const balancePlan = await journal.findOne({ collection: Balance.collection.name, 'result.guildId': 'guild' });
  assert.equal(balancePlan.originals.length, 3);
  assert.equal(balancePlan.complete, true);

  await economy.addMoney({ ...scope, executorId: 'admin', amount: 5 });
  await migrateEconomyGlobalContexts();
  assert.equal(await economy.getBalance('guild', 'avalonianas', 'member'), 100, 'Reiniciar no debe sobrescribir movimientos nuevos');
  assert.equal((await economy.getTransactions('guild', 'avalonianas', 'member')).length, 3);
  assert.equal((await economy.getLeaderboard('guild', 'avalonianas'))[0].balance, 100);
  await economy.addMoney({ ...scope, userId: 'debtor', executorId: 'admin', amount: 10 });
  assert.deepEqual((await economy.getTotalsByContext('guild', ['avalonianas'])).get('avalonianas'), { totalDebt: 110 });
  await economy.resetBalance({ ...scope, executorId: 'admin' });
  assert.equal(await economy.getBalance('guild', 'avalonianas', 'member'), 0);
  await assert.rejects(contexts.createContext({ guildId: 'guild', name: 'AVALONIANAS', createdBy: 'admin' }), /Ya existe/);
  await economy.setLogChannel({ guildId: 'guild', channelId: 'new-logs', setBy: 'admin' });
  assert.equal(await economy.getLogChannel('guild'), 'new-logs');

  // Las validaciones forman parte de la escritura atómica, también sin sesiones.
  const limitScope = { ...scope, contextId: 'limits', executorId: 'admin' };
  await economy.addMoney({ ...limitScope, amount: Number.MAX_SAFE_INTEGER });
  await assert.rejects(economy.addMoney({ ...limitScope, amount: 1 }), /deuda excede el límite/);
  assert.equal(await economy.getBalance('guild', 'limits', 'member'), Number.MAX_SAFE_INTEGER);
  assert.equal((await economy.getTransactions('guild', 'limits', 'member')).length, 1);
  await assert.rejects(economy.removeMoney({ ...limitScope, userId: 'missing', amount: 1 }), /más de la deuda actual/);
  assert.equal(await Balance.countDocuments({ contextId: 'limits', userId: 'missing' }), 0);
  const concurrent = { ...limitScope, userId: 'concurrent' };
  await economy.addMoney({ ...concurrent, amount: 50 });
  const removals = await Promise.allSettled([
    economy.removeMoney({ ...concurrent, amount: 40 }),
    economy.removeMoney({ ...concurrent, amount: 40 }),
  ]);
  assert.equal(removals.filter(result => result.status === 'fulfilled').length, 1);
  assert.match(removals.find(result => result.status === 'rejected').reason.message, /más de la deuda actual/);
  assert.equal(await economy.getBalance('guild', 'limits', 'concurrent'), 10);
  assert.equal((await economy.getTransactions('guild', 'limits', 'concurrent')).length, 2);
  await economy.removeMoney({ ...concurrent, amount: 10 });
  assert.equal(await economy.getBalance('guild', 'limits', 'concurrent'), 0);

  const negative = { ...scope, contextId: 'old-negative', balance: -5 };
  await Balance.collection.insertOne(negative);
  await assert.rejects(economy.getBalance('guild', 'old-negative', 'member'), /registro antiguo/);
  await assert.rejects(economy.getTotalsByContext('guild', ['old-negative']), /registros antiguos/);
  await assert.rejects(economy.addMoney({ ...limitScope, contextId: 'old-negative', amount: 10 }), /importe negativo/);
  assert.equal((await Balance.collection.findOne({ contextId: 'old-negative' })).balance, -5);

  // Simular caída después de borrar duplicados y antes de escribir el total.
  await Balance.collection.dropIndex('guildId_1_contextId_1_userId_1');
  await Balance.collection.insertMany([
    { ...scope, contextId: 'resume', channelId: 'a', balance: 20 },
    { ...scope, contextId: 'resume', channelId: 'b', balance: 30 },
  ]);
  const replace = Balance.collection.replaceOne;
  try {
    Balance.collection.replaceOne = async () => { throw new Error('simulated interruption'); };
    await assert.rejects(migrateEconomyGlobalContexts(), /simulated interruption/);
  } finally {
    Balance.collection.replaceOne = replace;
  }
  assert.equal(await Balance.countDocuments({ contextId: 'resume' }), 1);
  await migrateEconomyGlobalContexts();
  await migrateEconomyGlobalContexts();
  assert.equal(await economy.getBalance('guild', 'resume', 'member'), 50);
  assert.equal(await journal.countDocuments({ complete: false }), 0);
  const deleted = await economy.deleteContext({ guildId: 'guild', contextId: 'avalonianas' });
  assert.deepEqual(deleted, { balancesDeleted: 2, transactionsDeleted: 5 });
  assert.equal(await Context.countDocuments({ guildId: 'guild', slug: 'avalonianas' }), 0);
  assert.equal(await Balance.countDocuments({ guildId: 'guild', contextId: 'avalonianas' }), 0);
  assert.equal(await Transaction.countDocuments({ guildId: 'guild', contextId: 'avalonianas' }), 0);
  assert.equal(await economy.getBalance('other-guild', 'avalonianas', 'member'), 999);
  assert.equal(await economy.getBalance('guild', 'resume', 'member'), 50);
  await contexts.createContext({ guildId: 'guild', name: 'Avalonianas', createdBy: 'admin' });
  await migrateEconomyGlobalContexts();
  assert.equal(await economy.getBalance('guild', 'avalonianas', 'member'), 0);
  assert.equal((await economy.getTransactions('guild', 'avalonianas', 'member')).length, 0);
  console.log('✅ MongoDB: migración, respaldo, reanudación, índices y operaciones globales verificados');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.name === dbName) {
    await mongoose.connection.dropDatabase();
  }
  await mongoose.disconnect();
});
