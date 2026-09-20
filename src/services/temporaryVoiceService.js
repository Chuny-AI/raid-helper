const { ChannelType, PermissionFlagsBits } = require('discord.js');
const TemporaryVoiceConfig = require('../database/models/TemporaryVoiceConfig');
const TemporaryVoiceChannel = require('../database/models/TemporaryVoiceChannel');

const MAX_GENERATORS = 25;
const creationLocks = new Map();
const cleanupTimers = new Map();
const generatorCache = new Map();

const uniqueIds = (values) => Array.from(new Set((values || []).filter(Boolean))).slice(0, MAX_GENERATORS);

const requiredPermissions = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.MoveMembers,
];

const validateGeneratorChannels = (guild, channelIds) => {
  const ids = uniqueIds(channelIds);
  if (ids.length === 0) throw new Error('Selecciona al menos un canal de voz generador.');

  return ids.map((channelId) => {
    const channel = guild.channels.cache.get(channelId);
    if (!channel || channel.type !== ChannelType.GuildVoice) {
      throw new Error('Todos los generadores deben ser canales de voz normales.');
    }
    if (!channel.parentId || channel.parent?.type !== ChannelType.GuildCategory) {
      throw new Error(`${channel} debe estar dentro de una categoría.`);
    }
    const permissions = channel.parent.permissionsFor?.(guild.members.me);
    if (!permissions?.has(requiredPermissions)) {
      throw new Error(`En la categoría de ${channel}, el bot necesita Ver canal, Conectar, Gestionar canales y Mover miembros.`);
    }
    const generatorPermissions = channel.permissionsFor?.(guild.members.me);
    if (!generatorPermissions?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.MoveMembers,
    ])) {
      throw new Error(`El bot necesita Ver canal, Conectar y Mover miembros en ${channel}.`);
    }
    return channel;
  });
};

const setTemporaryVoiceGenerators = async ({ guild, channelIds, updatedBy }) => {
  const channels = validateGeneratorChannels(guild, channelIds);
  const generatorChannelIds = channels.map((channel) => channel.id);
  const config = await TemporaryVoiceConfig.findOneAndUpdate(
    { guildId: guild.id },
    { guildId: guild.id, generatorChannelIds, updatedBy, updatedAt: new Date() },
    { upsert: true, new: true, runValidators: true },
  );
  generatorCache.set(guild.id, new Set(generatorChannelIds));
  return config;
};

const clearTemporaryVoiceGenerators = async (guildId) => {
  const result = await TemporaryVoiceConfig.findOneAndDelete({ guildId });
  generatorCache.set(guildId, new Set());
  return result;
};

const getConfiguredGeneratorIds = async (guildId) => {
  if (generatorCache.has(guildId)) return generatorCache.get(guildId);
  const config = await TemporaryVoiceConfig.findOne({ guildId });
  const ids = new Set(config?.generatorChannelIds || []);
  generatorCache.set(guildId, ids);
  return ids;
};

const getTemporaryVoiceStatus = async (guild) => {
  const config = await TemporaryVoiceConfig.findOne({ guildId: guild.id });
  const configured = config?.generatorChannelIds || [];
  const live = configured.filter((id) => guild.channels.cache.get(id)?.type === ChannelType.GuildVoice);
  return {
    temporaryVoiceGeneratorIds: live,
    staleTemporaryVoiceGenerators: configured.length - live.length,
    temporaryVoiceReady: live.length > 0,
  };
};

const temporaryChannelName = (member) => {
  const rawName = String(member.displayName || member.user?.globalName || member.user?.username || 'Jugador');
  return `🔊 Sala de ${rawName}`.slice(0, 100);
};

const removeTracking = (guildId, channelId) => TemporaryVoiceChannel.deleteOne({ guildId, channelId });

const deleteTemporaryChannelIfEmpty = async (channel, reason = 'Canal de voz temporal vacío') => {
  if (!channel?.guild || channel.type !== ChannelType.GuildVoice || channel.members?.size !== 0) return false;
  const tracked = await TemporaryVoiceChannel.findOne({ guildId: channel.guild.id, channelId: channel.id });
  if (!tracked || channel.members?.size !== 0) return false;
  await channel.delete(reason);
  await removeTracking(channel.guild.id, channel.id);
  return true;
};

const cancelScheduledCleanup = (channelId) => {
  const timer = cleanupTimers.get(channelId);
  if (timer) clearTimeout(timer);
  cleanupTimers.delete(channelId);
};

const scheduleEmptyChannelCleanup = (channel, delayMs = 1500) => {
  if (!channel?.id) return;
  cancelScheduledCleanup(channel.id);
  const timer = setTimeout(async () => {
    cleanupTimers.delete(channel.id);
    try {
      const current = channel.guild.channels.cache.get(channel.id);
      if (current) await deleteTemporaryChannelIfEmpty(current);
      else await removeTracking(channel.guild.id, channel.id);
    } catch (error) {
      console.error(`[ERROR] No se pudo eliminar el canal temporal ${channel.id}:`, error);
    }
  }, delayMs);
  timer.unref?.();
  cleanupTimers.set(channel.id, timer);
};

const createTemporaryChannelFor = async (member, generator) => {
  const key = `${member.guild.id}:${member.id}`;
  if (creationLocks.has(key)) return creationLocks.get(key);

  const creation = (async () => {
    let channel;
    try {
      channel = await member.guild.channels.create({
        name: temporaryChannelName(member),
        type: ChannelType.GuildVoice,
        parent: generator.parentId,
        reason: `Canal temporal solicitado por ${member.user?.tag || member.id}`,
      });
      // Copia exactamente las sobrescrituras de la categoría y mantiene el
      // canal sincronizado con futuros cambios de permisos de esa categoría.
      await channel.lockPermissions();
      await TemporaryVoiceChannel.findOneAndUpdate(
        { channelId: channel.id },
        {
          guildId: member.guild.id,
          channelId: channel.id,
          generatorChannelId: generator.id,
          ownerId: member.id,
          createdAt: new Date(),
        },
        { upsert: true, new: true, runValidators: true },
      );
      await member.voice.setChannel(channel, 'Traslado a su canal de voz temporal');
      return channel;
    } catch (error) {
      if (channel) {
        await removeTracking(member.guild.id, channel.id).catch(() => {});
        if (channel.members?.size === 0) await channel.delete('Creación de canal temporal incompleta').catch(() => {});
      }
      throw error;
    }
  })();

  creationLocks.set(key, creation);
  try {
    return await creation;
  } finally {
    creationLocks.delete(key);
  }
};

const handleVoiceStateUpdate = async (oldState, newState) => {
  if (newState.channelId) cancelScheduledCleanup(newState.channelId);

  // La limpieza no depende de poder leer la configuración: si MongoDB falla
  // mientras alguien sale, la sala anterior aun debe intentar eliminarse.
  if (oldState.channelId && oldState.channelId !== newState.channelId && oldState.channel) {
    scheduleEmptyChannelCleanup(oldState.channel);
  }

  if (newState.channelId && newState.channelId !== oldState.channelId && !newState.member?.user?.bot) {
    const generators = await getConfiguredGeneratorIds(newState.guild.id);
    if (generators.has(newState.channelId)) {
      const generator = newState.channel;
      if (generator?.type === ChannelType.GuildVoice && generator.parentId) {
        await createTemporaryChannelFor(newState.member, generator);
      }
    }
  }
};

const handleChannelDelete = async (channel) => {
  cancelScheduledCleanup(channel.id);
  await TemporaryVoiceChannel.deleteOne({ channelId: channel.id });
  generatorCache.delete(channel.guild?.id);
};

const recoverTemporaryVoiceChannels = async (client) => {
  generatorCache.clear();
  const trackedChannels = await TemporaryVoiceChannel.find({});
  let removed = 0;
  for (const tracked of trackedChannels) {
    const guild = client.guilds.cache.get(tracked.guildId);
    let channel = guild?.channels.cache.get(tracked.channelId) || null;
    if (!channel && guild) channel = await guild.channels.fetch(tracked.channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildVoice) {
      await removeTracking(tracked.guildId, tracked.channelId);
      continue;
    }
    if (await deleteTemporaryChannelIfEmpty(channel, 'Limpieza de canal temporal al iniciar')) removed += 1;
  }
  return removed;
};

module.exports = {
  cancelScheduledCleanup,
  clearTemporaryVoiceGenerators,
  createTemporaryChannelFor,
  deleteTemporaryChannelIfEmpty,
  getConfiguredGeneratorIds,
  getTemporaryVoiceStatus,
  handleChannelDelete,
  handleVoiceStateUpdate,
  recoverTemporaryVoiceChannels,
  scheduleEmptyChannelCleanup,
  setTemporaryVoiceGenerators,
  temporaryChannelName,
  validateGeneratorChannels,
};
