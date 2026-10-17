const assert = require('node:assert/strict');
const { PermissionFlagsBits } = require('discord.js');
const Registration = require('../src/database/models/AlbionRegistration');
const Config = require('../src/database/models/AlbionRegistrationConfig');
const Rule = require('../src/database/models/AlbionMembershipRule');
const api = require('../src/services/albionApiService');
const service = require('../src/services/albionRegistrationService');

const originals = {
  config: Config.findOne, rules: Rule.find, registration: Registration.findOne,
  save: Registration.prototype.save, player: api.getPlayer, findPlayer: api.findPlayerByName,
};
let fixture;
const makeFixture = () => {
  const f = {
    config: { enabled: true, region: 'americas', auditChannelId: 'audit' },
    rules: [{ entityType: 'guild', entityId: 'g1', primaryRoleId: 'primary', additionalRoleIds: ['extra'] }],
    player: { id: 'player', name: 'Player', guildId: null, guildName: null },
    roles: new Map(['primary', 'extra', 'manual'].map((id) => [id, { id, position: 1 }])),
    permissions: new Set([PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageNicknames, PermissionFlagsBits.KickMembers]),
    audit: [], kicked: 0, absent: false,
  };
  f.record = new Registration({ guildId: 'discord', discordUserId: 'user', playerId: 'player', playerName: 'Player', region: 'americas',
    lastGuildId: 'g1', lastGuildName: 'Guild', assignedRoleIds: ['primary', 'extra'] });
  f.guild = { id: 'discord', roles: { cache: f.roles }, channels: { fetch: async () => ({ send: async (payload) => f.audit.push(payload) }) },
    members: { me: { permissions: { has: (flag) => f.permissions.has(flag) }, roles: { highest: { position: 10 } } },
      fetch: async (options) => {
        assert.deepEqual(options, { user: 'user', force: true });
        if (f.fetchError) throw f.fetchError;
        if (f.absent) throw Object.assign(new Error('Unknown Member'), { code: 10007 });
        return f.member;
      } } };
  f.member = { id: 'user', guild: f.guild, nickname: null, manageable: true, kickable: true,
    setNickname: async (name) => { f.member.nickname = name; },
    roles: { cache: new Map(f.roles),
      add: async (ids) => ids.forEach((id) => f.member.roles.cache.set(id, f.roles.get(id))),
      remove: async (ids) => ids.forEach((id) => f.member.roles.cache.delete(id)) },
    kick: async () => {
      assert(f.record.departureConfirmedAt, 'La confirmación debe persistir antes de expulsar');
      assert(!f.member.roles.cache.has('primary'));
      assert(!f.member.roles.cache.has('extra'));
      if (f.kickError) throw f.kickError;
      f.kicked += 1;
      f.absent = true;
    } };
  return f;
};
const ageConfirmation = () => {
  fixture.record.mismatchStartedAt = new Date(Date.now() - 73 * 60 * 60_000);
  fixture.record.lastValidatedAt = new Date(Date.now() - 13 * 60 * 60_000);
};
const confirmDeparture = async () => {
  assert.equal((await service.checkRegistration(fixture.guild, fixture.record)).status, 'pending_confirmation');
  assert.equal(fixture.kicked, 0);
  ageConfirmation();
  assert.equal((await service.checkRegistration(fixture.guild, fixture.record)).status, 'pending_confirmation');
  ageConfirmation();
  return service.checkRegistration(fixture.guild, fixture.record);
};

(async () => {
  Config.findOne = async () => fixture.config;
  Rule.find = () => ({ sort: async () => fixture.rules });
  Registration.findOne = async () => fixture.record;
  Registration.prototype.save = async function save() { return this; };
  api.getPlayer = async () => {
    if (fixture.apiError) throw fixture.apiError;
    return fixture.player;
  };
  api.findPlayerByName = async () => fixture.player;

  fixture = makeFixture();
  fixture.record.assignedRoleIds = [];
  fixture.member.roles.cache.delete('primary');
  fixture.member.roles.cache.delete('extra');
  assert.equal((await confirmDeparture()).status, 'kicked', 'Salir sin roles rastreados también requiere confirmación y expulsión');
  assert(fixture.member.roles.cache.has('manual'));
  assert.equal(fixture.record.status, 'discord_absent');
  assert(fixture.audit.some((payload) => payload.embeds[0].toJSON().title.includes('expulsado')));

  fixture = makeFixture();
  fixture.player = { ...fixture.player, guildId: 'outside', guildName: 'Otro gremio' };
  fixture.permissions.delete(PermissionFlagsBits.KickMembers);
  await assert.rejects(confirmDeparture(), /Expulsar miembros/);
  assert.equal(fixture.kicked, 0);
  assert(!fixture.member.roles.cache.has('primary'));
  assert(!fixture.member.roles.cache.has('extra'));
  assert(fixture.member.roles.cache.has('manual'));
  assert.equal(fixture.record.status, 'unmatched');
  assert(fixture.record.lastError.includes('Expulsar miembros'));
  assert(fixture.record.nextCheckAt > new Date());
  assert(fixture.audit.some((payload) => payload.embeds[0].toJSON().title.includes('pendiente')));
  fixture.record = new Registration(fixture.record.toObject());
  fixture.permissions.add(PermissionFlagsBits.KickMembers);
  fixture.member.kickable = false;
  await assert.rejects(service.checkRegistration(fixture.guild, fixture.record), /jerarquía/);
  fixture.member.kickable = true;
  fixture.kickError = new Error('Discord temporalmente inaccesible');
  await assert.rejects(service.checkRegistration(fixture.guild, fixture.record), /inaccesible/);
  fixture.kickError = null;
  assert.equal((await service.checkRegistration(fixture.guild, fixture.record)).status, 'kicked', 'Reintenta aun después de retirar roles y recargar el registro');

  await service.handleDiscordMemberLeave(fixture.member);
  fixture.absent = false;
  fixture.apiError = new api.AlbionApiError('Albion no disponible', 'timeout');
  await assert.rejects(service.handleDiscordMemberJoin(fixture.member), /no disponible/);
  assert.equal(fixture.kicked, 1, 'Sin una ficha válida no expulsa al reingresar');
  fixture.apiError = null;
  await service.handleDiscordMemberJoin(fixture.member);
  assert.equal(fixture.kicked, 2, 'El reingreso no cancela una salida confirmada');
  fixture.absent = false;
  fixture.player = { ...fixture.player, guildId: 'g1', guildName: 'Guild' };
  await service.handleDiscordMemberJoin(fixture.member);
  assert.equal(fixture.kicked, 2, 'Volver al gremio original restaura el acceso');
  assert.equal(fixture.record.departureConfirmedAt, null);
  assert.equal(fixture.record.departureGuildId, null);
  assert(fixture.member.roles.cache.has('primary'));

  fixture = makeFixture();
  fixture.rules.push({ ...fixture.rules[0], entityId: 'g2' });
  fixture.player = { ...fixture.player, guildId: 'g2', guildName: 'Guild 2' };
  assert.equal((await confirmDeparture()).status, 'kicked', 'Cambiar a otro gremio configurado con roles compartidos también expulsa');
  assert.equal(fixture.record.registeredGuildId, 'g1');
  assert.equal(fixture.record.departureGuildId, 'g1');
  assert(fixture.record.departureConfirmedAt);
  assert(!fixture.member.roles.cache.has('primary'));
  assert(!fixture.member.roles.cache.has('extra'));
  fixture.absent = false;
  await service.handleDiscordMemberJoin(fixture.member);
  assert.equal(fixture.kicked, 2, 'Reingresar estando en otro gremio configurado no evita la expulsión');

  fixture = makeFixture();
  fixture.roles.set('secondary', { id: 'secondary', position: 1 });
  fixture.rules.push({ entityType: 'guild', entityId: 'g2', primaryRoleId: 'secondary' });
  fixture.player = { ...fixture.player, guildId: 'g2', guildName: 'Guild 2' };
  await assert.rejects(service.registerPlayer({ member: fixture.member, playerName: 'Player' }), /gremio|desvincul/);
  assert(!fixture.member.roles.cache.has('secondary'), 'Reenviar el registro no concede roles del nuevo gremio');
  assert.equal(fixture.record.registeredGuildId, 'g1', 'El registro legado conserva su gremio de referencia al rechazar una transferencia');
  fixture.permissions.delete(PermissionFlagsBits.KickMembers);
  await assert.rejects(confirmDeparture(), /Expulsar miembros/);
  assert(!fixture.member.roles.cache.has('primary'));
  assert(!fixture.member.roles.cache.has('extra'));
  assert(!fixture.member.roles.cache.has('secondary'));
  fixture.record = new Registration(fixture.record.toObject());
  fixture.permissions.add(PermissionFlagsBits.KickMembers);
  assert.equal((await service.checkRegistration(fixture.guild, fixture.record)).status, 'kicked', 'Una salida hacia un gremio admitido conserva su confirmación tras recargar');

  fixture = makeFixture();
  fixture.roles.set('secondary', { id: 'secondary', position: 1 });
  fixture.rules.push({ entityType: 'guild', entityId: 'g2', primaryRoleId: 'secondary' });
  fixture.player = { ...fixture.player, guildId: 'g2', guildName: 'Guild 2' };
  assert.equal((await service.checkRegistration(fixture.guild, fixture.record)).status, 'pending_confirmation');
  ageConfirmation();
  fixture.player = { ...fixture.player, guildId: 'g1', guildName: 'Guild' };
  assert.equal((await service.checkRegistration(fixture.guild, fixture.record)).status, 'synced');
  assert.equal(fixture.record.consecutiveMismatches, 0, 'Regresar al origen cancela la sospecha automáticamente');
  assert.equal(fixture.kicked, 0);
  assert(fixture.member.roles.cache.has('primary'));
  assert(!fixture.member.roles.cache.has('secondary'));

  fixture = makeFixture();
  fixture.record.assignedRoleIds = [];
  fixture.member.roles.cache.delete('primary');
  fixture.member.roles.cache.delete('extra');
  fixture.rules.push({ ...fixture.rules[0], entityId: 'g2' });
  fixture.player = { ...fixture.player, guildId: 'g2', guildName: 'Guild 2' };
  assert.equal((await confirmDeparture()).status, 'kicked', 'El cambio a un gremio configurado se verifica aunque no haya roles rastreados');

  fixture = makeFixture();
  fixture.roles.set('secondary', { id: 'secondary', position: 1 });
  fixture.rules = [{ entityType: 'guild', entityId: 'g2', primaryRoleId: 'secondary' }];
  fixture.player = { ...fixture.player, guildId: 'g2', guildName: 'Guild 2' };
  assert.equal((await service.checkRegistration(fixture.guild, fixture.record)).status, 'synced');
  assert.equal(fixture.kicked, 0, 'Eliminar la regla de origen no provoca una expulsión');
  assert(!fixture.member.roles.cache.has('secondary'), 'Eliminar la regla de origen no transfiere a otro gremio configurado');
  assert.equal(fixture.record.registeredGuildId, 'g1');

  fixture = makeFixture();
  fixture.record.lastGuildId = 'g2';
  fixture.record.departureGuildId = 'g1';
  fixture.record.departureConfirmedAt = new Date();
  fixture.record.assignedRoleIds = [];
  fixture.member.roles.cache.delete('primary');
  fixture.member.roles.cache.delete('extra');
  fixture.roles.set('secondary', { id: 'secondary', position: 1 });
  fixture.member.roles.cache.set('secondary', fixture.roles.get('secondary'));
  fixture.rules.push({ entityType: 'guild', entityId: 'g2', primaryRoleId: 'secondary' });
  fixture.player = { ...fixture.player, guildId: 'g2', guildName: 'Guild 2' };
  assert.equal((await service.checkRegistration(fixture.guild, fixture.record)).status, 'kicked');
  assert.equal(fixture.record.registeredGuildId, 'g1', 'La confirmación histórica tiene prioridad sobre el último gremio observado');
  assert(!fixture.member.roles.cache.has('secondary'), 'La expulsión pendiente retira también roles del nuevo gremio que se hayan concedido durante el reintento');

  fixture = makeFixture();
  fixture.record.lastGuildId = null;
  fixture.roles.set('secondary', { id: 'secondary', position: 1 });
  fixture.rules.push({ entityType: 'guild', entityId: 'g2', primaryRoleId: 'secondary' });
  fixture.player = { ...fixture.player, guildId: 'g2', guildName: 'Guild 2' };
  await assert.rejects(service.checkRegistration(fixture.guild, fixture.record), /gremio|desvincul|referencia/);
  assert.equal(fixture.record.registeredGuildId, null);
  assert.equal(fixture.record.lastGuildId, null, 'Una ficha actual no inventa el gremio original de un registro incompleto');
  assert.equal(fixture.kicked, 0);
  await assert.rejects(service.registerPlayer({ member: fixture.member, playerName: 'Player' }), /gremio|desvincul|referencia/);
  assert.equal(fixture.record.registeredGuildId, null);
  assert(!fixture.member.roles.cache.has('secondary'));

  for (const changedGuild of [false, true]) {
    fixture = makeFixture();
    fixture.rules = [];
    if (!changedGuild) fixture.player = { ...fixture.player, guildId: 'g1', guildName: 'Guild' };
    assert.equal((await service.checkRegistration(fixture.guild, fixture.record)).status, 'synced');
    assert.equal(fixture.kicked, 0, 'Quitar una regla no causa expulsiones');
    assert.equal(fixture.record.departureConfirmedAt, null);
  }
  fixture = makeFixture();
  fixture.permissions.delete(PermissionFlagsBits.KickMembers);
  await assert.rejects(confirmDeparture(), /Expulsar miembros/);
  fixture.rules = [];
  fixture.permissions.add(PermissionFlagsBits.KickMembers);
  assert.equal((await service.checkRegistration(fixture.guild, fixture.record)).status, 'synced');
  assert.equal(fixture.kicked, 0, 'Quitar el gremio de origen cancela una expulsión pendiente');

  fixture = makeFixture();
  fixture.fetchError = Object.assign(new Error('Missing Access'), { code: 50001 });
  await assert.rejects(service.checkRegistration(fixture.guild, fixture.record), /Missing Access/);
  assert.equal(fixture.record.status, 'active', 'Un error Discord no se confunde con una salida');
  assert.equal(fixture.kicked, 0);
  fixture.fetchError = null;
  fixture.absent = true;
  assert.equal((await service.checkRegistration(fixture.guild, fixture.record)).status, 'discord_absent');
  console.log('✅ Salidas confirmadas, expulsión, permisos, reintentos, reingreso y cambios de configuración verificados');
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
  Config.findOne = originals.config;
  Rule.find = originals.rules;
  Registration.findOne = originals.registration;
  Registration.prototype.save = originals.save;
  api.getPlayer = originals.player;
  api.findPlayerByName = originals.findPlayer;
});
