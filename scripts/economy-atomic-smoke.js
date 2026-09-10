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
  EconomyBalance.findOneAndUpdate = async (_filter, _update, options) => {
    balanceOptions = options;
    return { balance: 10 };
  };
  EconomyTransaction.create = async (docs, options) => {
    assert.ok(Array.isArray(docs));
    transactionOptions = options;
  };

  const { addMoney } = require('../src/services/economy/economyService');
  const result = await addMoney({
    guildId: 'guild', userId: 'user', executorId: 'admin', amount: 5,
  });
  assert.deepStrictEqual(result, { previousBalance: 10, newBalance: 15 });
  assert.strictEqual(balanceOptions.session, fakeSession);
  assert.strictEqual(transactionOptions.session, fakeSession);
  assert.strictEqual(fakeSession.ended, true);
  await assert.rejects(
    require('../src/services/economy/economyService').addMoney({
      guildId: 'guild', userId: 'user', executorId: 'admin', amount: Number.MAX_SAFE_INTEGER + 1,
    })
  );

  console.log('✅ Atomicidad de economía verificada');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  mongoose.startSession = originals.startSession;
  EconomyBalance.findOneAndUpdate = originals.findOneAndUpdate;
  EconomyTransaction.create = originals.create;
});
