const GuildRole = require('../database/models/GuildRole');

/**
 * Añade uno o varios roles de gremio/alianza para un servidor
 * @param {string} guildId
 * @param {Array<string>} roleIds
 * @param {string} addedBy
 * @param {Array<string>} roleNames Optional parallel names
 */
const addGuildRoles = async (guildId, roleIds = [], addedBy = 'system', roleNames = []) => {
  const results = [];
  for (let i = 0; i < roleIds.length; i++) {
    const roleId = roleIds[i];
    const roleName = roleNames[i] || null;
    try {
      const existing = await GuildRole.findOne({ guildId, roleId });
      if (existing) {
        if (!existing.isActive) {
          existing.isActive = true;
          if (roleName) existing.roleName = roleName;
          await existing.save();
          results.push({ roleId, status: 'reactivated' });
        } else {
          results.push({ roleId, status: 'exists' });
        }
      } else {
        await GuildRole.create({ guildId, roleId, roleName, addedBy, isActive: true });
        results.push({ roleId, status: 'created' });
      }
    } catch (err) {
      results.push({ roleId, status: 'error', error: err.message });
    }
  }
  return results;
};

/**
 * Elimina (desactiva) roles de gremio/alianza del servidor
 */
const removeGuildRoles = async (guildId, roleIds = []) => {
  const results = [];
  for (const roleId of roleIds) {
    try {
      const role = await GuildRole.findOne({ guildId, roleId });
      if (!role) { results.push({ roleId, status: 'not_found' }); continue; }
      role.isActive = false;
      await role.save();
      results.push({ roleId, status: 'removed' });
    } catch (err) {
      results.push({ roleId, status: 'error', error: err.message });
    }
  }
  return results;
};

/**
 * Lista los roles activos del servidor
 */
const listGuildRoles = async (guildId) => {
  try {
    const roles = await GuildRole.find({ guildId, isActive: true }).sort({ addedAt: -1 });
    return roles;
  } catch (err) {
    return [];
  }
};

/**
 * Limpia roles obsoletos que ya no existen en el servidor
 */
const cleanStaleGuildRoles = async (guild) => {
  try {
    const guildId = guild.id;
    const activeRoles = await GuildRole.find({ guildId, isActive: true });
    const guildRoleIds = guild.roles.cache.map(r => r.id);
    let removed = 0;
    for (const gr of activeRoles) {
      if (!guildRoleIds.includes(gr.roleId)) {
        gr.isActive = false;
        await gr.save();
        removed++;
      }
    }
    return { removed };
  } catch (err) {
    return { removed: 0, error: err.message };
  }
};

/**
 * Verifica si el miembro posee algún rol de gremio/alianza configurado
 */
const isMemberInGuildRoles = async (member) => {
  try {
    const guildId = member.guild.id;
    const roles = await GuildRole.find({ guildId, isActive: true });
    const roleIds = roles.map(r => r.roleId);
    return member.roles.cache.some(role => roleIds.includes(role.id));
  } catch (err) {
    return false;
  }
};

module.exports = {
  addGuildRoles,
  removeGuildRoles,
  listGuildRoles,
  cleanStaleGuildRoles,
  isMemberInGuildRoles
};