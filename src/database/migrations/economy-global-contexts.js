const EconomyBalance = require('../models/economy/EconomyBalance');
const EconomyContext = require('../models/economy/EconomyContext');
const EconomyLogChannel = require('../models/economy/EconomyLogChannel');

// Se ejecuta antes de aceptar comandos. El plan persistido permite reanudar una
// interrupción incluso en MongoDB independiente, sin volver a sumar los saldos.
const migrateEconomyGlobalContexts = async () => {
  const journal = EconomyBalance.db.collection('economy_scope_migrations');
  const specs = [
    { model: EconomyBalance, keys: ['guildId', 'contextId', 'userId'], removed: 'channelId' },
    { model: EconomyContext, keys: ['guildId', 'slug'], removed: 'channelId' },
    { model: EconomyLogChannel, keys: ['guildId'], removed: 'sourceChannelId' },
  ];
  for (const { model, keys, removed } of specs) {
    const collection = model.collection;
    const apply = async (plan) => {
      const others = plan.originals.filter((doc) => String(doc._id) !== String(plan.result._id)).map((doc) => doc._id);
      if (others.length) await collection.deleteMany({ _id: { $in: others } });
      await collection.replaceOne({ _id: plan.result._id }, plan.result, { upsert: true });
      await journal.updateOne({ _id: plan._id }, { $set: { complete: true } });
    };
    for (const plan of await journal.find({ collection: collection.name, complete: false }).toArray()) {
      await apply(plan);
    }
    const groups = await collection.aggregate([
      // Sin categoría explícita no se inventa una: esos registros se conservan.
      { $match: Object.fromEntries(keys.map((key) => [key, { $type: 'string', $ne: '' }])) },
      { $group: {
        _id: Object.fromEntries(keys.map((key) => [key, `$${key}`])),
        count: { $sum: 1 },
        scoped: { $sum: { $cond: [{ $ne: [{ $type: `$${removed}` }, 'missing'] }, 1, 0] } },
      } },
      { $match: { $or: [{ count: { $gt: 1 } }, { scoped: { $gt: 0 } }] } },
    ]).toArray();
    for (const group of groups) {
      const originals = await collection.find(group._id).sort({ _id: 1 }).toArray();
      const selected = model === EconomyLogChannel
        ? [...originals].sort((a, b) => new Date(b.setAt || 0) - new Date(a.setAt || 0))[0]
        : originals[0];
      const result = { ...selected };
      delete result[removed];
      if (model === EconomyBalance) {
        // BigInt evita perder precisión antes de validar la suma consolidada.
        let total = 0n;
        for (const doc of originals) {
          if (!Number.isSafeInteger(doc.balance)) throw new Error('Saldo inválido durante la migración de economía.');
          total += BigInt(doc.balance);
        }
        result.balance = Number(total);
        if (!Number.isSafeInteger(result.balance)) throw new Error('El saldo consolidado excede el rango de enteros seguros.');
        result.updatedAt = new Date(Math.max(...originals.map((doc) => new Date(doc.updatedAt || 0).getTime())));
      }
      const plan = {
        _id: `${collection.name}:${JSON.stringify(group._id)}`,
        collection: collection.name, originals, result, complete: false,
      };
      const existing = await journal.findOne({ _id: plan._id });
      if (existing?.complete) throw new Error('Se detectaron nuevos registros por canal tras migrar economía. Detén las versiones antiguas del bot.');
      if (!existing) await journal.insertOne(plan);
      await apply(existing || plan);
    }
  }
};

module.exports = { migrateEconomyGlobalContexts };
