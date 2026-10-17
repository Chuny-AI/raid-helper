const assert = require('node:assert/strict');
const api = require('../src/services/albionApiService');

const originalFetch = global.fetch;
const responses = new Map();
const requests = [];
const searchPath = (name) => `/search?q=${encodeURIComponent(name)}`;
const guildPath = (id) => `/guilds/${encodeURIComponent(id)}`;

const expectInvalid = (promise, message) => assert.rejects(promise, (error) => {
  assert(error instanceof api.AlbionApiError);
  assert.equal(error.code, 'invalid_response');
  assert.match(error.message, message);
  return true;
});

const guildFixture = (name, id, detail) => {
  responses.set(searchPath(name), { guilds: [{ Id: id, Name: name }] });
  responses.set(guildPath(id), detail);
};

(async () => {
  global.fetch = async (url) => {
    const parsed = new URL(url);
    const path = `${parsed.pathname.replace('/api/gameinfo', '')}${parsed.search}`;
    requests.push(path);
    assert(responses.has(path), `Consulta inesperada: ${path}`);
    return { ok: true, json: async () => responses.get(path) };
  };

  for (const [suffix, payload] of [
    ['missing', {}],
    ['null', { guilds: null }],
    ['object', { guilds: {} }],
    ['text', { guilds: 'invalid' }],
    ['root-array', []],
    ['null-entry', { guilds: [null] }],
    ['missing-id', { guilds: [{ Name: 'Guild missing-id' }] }],
    ['empty-id', { guilds: [{ Id: '', Name: 'Guild empty-id' }] }],
    ['numeric-id', { guilds: [{ Id: 123, Name: 'Guild numeric-id' }] }],
    ['missing-name', { guilds: [{ Id: 'missing-name' }] }],
    ['empty-name', { guilds: [{ Id: 'empty-name', Name: '   ' }] }],
  ]) {
    const name = `Guild ${suffix}`;
    responses.set(searchPath(name), payload);
    const before = requests.length;
    await expectInvalid(api.findGuildByName('americas', name), /búsqueda de gremios/);
    assert.equal(requests.length, before + 1, 'Una búsqueda inválida no debe consultar una ficha');
  }

  responses.set(searchPath('Guild absent'), { guilds: [] });
  await assert.rejects(api.findGuildByName('americas', 'Guild absent'), (error) => error.code === 'guild_not_found');
  responses.set(searchPath('Guild exact'), { guilds: [{ Id: 'partial-guild', Name: 'Guild exact match' }] });
  await assert.rejects(api.findGuildByName('americas', 'Guild exact'), (error) => error.code === 'guild_not_found');

  for (const [suffix, detail] of [
    ['empty', {}],
    ['array', []],
    ['missing-id', { Name: 'Guild detail missing-id' }],
    ['wrong-id', { Id: 'different-guild', Name: 'Guild detail wrong-id' }],
    ['numeric-id', { Id: 123, Name: 'Guild detail numeric-id' }],
    ['missing-name', { Id: 'detail-missing-name' }],
    ['empty-name', { Id: 'detail-empty-name', Name: '  ' }],
    ['numeric-name', { Id: 'detail-numeric-name', Name: 123 }],
  ]) {
    const name = `Guild detail ${suffix}`;
    guildFixture(name, `detail-${suffix}`, detail);
    await expectInvalid(api.findGuildByName('americas', name), /ficha del gremio/);
  }

  const beforeInvalidId = requests.length;
  await expectInvalid(api.getGuild('americas', undefined), /ID de gremio válido/);
  assert.equal(requests.length, beforeInvalidId, 'Un ID ausente no debe consultar /guilds/undefined');

  guildFixture('Guild valid', 'valid-guild', {
    Id: 'valid-guild', Name: 'Guild Valid', AllianceId: 'alliance-1', AllianceName: 'Alliance', AllianceTag: 'ALLY',
  });
  assert.deepEqual(await api.findGuildByName('americas', 'Guild valid'), {
    id: 'valid-guild', name: 'Guild Valid', allianceId: 'alliance-1', allianceName: 'Alliance', allianceTag: 'ALLY',
  });
  responses.set(searchPath('Guild alternate'), { Guilds: [{ id: 'alternate-guild', name: 'Guild alternate' }] });
  responses.set(guildPath('alternate-guild'), { id: 'alternate-guild', name: 'Guild Alternate' });
  assert.deepEqual(await api.findGuildByName('americas', 'Guild alternate'), {
    id: 'alternate-guild', name: 'Guild Alternate', allianceId: null, allianceName: null, allianceTag: '',
  });

  for (const [suffix, payload] of [
    ['missing', {}],
    ['null', { players: null }],
    ['object', { players: {} }],
    ['invalid-entry', { players: [null] }],
    ['missing-id', { players: [{ Name: 'Player missing-id' }] }],
  ]) {
    const name = `Player ${suffix}`;
    responses.set(searchPath(name), payload);
    await expectInvalid(api.findPlayerByName('americas', name), /búsqueda de personajes/);
  }
  responses.set(searchPath('Player absent'), { players: [] });
  await assert.rejects(api.findPlayerByName('americas', 'Player absent'), (error) => error.code === 'player_not_found');
  responses.set(searchPath('Player valid'), { Players: [{ Id: 'valid-player', Name: 'Player valid' }] });
  responses.set('/players/valid-player', { Id: 'valid-player', Name: 'Player Valid', GuildId: null });
  assert.equal((await api.findPlayerByName('americas', 'Player valid')).id, 'valid-player');

  console.log('✅ Búsquedas Albion, fichas de gremio incompletas e IDs discordantes verificados');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  global.fetch = originalFetch;
});
