const EconomyBalance = require('../../database/models/economy/EconomyBalance');
const EconomyTransaction = require('../../database/models/economy/EconomyTransaction');
const mongoose = require('mongoose');
const EconomyLogChannel = require('../../database/models/economy/EconomyLogChannel');
const { UserError } = require('../../utils/userError');

const ensurePositiveAmount = (amount) => {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    // UserError: este mensaje sí está escrito para quien ejecuta el comando.
    throw new UserError('La cantidad debe ser un numero entero positivo.');
  }
};

const runInTransaction = async (work) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
};

const getLogChannel = async (guildId) => {
  const doc = await EconomyLogChannel.findOne({ guildId });
  return doc?.channelId || null;
};

const setLogChannel = async ({ guildId, channelId, setBy }) => {
  return await EconomyLogChannel.findOneAndUpdate(
    { guildId },
    { channelId, setBy, setAt: new Date() },
    { upsert: true, new: true },
  );
};

const getBalance = async (guildId, userId) => {
  const doc = await EconomyBalance.findOne({ guildId, userId });
  return doc?.balance || 0;
};

const getLeaderboard = async (guildId, limit = 10) => {
  const safeLimit = Math.min(Math.max(1, limit), 100);
  return await EconomyBalance.find({ guildId, balance: { $gt: 0 } })
    .sort({ balance: -1 })
    .limit(safeLimit)
    .select('userId balance');
};

const addMoney = async ({ guildId, userId, executorId, amount, description = '' }) => {
  ensurePositiveAmount(amount);

  return runInTransaction(async (session) => {
    const oldDoc = await EconomyBalance.findOneAndUpdate(
      { guildId, userId },
      {
        $inc: { balance: amount },
        $set: { updatedAt: new Date() },
        $setOnInsert: { guildId, userId },
      },
      { upsert: true, new: false, session },
    );
    const previousBalance = oldDoc?.balance || 0;
    const newBalance = previousBalance + amount;
    await EconomyTransaction.create([{
      guildId, type: 'add', userId, affectedUserIds: [userId], executorId, amount,
      description: String(description || '').trim(),
    }], { session });
    return { previousBalance, newBalance };
  });
};

const clearLogChannel = async (guildId) => {
  return await EconomyLogChannel.findOneAndDelete({ guildId });
};

const removeMoney = async ({ guildId, userId, executorId, amount, description = '' }) => {
  ensurePositiveAmount(amount);

  return runInTransaction(async (session) => {
    const oldDoc = await EconomyBalance.findOneAndUpdate(
      { guildId, userId },
      {
        $inc: { balance: -amount },
        $set: { updatedAt: new Date() },
        $setOnInsert: { guildId, userId },
      },
      { upsert: true, new: false, session },
    );
    const previousBalance = oldDoc?.balance || 0;
    const newBalance = previousBalance - amount;
    await EconomyTransaction.create([{
      guildId, type: 'remove', userId, affectedUserIds: [userId], executorId, amount,
      description: String(description || '').trim(),
    }], { session });
    return { previousBalance, newBalance };
  });
};

const resetBalance = async ({ guildId, userId, executorId }) => {
  return runInTransaction(async (session) => {
    const oldDoc = await EconomyBalance.findOneAndUpdate(
      { guildId, userId },
      { $set: { balance: 0, updatedAt: new Date() } },
      { new: false, session },
    );
    const previousBalance = oldDoc?.balance || 0;
    await EconomyTransaction.create([{
      guildId, type: 'reset', userId, affectedUserIds: [userId], executorId,
      amount: previousBalance, description: 'Reset de balance',
    }], { session });
    return { previousBalance };
  });
};

const getDebtors = async (guildId, limit = 10) => {
  const safeLimit = Math.min(Math.max(1, limit), 100);
  return await EconomyBalance.find({ guildId, balance: { $lt: 0 } })
    .sort({ balance: 1 })
    .limit(safeLimit)
    .select('userId balance');
};

module.exports = {
  getLogChannel,
  setLogChannel,
  clearLogChannel,
  getBalance,
  getLeaderboard,
  getDebtors,
  addMoney,
  removeMoney,
  resetBalance,
};
