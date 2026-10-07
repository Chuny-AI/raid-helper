const assert = require('node:assert');
const mongoose = require('mongoose');
const EconomyBalance = require('../src/database/models/economy/EconomyBalance');
const EconomyTransaction = require('../src/database/models/economy/EconomyTransaction');

const originals = {
  startSession: mongoose.startSession,
  findOneAndUpdate: EconomyBalance.findOneAndUpdate,
  create: EconomyTransaction.create,
};

(async () => {
  const fakeSession = {
    ended: false,
    async withTransaction(work) { await work(); },
    async endSession() { this.ended = true; },
  };
  let balanceOptions;
  let transactionOptions;
  mongoose.startSession = async () => fakeSession;
  EconomyBalance.findOneAndUpdate = async (filter, _update, options) => {
    assert.deepStrictEqual(filter, { guildId: 'guild', channelId: 'channel-a', contextId: 'avalonianas', userId: 'user' });
    balanceOptions = options;
    return { balance: 10 };
  };
  EconomyTransaction.create = async (docs, options) => {
    assert.ok(Array.isArray(docs));
    assert.strictEqual(docs[0].contextId, 'avalonianas');
    assert.strictEqual(docs[0].channelId, 'channel-a');
    transactionOptions = options;
  };

  const { addMoney } = require('../src/services/economy/economyService');
  const result = await addMoney({
    guildId: 'guild', channelId: 'channel-a', contextId: 'avalonianas', userId: 'user', executorId: 'admin', amount: 5,
  });
  assert.deepStrictEqual(result, { previousBalance: 10, newBalance: 15 });
  assert.strictEqual(balanceOptions.session, fakeSession);
  assert.strictEqual(transactionOptions.session, fakeSession);
  assert.strictEqual(fakeSession.ended, true);

  const standaloneSession = {
    ended: false,
    async withTransaction() {
      const error = new Error('Transaction numbers are only allowed on a replica set member or mongos');
      error.code = 20;
      throw error;
    },
    async endSession() { this.ended = true; },
  };
  mongoose.startSession = async () => standaloneSession;
  const standaloneResult = await addMoney({
    guildId: 'guild', channelId: 'channel-a', contextId: 'avalonianas', userId: 'user', executorId: 'admin', amount: 5,
  });
  assert.deepStrictEqual(standaloneResult, { previousBalance: 10, newBalance: 15 });
  assert.deepStrictEqual(balanceOptions, { upsert: true, new: false });
  assert.equal(transactionOptions, undefined);
  assert.strictEqual(standaloneSession.ended, true);
  await assert.rejects(
    require('../src/services/economy/economyService').addMoney({
      guildId: 'guild', channelId: 'channel-a', contextId: 'avalonianas', userId: 'user', executorId: 'admin', amount: Number.MAX_SAFE_INTEGER + 1,
    })
  );
  await assert.rejects(
    require('../src/services/economy/economyService').addMoney({
      guildId: 'guild', channelId: 'channel-a', contextId: 'avalonianas', userId: 'user', executorId: 'admin', amount: Number.MAX_SAFE_INTEGER,
    }),
    /saldo resultante excede/i,
  );

  console.log('✅ Transacciones y fallback de economía verificados');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  mongoose.startSession = originals.startSession;
  EconomyBalance.findOneAndUpdate = originals.findOneAndUpdate;
  EconomyTransaction.create = originals.create;
});
