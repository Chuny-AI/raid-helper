const assert = require('node:assert/strict');
const { PermissionFlagsBits } = require('discord.js');
const Registration = require('../src/database/models/AlbionRegistration');
const Config = require('../src/database/models/AlbionRegistrationConfig');
const Rule = require('../src/database/models/AlbionMembershipRule');
const api = require('../src/services/albionApiService');
const service = require('../src/services/albionRegistrationService');

const originals = { find: Registration.find, config: Config.findOne, rules: Rule.find, player: api.getPlayer, error: console.error };
const future = () => new Date(Date.now() + 24 * 60 * 60_000);
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
let fixture;

const makeFixture = (count = 1) => {
  const f = {
    records: [], fetched: [], players: [], queries: [], warnings: [], kicked: [],
    absent: new Set(), apiErrors: new Set(),
    config: { enabled: true, region: 'americas', auditChannelId: null },
    rules: [{ entityType: 'guild', entityId: 'g1', entityTag: 'G1', primaryRoleId: 'primary' }],
  };
  const roles = new Map([['primary', { id: 'primary', position: 1 }]]);
  f.guild = {
    id: 'discord', roles: { cache: roles },
    members: {
      me: { permissions: { has: (flag) => [PermissionFlagsBits.ManageRoles, PermissionFlagsBits.KickMembers].includes(flag) }, roles: { highest: { position: 10 } } },
      fetch: async ({ user, force }) => {
        assert.equal(force, true);
        f.fetched.push(user);
        if (f.absent.has(user)) throw Object.assign(new Error('Unknown Member'), { code: 10007 });
        const memberRoles = new Map(roles);
        return {
          id: user, guild: f.guild, kickable: true,
          roles: {
            cache: memberRoles,
            add: async (ids) => ids.forEach((id) => memberRoles.set(id, roles.get(id))),
            remove: async (ids) => ids.forEach((id) => memberRoles.delete(id)),
          },
          kick: async () => { assert(!memberRoles.has('primary')); f.kicked.push(user); },
        };
      },
    },
  };
  f.client = { guilds: { cache: new Map([[f.guild.id, f.guild]]) } };
  for (let index = 1; index <= count; index += 1) {
    f.records.push({
      _id: String(index).padStart(3, '0'), guildId: f.guild.id, discordUserId: `user-${index}`, playerId: `player-${index}`,
      playerName: `Player ${index}`, region: 'americas', status: 'active', assignedRoleIds: ['primary'],
      lastGuildId: 'g1', nextCheckAt: future(), save: async function save() { return this; },
    });
  }
  return f;
};

(async () => {
  Config.findOne = async () => fixture.config;
  Rule.find = () => ({ sort: async () => fixture.rules });
  api.getPlayer = async (_region, id) => {
    fixture.players.push(id);
    if (fixture.apiErrors.has(id)) throw new Error('Albion temporalmente inaccesible');
    return { id, name: id, guildId: fixture.departed ? null : 'g1', guildName: fixture.departed ? null : 'Guild' };
  };
  console.error = (...args) => fixture.warnings.push(args.join(' '));
  Registration.find = (query) => ({
    sort: (sort) => ({
      limit: async (limit) => {
        const number = fixture.queries.length + 1;
        fixture.queries.push({ query, sort, limit });
        if (fixture.queryStarted && number === 1) fixture.queryStarted.resolve();
        if (fixture.queryGate && number === 1) await fixture.queryGate.promise;
        if (fixture.failQuery === number) throw new Error('Mongo temporalmente inaccesible');
        return fixture.records.filter((entry) => (!query.guildId || query.guildId.$in.includes(entry.guildId))
          && (!query._id || entry._id > query._id.$gt)
          && (!query.status || query.status.$in.includes(entry.status))
          && (!query.nextCheckAt || entry.nextCheckAt <= query.nextCheckAt.$lte))
          .sort((a, b) => sort._id ? a._id.localeCompare(b._id) : a.nextCheckAt - b.nextCheckAt)
          .slice(0, limit);
      },
    }),
  });

  fixture = makeFixture(8);
  fixture.records[1].status = 'pending';
  fixture.records[2].status = 'unmatched';
  fixture.records[3].status = 'discord_absent';
  fixture.absent.add('user-4');
  fixture.records[4].status = 'discord_absent';
  fixture.records[4].assignedRoleIds = [];
  fixture.apiErrors.add('player-6');
  fixture.records[7].guildId = 'unavailable-server';
  assert.equal(await service.sweepAllRegistrations(fixture.client, 2), 6);
  assert.deepEqual(fixture.fetched, ['user-1', 'user-2', 'user-3', 'user-4', 'user-5', 'user-6', 'user-7']);
  assert(!fixture.players.includes('player-4'), 'Los miembros ausentes no consultan Albion');
  assert(fixture.players.includes('player-5'), 'Revisa reingresos aunque se haya perdido el evento de Discord');
  assert.equal(fixture.records[4].status, 'active');
  assert.deepEqual(fixture.records[4].assignedRoleIds, ['primary']);
  assert.equal(fixture.records[3].status, 'discord_absent');
  assert(fixture.records[5].lastError.includes('inaccesible'));
  assert(fixture.players.includes('player-7'), 'Continúa con el siguiente miembro después de un fallo individual');
  assert.equal(fixture.warnings.length, 1);
  assert.equal(fixture.queries.length, 4);
  assert(fixture.queries.every(({ query, sort, limit }) => !query.status && !query.nextCheckAt
    && query.guildId.$in.join() === 'discord' && sort._id === 1 && limit === 2));
  assert.deepEqual(fixture.queries.map(({ query }) => query._id?.$gt), [undefined, '002', '004', '006']);
  assert.equal(fixture.kicked.length, 0);

  fixture = makeFixture(21);
  assert.equal(await service.sweepAllRegistrations(fixture.client), 21, 'El barrido completo supera el lote predeterminado de 20');
  assert.deepEqual(fixture.queries.map(({ limit }) => limit), [20, 20]);
  assert.equal(new Set(fixture.fetched).size, 21);

  fixture = makeFixture();
  fixture.departed = true;
  assert.equal(await service.sweepAllRegistrations(fixture.client), 1);
  assert.equal(fixture.records[0].consecutiveMismatches, 1);
  assert.equal(fixture.kicked.length, 0, 'El barrido diario conserva la gracia y las confirmaciones de salida');

  fixture = makeFixture();
  fixture.records[0].nextCheckAt = new Date(0);
  fixture.queryStarted = deferred();
  fixture.queryGate = deferred();
  const periodic = service.sweepRegistrations(fixture.client);
  await fixture.queryStarted.promise;
  const daily = service.sweepAllRegistrations(fixture.client);
  assert.equal(await service.sweepRegistrations(fixture.client), 0);
  assert.equal(fixture.queries.length, 1, 'La revisión diaria espera la revisión periódica activa');
  fixture.queryGate.resolve();
  assert.equal(await periodic, 1);
  assert.equal(await daily, 1, 'El barrido diario pendiente se ejecuta aunque el periódico cambie nextCheckAt');
  assert.equal(fixture.queries.length, 2);
  assert.deepEqual(fixture.fetched, ['user-1', 'user-1']);

  fixture = makeFixture();
  fixture.queryStarted = deferred();
  fixture.queryGate = deferred();
  const firstDaily = service.sweepAllRegistrations(fixture.client);
  await fixture.queryStarted.promise;
  const secondDaily = service.sweepAllRegistrations(fixture.client);
  assert.equal(await service.sweepRegistrations(fixture.client), 0, 'El periódico cede ante un barrido diario activo');
  assert.equal(fixture.queries.length, 1);
  fixture.queryGate.resolve();
  assert.deepEqual(await Promise.all([firstDaily, secondDaily]), [1, 1], 'Las revisiones completas se serializan sin descartarse');

  fixture = makeFixture(3);
  fixture.failQuery = 2;
  await assert.rejects(service.sweepAllRegistrations(fixture.client, 2), /Mongo/);
  assert.equal(fixture.fetched.length, 2, 'El fallo de página conserva los resultados de los lotes anteriores');
  fixture.failQuery = null;
  fixture.records[0].nextCheckAt = new Date(0);
  assert.equal(await service.sweepRegistrations(fixture.client), 1, 'Un fallo de Mongo libera el bloqueo del barrido diario');
  assert.equal(await service.sweepAllRegistrations(fixture.client, 2), 3);

  fixture = makeFixture();
  fixture.failQuery = 1;
  fixture.records[0].nextCheckAt = new Date(0);
  fixture.queryStarted = deferred();
  fixture.queryGate = deferred();
  const failedPeriodic = service.sweepRegistrations(fixture.client);
  const failedPeriodicAssertion = assert.rejects(failedPeriodic, /Mongo/);
  await fixture.queryStarted.promise;
  const waitingDaily = service.sweepAllRegistrations(fixture.client);
  fixture.queryGate.resolve();
  await failedPeriodicAssertion;
  assert.equal(await waitingDaily, 1, 'El barrido diario no hereda el error del barrido que lo precede');

  fixture = makeFixture();
  fixture.client.guilds.cache.clear();
  assert.equal(await service.sweepAllRegistrations(fixture.client), 0);
  assert.equal(fixture.queries.length, 0, 'Sin servidores disponibles no consulta registros ajenos');
  await assert.rejects(service.sweepAllRegistrations(fixture.client, 0), RangeError);
  await assert.rejects(service.sweepAllRegistrations(fixture.client, 1.5), RangeError);
  console.log('✅ Barrido diario completo, paginación, reingresos, aislamiento de errores y concurrencia verificados');
})().catch((error) => { originals.error(error); process.exitCode = 1; }).finally(() => {
  Registration.find = originals.find;
  Config.findOne = originals.config;
  Rule.find = originals.rules;
  api.getPlayer = originals.player;
  console.error = originals.error;
});
