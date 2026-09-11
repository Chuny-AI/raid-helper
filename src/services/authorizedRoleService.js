const AuthorizedRole = require('../database/models/AuthorizedRole');

/**
 * Obtiene todos los roles autorizados para un servidor
 */
const getAuthorizedRoles = async (serverId) => {
  try {
    const roles = await AuthorizedRole.find({ serverId }).sort({ addedAt: -1 });
    return roles;
  } catch (error) {
    console.error('[ERROR] Error en getAuthorizedRoles:', error);
    throw error;
  }
};

/**
 * Verifica si un rol está autorizado para enviar notificaciones
 */
const isRoleAuthorized = async (roleId, serverId) => {
  try {
    const role = await AuthorizedRole.findOne({ roleId, serverId });
    return !!role;
  } catch (error) {
    console.error('[ERROR] Error en isRoleAuthorized:', error);
    throw error;
  }
};

/**
 * Verifica si un usuario tiene algún rol autorizado
 */
const isUserAuthorized = async (member, serverId) => {
  try {
    if (member.permissions.has('Administrator')) {
      return true;
    }

    const userRoles = member.roles.cache.map(role => role.id);
    const authorizedRoles = await getAuthorizedRoles(serverId);
    const authorizedRoleIds = authorizedRoles.map(role => role.roleId);
    
    return userRoles.some(roleId => authorizedRoleIds.includes(roleId));
  } catch (error) {
    console.error('[ERROR] Error en isUserAuthorized:', error);
    throw error;
  }
};

/**
 * Agrega un rol autorizado
 */
const addAuthorizedRole = async (roleId, roleName, serverId, addedBy) => {
  try {
    const existingRole = await AuthorizedRole.findOne({ roleId, serverId });
    if (existingRole) {
      throw new Error('Este rol ya está autorizado para enviar notificaciones.');
    }

    const authorizedRole = new AuthorizedRole({
      roleId,
      roleName,
      serverId,
      addedBy
    });

    const savedRole = await authorizedRole.save();
    return savedRole;
  } catch (error) {
    console.error('[ERROR] Error en addAuthorizedRole:', error);
    throw error;
  }
};

/**
 * Elimina un rol autorizado
 */
const removeAuthorizedRole = async (roleId, serverId) => {
  try {
    const result = await AuthorizedRole.findOneAndDelete({ roleId, serverId });
    if (!result) {
      throw new Error('Rol no encontrado en la lista de autorizados.');
    }
    return result;
  } catch (error) {
    console.error('[ERROR] Error en removeAuthorizedRole:', error);
    throw error;
  }
};

/**
 * Elimina todos los roles autorizados de un servidor
 */
const clearAuthorizedRoles = async (serverId) => {
  try {
    const result = await AuthorizedRole.deleteMany({ serverId });
    return result;
  } catch (error) {
    console.error('[ERROR] Error en clearAuthorizedRoles:', error);
    throw error;
  }
};

/**
 * Reemplaza de forma idempotente la selección de roles de un servidor.
 * Se usa en interfaces multi-select, donde el estado enviado por Discord es la
 * fuente completa de verdad y no una sola operación add/remove.
 */
const syncAuthorizedRoles = async ({ serverId, roles, addedBy }) => {
  const selected = Array.from(new Map(
    (roles || []).map((role) => [String(role.id), role])
  ).values());
  const roleIds = selected.map((role) => String(role.id));

  if (selected.length > 0) {
    await AuthorizedRole.bulkWrite(selected.map((role) => ({
      updateOne: {
        filter: { serverId, roleId: String(role.id) },
        update: {
          $set: { roleName: role.name },
          $setOnInsert: { serverId, roleId: String(role.id), addedBy, addedAt: new Date() },
        },
        upsert: true,
      },
    })));
  }

  // Elimina lo obsoleto después de asegurar lo seleccionado. Si el upsert
  // falla, la configuración anterior permanece disponible.
  await AuthorizedRole.deleteMany({
    serverId,
    ...(roleIds.length > 0 ? { roleId: { $nin: roleIds } } : {}),
  });

  return getAuthorizedRoles(serverId);
};

module.exports = {
  getAuthorizedRoles,
  isRoleAuthorized,
  isUserAuthorized,
  addAuthorizedRole,
  removeAuthorizedRole,
  clearAuthorizedRoles,
  syncAuthorizedRoles,
};
