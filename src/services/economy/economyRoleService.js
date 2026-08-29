const { PermissionFlagsBits } = require('discord.js');
const EconomyRole = require('../../database/models/economy/EconomyRole');
const { UserError } = require('../../utils/userError');

const listEconomyRoles = async (guildId) => {
  return await EconomyRole.find({ guildId }).sort({ addedAt: -1 });
};

const hasConfiguredEconomyRole = async (member, guildId) => {
  if (!member?.roles?.cache) return false;

  const configuredRoles = await listEconomyRoles(guildId);
  if (configuredRoles.length === 0) return false;

  const configuredRoleIds = configuredRoles.map((role) => role.roleId);
  return member.roles.cache.some((role) => configuredRoleIds.includes(role.id));
};

const addEconomyRole = async ({ guildId, roleId, roleName, addedBy }) => {
  const existing = await EconomyRole.findOne({ guildId, roleId });
  if (existing) {
    throw new UserError('Ese rol ya está autorizado para economía en este servidor.');
  }

  return await EconomyRole.create({
    guildId,
    roleId,
    roleName,
    addedBy,
  });
};

const removeEconomyRole = async ({ guildId, roleId }) => {
  const removed = await EconomyRole.findOneAndDelete({ guildId, roleId });
  if (!removed) {
    throw new UserError('El rol indicado no estaba autorizado para economía.');
  }
  return removed;
};

const resetEconomyRoles = async ({ guildId }) => {
  return await EconomyRole.deleteMany({ guildId });
};

const canManageEconomyRoles = (member) => {
  return Boolean(member?.permissions?.has(PermissionFlagsBits.Administrator));
};

module.exports = {
  listEconomyRoles,
  hasConfiguredEconomyRole,
  addEconomyRole,
  removeEconomyRole,
  resetEconomyRoles,
  canManageEconomyRoles,
};
