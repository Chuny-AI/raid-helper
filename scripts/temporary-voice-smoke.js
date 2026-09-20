const assert = require('node:assert/strict');
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const TemporaryVoiceConfig = require('../src/database/models/TemporaryVoiceConfig');
const TemporaryVoiceChannel = require('../src/database/models/TemporaryVoiceChannel');
const service = require('../src/services/temporaryVoiceService');
const setupUi = require('../src/features/setup/presentation/setup-ui');

const saved = {
  configFindOne: TemporaryVoiceConfig.findOne,
  configUpdate: TemporaryVoiceConfig.findOneAndUpdate,
  configDelete: TemporaryVoiceConfig.findOneAndDelete,
  trackedFind: TemporaryVoiceChannel.find,
  trackedFindOne: TemporaryVoiceChannel.findOne,
  trackedUpdate: TemporaryVoiceChannel.findOneAndUpdate,
  trackedDelete: TemporaryVoiceChannel.deleteOne,
};

(async () => {
  const category = {
    id: 'category-1',
    type: ChannelType.GuildCategory,
    permissionsFor: () => ({ has: (permissions) => permissions.every((permission) => [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.MoveMembers,
    ].includes(permission)) }),
  };
  const generator = {
    id: 'generator-1',
    type: ChannelType.GuildVoice,
    parentId: category.id,
    parent: category,
    permissionsFor: category.permissionsFor,
    toString: () => '<#generator-1>',
  };
  const cache = new Map([[generator.id, generator]]);
  const createdChannels = [];
  const guild = {
    id: 'guild-voice',
    name: 'Avalon',
    members: { me: { id: 'bot-1' } },
    channels: {
      cache,
      fetch: async (id) => cache.get(id) || null,
      create: async (options) => {
        const channel = {
          id: `temporary-${createdChannels.length + 1}`,
          type: ChannelType.GuildVoice,
          guild,
          members: new Map(),
          options,
          locked: false,
          deleted: false,
          lockPermissions: async () => { channel.locked = true; },
          delete: async () => { channel.deleted = true; cache.delete(channel.id); },
        };
        createdChannels.push(channel);
        cache.set(channel.id, channel);
        return channel;
      },
    },
  };

  let savedConfig;
  TemporaryVoiceConfig.findOneAndUpdate = async (filter, update, options) => {
    assert.deepEqual(filter, { guildId: guild.id });
    assert.equal(options.upsert, true);
    assert.equal(options.runValidators, true);
    savedConfig = update;
    return update;
  };
  await service.setTemporaryVoiceGenerators({
    guild,
    channelIds: [generator.id, generator.id],
    updatedBy: 'admin-1',
  });
  assert.deepEqual(savedConfig.generatorChannelIds, [generator.id]);

  assert.throws(() => service.validateGeneratorChannels({
    ...guild,
    channels: { cache: new Map([['orphan', { id: 'orphan', type: ChannelType.GuildVoice, parentId: null }]]) },
  }, ['orphan']), /categoría/);
  assert.throws(() => service.validateGeneratorChannels({
    ...guild,
    channels: { cache: new Map([['blocked', {
      ...generator,
      id: 'blocked',
      permissionsFor: () => ({ has: () => false }),
    }]]) },
  }, ['blocked']), /Mover miembros/);

  let tracked;
  TemporaryVoiceChannel.findOneAndUpdate = async (_filter, update, options) => {
    assert.equal(options.upsert, true);
    tracked = update;
    return update;
  };
  TemporaryVoiceChannel.deleteOne = async () => ({ deletedCount: 1 });
  const member = {
    id: 'user-1',
    displayName: 'Ava Líder',
    user: { username: 'ava_user', tag: 'ava_user' },
    guild,
    voice: { setChannel: async (channel) => { member.movedTo = channel.id; } },
  };
  const oldState = { channelId: null, channel: null, guild, member, id: member.id };
  const newState = { channelId: generator.id, channel: generator, guild, member, id: member.id };
  await service.handleVoiceStateUpdate(oldState, newState);

  assert.equal(createdChannels.length, 1);
  const temporary = createdChannels[0];
  assert.equal(temporary.options.parent, category.id);
  assert.equal(temporary.options.type, ChannelType.GuildVoice);
  assert.match(temporary.options.name, /Ava Líder/);
  assert.equal(temporary.locked, true, 'los permisos deben sincronizarse con la categoría');
  assert.equal(member.movedTo, temporary.id);
  assert.equal(tracked.generatorChannelId, generator.id);
  assert.equal(tracked.ownerId, member.id);

  TemporaryVoiceChannel.findOne = async ({ channelId }) => (
    channelId === temporary.id ? tracked : null
  );
  temporary.members.set(member.id, member);
  assert.equal(await service.deleteTemporaryChannelIfEmpty(temporary), false);
  assert.equal(temporary.deleted, false);
  temporary.members.clear();
  assert.equal(await service.deleteTemporaryChannelIfEmpty(temporary), true);
  assert.equal(temporary.deleted, true);

  const failedMember = {
    ...member,
    id: 'user-2',
    displayName: 'Sin mover',
    voice: { setChannel: async () => { throw new Error('sin permiso para mover'); } },
  };
  await assert.rejects(
    service.createTemporaryChannelFor(failedMember, generator),
    /sin permiso para mover/,
  );
  assert.equal(createdChannels[1].deleted, true, 'una creación incompleta no debe dejar canales huérfanos');

  const recoveredEmpty = await guild.channels.create({ name: 'Vacío', type: ChannelType.GuildVoice, parent: category.id });
  const recoveredOccupied = await guild.channels.create({ name: 'Ocupado', type: ChannelType.GuildVoice, parent: category.id });
  recoveredOccupied.members.set(member.id, member);
  const recoveryRecords = [recoveredEmpty, recoveredOccupied].map((channel) => ({
    guildId: guild.id,
    channelId: channel.id,
  }));
  TemporaryVoiceChannel.find = async () => recoveryRecords;
  TemporaryVoiceChannel.findOne = async ({ channelId }) => recoveryRecords.find((record) => record.channelId === channelId) || null;
  const removedAtStartup = await service.recoverTemporaryVoiceChannels({
    guilds: { cache: new Map([[guild.id, guild]]) },
  });
  assert.equal(removedAtStartup, 1);
  assert.equal(recoveredEmpty.deleted, true);
  assert.equal(recoveredOccupied.deleted, false);

  const status = {
    temporaryVoiceGeneratorIds: [generator.id],
    temporaryVoiceReady: true,
  };
  const screen = setupUi.buildTemporaryVoiceScreen({ status, userId: 'admin-1', guildId: guild.id });
  const select = screen.components[0].components[0].data;
  assert.equal(select.type, 8);
  assert.deepEqual(select.channel_types, [ChannelType.GuildVoice]);
  assert.equal(select.max_values, 25);
  assert.deepEqual(select.default_values.map((value) => value.id), [generator.id]);

  console.log('✅ Canales de voz temporales verificados');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  TemporaryVoiceConfig.findOne = saved.configFindOne;
  TemporaryVoiceConfig.findOneAndUpdate = saved.configUpdate;
  TemporaryVoiceConfig.findOneAndDelete = saved.configDelete;
  TemporaryVoiceChannel.find = saved.trackedFind;
  TemporaryVoiceChannel.findOne = saved.trackedFindOne;
  TemporaryVoiceChannel.findOneAndUpdate = saved.trackedUpdate;
  TemporaryVoiceChannel.deleteOne = saved.trackedDelete;
});
