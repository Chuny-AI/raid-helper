const assert = require('node:assert/strict');
const {
  ChannelType,
  OverwriteType,
  PermissionFlagsBits,
} = require('discord.js');
const TemporaryVoiceConfig = require('../src/database/models/TemporaryVoiceConfig');
const TemporaryVoiceChannel = require('../src/database/models/TemporaryVoiceChannel');
const raidVoice = require('../src/utils/raidVoice');
const { renderRaidEmbed, renderRaidComponents } = require('../src/utils/raidRender');

const saved = {
  configFindOne: TemporaryVoiceConfig.findOne,
  trackedUpdate: TemporaryVoiceChannel.findOneAndUpdate,
  trackedDelete: TemporaryVoiceChannel.deleteOne,
};

const raid = {
  eventId: 'VOICE1',
  guildId: 'guild-1',
  title: 'Avaloniana 8.3',
  status: 'active',
  leaderId: 'leader',
  voiceChannelId: null,
  groups: [{ groupKey: 'dps', displayName: 'DPS', emoji: '⚔️', maxPlayers: 3, order: 0 }],
  slots: [{
    slotId: 'dps~0', groupKey: 'dps', itemIndex: 0, label: 'DPS', emoji: '⚔️', units: 3,
    users: [{ userId: 'user-1', username: 'Uno' }, { userId: 'user-2', username: 'Dos' }],
  }],
  looters: { max: 2, users: [{ userId: 'looter-1', username: 'Looter' }] },
  waitlist: [{ userId: 'waiting-1' }],
  cannotGo: [{ userId: 'absent-1' }],
};

(async () => {
  const granted = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.Connect,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.MoveMembers,
  ];
  const category = {
    id: 'category-1',
    permissionsFor: () => ({ has: (values) => values.every((value) => granted.includes(value)) }),
  };
  const generator = {
    id: 'generator-1',
    type: ChannelType.GuildVoice,
    parentId: category.id,
    parent: category,
  };
  const memberIds = ['bot-1', 'leader', 'user-1', 'user-2', 'looter-1', 'waiting-1', 'absent-1'];
  const memberCache = new Map(memberIds.map((id) => [id, { id }]));
  const channelCache = new Map([[generator.id, generator]]);
  let createdOptions;
  let syncedOverwrites;
  const createdChannel = {
    id: 'raid-voice-1',
    type: ChannelType.GuildVoice,
    members: new Map(),
    toString: () => '<#raid-voice-1>',
    permissionOverwrites: {
      set: async (overwrites) => { syncedOverwrites = overwrites; },
    },
    delete: async () => { createdChannel.deleted = true; channelCache.delete(createdChannel.id); },
  };
  const guild = {
    id: 'guild-1',
    members: {
      me: { id: 'bot-1' },
      cache: memberCache,
      fetch: async () => memberCache,
    },
    channels: {
      cache: channelCache,
      fetch: async (id) => channelCache.get(id) || null,
      create: async (options) => {
        createdOptions = options;
        createdChannel.guild = guild;
        channelCache.set(createdChannel.id, createdChannel);
        return createdChannel;
      },
    },
  };

  TemporaryVoiceConfig.findOne = async () => ({ generatorChannelIds: [generator.id] });
  let tracked;
  TemporaryVoiceChannel.findOneAndUpdate = async (_filter, update) => { tracked = update; return update; };
  TemporaryVoiceChannel.deleteOne = async () => ({ deletedCount: 1 });

  const result = await raidVoice.createRaidVoiceChannel({ guild, raid, actorId: 'leader' });
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'created');
  assert.equal(result.allowedCount, 4);
  assert.equal(createdOptions.parent, category.id);
  assert.equal(createdOptions.type, ChannelType.GuildVoice);
  assert.match(createdOptions.name, /Avaloniana 8\.3/);
  assert.equal(tracked.raidId, raid.eventId);

  const overwriteById = new Map(createdOptions.permissionOverwrites.map((overwrite) => [overwrite.id, overwrite]));
  assert.equal(overwriteById.get(guild.id).type, OverwriteType.Role);
  assert(overwriteById.get(guild.id).allow.includes(PermissionFlagsBits.ViewChannel));
  assert(overwriteById.get(guild.id).deny.includes(PermissionFlagsBits.Connect));
  for (const id of ['leader', 'user-1', 'user-2', 'looter-1']) {
    assert(overwriteById.get(id).allow.includes(PermissionFlagsBits.Connect), `${id} debe poder entrar`);
  }
  assert.equal(overwriteById.has('waiting-1'), false);
  assert.equal(overwriteById.has('absent-1'), false);

  raid.voiceChannelId = createdChannel.id;
  raid.slots[0].users = [{ userId: 'user-1', username: 'Uno' }];
  raid.looters.users.push({ userId: 'user-3', username: 'Tres' });
  memberCache.set('user-3', { id: 'user-3' });
  const syncResult = await raidVoice.syncRaidVoiceChannel(guild, raid);
  assert.equal(syncResult.ok, true);
  const syncedIds = new Set(syncedOverwrites.map((overwrite) => overwrite.id));
  assert(syncedIds.has('user-1'));
  assert(syncedIds.has('user-3'));
  assert(!syncedIds.has('user-2'));
  assert(!syncedIds.has('waiting-1'));

  const beforeStart = { ...raid, voiceChannelId: null };
  const startButton = renderRaidComponents(beforeStart, beforeStart)
    .flatMap((row) => row.components)
    .find((component) => component.data.custom_id === `raid:start:${raid.eventId}`);
  assert.equal(startButton.data.label, 'Iniciar evento');
  assert.equal(startButton.data.disabled, false);

  const startedButton = renderRaidComponents(raid, raid)
    .flatMap((row) => row.components)
    .find((component) => component.data.custom_id === `raid:start:${raid.eventId}`);
  assert.equal(startedButton.data.label, 'Evento iniciado');
  assert.equal(startedButton.data.disabled, true);
  const voiceField = renderRaidEmbed(raid, raid).data.fields.find((field) => field.name.includes('Canal del evento'));
  assert.match(voiceField.value, /raid-voice-1/);

  console.log('✅ Inicio privado de raids por voz verificado');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  TemporaryVoiceConfig.findOne = saved.configFindOne;
  TemporaryVoiceChannel.findOneAndUpdate = saved.trackedUpdate;
  TemporaryVoiceChannel.deleteOne = saved.trackedDelete;
});
