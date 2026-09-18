const { PermissionFlagsBits } = require('discord.js');
const EconomyRole = require('../../database/models/economy/EconomyRole');
const { UserError } = require('../../utils/userError');

const listEconomyRoles = async (guildId) => {
  return await EconomyRole.find({ guildId }).sort({ addedAt: -1 });
};

const hasConfiguredEconomyRole = async (member, guildId) => {
  if (!member?.roles) return false;

  const configuredRoles = await listEconomyRoles(guildId);
  if (configuredRoles.length === 0) return false;

  const configuredRoleIds = configuredRoles.map((role) => role.roleId);
  if (member.roles.cache) return member.roles.cache.some((role) => configuredRoleIds.includes(role.id));
  if (Array.isArray(member.roles)) return member.roles.some((id) => configuredRoleIds.includes(id));
  return false;
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

const syncEconomyRoles = async ({ guildId, roles, addedBy }) => {
  const selected = Array.from(new Map(
    (roles || []).map((role) => [String(role.id), role])
  ).values());
  const roleIds = selected.map((role) => String(role.id));

  if (selected.length > 0) {
    await EconomyRole.bulkWrite(selected.map((role) => ({
      updateOne: {
        filter: { guildId, roleId: String(role.id) },
        update: {
          $set: { roleName: role.name },
          $setOnInsert: { guildId, roleId: String(role.id), addedBy, addedAt: new Date() },
        },
        upsert: true,
      },
    })));
  }

  await EconomyRole.deleteMany({
    guildId,
    ...(roleIds.length > 0 ? { roleId: { $nin: roleIds } } : {}),
  });

  return listEconomyRoles(guildId);
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
  syncEconomyRoles,
  canManageEconomyRoles,
};
