const assert = require('node:assert/strict');
const { PermissionFlagsBits } = require('discord.js');
const Registration = require('../src/database/models/AlbionRegistration');
const Config = require('../src/database/models/AlbionRegistrationConfig');
const Rule = require('../src/database/models/AlbionMembershipRule');
const api = require('../src/services/albionApiService');
const service = require('../src/services/albionRegistrationService');
const panel = require('../src/commands/utility/registro_panel');
const setup = require('../src/commands/utility/setup_registro');

const original = {
  configFind: Config.findOne, ruleFind: Rule.find, ruleFindOne: Rule.findOne,
  ruleCount: Rule.countDocuments, ruleUpdate: Rule.findOneAndUpdate,
  registrationFind: Registration.findOne, registrationSave: Registration.prototype.save,
  registrationUpdate: Registration.updateMany, apiFind: api.findPlayerByName,
  apiGet: api.getPlayer, fetch: global.fetch,
};

(async () => {
  assert.equal(panel.data.toJSON().name, 'registro-panel');
  assert.equal(setup.data.toJSON().name, 'setup-registro');
  assert.equal(panel.panelPayload({ region: 'americas' }).components[0].components[0].data.custom_id, 'albion-register:open');
  assert.equal(setup.parseId('regcfg:home:111111111111111111:222222222222222222').action, 'home');

  const config = { region: 'americas', enabled: true, checkIntervalMinutes: 360, auditChannelId: null };
  const guildId = '222222222222222222';
  const userId = '111111111111111111';
  const primary1 = '333333333333333333';
  const extra1 = '444444444444444444';
  const primary2 = '555555555555555555';
  const manual = '666666666666666666';
  const roles = new Map([primary1, extra1, primary2, manual].map((id) => [id, { id, name: id, position: 1 }]));
  const memberRoles = new Map([[manual, roles.get(manual)]]);
  const changes = [];
  const bot = { permissions: { has: (flag) => [PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageNicknames].includes(flag) }, roles: { highest: { position: 10 } } };
  const guild = { id: guildId, name: 'Discord', members: { me: bot, fetch: async () => member },
    roles: { cache: roles }, channels: { fetch: async () => null } };
  const member = { id: userId, guild, nickname: 'Nombre previo', manageable: true,
    setNickname: async (nickname) => { member.nickname = nickname; changes.push(['nickname', nickname]); },
    roles: { cache: memberRoles,
      add: async (ids) => { ids.forEach((id) => memberRoles.set(id, roles.get(id))); changes.push(['add', ids]); },
      remove: async (ids) => { ids.forEach((id) => memberRoles.delete(id)); changes.push(['remove', ids]); } } };
  const rules = [
    { entityType: 'guild', entityId: 'g1', entityName: 'Bon Bon Bum', entityTag: 'BBB', primaryRoleId: primary1, additionalRoleIds: [extra1], roleIds: [primary1, extra1] },
    { entityType: 'guild', entityId: 'g2', entityName: 'MONASTERIO', entityTag: 'MONS', primaryRoleId: primary2, additionalRoleIds: [], roleIds: [primary2] },
    { entityType: 'alliance', entityId: 'a1', entityName: 'Alianza', roleIds: [manual] },
  ];
  let record;
  let player = { id: 'player-1', name: 'Player', guildId: 'g1', guildName: 'Bon Bon Bum', allianceId: 'a1', allianceName: 'Alianza' };
  Config.findOne = async () => config;
  Rule.find = (query) => {
    assert.equal(query.entityType, 'guild');
    return { sort: async () => rules.filter((rule) => rule.entityType === 'guild') };
  };
  Rule.findOne = async () => null;
  Rule.countDocuments = async () => 2;
  Rule.findOneAndUpdate = async (_filter, update) => update.$set;
  Registration.findOne = async (query) => query.playerId ? (record?.playerId === query.playerId ? record : null) : record;
  Registration.prototype.save = async function save() { record = this; return this; };
  Registration.updateMany = async () => ({ modifiedCount: 1 });
  api.findPlayerByName = async () => player;
  api.getPlayer = async () => player;

  const dashboard = setup.render({ config, rules: rules.slice(0, 2), guild, userId });
  assert(dashboard.embeds.flatMap((embed) => embed.toJSON().fields || []).some((field) => field.value.includes(`<@&${extra1}>`)));
  assert(!dashboard.components.some((component) => component.toJSON().components.some((item) => item.custom_id?.includes('alliance'))));
  assert.equal(setup.render({ config, rules: rules.slice(0, 2), guild, userId, screen: 'detail', entityId: 'g1' }).components.length, 3);
  const manyRules = Array.from({ length: 25 }, (_, index) => ({ ...rules[0], entityId: `g-${index}`, entityName: `Gremio ${index}` }));
  const manyDashboard = setup.render({ config, rules: manyRules, guild, userId });
  assert.equal(manyDashboard.embeds.length, 5);
  assert.equal(manyDashboard.embeds.slice(1).flatMap((embed) => embed.toJSON().fields).length, 25);
  assert(manyDashboard.components.every((component) => component.toJSON().components.length <= 5));
  const savedRule = await service.saveGuildRule({ guild, entity: { id: 'g3', name: 'Otro' }, tag: 'OTRO', primaryRoleId: primary1, additionalRoleIds: [extra1], createdBy: userId });
  assert.equal(savedRule.primaryRoleId, primary1);
  assert.deepEqual(savedRule.additionalRoleIds, [extra1]);
  await assert.rejects(service.saveGuildRule({ guild, entity: { id: 'g3', name: 'Otro' }, tag: 'Mal tag', primaryRoleId: primary1, createdBy: userId }), /etiqueta/);
  api.findGuildByName = async () => ({ id: 'g4', name: 'Nuevo Gremio' });
  let setupReply;
  const setupInteraction = (customId, rest) => ({ customId, guildId, guild, user: { id: userId },
    member: { permissions: { has: () => true } },
    deferUpdate: async function deferUpdate() { this.deferred = true; },
    editReply: async (payload) => { setupReply = payload; }, ...rest });
  await setup.handleInteraction(setupInteraction(`regcfg:add-submit:${userId}:${guildId}`, {
    isModalSubmit: () => true, fields: { getTextInputValue: (id) => id === 'name' ? 'Nuevo Gremio' : 'NG' },
  }));
  assert(setupReply.components[0].toJSON().components[0].custom_id.includes('create-role'));
  await setup.handleInteraction(setupInteraction(`regcfg:create-role:${userId}:${guildId}`, {
    isRoleSelectMenu: () => true, values: [primary2],
  }));
  assert.equal(setupReply.embeds[0].toJSON().title, '🛡️ Configuración de registro Albion');

  let shownModal;
  await panel.handleInteraction({ customId: 'albion-register:open', guildId, isButton: () => true,
    showModal: async (value) => { shownModal = value; } });
  assert.equal(shownModal.toJSON().custom_id, 'albion-register:submit');
  await service.registerPlayer({ member, playerName: 'Player' });
  assert(memberRoles.has(primary1));
  assert(memberRoles.has(extra1));
  assert(memberRoles.has(manual));
  assert.equal(member.nickname, '[BBB] Player');
  assert.equal(record.originalNickname, 'Nombre previo');
  assert.deepEqual(new Set(record.assignedRoleIds), new Set([primary1, extra1]));

  player = { ...player, guildId: 'g2', guildName: 'MONASTERIO' };
  assert.equal((await service.checkRegistration(guild, record)).status, 'pending_confirmation');
  assert(memberRoles.has(primary1));
  assert.equal(record.consecutiveMismatches, 1);
  assert.equal((await service.checkRegistration(guild, record)).status, 'pending_confirmation');
  assert.equal(record.consecutiveMismatches, 1, 'dos consultas seguidas no son confirmaciones independientes');
  api.getPlayer = async () => { throw new api.AlbionApiError('timeout', 'timeout'); };
  await assert.rejects(service.checkRegistration(guild, record), /timeout/);
  assert(memberRoles.has(primary1), 'Una caída de Albion no quita roles');
  api.getPlayer = async () => ({ ...player, guildId: 'g1', guildName: 'Bon Bon Bum' });
  assert.equal((await service.checkRegistration(guild, record)).status, 'synced');
  assert.equal(record.consecutiveMismatches, 0, 'una lectura correcta cancela la sospecha');
  assert(memberRoles.has(primary1));
  api.getPlayer = async () => player;
  assert.equal((await service.checkRegistration(guild, record)).status, 'pending_confirmation');
  record.lastValidatedAt = new Date(Date.now() - 13 * 60 * 60_000);
  assert.equal((await service.checkRegistration(guild, record)).status, 'pending_confirmation');
  assert.equal(record.consecutiveMismatches, 2);
  record.lastValidatedAt = new Date(Date.now() - 13 * 60 * 60_000);
  assert.equal((await service.checkRegistration(guild, record)).status, 'pending_confirmation');
  assert.equal(record.consecutiveMismatches, 3);
  assert(memberRoles.has(primary1), 'tres lecturas en menos de 72 horas no quitan roles');
  record.mismatchStartedAt = new Date(Date.now() - 73 * 60 * 60_000);
  record.lastValidatedAt = new Date(Date.now() - 13 * 60 * 60_000);
  assert.equal((await service.checkRegistration(guild, record)).status, 'synced');
  assert(!memberRoles.has(primary1));
  assert(!memberRoles.has(extra1));
  assert(memberRoles.has(primary2));
  assert(memberRoles.has(manual));
  assert.equal(member.nickname, '[MONS] Player');

  player = { ...player, guildId: null, guildName: null };
  assert.equal((await service.checkRegistration(guild, record)).status, 'pending_confirmation');
  record.mismatchStartedAt = new Date(Date.now() - 73 * 60 * 60_000);
  for (let index = 0; index < 2; index += 1) {
    record.lastValidatedAt = new Date(Date.now() - 13 * 60 * 60_000);
    const checked = await service.checkRegistration(guild, record);
    if (index === 0) assert.equal(checked.status, 'pending_confirmation');
    else assert.equal(checked.status, 'synced');
  }
  assert(!memberRoles.has(primary2));
  assert(memberRoles.has(manual));
  assert.equal(member.nickname, 'Nombre previo');
  assert.equal(record.status, 'unmatched');
  assert(changes.some(([kind, ids]) => kind === 'remove' && ids.includes(primary1)));

  api.getPlayer = original.apiGet;
  let fetchCount = 0;
  global.fetch = async () => { fetchCount += 1; return { ok: true, json: async () => ({ Id: 'cache-test', Name: 'Test', GuildId: null }) }; };
  const [first, second] = await Promise.all([
    api.requestJson('americas', '/players/cache-test'), api.requestJson('americas', '/players/cache-test'),
  ]);
  assert.equal(fetchCount, 1, 'Las consultas iguales en curso se comparten');
  assert.deepEqual(first, second);
  await api.requestJson('americas', '/players/cache-test');
  assert.equal(fetchCount, 1, 'La ficha se reutiliza brevemente');
  assert.equal((await api.getPlayer('americas', 'cache-test')).guildId, null);
  global.fetch = async () => ({ ok: true, json: async () => ({
    Id: 'inconsistent-test', Name: 'Test', GuildId: null, GuildName: 'Bon Bon Bum',
  }) });
  await assert.rejects(api.getPlayer('americas', 'inconsistent-test'), /incompleta/);
  let attempts = 0;
  global.fetch = async (_url, { signal }) => {
    attempts += 1;
    if (attempts < 3) return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    });
    return { ok: true, json: async () => ({ Id: 'retry-test', Name: 'Test', GuildId: null }) };
  };
  const recovered = await api.requestJson('americas', '/players/retry-test', {
    timeoutMs: 15, retries: 2, queueTimeoutMs: 1_000,
  });
  assert.equal(recovered.Id, 'retry-test');
  assert.equal(attempts, 3, 'Dos timeouts se recuperan con el tercer intento');
  console.log('✅ Paneles, reglas de gremio, roles, apodos, retirada y caché Albion verificados');
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
  Config.findOne = original.configFind;
  Rule.find = original.ruleFind;
  Rule.findOne = original.ruleFindOne;
  Rule.countDocuments = original.ruleCount;
  Rule.findOneAndUpdate = original.ruleUpdate;
  Registration.findOne = original.registrationFind;
  Registration.prototype.save = original.registrationSave;
  Registration.updateMany = original.registrationUpdate;
  api.findPlayerByName = original.apiFind;
  api.getPlayer = original.apiGet;
  global.fetch = original.fetch;
});
