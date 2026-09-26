const {
  ChannelType,
  OverwriteType,
  PermissionFlagsBits,
} = require('discord.js');
const TemporaryVoiceChannel = require('../database/models/TemporaryVoiceChannel');
const RaidEvent = require('../database/models/RaidEvent');
const raidRegistry = require('../services/raidRegistry');
const {
  deleteTemporaryChannelIfEmpty,
  getConfiguredGeneratorIds,
} = require('../services/temporaryVoiceService');
const { collectAllowedMemberIds } = require('./raidThread');
const { getRaidVoiceCategory } = require('../services/raidVoiceConfigService');

// Discord reemplaza la lista completa de overwrites en cada sincronización.
// Serializar por sala impide que una respuesta REST vieja restaure permisos.
const syncQueues = new Map();

const memberPermissions = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.Speak,
  PermissionFlagsBits.Stream,
  PermissionFlagsBits.UseVAD,
];

const botPermissions = [
  ...memberPermissions,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.MoveMembers,
];

const buildRaidVoiceName = (raid) => {
  const suffix = raid?.eventId ? ` · #${raid.eventId}` : '';
  const title = String(raid?.title || '').trim() || 'Raid';
  return `🔊 ${title.slice(0, Math.max(1, 97 - suffix.length))}${suffix}`.slice(0, 100);
};

const findGeneratorChannel = async (guild) => {
  const generatorIds = await getConfiguredGeneratorIds(guild.id);
  for (const channelId of generatorIds) {
    const channel = guild.channels.cache.get(channelId)
      || await guild.channels.fetch(channelId).catch(() => null);
    if (channel?.type === ChannelType.GuildVoice && channel.parentId) return channel;
  }
  return null;
};

const resolveLiveAllowedIds = async (guild, raid) => {
  const requested = [...collectAllowedMemberIds(raid)];
  const missing = requested.filter((id) => !guild.members.cache.has(id));
  if (missing.length > 0) {
    await guild.members.fetch({ user: missing, time: 15_000 }).catch(() => null);
  }
  return requested.filter((id) => guild.members.cache.has(id));
};

const buildPermissionOverwrites = (guild, allowedIds) => {
  const overwrites = [{
    id: guild.id,
    type: OverwriteType.Role,
    allow: [PermissionFlagsBits.ViewChannel],
    deny: [PermissionFlagsBits.Connect],
  }];

  if (guild.members.me?.id) {
    overwrites.push({
      id: guild.members.me.id,
      type: OverwriteType.Member,
      allow: botPermissions,
    });
  }

  for (const userId of allowedIds) {
    if (userId === guild.members.me?.id) continue;
    overwrites.push({
      id: userId,
      type: OverwriteType.Member,
      allow: memberPermissions,
    });
  }
  return overwrites;
};

const fetchRaidVoiceChannel = async (guild, channelId) => {
  if (!guild || !channelId) return null;
  return guild.channels.cache.get(channelId)
    || await guild.channels.fetch(channelId).catch(() => null);
};

const createRaidVoiceChannel = async ({ guild, raid, actorId }) => {
  if (raid.voiceChannelId) {
    const existing = await fetchRaidVoiceChannel(guild, raid.voiceChannelId);
    if (existing?.type === ChannelType.GuildVoice) {
      return { ok: true, reason: 'already_exists', channel: existing, allowedCount: collectAllowedMemberIds(raid).size };
    }
    raid.voiceChannelId = null;
  }

  const configuredCategory = await getRaidVoiceCategory(guild);
  if (configuredCategory.configured && !configuredCategory.category) {
    return { ok: false, reason: 'invalid_category' };
  }
  const generator = configuredCategory.configured ? null : await findGeneratorChannel(guild);
  if (!configuredCategory.configured && !generator) return { ok: false, reason: 'no_generator' };

  const category = configuredCategory.category || generator?.parent;
  const permissions = category?.permissionsFor?.(guild.members.me);
  if (!category || !permissions?.has([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.Connect,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.MoveMembers,
  ])) {
    return { ok: false, reason: 'missing_permissions' };
  }

  const allowedIds = await resolveLiveAllowedIds(guild, raid);
  if (allowedIds.length === 0) return { ok: false, reason: 'no_participants' };

  let channel;
  try {
    channel = await guild.channels.create({
      name: buildRaidVoiceName(raid),
      type: ChannelType.GuildVoice,
      parent: category.id,
      permissionOverwrites: buildPermissionOverwrites(guild, allowedIds),
      reason: `Canal privado para el raid #${raid.eventId}`,
    });
    await TemporaryVoiceChannel.findOneAndUpdate(
      { channelId: channel.id },
      {
        guildId: guild.id,
        channelId: channel.id,
        generatorChannelId: generator?.id || null,
        ownerId: actorId || raid.leaderId,
        raidId: raid.eventId,
        createdAt: new Date(),
      },
      { upsert: true, new: true, runValidators: true },
    );
    return { ok: true, reason: 'created', channel, allowedCount: allowedIds.length, allowedIds };
  } catch (error) {
    if (channel?.members?.size === 0) {
      await channel.delete('Creación del canal privado del raid incompleta').catch(() => {});
    }
    await TemporaryVoiceChannel.deleteOne({ channelId: channel?.id }).catch(() => {});
    throw error;
  }
};

const syncRaidVoiceChannel = (guild, raid) => {
  const key = `${guild?.id}:${raid?.eventId}`;
  const tail = syncQueues.get(key) || Promise.resolve();
  const run = tail.then(() => syncRaidVoiceChannelNow(guild, raid));
  const guarded = run.catch(() => {});
  syncQueues.set(key, guarded);
  guarded.then(() => {
    if (syncQueues.get(key) === guarded) syncQueues.delete(key);
  });
  return run;
};

const syncRaidVoiceChannelNow = async (guild, raid) => {
  if (!raid?.voiceChannelId) return { ok: false, reason: 'no_channel' };
  const channel = await fetchRaidVoiceChannel(guild, raid.voiceChannelId);
  if (!channel || channel.type !== ChannelType.GuildVoice) return { ok: false, reason: 'gone' };

  // Una vez iniciado el evento, la lista de acceso es una fotografía del
  // roster en ese instante. No se vuelven a escribir permisos ni se expulsa a
  // nadie que ya esté conectado, aunque una llamada atrasada llegue después.
  if (raid.status !== 'active') {
    return { ok: true, reason: 'frozen', channel };
  }

  const allowedIds = await resolveLiveAllowedIds(guild, raid);
  await channel.permissionOverwrites.set(
    buildPermissionOverwrites(guild, allowedIds),
    `Sincronización de participantes del raid #${raid.eventId}`,
  );
  // Quitar Connect no expulsa de inmediato a quien ya está conectado.
  const allowed = new Set(allowedIds);
  const unauthorized = [...(channel.members?.values() || [])]
    .filter((member) => member.id !== guild.members.me?.id && !allowed.has(member.id));
  const disconnected = await Promise.allSettled(unauthorized.map((member) =>
    member.voice.disconnect(`Salió del raid #${raid.eventId}`)));
  for (const failure of disconnected) {
    if (failure.status === 'rejected') {
      console.error(`[WARN] No se pudo sacar a un usuario del canal del raid #${raid.eventId}:`, failure.reason?.message);
    }
  }
  return { ok: true, channel, allowedCount: allowedIds.length };
};

const discardRaidVoiceChannel = async (channel) => {
  if (!channel) return;
  await channel.delete('Se revirtió la creación del canal del raid').catch(() => {});
  await TemporaryVoiceChannel.deleteOne({ channelId: channel.id }).catch(() => {});
};

const deleteRaidVoiceChannelIfEmpty = async (guild, raid) => {
  if (!raid?.voiceChannelId) return false;
  const channel = await fetchRaidVoiceChannel(guild, raid.voiceChannelId);
  if (!channel) {
    await clearRaidVoiceReference({
      guildId: guild.id,
      raidId: raid.eventId,
      channelId: raid.voiceChannelId,
    });
    return false;
  }
  return deleteTemporaryChannelIfEmpty(channel, `Raid #${raid.eventId} finalizado`);
};

const clearRaidVoiceReference = async ({ guildId, raidId, channelId }) => {
  if (!raidId) return false;
  const runtime = raidRegistry.getByRaidId(raidId);
  if (runtime?.raid?.guildId === guildId) {
    return raidRegistry.withRaidLock(raidId, async () => {
      if (runtime.raid.voiceChannelId !== channelId) return false;
      runtime.raid.voiceChannelId = null;
      try {
        await raidRegistry.saveRaid(raidId);
      } catch (error) {
        runtime.raid.voiceChannelId = channelId;
        throw error;
      }
      await raidRegistry.renderAndEdit(raidId);
      return true;
    });
  }
  const raid = await RaidEvent.findOneAndUpdate(
    { eventId: raidId, guildId, voiceChannelId: channelId },
    { $set: { voiceChannelId: null, updatedAt: new Date() } },
    { new: true },
  );
  if (!raid) return false;

  // Los raids cerrados se eliminan del registro en memoria, pero su mensaje
  // continúa visible. Si su sala temporal se borra después, quitamos también
  // la referencia del embed para que no quede un enlace muerto.
  if (raid.channelId && raid.messageId && raid.stateVersion >= 2) {
    try {
      const { client } = require('./client');
      const { renderRaidEmbeds, renderRaidComponents } = require('./raidRender');
      const channel = await client.channels.fetch(raid.channelId);
      const message = channel ? await channel.messages.fetch(raid.messageId) : null;
      if (message) {
        await message.edit({
          embeds: renderRaidEmbeds(raid, raid),
          components: renderRaidComponents(raid, raid),
        });
      }
    } catch (error) {
      if (error?.code !== 10003 && error?.code !== 10008) {
        console.error(`[WARN] No se pudo quitar del mensaje el canal de voz del raid #${raidId}:`, error?.message);
      }
    }
  }
  return true;
};

module.exports = {
  buildPermissionOverwrites,
  buildRaidVoiceName,
  clearRaidVoiceReference,
  createRaidVoiceChannel,
  deleteRaidVoiceChannelIfEmpty,
  discardRaidVoiceChannel,
  fetchRaidVoiceChannel,
  findGeneratorChannel,
  resolveLiveAllowedIds,
  syncRaidVoiceChannel,
};
