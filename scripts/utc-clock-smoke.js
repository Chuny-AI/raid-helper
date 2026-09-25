const assert = require('node:assert/strict');
const {
  ChannelType,
  PermissionFlagsBits,
  Routes,
} = require('discord.js');
const command = require('../src/commands/utility/setup_utc');
const UtcClockConfig = require('../src/database/models/UtcClockConfig');
const service = require('../src/services/utcClockService');

const saved = {
  find: UtcClockConfig.find,
  findOne: UtcClockConfig.findOne,
  findOneAndDelete: UtcClockConfig.findOneAndDelete,
  findOneAndUpdate: UtcClockConfig.findOneAndUpdate,
};

(async () => {
  const definition = command.data.toJSON();
  assert.equal(definition.name, 'setup-utc');
  assert.deepEqual(definition.contexts, [0]);
  assert.equal(definition.default_member_permissions, String(PermissionFlagsBits.Administrator));
  assert.equal(service.formatUtcTime(new Date('2026-09-25T04:07:59.000Z')), '04:07 UTC');

  let config = null;
  const restCalls = [];
  const createdChannels = [];
  const cache = new Map();
  const client = {
    rest: {
      put: async (route, payload) => {
        restCalls.push({ route, payload });
      },
    },
    guilds: { cache: new Map() },
  };
  const guild = {
    id: 'guild-utc',
    name: 'UTC test',
    client,
    roles: { everyone: { id: 'guild-utc' } },
    members: { me: { id: 'bot-1' } },
    channels: {
      cache,
      fetch: async (channelId) => cache.get(channelId) || null,
      create: async (options) => {
        const channel = {
          id: `utc-${createdChannels.length + 1}`,
          type: ChannelType.GuildVoice,
          options,
          toString: () => `<#utc-${createdChannels.length}>`,
          delete: async () => {},
        };
        createdChannels.push(channel);
        cache.set(channel.id, channel);
        return channel;
      },
    },
  };
  client.guilds.cache.set(guild.id, guild);

  UtcClockConfig.findOne = async ({ guildId }) => (config?.guildId === guildId ? config : null);
  UtcClockConfig.findOneAndUpdate = async (_filter, update) => {
    config = { ...update };
    return config;
  };
  UtcClockConfig.findOneAndDelete = async (filter) => {
    if ((filter.guildId && filter.guildId === config?.guildId)
      || (filter.channelId && filter.channelId === config?.channelId)) {
      const deleted = config;
      config = null;
      return deleted;
    }
    return null;
  };
  UtcClockConfig.find = async () => (config ? [config] : []);

  const first = await service.setupUtcClock({ guild, updatedBy: 'admin-1', client });
  assert.equal(first.created, true);
  assert.equal(createdChannels.length, 1);
  assert.equal(first.channel.options.name, service.UTC_CHANNEL_NAME);
  assert.equal(first.channel.options.type, ChannelType.GuildVoice);
  assert(first.channel.options.permissionOverwrites[0].deny.includes(PermissionFlagsBits.Connect));
  assert(first.channel.options.permissionOverwrites[1].allow.includes(PermissionFlagsBits.SetVoiceChannelStatus));
  assert.equal(config.channelId, first.channel.id);
  assert.equal(restCalls[0].route, Routes.channelVoiceStatus(first.channel.id));
  assert.match(restCalls[0].payload.body.status, /^\d{2}:\d{2} UTC$/);

  const second = await service.setupUtcClock({ guild, updatedBy: 'admin-2', client });
  assert.equal(second.created, false);
  assert.equal(second.channel.id, first.channel.id);
  assert.equal(createdChannels.length, 1, 'repetir /setup-utc no debe duplicar el canal');

  restCalls.length = 0;
  assert.equal(await service.updateUtcClocks(client, new Date('2026-09-25T23:58:00.000Z')), 1);
  assert.deepEqual(restCalls, [{
    route: Routes.channelVoiceStatus(first.channel.id),
    payload: { body: { status: '23:58 UTC' } },
  }]);

  cache.delete(first.channel.id);
  assert.equal(await service.updateUtcClocks(client), 0);
  assert.equal(config, null, 'un canal eliminado debe retirar su configuración');

  console.log('UTC clock smoke tests passed.');
})().finally(() => {
  service.stopUtcClockUpdater();
  UtcClockConfig.find = saved.find;
  UtcClockConfig.findOne = saved.findOne;
  UtcClockConfig.findOneAndDelete = saved.findOneAndDelete;
  UtcClockConfig.findOneAndUpdate = saved.findOneAndUpdate;
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
