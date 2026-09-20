const { getOrCreateServer } = require('../../../services/serverService');
const {
  getAuthorizedRoles,
  syncAuthorizedRoles,
} = require('../../../services/authorizedRoleService');
const {
  listEconomyRoles,
  syncEconomyRoles,
} = require('../../../services/economy/economyRoleService');
const {
  clearLogChannel,
  getLogChannel,
  setLogChannel,
} = require('../../../services/economy/economyService');
const { PermissionFlagsBits } = require('discord.js');
const {
  clearTemporaryVoiceGenerators,
  getTemporaryVoiceStatus,
  setTemporaryVoiceGenerators,
} = require('../../../services/temporaryVoiceService');

const getSetupStatus = async (guild, sourceChannelId) => {
  await getOrCreateServer(guild.id, guild.name);
  const [authorizedRoles, economyRoles, economyChannelId, temporaryVoiceStatus] = await Promise.all([
    getAuthorizedRoles(guild.id),
    listEconomyRoles(guild.id),
    getLogChannel(guild.id, sourceChannelId),
    getTemporaryVoiceStatus(guild),
  ]);

  const liveAuthorizedRoles = authorizedRoles.filter((role) => guild.roles.cache.has(role.roleId));
  const liveEconomyRoles = economyRoles.filter((role) => guild.roles.cache.has(role.roleId));
  const economyChannel = economyChannelId
    ? guild.channels.cache.get(economyChannelId) || null
    : null;

  return {
    authorizedRoleIds: liveAuthorizedRoles.map((role) => role.roleId),
    economyRoleIds: liveEconomyRoles.map((role) => role.roleId),
    economyChannelId: economyChannel?.id || null,
    staleAuthorizedRoles: authorizedRoles.length - liveAuthorizedRoles.length,
    staleEconomyRoles: economyRoles.length - liveEconomyRoles.length,
    baseReady: liveAuthorizedRoles.length > 0,
    economyReady: liveEconomyRoles.length > 0 && Boolean(economyChannel),
    ...temporaryVoiceStatus,
  };
};

const resolveSelectableRoles = (guild, roleIds) => Array.from(new Set(roleIds || []))
  .map((roleId) => guild.roles.cache.get(roleId))
  .filter((role) => role && role.id !== guild.id && !role.managed)
  .slice(0, 25);

const saveAuthorizedRoles = async ({ guild, roleIds, userId }) => {
  const roles = resolveSelectableRoles(guild, roleIds);
  return syncAuthorizedRoles({ serverId: guild.id, roles, addedBy: userId });
};

const saveEconomyRoles = async ({ guild, roleIds, userId }) => {
  const roles = resolveSelectableRoles(guild, roleIds);
  return syncEconomyRoles({ guildId: guild.id, roles, addedBy: userId });
};

const saveEconomyChannel = async ({ guild, sourceChannelId, channelId, userId }) => {
  if (!sourceChannelId) throw new Error('Abre `/setup` dentro del canal que quieres configurar.');
  const channel = guild.channels.cache.get(channelId);
  if (!channel?.isTextBased?.() || typeof channel.send !== 'function') {
    throw new Error('Selecciona un canal de texto válido.');
  }
  const permissions = channel.permissionsFor?.(guild.members.me);
  if (!permissions?.has([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
  ])) {
    throw new Error('El bot necesita ver el canal, enviar mensajes e insertar enlaces allí.');
  }
  return setLogChannel({ guildId: guild.id, sourceChannelId, channelId, setBy: userId });
};

module.exports = {
  clearLogChannel,
  clearTemporaryVoiceGenerators,
  getSetupStatus,
  resolveSelectableRoles,
  saveAuthorizedRoles,
  saveEconomyChannel,
  saveEconomyRoles,
  setTemporaryVoiceGenerators,
};
