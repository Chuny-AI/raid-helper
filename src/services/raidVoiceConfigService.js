const { ChannelType, PermissionFlagsBits } = require('discord.js');
const RaidVoiceConfig = require('../database/models/RaidVoiceConfig');

const requiredPermissions = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.MoveMembers,
];

const findCategory = async (guild, categoryId) => guild.channels.cache.get(categoryId)
  || await guild.channels.fetch(categoryId).catch(() => null);

const validateRaidVoiceCategory = async (guild, categoryId) => {
  const category = await findCategory(guild, categoryId);
  if (category?.type !== ChannelType.GuildCategory) {
    throw new Error('Selecciona una categoría válida del servidor.');
  }
  if (!category.permissionsFor?.(guild.members.me)?.has(requiredPermissions)) {
    throw new Error('En esa categoría el bot necesita Ver canal, Conectar, Gestionar canales y Mover miembros.');
  }
  return category;
};

const setRaidVoiceCategory = async ({ guild, categoryId, updatedBy }) => {
  const category = await validateRaidVoiceCategory(guild, categoryId);
  return RaidVoiceConfig.findOneAndUpdate(
    { guildId: guild.id },
    { guildId: guild.id, categoryId: category.id, updatedBy, updatedAt: new Date() },
    { upsert: true, new: true, runValidators: true },
  );
};

const clearRaidVoiceCategory = (guildId) => RaidVoiceConfig.findOneAndDelete({ guildId });

const getRaidVoiceCategory = async (guild) => {
  const config = await RaidVoiceConfig.findOne({ guildId: guild.id });
  if (!config?.categoryId) return { configured: false, category: null };
  const category = await findCategory(guild, config.categoryId);
  return {
    configured: true,
    category: category?.type === ChannelType.GuildCategory ? category : null,
    categoryId: config.categoryId,
  };
};

module.exports = {
  clearRaidVoiceCategory,
  getRaidVoiceCategory,
  setRaidVoiceCategory,
  validateRaidVoiceCategory,
};
