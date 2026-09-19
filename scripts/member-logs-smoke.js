const assert = require('node:assert/strict');
const { PermissionFlagsBits } = require('discord.js');
const MemberLogConfig = require('../src/database/models/MemberLogConfig');
const MemberIdentity = require('../src/database/models/MemberIdentity');
const service = require('../src/services/memberLogService');
const command = require('../src/commands/utility/member_logs');

const saved = {
  configFindOne: MemberLogConfig.findOne,
  configUpdate: MemberLogConfig.findOneAndUpdate,
  configDelete: MemberLogConfig.findOneAndDelete,
  configFind: MemberLogConfig.find,
  identityFindOne: MemberIdentity.findOne,
  identityUpdate: MemberIdentity.findOneAndUpdate,
  identityDelete: MemberIdentity.deleteMany,
  identityBulk: MemberIdentity.bulkWrite,
};

(async () => {
  const definition = command.data.toJSON();
  assert.equal(definition.name, 'registro-miembros');
  assert.equal(definition.default_member_permissions, String(PermissionFlagsBits.Administrator));
  assert.deepEqual(definition.options.map((option) => option.name), ['configurar', 'estado', 'desactivar']);
  assert.deepEqual(definition.options[0].options.map((option) => option.name), ['bienvenida', 'despedida']);

  assert.ok(MemberLogConfig.schema.indexes().some(([keys, options]) => keys.guildId === 1 && options.unique));
  assert.ok(MemberIdentity.schema.indexes().some(([keys, options]) =>
    keys.guildId === 1 && keys.userId === 1 && options.unique));

  const sent = { welcome: [], farewell: [] };
  const channels = new Map([
    ['welcome', { isTextBased: () => true, send: async (payload) => sent.welcome.push(payload) }],
    ['farewell', { isTextBased: () => true, send: async (payload) => sent.farewell.push(payload) }],
  ]);
  const avatarCalls = [];
  const user = {
    id: 'user-1', username: 'original_user', globalName: 'Nombre Original', bot: false,
    displayAvatarURL: (options) => { avatarCalls.push(options); return 'https://cdn.test/avatar.png?size=4096'; },
  };
  const botUser = {
    username: 'Avalon Bot',
    displayAvatarURL: (options) => `https://cdn.test/bot.png?size=${options.size}`,
  };
  const member = {
    id: 'user-1', nickname: null, displayName: 'Nombre Original', user,
    guild: {
      id: 'guild-1', name: 'Servidor Avalon', memberCount: 50,
      channels: { cache: channels, fetch: async (id) => channels.get(id) },
      members: { fetch: async () => new Map() },
    },
    client: { user: botUser },
  };
  const config = { guildId: 'guild-1', welcomeChannelId: 'welcome', farewellChannelId: 'farewell' };
  const stored = {
    guildId: 'guild-1', userId: 'user-1',
    displayName: 'Ava Lider 7.4', nickname: 'Ava Lider 7.4',
    username: 'usuario_viejo', globalName: 'Nombre Viejo',
    avatarUrl: 'https://cdn.test/stored.png', isBot: false,
  };

  MemberLogConfig.findOne = async () => config;
  MemberIdentity.findOne = async () => stored;
  MemberIdentity.findOneAndUpdate = async (_filter, identity) => identity;

  assert.equal(await service.handleMemberJoin(member, botUser), true);
  assert.equal(sent.welcome.length, 1);
  const welcome = sent.welcome[0].embeds[0].data;
  assert.equal(welcome.image.url, 'https://cdn.test/avatar.png?size=4096');
  assert.equal(welcome.thumbnail.url, 'https://cdn.test/bot.png?size=256');
  assert.equal(sent.welcome[0].allowedMentions.parse.length, 0);

  assert.equal(await service.handleMemberLeave(member, botUser), true);
  assert.equal(sent.farewell.length, 1);
  const farewell = sent.farewell[0].embeds[0].data;
  assert.equal(farewell.fields.find((field) => field.name === 'Nombre asignado en el servidor').value, 'Ava Lider 7.4');
  assert.equal(farewell.fields.find((field) => field.name === 'Nombre original').value, 'Nombre Original');
  assert.equal(farewell.fields.find((field) => field.name === 'Usuario de Discord').value, '@original\\_user');
  assert(avatarCalls.some((options) => options.size === 4096));

  const members = new Map([
    ['user-1', { ...member, nickname: 'Nombre Uno', displayName: 'Nombre Uno' }],
    ['user-2', {
      ...member, id: 'user-2', displayName: 'Nombre Dos',
      user: { ...user, id: 'user-2', username: 'user_two' },
    }],
  ]);
  member.guild.members.fetch = async () => members;
  let bulkOperations;
  MemberIdentity.bulkWrite = async (operations) => { bulkOperations = operations; };
  assert.equal(await service.syncGuildMembers(member.guild), 2);
  assert.equal(bulkOperations.length, 2);
  assert.equal(bulkOperations[0].updateOne.update.$set.displayName, 'Nombre Uno');

  MemberLogConfig.findOneAndUpdate = async (filter, update, options) => {
    assert.deepEqual(filter, { guildId: 'guild-1' });
    assert.equal(update.welcomeChannelId, 'welcome');
    assert.equal(update.farewellChannelId, 'farewell');
    assert.equal(options.runValidators, true);
    return update;
  };
  await service.setMemberLogConfig({
    guildId: 'guild-1', welcomeChannelId: 'welcome', farewellChannelId: 'farewell', updatedBy: 'admin',
  });

  const commandChannels = {
    bienvenida: {
      id: 'welcome',
      isTextBased: () => true,
      send: async () => {},
      permissionsFor: () => ({ has: () => true }),
      toString: () => '<#welcome>',
    },
    despedida: {
      id: 'farewell',
      isTextBased: () => true,
      send: async () => {},
      permissionsFor: () => ({ has: () => true }),
      toString: () => '<#farewell>',
    },
  };
  const makeInteraction = (fetchMembers) => {
    const interaction = {
      guildId: 'guild-1',
      guild: {
        ...member.guild,
        members: { me: {}, fetch: fetchMembers },
      },
      user: { id: 'admin' },
      member: { permissions: { has: () => true } },
      options: {
        getSubcommand: () => 'configurar',
        getChannel: (name) => commandChannels[name],
      },
      deferred: false,
      replied: false,
      deferReply: async () => { interaction.deferred = true; },
      editReply: async (payload) => { interaction.response = payload; return payload; },
    };
    return interaction;
  };

  const configured = makeInteraction(async () => members);
  await command.execute(configured);
  assert.match(configured.response.embeds[0].data.title, /Registro de miembros configurado/);
  assert.match(configured.response.embeds[0].data.description, /Nombres actuales sincronizados: \*\*2\*\*/);

  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const configuredWithoutSync = makeInteraction(async () => {
      throw new Error('detalle interno que no debe mostrarse');
    });
    await command.execute(configuredWithoutSync);
    const response = configuredWithoutSync.response.embeds[0].data;
    assert.match(response.title, /Registro de miembros configurado/);
    assert.match(response.description, /configuración quedó guardada/);
    assert.doesNotMatch(response.description, /detalle interno/);
  } finally {
    console.error = originalConsoleError;
  }

  console.log('✅ Registro de bienvenida, despedida e identidad verificado');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  MemberLogConfig.findOne = saved.configFindOne;
  MemberLogConfig.findOneAndUpdate = saved.configUpdate;
  MemberLogConfig.findOneAndDelete = saved.configDelete;
  MemberLogConfig.find = saved.configFind;
  MemberIdentity.findOne = saved.identityFindOne;
  MemberIdentity.findOneAndUpdate = saved.identityUpdate;
  MemberIdentity.deleteMany = saved.identityDelete;
  MemberIdentity.bulkWrite = saved.identityBulk;
});
