const EconomyBalance = require('../../database/models/economy/EconomyBalance');
const EconomyTransaction = require('../../database/models/economy/EconomyTransaction');
const mongoose = require('mongoose');
const EconomyLogChannel = require('../../database/models/economy/EconomyLogChannel');
const EconomyContext = require('../../database/models/economy/EconomyContext');
const { UserError } = require('../../utils/userError');

const ensurePositiveAmount = (amount) => {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    // UserError: este mensaje sí está escrito para quien ejecuta el comando.
    throw new UserError('La cantidad debe ser un numero entero positivo.');
  }
};

const ensureSafeBalance = (balance) => {
  if (!Number.isSafeInteger(balance)) {
    throw new UserError('La deuda resultante excede el rango permitido de números enteros.');
  }
};

const ensureAuditChannelId = (channelId) => {
  if (!channelId) throw new UserError('Selecciona un canal de auditoría.');
};

const ensureGuildId = (guildId) => {
  if (!guildId) throw new UserError('Este comando debe usarse dentro de un servidor de Discord.');
};

const ensureBalanceScope = (guildId, contextId) => {
  ensureGuildId(guildId);
  if (!contextId) throw new UserError('Selecciona un contexto de balance.');
};

const ensureUserId = (userId) => {
  if (!userId) throw new UserError('Selecciona un usuario.');
};

const isTransactionUnsupported = (error) => (
  error?.code === 20
  || /transaction numbers are only allowed on a replica set member or mongos|transactions are not supported/i.test(error?.message || '')
);

const withSession = (options, session) => (session ? { ...options, session } : options);
const createWithSession = (documents, session) => (
  session ? EconomyTransaction.create(documents, { session }) : EconomyTransaction.create(documents)
);

const runInTransaction = async (work) => {
  let session;
  try {
    session = await mongoose.startSession();
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } catch (error) {
    // MongoDB independiente no admite transacciones. El saldo sigue estando
    // aislado por su clave compuesta; solo se pierde la agrupación atómica con
    // el historial, que sí se mantiene cuando hay replica set.
    if (!isTransactionUnsupported(error)) throw error;
    console.warn('[WARN] MongoDB no admite transacciones; se guardará el movimiento sin sesión.');
    return await work(null);
  } finally {
    if (session) await session.endSession();
  }
};

const getLogChannel = async (guildId) => {
  ensureGuildId(guildId);
  const doc = await EconomyLogChannel.findOne({ guildId });
  return doc?.channelId || null;
};

const setLogChannel = async ({ guildId, channelId, setBy }) => {
  ensureGuildId(guildId);
  ensureAuditChannelId(channelId);
  return await EconomyLogChannel.findOneAndUpdate(
    { guildId },
    { channelId, setBy, setAt: new Date() },
    { upsert: true, new: true },
  );
};

const getBalance = async (guildId, contextId, userId) => {
  ensureBalanceScope(guildId, contextId);
  ensureUserId(userId);
  const doc = await EconomyBalance.findOne({ guildId, contextId, userId });
  const debt = doc?.balance || 0;
  ensureSafeBalance(debt);
  if (debt < 0) throw new UserError('Este registro antiguo tiene un importe negativo. Revisa su historial y corrígelo con `/balance reiniciar` antes de registrar la deuda correcta.');
  return debt;
};

const getLeaderboard = async (guildId, contextId, limit = 10) => {
  ensureBalanceScope(guildId, contextId);
  const safeLimit = Math.min(Math.max(1, limit), 100);
  return await EconomyBalance.find({ guildId, contextId, balance: { $gt: 0 } })
    .sort({ balance: -1 })
    .limit(safeLimit)
    .select('userId balance');
};

const getTotalsByContext = async (guildId, contextIds) => {
  ensureGuildId(guildId);
  const ids = [...new Set((contextIds || []).filter(Boolean))];
  if (!ids.length) return new Map();
  const totals = await EconomyBalance.aggregate([
    { $match: { guildId, contextId: { $in: ids } } },
    { $group: {
      _id: '$contextId',
      totalDebt: { $sum: '$balance' },
      negativeRecords: { $sum: { $cond: [{ $lt: ['$balance', 0] }, 1, 0] } },
    } },
  ]);
  if (totals.some(({ negativeRecords }) => negativeRecords > 0)) {
    throw new UserError('Hay registros antiguos con importes negativos. Revisa y corrige esas deudas antes de consultar el total; no se han convertido sus signos.');
  }
  for (const { totalDebt } of totals) ensureSafeBalance(totalDebt);
  return new Map(totals.map(({ _id, totalDebt }) => [_id, { totalDebt }]));
};

const addMoney = async ({ guildId, contextId, userId, executorId, amount, description = '' }) => {
  ensurePositiveAmount(amount);
  ensureBalanceScope(guildId, contextId);
  ensureUserId(userId);

  return runInTransaction(async (session) => {
    const oldDoc = await EconomyBalance.findOneAndUpdate(
      { guildId, contextId, userId, balance: { $gte: 0, $lte: Number.MAX_SAFE_INTEGER - amount } },
      {
        $inc: { balance: amount },
        $set: { updatedAt: new Date() },
        $setOnInsert: { guildId, contextId, userId },
      },
      withSession({ upsert: true, new: false }, session),
    ).catch((error) => {
      // Un registro fuera del rango no coincide; el índice único impide que
      // el upsert lo duplique. No se modifica su importe ni se crea historial.
      if (error.code === 11000) throw new UserError('No se pudo agregar: la deuda excede el límite permitido o el registro antiguo tiene un importe negativo. Revisa la deuda actual.');
      throw error;
    });
    const previousBalance = oldDoc?.balance || 0;
    const newBalance = previousBalance + amount;
    ensureSafeBalance(newBalance);
    await createWithSession([{
      guildId, contextId, type: 'add', userId, affectedUserIds: [userId], executorId, amount,
      description: String(description || '').trim(),
    }], session);
    return { previousBalance, newBalance };
  });
};

const clearLogChannel = async (guildId) => {
  ensureGuildId(guildId);
  return await EconomyLogChannel.findOneAndDelete({ guildId });
};

const removeMoney = async ({ guildId, contextId, userId, executorId, amount, description = '' }) => {
  ensurePositiveAmount(amount);
  ensureBalanceScope(guildId, contextId);
  ensureUserId(userId);

  return runInTransaction(async (session) => {
    const oldDoc = await EconomyBalance.findOneAndUpdate(
      { guildId, contextId, userId, balance: { $gte: amount } },
      {
        $inc: { balance: -amount },
        $set: { updatedAt: new Date() },
      },
      withSession({ new: false }, session),
    );
    if (!oldDoc) throw new UserError('No puedes quitar más de la deuda actual. No se modificó la deuda.');
    const previousBalance = oldDoc.balance;
    const newBalance = previousBalance - amount;
    ensureSafeBalance(newBalance);
    await createWithSession([{
      guildId, contextId, type: 'remove', userId, affectedUserIds: [userId], executorId, amount,
      description: String(description || '').trim(),
    }], session);
    return { previousBalance, newBalance };
  });
};

const resetBalance = async ({ guildId, contextId, userId, executorId }) => {
  ensureBalanceScope(guildId, contextId);
  ensureUserId(userId);
  return runInTransaction(async (session) => {
    const oldDoc = await EconomyBalance.findOneAndUpdate(
      { guildId, contextId, userId },
      { $set: { balance: 0, updatedAt: new Date() } },
      withSession({ new: false }, session),
    );
    const previousBalance = oldDoc?.balance || 0;
    await createWithSession([{
      guildId, contextId, type: 'reset', userId, affectedUserIds: [userId], executorId,
      amount: previousBalance, description: 'Reinicio de deuda',
    }], session);
    return { previousBalance };
  });
};

const getDebtors = getLeaderboard;

const getTransactions = (guildId, contextId, userId, limit = 10) => {
  ensureBalanceScope(guildId, contextId);
  ensureUserId(userId);
  return EconomyTransaction.find({
    guildId, contextId, affectedUserIds: userId,
  }).sort({ createdAt: -1, _id: -1 }).limit(Math.min(Math.max(1, limit), 25));
};

const deleteContext = async ({ guildId, contextId }) => {
  ensureBalanceScope(guildId, contextId);
  return runInTransaction(async (session) => {
    const options = withSession({}, session);
    const scope = { guildId, contextId };
    // En standalone, conservar la categoría hasta terminar permite reintentar
    // si falla el borrado de sus datos. En replica set se confirma todo junto.
    const balances = await EconomyBalance.deleteMany(scope, options);
    const transactions = await EconomyTransaction.deleteMany(scope, options);
    await EconomyContext.deleteOne({ guildId, slug: contextId }, options);
    return { balancesDeleted: balances.deletedCount, transactionsDeleted: transactions.deletedCount };
  });
};

module.exports = {
  getLogChannel,
  setLogChannel,
  clearLogChannel,
  getBalance,
  getLeaderboard,
  getTotalsByContext,
  getDebtors,
  getTransactions,
  addMoney,
  removeMoney,
  resetBalance,
  deleteContext,
};
