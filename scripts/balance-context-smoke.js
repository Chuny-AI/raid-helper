const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { ApplicationCommandOptionType, CommandInteractionOptionResolver } = require('discord.js');
const EconomyRole = require('../src/database/models/economy/EconomyRole');
const EconomyContext = require('../src/database/models/economy/EconomyContext');
const EconomyBalance = require('../src/database/models/economy/EconomyBalance');
const EconomyTransaction = require('../src/database/models/economy/EconomyTransaction');
const EconomyLogChannel = require('../src/database/models/economy/EconomyLogChannel');
const command = require('../src/commands/utility/balance');
const economyService = require('../src/services/economy/economyService');
const contextService = require('../src/services/economy/economyContextService');
const setupService = require('../src/features/setup/application/setup-service');

const saved = {
  startSession: mongoose.startSession,
  rolesFind: EconomyRole.find,
  contextsFind: EconomyContext.find,
  contextsFindOne: EconomyContext.findOne,
  contextsCreate: EconomyContext.create,
  balanceFind: EconomyBalance.findOne,
  balanceFindMany: EconomyBalance.find,
  balanceAggregate: EconomyBalance.aggregate,
  balanceUpdate: EconomyBalance.findOneAndUpdate,
  transactionsCreate: EconomyTransaction.create,
  transactionsFind: EconomyTransaction.find,
  logFind: EconomyLogChannel.findOne,
  logUpdate: EconomyLogChannel.findOneAndUpdate,
  logDelete: EconomyLogChannel.findOneAndDelete,
};

(async () => {
  for (const subcommand of command.data.toJSON().options) {
    let foundOptional = false;
    for (const option of subcommand.options || []) {
      if (!option.required) foundOptional = true;
      else assert.equal(foundOptional, false, `${subcommand.name} no puede tener opciones obligatorias después de una opcional`);
    }
  }
  assert.ok(EconomyBalance.schema.indexes().some(([keys, options]) =>
    keys.guildId === 1 && keys.channelId === 1 && keys.contextId === 1 && keys.userId === 1 && options.unique));
  assert.ok(EconomyTransaction.schema.path('channelId'));
  assert.equal(EconomyBalance.schema.path('contextId').options.default, undefined);
  assert.equal(EconomyTransaction.schema.path('contextId').options.default, undefined);
  assert.ok(EconomyContext.schema.indexes().some(([keys, options]) =>
    keys.guildId === 1 && keys.channelId === 1 && keys.slug === 1 && options.unique));
  assert.ok(EconomyLogChannel.schema.indexes().some(([keys, options]) =>
    keys.guildId === 1 && keys.sourceChannelId === 1 && options.unique));

  const contexts = [];
  const balances = new Map();
  const transactions = [];
  const published = [];
  EconomyRole.find = () => ({ sort: async () => [{ roleId: 'balance-role' }] });
  EconomyContext.create = async (data) => {
    if (contexts.some((context) => context.guildId === data.guildId && context.channelId === data.channelId && context.slug === data.slug)) {
      const error = new Error('duplicate'); error.code = 11000; throw error;
    }
    contexts.push(data);
    return data;
  };
  EconomyContext.findOne = async (filter) => contexts.find((context) =>
    context.guildId === filter.guildId && context.channelId === filter.channelId && context.slug === filter.slug) || null;
  EconomyContext.find = (filter) => {
    const matches = contexts.filter((context) => {
      if (context.guildId !== filter.guildId || (filter.channelId && context.channelId !== filter.channelId)) return false;
      if (!filter.$or) return true;
      return filter.$or.some((condition) => {
        const [field, expression] = Object.entries(condition)[0];
        return new RegExp(expression.$regex, expression.$options).test(context[field]);
      });
    });
    const query = {
      then: (resolve, reject) => Promise.resolve(matches).then(resolve, reject),
      limit: async (count) => matches.slice(0, count),
    };
    return { sort: () => query };
  };
  EconomyBalance.findOne = async (filter) => ({ balance: balances.get(`${filter.guildId}:${filter.channelId}:${filter.contextId}:${filter.userId}`) || 0 });
  EconomyBalance.find = (filter) => ({
    sort: () => ({ limit: (limit) => ({ select: async () => Array.from(balances.entries())
      .filter(([key, balance]) => key.startsWith(`${filter.guildId}:${filter.channelId}:${filter.contextId}:`)
        && (filter.balance.$gt !== undefined ? balance > 0 : balance < 0))
      .map(([key, balance]) => ({ userId: key.split(':')[3], balance }))
      .sort((a, b) => b.balance - a.balance).slice(0, limit) }) }),
  });
  EconomyBalance.aggregate = async (pipeline) => {
    const match = pipeline[0].$match;
    assert.equal(match.balance, undefined, 'El resumen debe incluir también saldos positivos');
    assert.deepEqual(pipeline[1].$group.totalBalance, { $sum: '$balance' });
    assert.deepEqual(pipeline[1].$group.totalDebt, {
      $sum: { $cond: [{ $lt: ['$balance', 0] }, { $abs: '$balance' }, 0] },
    });
    const totals = new Map();
    for (const [key, balance] of balances.entries()) {
      const [guildId, channelId, contextId] = key.split(':');
      if (guildId !== match.guildId
        || !match.$or.some((scope) => scope.channelId === channelId && scope.contextId === contextId)) continue;
      const totalKey = `${channelId}:${contextId}`;
      const total = totals.get(totalKey) || { totalBalance: 0, totalDebt: 0 };
      total.totalBalance += balance;
      total.totalDebt += balance < 0 ? Math.abs(balance) : 0;
      totals.set(totalKey, total);
    }
    return Array.from(totals, ([key, total]) => {
      const [channelId, contextId] = key.split(':');
      return { _id: { channelId, contextId }, ...total };
    });
  };
  EconomyBalance.findOneAndUpdate = async (filter, update, options) => {
    assert.ok(options.session);
    const key = `${filter.guildId}:${filter.channelId}:${filter.contextId}:${filter.userId}`;
    const previous = balances.get(key) || 0;
    balances.set(key, update.$inc ? previous + update.$inc.balance : update.$set.balance);
    return { balance: previous };
  };
  EconomyTransaction.create = async (docs, options) => {
    assert.ok(options.session);
    transactions.push(...docs.map((doc) => ({ ...doc, createdAt: new Date() })));
  };
  EconomyTransaction.find = (filter) => ({
    sort: () => ({ limit: async () => transactions.filter((item) =>
      item.guildId === filter.guildId && item.channelId === filter.channelId && item.contextId === filter.contextId
      && item.affectedUserIds.includes(filter.affectedUserIds)).reverse() }),
  });
  EconomyLogChannel.findOne = async (filter) => {
    assert.equal(filter.guildId, 'guild');
    assert.ok(filter.sourceChannelId);
    return { channelId: `logs-${filter.sourceChannelId}` };
  };
  mongoose.startSession = async () => ({
    withTransaction: async (work) => work(),
    endSession: async () => {},
  });

  const makeInteraction = (action, values = {}, authorized = true, channelId = 'channel-a') => {
    const interaction = {
      guildId: 'guild',
      channelId,
      guild: { channels: { fetch: async (auditChannelId) => ({ send: async (payload) => published.push({ auditChannelId, payload }) }) } },
      member: { roles: { cache: { some: (fn) => authorized && fn({ id: 'balance-role' }) } } },
      user: { id: 'operator' },
      options: new CommandInteractionOptionResolver({}, [{
        name: action, type: ApplicationCommandOptionType.Subcommand,
        options: Object.entries(values).map(([name, value]) => ({
          name, value,
          type: name === 'usuario' ? ApplicationCommandOptionType.User
            : name === 'canal' ? ApplicationCommandOptionType.Channel
              : name === 'cantidad' ? ApplicationCommandOptionType.Integer : ApplicationCommandOptionType.String,
          ...(name === 'usuario' ? { user: { id: value } } : {}),
          ...(name === 'canal' ? { channel: { id: value } } : {}),
        })),
      }]),
      async deferReply() {},
      async editReply(payload) {
        interaction.answer = payload.content || [
          payload.embeds[0].data.title,
          ...payload.embeds[0].data.fields.map((field) => `${field.name} ${field.value}`),
        ].join('\n');
      },
    };
    return interaction;
  };
  const run = async (action, values, authorized = true, channelId = 'channel-a') => {
    const interaction = makeInteraction(action, values, authorized, channelId);
    await command.execute(interaction);
    return interaction.answer;
  };

  assert.match(await run('crear-contexto', { nombre: 'Avalonianas' }, false), /Solo quienes tengan/);
  assert.equal(contexts.length, 0);
  assert.match(await run('crear-contexto', { nombre: 'Avalonianas' }), /creado/);
  assert.match(await run('crear-contexto', { nombre: 'Gremio' }), /creado/);
  assert.match(await run('crear-contexto', { nombre: 'Avalonianas' }, true, 'channel-b'), /creado/);
  assert.match(await run('crear-contexto', { nombre: 'AVALONIANAS' }), /Ya existe/);
  const autocomplete = async (channelId, focused, selectedChannel, authorized = true) => {
    let choices;
    await command.autocomplete({
      guildId: 'guild', channelId,
      member: { roles: ['balance-role'].filter(() => authorized) },
      options: new CommandInteractionOptionResolver({}, [
        { name: 'contexto', type: ApplicationCommandOptionType.String, value: focused, focused: true },
        ...(selectedChannel ? [{ name: 'canal', type: ApplicationCommandOptionType.Channel, value: selectedChannel }] : []),
      ]),
      respond: async (result) => { choices = result; },
    });
    return choices;
  };
  assert.deepEqual((await autocomplete('channel-b', '')).map((choice) => choice.value), ['avalonianas']);
  assert.deepEqual(await autocomplete('channel-b', '(.*'), []);
  assert.deepEqual((await autocomplete('channel-b', '', 'channel-a')).map((choice) => choice.value), ['avalonianas', 'gremio']);
  assert.deepEqual(await autocomplete('channel-a', '', 'channel-b', false), []);
  await run('agregar', { contexto: 'avalonianas', usuario: 'member', cantidad: 100, motivo: 'Botín' });
  await run('agregar', { contexto: 'gremio', usuario: 'member', cantidad: 40, motivo: 'Aporte' });
  await run('agregar', { contexto: 'avalonianas', usuario: 'member', cantidad: 7, motivo: 'Otro canal' }, true, 'channel-b');
  assert.match(await run('ver', { contexto: 'avalonianas', usuario: 'member' }), /100/);
  assert.match(await run('ver', { contexto: 'Avalonianas', usuario: 'member' }), /100/);
  assert.match(await run('ver', { contexto: 'gremio', usuario: 'member' }), /40/);
  assert.match(await run('ver', { contexto: 'avalonianas', usuario: 'member' }, true, 'channel-b'), /7/);
  assert.match(await run('ver', { contexto: 'avalonianas', usuario: 'member', canal: 'channel-a' }, true, 'channel-c'), /100/);
  assert.match(await run('ranking', { contexto: 'avalonianas' }, true, 'channel-b'), /7/);
  assert.doesNotMatch(await run('ranking', { contexto: 'avalonianas' }, true, 'channel-b'), /100/);
  const globalContexts = await run('contextos', {}, true, 'channel-b');
  assert.match(globalContexts, /Contextos de balance del servidor \(3\)/);
  assert.match(globalContexts, /Avalonianas · <#channel-a> — Saldo: \*\*100\*\* · Debe: \*\*0\*\*/);
  assert.match(globalContexts, /Gremio · <#channel-a> — Saldo: \*\*40\*\* · Debe: \*\*0\*\*/);
  assert.match(globalContexts, /Avalonianas · <#channel-b> — Saldo: \*\*7\*\* · Debe: \*\*0\*\*/);
  assert.match(await run('ver', { contexto: 'gremio', usuario: 'member' }, true, 'channel-b'), /no existe en este canal/);
  assert.equal(transactions.length, 3);
  assert.deepEqual(transactions.map((item) => [item.channelId, item.contextId]), [
    ['channel-a', 'avalonianas'], ['channel-a', 'gremio'], ['channel-b', 'avalonianas'],
  ]);
  assert.equal(published.length, 3);
  assert.equal(published[0].payload.embeds[0].data.fields[0].value, '<#channel-a>');
  assert.equal(published[0].payload.embeds[0].data.fields[1].value, 'Avalonianas');
  assert.equal(published[2].auditChannelId, 'logs-channel-b');
  assert.match(await run('historial', { contexto: 'avalonianas', usuario: 'member' }), /Botín/);
  assert.doesNotMatch(await run('historial', { contexto: 'avalonianas', usuario: 'member' }, true, 'channel-b'), /Botín/);
  await run('quitar', { contexto: 'avalonianas', usuario: 'member', cantidad: 2, motivo: 'Ajuste' }, true, 'channel-b');
  assert.match(await run('ver', { contexto: 'avalonianas', usuario: 'member' }, true, 'channel-b'), /5/);
  assert.match(await run('ver', { contexto: 'avalonianas', usuario: 'member' }), /100/);
  await run('reiniciar', { contexto: 'avalonianas', usuario: 'member' }, true, 'channel-b');
  assert.match(await run('ver', { contexto: 'avalonianas', usuario: 'member' }, true, 'channel-b'), /0/);
  assert.match(await run('ver', { contexto: 'avalonianas', usuario: 'member' }), /100/);
  await run('quitar', { contexto: 'gremio', usuario: 'member', cantidad: 50, motivo: 'Deuda' });
  assert.match(await run('contextos'), /Gremio · <#channel-a> — Saldo: \*\*-10\*\* · Debe: \*\*10\*\*/);
  assert.match(await run('agregar', { contexto: 'gremio', usuario: 'member', cantidad: 1, motivo: 'No' }, false), /Solo quienes tengan/);
  assert.equal(transactions.length, 6);

  // Todos los comandos usan el canal seleccionado, incluido su registro de auditoría.
  const remote = { contexto: 'gremio', usuario: 'member', canal: 'channel-a' };
  assert.match(await run('agregar', { ...remote, cantidad: 25, motivo: 'Ingreso remoto' }, true, 'channel-c'), /-10 → \*\*15\*\*/);
  assert.match(await run('ver', remote, true, 'channel-c'), /<#channel-a> · <@member>: \*\*15\*\*/);
  assert.match(await run('ranking', { contexto: 'gremio', canal: 'channel-a' }, true, 'channel-c'), /<@member> — 15/);
  assert.match(await run('historial', remote, true, 'channel-c'), /Ingreso remoto/);
  assert.equal(published.at(-1).auditChannelId, 'logs-channel-a');
  assert.equal(published.at(-1).payload.embeds[0].data.fields[0].value, '<#channel-a>');
  assert.equal(transactions.at(-1).channelId, 'channel-a');
  assert.match(await run('quitar', { ...remote, cantidad: 5, motivo: 'Retiro remoto' }, true, 'channel-c'), /15 → \*\*10\*\*/);
  assert.match(await run('reiniciar', remote, true, 'channel-c'), /10 → \*\*0\*\*/);
  assert.match(await run('ver', remote, true, 'channel-c'), /<@member>: \*\*0\*\*/);
  assert.match(await run('ranking', { contexto: 'gremio', canal: 'channel-a' }, true, 'channel-c'), /no hay saldos positivos/);
  assert.match(await run('historial', remote, true, 'channel-c'), /Reset de balance/);
  assert.match(await run('ver', { contexto: 'avalonianas', usuario: 'member' }), /<@member>: \*\*100\*\*/);
  assert.equal([...balances.keys()].some((key) => key.includes(':channel-c:')), false);

  // El total suma varios miembros; la deuda no se cancela con saldos positivos.
  await run('agregar', { contexto: 'gremio', usuario: 'creditor', cantidad: 30, motivo: 'Crédito' });
  await run('quitar', { contexto: 'gremio', usuario: 'debtor', cantidad: 12, motivo: 'Deuda' });
  balances.set('other-guild:channel-a:gremio:member', 999);
  assert.match(await run('contextos'), /Gremio · <#channel-a> — Saldo: \*\*18\*\* · Debe: \*\*12\*\*/);
  assert.match(await run('ver', { contexto: 'gremio', usuario: 'unknown' }), /<@unknown>: \*\*0\*\*/);
  assert.match(await run('historial', { contexto: 'gremio', usuario: 'unknown' }), /No hay movimientos/);

  const beforeInvalid = transactions.length;
  for (const action of ['agregar', 'quitar', 'reiniciar']) {
    assert.match(await run(action, { ...remote, cantidad: 3, motivo: 'Sin permiso' }, false), /Solo quienes tengan/);
    assert.match(await run(action, { ...remote, canal: 'channel-c', cantidad: 3, motivo: 'No existe' }), /no existe en este canal/);
  }
  for (const cantidad of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.match(await run('agregar', { ...remote, cantidad, motivo: 'Inválido' }), /entero positivo/);
    assert.match(await run('quitar', { ...remote, cantidad, motivo: 'Inválido' }), /entero positivo/);
  }
  assert.match(await run('agregar', { ...remote, cantidad: 3, motivo: '   ' }), /Escribe un motivo/);
  assert.equal(transactions.length, beforeInvalid);
  await assert.rejects(economyService.getBalance('guild', undefined, 'avalonianas', 'member'), /canal/);
  await assert.rejects(economyService.getBalance('guild', 'channel-a', undefined, 'member'), /contexto/);
  await assert.rejects(economyService.getBalance(undefined, 'channel-a', 'avalonianas', 'member'), /servidor/);
  assert.equal((await contextService.listContexts('guild')).length, 3);
  assert.throws(() => contextService.listContexts(undefined, 'channel-a'), /servidor/);
  assert.throws(() => economyService.getTransactions('guild', undefined, 'avalonianas', 'member'), /canal/);
  assert.throws(() => economyService.getTransactions('guild', 'channel-a', undefined, 'member'), /contexto/);

  EconomyLogChannel.findOneAndUpdate = async (filter, update, options) => {
    assert.deepEqual(filter, { guildId: 'guild', sourceChannelId: 'channel-a' });
    assert.equal(update.channelId, 'logs-channel-a');
    assert.equal(options.upsert, true);
  };
  EconomyLogChannel.findOneAndDelete = async (filter) => {
    assert.deepEqual(filter, { guildId: 'guild', sourceChannelId: 'channel-a' });
  };
  const guild = {
    id: 'guild',
    members: { me: {} },
    channels: { cache: new Map([['logs-channel-a', {
      id: 'logs-channel-a', isTextBased: () => true, send: () => {},
      permissionsFor: () => ({ has: () => true }),
    }]]) },
  };
  await setupService.saveEconomyChannel({
    guild, sourceChannelId: 'channel-a', channelId: 'logs-channel-a', userId: 'admin',
  });
  await setupService.clearLogChannel('guild', 'channel-a');
  console.log('✅ Aislamiento por canal, contextos, permisos y auditoría verificados');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  mongoose.startSession = saved.startSession;
  EconomyRole.find = saved.rolesFind;
  EconomyContext.find = saved.contextsFind;
  EconomyContext.findOne = saved.contextsFindOne;
  EconomyContext.create = saved.contextsCreate;
  EconomyBalance.findOne = saved.balanceFind;
  EconomyBalance.find = saved.balanceFindMany;
  EconomyBalance.aggregate = saved.balanceAggregate;
  EconomyBalance.findOneAndUpdate = saved.balanceUpdate;
  EconomyTransaction.create = saved.transactionsCreate;
  EconomyTransaction.find = saved.transactionsFind;
  EconomyLogChannel.findOne = saved.logFind;
  EconomyLogChannel.findOneAndUpdate = saved.logUpdate;
  EconomyLogChannel.findOneAndDelete = saved.logDelete;
});
