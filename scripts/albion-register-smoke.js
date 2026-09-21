const assert = require('node:assert/strict');
const { PermissionFlagsBits } = require('discord.js');
const Registration = require('../src/database/models/AlbionRegistration');
const Config = require('../src/database/models/AlbionRegistrationConfig');
const Rule = require('../src/database/models/AlbionMembershipRule');
const albionApi = require('../src/services/albionApiService');
const service = require('../src/services/albionRegistrationService');
const panel = require('../src/commands/utility/panel');
const register = require('../src/commands/utility/register');
const setup = require('../src/commands/utility/register_setup');

const saved = {
  configFindOne: Config.findOne,
  ruleFind: Rule.find,
  registrationFindOne: Registration.findOne,
  findPlayerByName: albionApi.findPlayerByName,
  getPlayer: albionApi.getPlayer,
  registerName: register.registerName,
};

(async () => {
  assert.equal(register.data.toJSON().name, 'register');
  assert.equal(panel.data.toJSON().name, 'panel');
  assert.equal(setup.data.toJSON().name, 'register-setup');
  assert.deepEqual(setup.parseRoleIds('<@&123456789012345678> 234567890123456789'), [
    '123456789012345678', '234567890123456789',
  ]);
  assert.throws(() => setup.parseRoleIds('@everyone'), /únicamente menciones/);
  assert.equal(panel.panelPayload({ region: 'americas' }).components[0].components[0].data.custom_id, 'albion-register:open');

  const roles = new Map([
    ['guild-role', { id: 'guild-role', name: 'Gremio', position: 1 }],
    ['alliance-role', { id: 'alliance-role', name: 'Alianza', position: 1 }],
    ['manual-role', { id: 'manual-role', name: 'Manual', position: 1 }],
  ]);
  const roleCache = new Map(roles);
  roleCache.delete('guild-role');
  roleCache.delete('alliance-role');
  const changes = [];
  const guild = {
    id: 'guild-1',
    members: {
      me: { permissions: { has: (permission) => permission === PermissionFlagsBits.ManageRoles }, roles: { highest: { position: 10 } } },
      fetch: async () => member,
    },
    roles: { cache: roles },
    channels: { fetch: async () => null },
  };
  const member = {
    id: 'discord-1', guild,
    roles: {
      cache: roleCache,
      add: async (ids) => { ids.forEach((id) => roleCache.set(id, roles.get(id))); changes.push(['add', ids]); },
      remove: async (ids) => { ids.forEach((id) => roleCache.delete(id)); changes.push(['remove', ids]); },
    },
  };
  const registration = {
    guildId: guild.id, discordUserId: member.id, region: 'americas',
    playerId: 'player-1', playerName: 'Player', assignedRoleIds: [],
    consecutiveMismatches: 0,
    save: async () => {},
  };
  const config = { region: 'americas', enabled: true, checkIntervalMinutes: 360, auditChannelId: null };
  const rules = [
    { entityType: 'guild', entityId: 'g1', entityName: 'Gremio', roleIds: ['guild-role'] },
    { entityType: 'alliance', entityId: 'a1', entityName: 'Alianza', roleIds: ['alliance-role'] },
  ];
  let player = { id: 'player-1', name: 'Player', guildId: 'g1', guildName: 'Gremio', allianceId: 'a1', allianceName: 'Alianza' };
  Config.findOne = async () => config;
  Rule.find = () => ({ sort: async () => rules });
  Registration.findOne = async () => registration;
  albionApi.findPlayerByName = async () => player;
  albionApi.getPlayer = async () => player;

  let presentedModal;
  const buttonInteraction = {
    customId: 'albion-register:open', guildId: guild.id,
    isButton: () => true, showModal: async (modal) => { presentedModal = modal; },
  };
  assert.equal(await panel.handleInteraction(buttonInteraction), true);
  assert.equal(presentedModal.toJSON().custom_id, 'albion-register:submit');
  let submittedName;
  register.registerName = async (_interaction, name) => { submittedName = name; };
  assert.equal(await panel.handleInteraction({
    customId: 'albion-register:submit', isModalSubmit: () => true,
    fields: { getTextInputValue: () => 'Player' },
  }), true);
  assert.equal(submittedName, 'Player');
  register.registerName = saved.registerName;

  await service.registerPlayer({ member, playerName: 'Player' });
  assert(roleCache.has('guild-role'));
  assert(roleCache.has('alliance-role'));
  assert(roleCache.has('manual-role'));
  assert.deepEqual(new Set(registration.assignedRoleIds), new Set(['guild-role', 'alliance-role']));

  // Sale del gremio, pero sigue en alianza: se exige una segunda lectura válida.
  player = { ...player, guildId: 'g2', guildName: 'Otro' };
  assert.equal((await service.checkRegistration(guild, registration)).status, 'pending_confirmation');
  assert(roleCache.has('guild-role'));
  assert.equal(registration.consecutiveMismatches, 1);
  albionApi.getPlayer = async () => { throw new albionApi.AlbionApiError('timeout', 'timeout'); };
  await assert.rejects(service.checkRegistration(guild, registration), /timeout/);
  assert(roleCache.has('guild-role'), 'un fallo de API no quita permisos');
  albionApi.getPlayer = async () => player;
  assert.equal((await service.checkRegistration(guild, registration)).status, 'synced');
  assert(!roleCache.has('guild-role'));
  assert(roleCache.has('alliance-role'));
  assert(roleCache.has('manual-role'));

  player = { ...player, guildId: null, guildName: null, allianceId: null, allianceName: null };
  await service.checkRegistration(guild, registration);
  assert(roleCache.has('alliance-role'));
  await service.checkRegistration(guild, registration);
  assert(!roleCache.has('alliance-role'));
  assert(roleCache.has('manual-role'));
  assert.equal(registration.status, 'unmatched');

  player = { ...player, guildId: 'g1', guildName: 'Gremio', allianceId: 'a1', allianceName: 'Alianza' };
  await service.checkRegistration(guild, registration);
  assert(roleCache.has('guild-role'));
  assert(roleCache.has('alliance-role'));
  assert(changes.some(([type, ids]) => type === 'remove' && ids.includes('guild-role')));

  // Un rol configurado que ya estaba puesto también queda bajo control del
  // registro y debe retirarse al abandonar el gremio.
  registration.assignedRoleIds = ['alliance-role'];
  await service.applyPlayer({ member, registration, player, config, rules });
  assert(registration.assignedRoleIds.includes('guild-role'));
  player = { ...player, guildId: null, guildName: null };
  await service.checkRegistration(guild, registration);
  await service.checkRegistration(guild, registration);
  assert(!roleCache.has('guild-role'));
  assert(roleCache.has('alliance-role'));

  // El cliente toma el personaje exacto de la búsqueda y vuelve a comprobar su ID.
  const fetchBefore = global.fetch;
  try {
    global.fetch = async (url) => ({
      ok: true,
      json: async () => url.includes('/search?')
        ? { players: [{ Id: 'wrong', Name: 'PlayerExtra' }, { Id: 'player-1', Name: 'Player' }] }
        : { Id: 'player-1', Name: 'Player', GuildId: 'g1', AllianceId: 'a1' },
    });
    assert.equal((await saved.findPlayerByName('americas', 'Player')).id, 'player-1');
    assert.deepEqual(albionApi.normalizePlayer({ Id: 'p', Name: 'N', GuildId: '', AllianceId: '' }).guildId, null);
  } finally {
    global.fetch = fetchBefore;
  }
  console.log('✅ Registro Albion, sincronización de roles y panel verificados');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  Config.findOne = saved.configFindOne;
  Rule.find = saved.ruleFind;
  Registration.findOne = saved.registrationFindOne;
  albionApi.findPlayerByName = saved.findPlayerByName;
  albionApi.getPlayer = saved.getPlayer;
  register.registerName = saved.registerName;
});
