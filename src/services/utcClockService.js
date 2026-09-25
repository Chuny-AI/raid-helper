const {
  ChannelType,
  PermissionFlagsBits,
  Routes,
} = require('discord.js');
const UtcClockConfig = require('../database/models/UtcClockConfig');

const UTC_CHANNEL_NAME = '🕒 Hora UTC';
const UPDATE_INTERVAL_MS = 60 * 1000;

let updateTimer = null;

const formatUtcTime = (date = new Date()) => {
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes} UTC`;
};

const getUtcClockConfig = (guildId) => UtcClockConfig.findOne({ guildId });

const clearUtcClockConfig = (guildId) => UtcClockConfig.findOneAndDelete({ guildId });

const clearUtcClockConfigByChannel = (channelId) => UtcClockConfig.findOneAndDelete({ channelId });

const setVoiceChannelStatus = (client, channelId, date = new Date()) => (
  client.rest.put(Routes.channelVoiceStatus(channelId), {
    body: { status: formatUtcTime(date) },
  })
);

const resolveConfiguredChannel = async (guild, channelId) => (
  guild.channels.cache.get(channelId)
  || guild.channels.fetch(channelId)
);

/**
 * Crea el reloj del servidor o reutiliza el canal que ya estaba configurado.
 * La hora se muestra como estado del canal de voz: así puede cambiar cada
 * minuto sin depender del límite estricto de renombrados de Discord.
 */
const setupUtcClock = async ({ guild, updatedBy, client = guild.client }) => {
  const existing = await getUtcClockConfig(guild.id);
  if (existing) {
    let existingChannel;
    try {
      existingChannel = await resolveConfiguredChannel(guild, existing.channelId);
    } catch (error) {
      if (error?.code !== 10003) throw error;
    }
    if (existingChannel?.type === ChannelType.GuildVoice) {
      await setVoiceChannelStatus(client, existingChannel.id);
      return { channel: existingChannel, created: false };
    }
    await clearUtcClockConfig(guild.id);
  }

  const channel = await guild.channels.create({
    name: UTC_CHANNEL_NAME,
    type: ChannelType.GuildVoice,
    reason: `Reloj UTC configurado por ${updatedBy}`,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.Connect],
      },
      {
        id: guild.members.me.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.SetVoiceChannelStatus,
        ],
      },
    ],
  });

  try {
    await setVoiceChannelStatus(client, channel.id);
    await UtcClockConfig.findOneAndUpdate(
      { guildId: guild.id },
      {
        guildId: guild.id,
        channelId: channel.id,
        updatedBy,
        updatedAt: new Date(),
      },
      { upsert: true, new: true, runValidators: true },
    );
    return { channel, created: true };
  } catch (error) {
    await channel.delete('No se pudo guardar la configuración del reloj UTC').catch(() => null);
    throw error;
  }
};

const updateUtcClocks = async (client, date = new Date()) => {
  const configs = await UtcClockConfig.find({});
  let updated = 0;

  for (const config of configs) {
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild) continue;

    let channel;
    try {
      channel = await resolveConfiguredChannel(guild, config.channelId);
    } catch (error) {
      if (error?.code === 10003) {
        await clearUtcClockConfig(config.guildId);
      } else {
        console.warn(`[WARN] No se pudo localizar el reloj UTC de ${guild.name} (${guild.id}):`, error.message);
      }
      continue;
    }
    if (!channel || channel.type !== ChannelType.GuildVoice) {
      await clearUtcClockConfig(config.guildId);
      continue;
    }

    try {
      await setVoiceChannelStatus(client, channel.id, date);
      updated += 1;
    } catch (error) {
      // Un fallo en un servidor no debe impedir que el resto de relojes cambie.
      console.warn(`[WARN] No se pudo actualizar el reloj UTC de ${guild.name} (${guild.id}):`, error.message);
    }
  }

  return updated;
};

const startUtcClockUpdater = async (client) => {
  if (updateTimer) return updateTimer;

  const scheduleNextUpdate = () => {
    const delay = UPDATE_INTERVAL_MS - (Date.now() % UPDATE_INTERVAL_MS) + 250;
    updateTimer = setTimeout(async () => {
      try {
        await updateUtcClocks(client);
      } catch (error) {
        console.error('[WARN] No se pudieron actualizar los relojes UTC:', error);
      } finally {
        scheduleNextUpdate();
      }
    }, delay);
    updateTimer.unref?.();
  };

  try {
    await updateUtcClocks(client);
  } catch (error) {
    console.error('[WARN] No se pudieron actualizar los relojes UTC al iniciar:', error);
  }
  scheduleNextUpdate();
  return updateTimer;
};

const stopUtcClockUpdater = () => {
  if (!updateTimer) return;
  clearTimeout(updateTimer);
  updateTimer = null;
};

module.exports = {
  UTC_CHANNEL_NAME,
  UPDATE_INTERVAL_MS,
  clearUtcClockConfig,
  clearUtcClockConfigByChannel,
  formatUtcTime,
  getUtcClockConfig,
  setVoiceChannelStatus,
  setupUtcClock,
  startUtcClockUpdater,
  stopUtcClockUpdater,
  updateUtcClocks,
};
