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

const ensureSafeBalance = (balance) => {
  if (!Number.isSafeInteger(balance)) {
    throw new UserError('El saldo resultante excede el rango permitido de números enteros.');
  }
};

const ensureChannelId = (channelId) => {
  if (!channelId) throw new UserError('Este comando debe usarse dentro de un canal de Discord.');
};

const ensureGuildId = (guildId) => {
  if (!guildId) throw new UserError('Este comando debe usarse dentro de un servidor de Discord.');
};

const ensureBalanceScope = (guildId, channelId, contextId) => {
  ensureGuildId(guildId);
  ensureChannelId(channelId);
  if (!contextId) throw new UserError('Selecciona un contexto de balance.');
};

const ensureUserId = (userId) => {
  if (!userId) throw new UserError('Selecciona un usuario.');
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

const getLogChannel = async (guildId, channelId) => {
  ensureGuildId(guildId);
  ensureChannelId(channelId);
  const doc = await EconomyLogChannel.findOne({ guildId, sourceChannelId: channelId });
  return doc?.channelId || null;
};

const setLogChannel = async ({ guildId, sourceChannelId, channelId, setBy }) => {
  ensureGuildId(guildId);
  ensureChannelId(sourceChannelId);
  ensureChannelId(channelId);
  return await EconomyLogChannel.findOneAndUpdate(
    { guildId, sourceChannelId },
    { channelId, setBy, setAt: new Date() },
    { upsert: true, new: true },
  );
};

const getBalance = async (guildId, channelId, contextId, userId) => {
  ensureBalanceScope(guildId, channelId, contextId);
  ensureUserId(userId);
  const doc = await EconomyBalance.findOne({ guildId, channelId, contextId, userId });
  return doc?.balance || 0;
};

const getLeaderboard = async (guildId, channelId, contextId, limit = 10) => {
  ensureBalanceScope(guildId, channelId, contextId);
  const safeLimit = Math.min(Math.max(1, limit), 100);
  return await EconomyBalance.find({ guildId, channelId, contextId, balance: { $gt: 0 } })
    .sort({ balance: -1 })
    .limit(safeLimit)
    .select('userId balance');
};

const addMoney = async ({ guildId, channelId, contextId, userId, executorId, amount, description = '' }) => {
  ensurePositiveAmount(amount);
  ensureBalanceScope(guildId, channelId, contextId);
  ensureUserId(userId);

  return runInTransaction(async (session) => {
    const oldDoc = await EconomyBalance.findOneAndUpdate(
      { guildId, channelId, contextId, userId },
      {
        $inc: { balance: amount },
        $set: { updatedAt: new Date() },
        $setOnInsert: { guildId, channelId, contextId, userId },
      },
      { upsert: true, new: false, session },
    );
    const previousBalance = oldDoc?.balance || 0;
    const newBalance = previousBalance + amount;
    ensureSafeBalance(newBalance);
    await EconomyTransaction.create([{
      guildId, channelId, contextId, type: 'add', userId, affectedUserIds: [userId], executorId, amount,
      description: String(description || '').trim(),
    }], { session });
    return { previousBalance, newBalance };
  });
};

const clearLogChannel = async (guildId, sourceChannelId) => {
  ensureGuildId(guildId);
  ensureChannelId(sourceChannelId);
  return await EconomyLogChannel.findOneAndDelete({ guildId, sourceChannelId });
};

const removeMoney = async ({ guildId, channelId, contextId, userId, executorId, amount, description = '' }) => {
  ensurePositiveAmount(amount);
  ensureBalanceScope(guildId, channelId, contextId);
  ensureUserId(userId);

  return runInTransaction(async (session) => {
    const oldDoc = await EconomyBalance.findOneAndUpdate(
      { guildId, channelId, contextId, userId },
      {
        $inc: { balance: -amount },
        $set: { updatedAt: new Date() },
        $setOnInsert: { guildId, channelId, contextId, userId },
      },
      { upsert: true, new: false, session },
    );
    const previousBalance = oldDoc?.balance || 0;
    const newBalance = previousBalance - amount;
    ensureSafeBalance(newBalance);
    await EconomyTransaction.create([{
      guildId, channelId, contextId, type: 'remove', userId, affectedUserIds: [userId], executorId, amount,
      description: String(description || '').trim(),
    }], { session });
    return { previousBalance, newBalance };
  });
};

const resetBalance = async ({ guildId, channelId, contextId, userId, executorId }) => {
  ensureBalanceScope(guildId, channelId, contextId);
  ensureUserId(userId);
  return runInTransaction(async (session) => {
    const oldDoc = await EconomyBalance.findOneAndUpdate(
      { guildId, channelId, contextId, userId },
      { $set: { balance: 0, updatedAt: new Date() } },
      { new: false, session },
    );
    const previousBalance = oldDoc?.balance || 0;
    await EconomyTransaction.create([{
      guildId, channelId, contextId, type: 'reset', userId, affectedUserIds: [userId], executorId,
      amount: previousBalance, description: 'Reset de balance',
    }], { session });
    return { previousBalance };
  });
};

const getDebtors = async (guildId, channelId, contextId, limit = 10) => {
  ensureBalanceScope(guildId, channelId, contextId);
  const safeLimit = Math.min(Math.max(1, limit), 100);
  return await EconomyBalance.find({ guildId, channelId, contextId, balance: { $lt: 0 } })
    .sort({ balance: 1 })
    .limit(safeLimit)
    .select('userId balance');
};

const getTransactions = (guildId, channelId, contextId, userId, limit = 10) => {
  ensureBalanceScope(guildId, channelId, contextId);
  ensureUserId(userId);
  return EconomyTransaction.find({
    guildId, channelId, contextId, affectedUserIds: userId,
  }).sort({ createdAt: -1, _id: -1 }).limit(Math.min(Math.max(1, limit), 25));
};

module.exports = {
  getLogChannel,
  setLogChannel,
  clearLogChannel,
  getBalance,
  getLeaderboard,
  getDebtors,
  getTransactions,
  addMoney,
  removeMoney,
  resetBalance,
};
