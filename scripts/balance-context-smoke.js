const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { ApplicationCommandOptionType, CommandInteractionOptionResolver, MessageFlags } = require('discord.js');
const EconomyRole = require('../src/database/models/economy/EconomyRole');
const EconomyContext = require('../src/database/models/economy/EconomyContext');
const EconomyBalance = require('../src/database/models/economy/EconomyBalance');
const EconomyTransaction = require('../src/database/models/economy/EconomyTransaction');
const EconomyLogChannel = require('../src/database/models/economy/EconomyLogChannel');
const command = require('../src/commands/utility/balance');
const { filterCommand } = require('../src/utils/commandFilter');
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
  contextsDelete: EconomyContext.deleteOne,
  balancesDelete: EconomyBalance.deleteMany,
  transactionsDelete: EconomyTransaction.deleteMany,
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
    keys.guildId === 1 && keys.contextId === 1 && keys.userId === 1 && options.unique));
  assert.equal(Boolean(EconomyTransaction.schema.path('channelId').isRequired), false);
  assert.equal(EconomyBalance.schema.path('contextId').options.default, undefined);
  assert.equal(EconomyTransaction.schema.path('contextId').options.default, undefined);
  assert.ok(EconomyContext.schema.indexes().some(([keys, options]) =>
    keys.guildId === 1 && keys.slug === 1 && options.unique));
  assert.ok(EconomyLogChannel.schema.indexes().some(([keys, options]) =>
    keys.guildId === 1 && options.unique));

  const contexts = [];
  const balances = new Map();
  const transactions = [];
  const published = [];
  EconomyRole.find = () => ({ sort: async () => [{ roleId: 'balance-role' }] });
  EconomyContext.create = async (data) => {
    if (contexts.some((context) => context.guildId === data.guildId && context.slug === data.slug)) {
      const error = new Error('duplicate'); error.code = 11000; throw error;
    }
    contexts.push(data);
    return data;
  };
  EconomyContext.findOne = async (filter) => contexts.find((context) =>
    context.guildId === filter.guildId && context.slug === filter.slug) || null;
  EconomyContext.find = (filter) => {
    const matches = contexts.filter((context) => {
      if (context.guildId !== filter.guildId) return false;
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
  EconomyBalance.findOne = async (filter) => ({ balance: balances.get(`${filter.guildId}:${filter.contextId}:${filter.userId}`) || 0 });
  EconomyBalance.find = (filter) => {
    let offset = 0;
    let limit = Infinity;
    const query = {
      sort: () => query,
      skip: (value) => { offset = value; return query; },
      limit: (value) => { limit = value; return query; },
      select: async () => Array.from(balances.entries())
      .filter(([key, balance]) => key.startsWith(`${filter.guildId}:${filter.contextId}:`)
        && (filter.balance.$gt !== undefined ? balance > 0 : balance < 0))
      .map(([key, balance]) => ({ userId: key.split(':')[2], balance }))
      .sort((a, b) => b.balance - a.balance || a.userId.localeCompare(b.userId)).slice(offset, offset + limit),
    };
    return query;
  };
  EconomyBalance.aggregate = async (pipeline) => {
    const match = pipeline[0].$match;
    assert.equal(match.balance, undefined, 'El resumen debe incluir también saldos positivos');
    assert.equal(pipeline[1].$group.totalBalance, undefined);
    assert.deepEqual(pipeline[1].$group.totalDebt, {
      $sum: '$balance',
    });
    assert.deepEqual(pipeline[1].$group.personCount, {
      $sum: { $cond: [{ $gt: ['$balance', 0] }, 1, 0] },
    });
    const totals = new Map();
    for (const [key, balance] of balances.entries()) {
      const [guildId, contextId] = key.split(':');
      if (guildId !== match.guildId
        || !match.contextId.$in.includes(contextId)) continue;
      const totalKey = contextId;
      const total = totals.get(totalKey) || { totalDebt: 0, negativeRecords: 0, personCount: 0 };
      total.totalDebt += balance;
      total.personCount += balance > 0 ? 1 : 0;
      total.negativeRecords += balance < 0 ? 1 : 0;
      totals.set(totalKey, total);
    }
    return Array.from(totals, ([key, total]) => {
      const contextId = key;
      return { _id: contextId, ...total };
    });
  };
  EconomyBalance.findOneAndUpdate = async (filter, update, options) => {
    assert.ok(options.session);
    const key = `${filter.guildId}:${filter.contextId}:${filter.userId}`;
    const previous = balances.get(key) || 0;
    if (filter.balance && (previous < filter.balance.$gte || previous > filter.balance.$lte || (!balances.has(key) && !options.upsert))) {
      if (options.upsert) { const error = new Error('duplicate'); error.code = 11000; throw error; }
      return null;
    }
    balances.set(key, update.$inc ? previous + update.$inc.balance : update.$set.balance);
    return { balance: previous };
  };
  EconomyTransaction.create = async (docs, options) => {
    assert.ok(options.session);
    transactions.push(...docs.map((doc) => ({ ...doc, createdAt: new Date() })));
  };
  EconomyTransaction.find = (filter) => ({
    sort: () => ({ limit: async () => transactions.filter((item) =>
      item.guildId === filter.guildId && item.contextId === filter.contextId
      && item.affectedUserIds.includes(filter.affectedUserIds)).reverse() }),
  });
  EconomyBalance.deleteMany = async (filter, options) => {
    assert.ok(options.session);
    assert.deepEqual(Object.keys(filter).sort(), ['contextId', 'guildId']);
    let deletedCount = 0;
    for (const key of balances.keys()) {
      if (key.startsWith(`${filter.guildId}:${filter.contextId}:`)) {
        balances.delete(key);
        deletedCount++;
      }
    }
    return { deletedCount };
  };
  EconomyTransaction.deleteMany = async (filter, options) => {
    assert.ok(options.session);
    let deletedCount = 0;
    for (let i = transactions.length - 1; i >= 0; i--) {
      if (transactions[i].guildId === filter.guildId && transactions[i].contextId === filter.contextId) {
        transactions.splice(i, 1);
        deletedCount++;
      }
    }
    return { deletedCount };
  };
  EconomyContext.deleteOne = async (filter, options) => {
    assert.ok(options.session);
    const index = contexts.findIndex(c => c.guildId === filter.guildId && c.slug === filter.slug);
    if (index !== -1) contexts.splice(index, 1);
    return { deletedCount: index === -1 ? 0 : 1 };
  };
  EconomyLogChannel.findOne = async (filter) => {
    assert.equal(filter.guildId, 'guild');
    assert.deepEqual(filter, { guildId: 'guild' });
    return { channelId: 'logs-server' };
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
              : ['cantidad', 'pagina'].includes(name) ? ApplicationCommandOptionType.Integer
                : name === 'confirmar' ? ApplicationCommandOptionType.Boolean : ApplicationCommandOptionType.String,
          ...(name === 'usuario' ? { user: { id: value } } : {}),
          ...(name === 'canal' ? { channel: { id: value } } : {}),
        })),
      }]),
      async deferReply(payload) { interaction.deferred = payload; },
      async followUp(payload) {
        (interaction.followUps ||= []).push(payload);
      },
      async editReply(payload) {
        interaction.payload = payload;
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

  for (const sub of command.data.toJSON().options) {
    assert.equal((sub.options || []).some(option => option.name === 'canal'), false);
  }
  assert.match(await run('contextos'), /Aún no hay contextos/);
  assert.match(await run('crear-contexto', { nombre: 'Avalonianas' }, false), /Solo quienes tengan/);
  assert.equal(contexts.length, 0);
  assert.match(await run('crear-contexto', { nombre: 'Avalonianas' }), /creado/);
  assert.match(await run('crear-contexto', { nombre: 'Gremio' }), /creado/);
  assert.match(await run('crear-contexto', { nombre: 'AVALONIANAS' }, true, 'thread-b'), /Ya existe/);
  assert.equal(contexts.length, 2);
  assert.equal(contexts[0].channelId, undefined);
  const autocomplete = async (channelId, focused, authorized = true, action = 'ranking') => {
    let choices;
    await command.autocomplete({
      guildId: 'guild', channelId,
      member: { roles: authorized ? ['balance-role'] : [] },
      options: new CommandInteractionOptionResolver({}, [{
        name: action, type: ApplicationCommandOptionType.Subcommand,
        options: [{ name: 'contexto', type: ApplicationCommandOptionType.String, value: focused, focused: true }],
      }]),
      respond: async (result) => { choices = result; },
    });
    return choices;
  };
  for (const channel of ['channel-a', 'channel-b', 'thread-b', null]) {
    assert.deepEqual((await autocomplete(channel, '')).map(c => c.value), ['avalonianas', 'gremio']);
  }
  assert.deepEqual(await autocomplete('thread-b', '(.*'), []);
  assert.deepEqual(await autocomplete('thread-b', '', false), []);
  assert.deepEqual((await autocomplete('thread-b', '', false, 'ver')).map(c => c.value), ['avalonianas', 'gremio']);
  const avalon = { contexto: 'avalonianas', usuario: 'member' };
  const gremio = { contexto: 'gremio', usuario: 'member' };
  assert.match(await run('agregar', { ...avalon, cantidad: 100, motivo: 'Botín' }), /0 → \*\*100\*\*/);
  assert.match(await run('agregar', { ...gremio, cantidad: 40, motivo: 'Aporte' }), /0 → \*\*40\*\*/);
  assert.match(await run('agregar', { ...avalon, cantidad: 7, motivo: 'Desde hilo' }, true, 'thread-b'), /100 → \*\*107\*\*/);
  const ownBalance = makeInteraction('ver', avalon, false);
  ownBalance.user.id = 'member';
  ownBalance.commandName = 'balance';
  ownBalance.isChatInputCommand = () => true;
  assert.equal(await filterCommand(ownBalance), true);
  await command.execute(ownBalance);
  assert.match(ownBalance.answer, /<@member>: \*\*107\*\*/);
  assert.equal(ownBalance.deferred.flags, MessageFlags.Ephemeral);
  assert.match(await run('ver', avalon, false), /<@member>: \*\*107\*\*/);
  const noGuild = makeInteraction('ver', avalon, false);
  noGuild.guildId = null;
  await command.execute(noGuild);
  assert.match(noGuild.answer, /dentro de un servidor/);
  for (const sub of command.data.toJSON().options.filter(sub => sub.name !== 'ver')) {
    const restricted = makeInteraction(sub.name, avalon, false);
    restricted.commandName = 'balance';
    restricted.isChatInputCommand = () => true;
    restricted.reply = async (payload) => { restricted.denied = payload; };
    assert.equal(await filterCommand(restricted), false, `${sub.name} debe seguir restringido en el filtro`);
    assert.ok(restricted.denied);
    await command.execute(restricted);
    assert.match(restricted.answer, /Solo quienes tengan/, `${sub.name} debe seguir restringido en el comando`);
    assert.deepEqual(await autocomplete('thread-b', '', false, sub.name), []);
  }
  const configuredRoleFind = EconomyRole.find;
  EconomyRole.find = () => ({ sort: async () => [] });
  assert.equal(await filterCommand(ownBalance), true);
  assert.match(await run('ver', avalon, false), /<@member>: \*\*107\*\*/);
  assert.deepEqual((await autocomplete('thread-b', '', false, 'ver')).map(c => c.value), ['avalonianas', 'gremio']);
  EconomyRole.find = configuredRoleFind;
  for (const channel of ['channel-a', 'channel-b', 'thread-b', null]) {
    assert.match(await run('ver', avalon, true, channel), /<@member>: \*\*107\*\*/);
    assert.match(await run('ver', gremio, true, channel), /<@member>: \*\*40\*\*/);
    assert.match(await run('historial', avalon, true, channel), /Botín/);
    assert.match(await run('historial', avalon, true, channel), /Desde hilo/);
    assert.match(await run('ranking', { contexto: 'avalonianas' }, true, channel), /<@member> — 107/);
    const summary = await run('contextos', {}, true, channel);
    assert.match(summary, /servidor \(2\)/);
    assert.match(summary, /Avalonianas — Deuda: \*\*107\*\*/);
    assert.match(summary, /Gremio — Deuda: \*\*40\*\*/);
    assert.doesNotMatch(summary, /<#|saldo/i);
  }
  assert.match(await run('ver', { ...avalon, contexto: 'Avalonianas' }), /107/);
  assert.equal(transactions.length, 3);
  assert.ok(transactions.every(t => t.channelId === undefined));
  assert.ok(published.every(p => p.auditChannelId === 'logs-server'));
  assert.equal(published[2].payload.embeds[0].data.fields[0].value, '<#thread-b>');
  assert.match(await run('quitar', { ...avalon, cantidad: 12, motivo: 'Retiro' }, true, 'channel-b'), /107 → \*\*95\*\*/);
  assert.match(await run('ver', avalon), /<@member>: \*\*95\*\*/);
  assert.match(await run('reiniciar', avalon, true, 'thread-c'), /95 → \*\*0\*\*/);
  assert.match(await run('ver', avalon), /<@member>: \*\*0\*\*/);
  assert.match(await run('historial', avalon), /Reinicio de deuda/);
  assert.match(await run('ranking', { contexto: 'avalonianas' }), /no hay deudas pendientes/);
  assert.match(await run('ver', gremio), /<@member>: \*\*40\*\*/);
  const beforeExcess = transactions.length;
  assert.match(await run('quitar', { ...gremio, cantidad: 50, motivo: 'Exceso' }, true, 'thread-c'), /más de la deuda actual/);
  assert.match(await run('quitar', { ...gremio, usuario: 'missing', cantidad: 1, motivo: 'Sin deuda' }), /más de la deuda actual/);
  assert.equal(transactions.length, beforeExcess);
  assert.equal(balances.has('guild:gremio:missing'), false);
  assert.match(await run('ver', gremio), /\*\*40\*\*/);
  assert.match(await run('quitar', { ...gremio, cantidad: 40, motivo: 'Liquidar' }), /40 → \*\*0\*\*/);
  await run('agregar', { ...gremio, usuario: 'creditor', cantidad: 30, motivo: 'Crédito' });
  balances.set('other-guild:gremio:member', 999);
  assert.match(await run('contextos'), /Gremio — Deuda: \*\*30\*\*/);
  assert.match(await run('ver', { ...avalon, usuario: 'unknown' }), /<@unknown>: \*\*0\*\*/);
  assert.match(await run('historial', { ...avalon, usuario: 'unknown' }), /No hay movimientos/);
  const beforeInvalid = transactions.length;
  for (const action of ['agregar', 'quitar', 'reiniciar']) {
    assert.match(await run(action, { ...gremio, cantidad: 3, motivo: 'Sin permiso' }, false), /Solo quienes tengan/);
    assert.match(await run(action, { ...gremio, contexto: 'inexistente', cantidad: 3, motivo: 'No existe' }), /no existe en este servidor/);
  }
  for (const cantidad of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    for (const action of ['agregar', 'quitar']) {
      assert.match(await run(action, { ...gremio, cantidad, motivo: 'Inválido' }), /entero positivo/);
    }
  }
  assert.match(await run('agregar', { ...gremio, cantidad: 3, motivo: '   ' }), /Escribe un motivo/);
  EconomyLogChannel.findOne = async () => null;
  assert.match(await run('agregar', { ...gremio, cantidad: 3, motivo: 'Sin auditoría' }), /Configura el canal de auditoría/);
  assert.equal(transactions.length, beforeInvalid);
  await assert.rejects(economyService.getBalance('guild', undefined, 'member'), /contexto/);
  await assert.rejects(economyService.getBalance(undefined, 'avalonianas', 'member'), /servidor/);
  assert.equal((await contextService.listContexts('guild')).length, 2);
  assert.throws(() => contextService.listContexts(undefined), /servidor/);
  assert.throws(() => economyService.getTransactions('guild', undefined, 'member'), /contexto/);

  const deletion = { contexto: 'gremio', confirmar: true };
  assert.match(await run('eliminar-contexto', deletion, true, 'thread-c'), /Configura el canal de auditoría/);
  assert.equal(transactions.length, beforeInvalid);
  EconomyLogChannel.findOne = async () => ({ channelId: 'logs-server' });
  assert.match(await run('eliminar-contexto', deletion, false), /Solo quienes tengan/);
  assert.match(await run('eliminar-contexto', { ...deletion, confirmar: false }), /No se eliminó/);
  assert.match(await run('eliminar-contexto', { ...deletion, contexto: 'inexistente' }), /no existe en este servidor/);
  assert.equal(transactions.length, beforeInvalid);
  const otherTransactions = transactions.filter(t => t.contextId !== 'gremio');
  const removedTransactions = transactions.length - otherTransactions.length;
  assert.match(await run('eliminar-contexto', deletion, true, 'thread-c'), new RegExp('eliminado: \\*\\*2\\*\\* registros de deuda y \\*\\*' + removedTransactions + '\\*\\* movimientos'));
  assert.deepEqual(transactions, otherTransactions);
  assert.equal(balances.get('other-guild:gremio:member'), 999);
  assert.equal(balances.has('guild:avalonianas:member'), true);
  assert.equal([...balances.keys()].some(k => k.startsWith('guild:gremio:')), false);
  assert.match(published.at(-1).payload.embeds[0].data.title, /Contexto de balance eliminado/);
  assert.doesNotMatch(await run('contextos'), /Gremio/);
  assert.deepEqual((await autocomplete('thread-b', '')).map(c => c.value), ['avalonianas']);
  assert.match(await run('ver', gremio), /no existe en este servidor/);
  assert.match(await run('crear-contexto', { nombre: 'Gremio' }), /creado/);
  assert.match(await run('ver', gremio), /<@member>: \*\*0\*\*/);
  assert.match(await run('historial', gremio), /No hay movimientos/);
  assert.match(await run('eliminar-contexto', deletion), /\*\*0\*\* registros de deuda y \*\*0\*\* movimientos/);

  // El listado recorre todos los pendientes; los totales no dependen de la página.
  const pendingDefinition = command.data.toJSON().options.find(sub => sub.name === 'pendientes');
  assert.ok(pendingDefinition);
  assert.equal(pendingDefinition.options[0].name, 'contexto');
  assert.equal(pendingDefinition.options[0].required, true);
  assert.equal(pendingDefinition.options[0].autocomplete, true);
  assert.equal(pendingDefinition.options[1].name, 'pagina');
  assert.equal(pendingDefinition.options[1].min_value, 1);
  await run('crear-contexto', { nombre: 'Pagos' });
  assert.match(await run('pendientes', { contexto: 'pagos' }), /Personas con saldo: \*\*0\*\*\nTotal a pagar: \*\*0\*\*/);
  const personIds = Array.from({ length: 45 }, (_, i) => String(100000000000000000n + BigInt(i)));
  for (const id of personIds) balances.set(`guild:pagos:${id}`, 100);
  balances.set('guild:pagos:paid', 0);
  balances.set(`other-guild:pagos:${personIds[0]}`, 999);
  balances.set(`guild:avalonianas:${personIds[0]}`, 888);
  const balancesBeforeListing = new Map(balances);
  const transactionsBeforeListing = transactions.length;
  const publishedBeforeListing = published.length;
  EconomyLogChannel.findOne = async () => null;
  const listedIds = [];
  for (let page = 1; page <= 3; page++) {
    const interaction = makeInteraction('pendientes', { contexto: 'pagos', ...(page > 1 ? { pagina: page } : {}) }, true, 'thread-b');
    await command.execute(interaction);
    assert.equal(interaction.deferred.flags, MessageFlags.Ephemeral);
    assert.deepEqual(interaction.payload.allowedMentions, { parse: [] });
    assert.ok(interaction.answer.length <= 2000);
    assert.match(interaction.answer, /Personas con saldo: \*\*45\*\*\nTotal a pagar: \*\*4\.500\*\*/);
    assert.ok(interaction.answer.includes(`Página **${page}/3**`));
    assert.ok(interaction.answer.includes(`${(page - 1) * 20 + 1}. <@`));
    const ids = [...interaction.answer.matchAll(/<@(\d+)>/g)].map(match => match[1]);
    assert.equal(ids.length, page === 3 ? 5 : 20);
    listedIds.push(...ids);
  }
  assert.deepEqual(listedIds, personIds);
  assert.deepEqual(balances, balancesBeforeListing);
  assert.equal(transactions.length, transactionsBeforeListing);
  assert.equal(published.length, publishedBeforeListing);
  assert.match(await run('pendientes', { contexto: 'pagos', pagina: 4 }), /entre 1 y 3/);
  assert.match(await run('pendientes', { contexto: 'pagos' }, false), /Solo quienes tengan/);
  assert.match(await run('pendientes', { contexto: 'inexistente' }), /no existe en este servidor/);
  await assert.rejects(economyService.getPendingBalances('guild', undefined), /contexto/);
  await assert.rejects(economyService.getPendingBalances(undefined, 'pagos'), /servidor/);
  for (const page of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(economyService.getPendingBalances('guild', 'pagos', page), /entero positivo/);
  }
  balances.set('guild:pagos:legacy', -10);
  assert.match(await run('pendientes', { contexto: 'pagos' }), /registros antiguos/);
  balances.set('guild:pagos:legacy', Number.MAX_SAFE_INTEGER);
  assert.match(await run('pendientes', { contexto: 'pagos' }), /rango permitido/);
  balances.delete('guild:pagos:legacy');

  const rankingDefinition = command.data.toJSON().options.find(sub => sub.name === 'ranking');
  const quantityOption = rankingDefinition.options.find(option => option.name === 'cantidad');
  assert.equal(quantityOption.type, ApplicationCommandOptionType.Integer);
  assert.equal(Boolean(quantityOption.required), false);
  assert.equal(quantityOption.min_value, 1);
  assert.equal(quantityOption.max_value, 100);
  assert.equal((await run('ranking', { contexto: 'pagos', cantidad: 100 })).includes('de 45'), true);
  await run('crear-contexto', { nombre: 'Ranking' });
  const rankingIds = Array.from({ length: 105 }, (_, i) => String(200000000000000000n + BigInt(i)));
  for (const [index, id] of rankingIds.entries()) {
    balances.set(`guild:ranking:${id}`, Number.MAX_SAFE_INTEGER - index);
  }
  balances.set('guild:ranking:paid', 0);
  balances.set('guild:ranking:negative', -1);
  balances.set('other-guild:ranking:outsider', Number.MAX_SAFE_INTEGER);
  for (const quantity of [undefined, 1, 30, 100]) {
    const interaction = makeInteraction('ranking', { contexto: 'ranking', ...(quantity === undefined ? {} : { cantidad: quantity }) });
    await command.execute(interaction);
    const messages = [interaction.payload, ...(interaction.followUps || [])];
    const ids = messages.flatMap(payload => [...payload.content.matchAll(/<@(\d+)>/g)].map(match => match[1]));
    assert.deepEqual(ids, rankingIds.slice(0, quantity ?? 10));
    assert.equal(interaction.deferred.flags, MessageFlags.Ephemeral);
    for (const [index, payload] of messages.entries()) {
      assert.ok(payload.content.length <= 2000);
      assert.deepEqual(payload.allowedMentions, { parse: [] });
      if (index > 0) assert.equal(payload.flags, MessageFlags.Ephemeral);
      assert.ok(payload.content.includes(`${index * 20 + 1}. <@`));
    }
  }
  for (const quantity of [0, -1, 1.5, 101]) {
    assert.match(await run('ranking', { contexto: 'ranking', cantidad: quantity }), /entero entre 1 y 100/);
  }

  EconomyLogChannel.findOneAndUpdate = async (filter, update, options) => {
    assert.deepEqual(filter, { guildId: 'guild' });
    assert.equal(update.channelId, 'logs-channel-a');
    assert.equal(options.upsert, true);
  };
  EconomyLogChannel.findOneAndDelete = async (filter) => {
    assert.deepEqual(filter, { guildId: 'guild' });
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
  console.log('✅ Balances globales por categoría, canales, hilos, permisos y auditoría verificados');
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
  EconomyContext.deleteOne = saved.contextsDelete;
  EconomyBalance.deleteMany = saved.balancesDelete;
  EconomyTransaction.deleteMany = saved.transactionsDelete;
});
