const EconomyRole = require('../database/models/EconomyRole');

/**
 * Servicio para gestionar roles de economía
 * Maneja la creación, actualización, eliminación y consulta de roles con permisos de economía
 */
class EconomyRoleService {
  
  /**
   * Crea un nuevo rol de economía
   * @param {Object} roleData - Datos del rol
   * @param {string} roleData.roleId - ID del rol de Discord
   * @param {string} roleData.name - Nombre del rol
   * @param {string} roleData.guildId - ID del servidor
   * @param {Array<string>} roleData.permissions - Array de permisos
   * @param {string} roleData.createdBy - ID del usuario que crea el rol
   * @param {string} [roleData.description] - Descripción opcional
   * @returns {Promise<EconomyRole>} - Rol creado
   */
  static async createEconomyRole(roleData) {
    try {
      const { roleId, name, guildId, permissions = ['ECONOMY'], createdBy, description = '' } = roleData;

      // Verificar si el rol ya existe
      const existingRole = await EconomyRole.findOne({ guildId, roleId });
      if (existingRole) {
        if (existingRole.isActive) {
          throw new Error(`El rol ${name} ya está registrado como rol de economía`);
        } else {
          // Reactivar rol existente
          existingRole.isActive = true;
          existingRole.permissions = permissions;
          existingRole.name = name;
          existingRole.description = description;
          existingRole.updatedAt = new Date();
          await existingRole.save();
          return existingRole;
        }
      }

      // Crear nuevo rol
      const economyRole = new EconomyRole({
        roleId,
        name,
        guildId,
        permissions,
        createdBy,
        description
      });

      await economyRole.save();
      return economyRole;
    } catch (error) {
      console.error('[ERROR] Error creando rol de economía:', error);
      throw error;
    }
  }

  /**
   * Obtiene todos los roles de economía de un servidor
   * @param {string} guildId - ID del servidor
   * @returns {Promise<Array<EconomyRole>>} - Array de roles de economía
   */
  static async getEconomyRoles(guildId) {
    try {
      return await EconomyRole.findByGuild(guildId);
    } catch (error) {
      console.error('[ERROR] Error obteniendo roles de economía:', error);
      throw error;
    }
  }

  /**
   * Obtiene un rol de economía específico
   * @param {string} guildId - ID del servidor
   * @param {string} roleId - ID del rol
   * @returns {Promise<EconomyRole|null>} - Rol de economía o null
   */
  static async getEconomyRole(guildId, roleId) {
    try {
      return await EconomyRole.findOne({ guildId, roleId, isActive: true });
    } catch (error) {
      console.error('[ERROR] Error obteniendo rol de economía:', error);
      throw error;
    }
  }

  /**
   * Actualiza un rol de economía
   * @param {string} guildId - ID del servidor
   * @param {string} roleId - ID del rol
   * @param {Object} updateData - Datos a actualizar
   * @returns {Promise<EconomyRole|null>} - Rol actualizado o null
   */
  static async updateEconomyRole(guildId, roleId, updateData) {
    try {
      const role = await EconomyRole.findOne({ guildId, roleId, isActive: true });
      if (!role) {
        throw new Error('Rol de economía no encontrado');
      }

      // Actualizar campos permitidos
      if (updateData.name) role.name = updateData.name;
      if (updateData.permissions) role.permissions = updateData.permissions;
      if (updateData.description !== undefined) role.description = updateData.description;

      await role.save();
      return role;
    } catch (error) {
      console.error('[ERROR] Error actualizando rol de economía:', error);
      throw error;
    }
  }

  /**
   * Elimina un rol de economía (desactivación lógica)
   * @param {string} guildId - ID del servidor
   * @param {string} roleId - ID del rol
   * @returns {Promise<boolean>} - true si se eliminó exitosamente
   */
  static async removeEconomyRole(guildId, roleId) {
    try {
      const role = await EconomyRole.findOne({ guildId, roleId, isActive: true });
      if (!role) {
        throw new Error('Rol de economía no encontrado');
      }

      await role.deactivate();
      return true;
    } catch (error) {
      console.error('[ERROR] Error eliminando rol de economía:', error);
      throw error;
    }
  }

  /**
   * Elimina todos los roles de economía de un servidor
   * @param {string} guildId - ID del servidor
   * @returns {Promise<number>} - Número de roles eliminados
   */
  static async clearEconomyRoles(guildId) {
    try {
      const result = await EconomyRole.updateMany(
        { guildId, isActive: true },
        { isActive: false, updatedAt: new Date() }
      );
      return result.modifiedCount;
    } catch (error) {
      console.error('[ERROR] Error limpiando roles de economía:', error);
      throw error;
    }
  }

  /**
   * Verifica si un usuario tiene permisos de economía
   * @param {Object} interaction - Interacción de Discord
   * @param {string} permission - Permiso específico a verificar
   * @returns {Promise<boolean>} - true si tiene permisos
   */
  static async hasEconomyPermission(interaction, permission = 'ECONOMY') {
    try {
      if (!interaction.guild || !interaction.member) {
        return false;
      }

      const guildId = interaction.guild.id;
      const userRoles = interaction.member.roles.cache;

      // Verificar si alguno de los roles del usuario tiene el permiso
      for (const [roleId] of userRoles) {
        const hasPermission = await EconomyRole.hasPermission(guildId, roleId, permission);
        if (hasPermission) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('[ERROR] Error verificando permisos de economía:', error);
      return false;
    }
  }

  /**
   * Obtiene todos los permisos de economía de un usuario
   * @param {Object} interaction - Interacción de Discord
   * @returns {Promise<Array<string>>} - Array de permisos únicos
   */
  static async getUserEconomyPermissions(interaction) {
    try {
      if (!interaction.guild || !interaction.member) {
        return [];
      }

      const guildId = interaction.guild.id;
      const userRoles = interaction.member.roles.cache;
      const allPermissions = new Set();

      // Recopilar permisos de todos los roles del usuario
      for (const [roleId] of userRoles) {
        const permissions = await EconomyRole.getRolePermissions(guildId, roleId);
        permissions.forEach(permission => allPermissions.add(permission));
      }

      return Array.from(allPermissions);
    } catch (error) {
      console.error('[ERROR] Error obteniendo permisos de usuario:', error);
      return [];
    }
  }

  /**
   * Agrega un permiso a un rol de economía
   * @param {string} guildId - ID del servidor
   * @param {string} roleId - ID del rol
   * @param {string} permission - Permiso a agregar
   * @returns {Promise<boolean>} - true si se agregó exitosamente
   */
  static async addPermissionToRole(guildId, roleId, permission) {
    try {
      const role = await EconomyRole.findOne({ guildId, roleId, isActive: true });
      if (!role) {
        throw new Error('Rol de economía no encontrado');
      }

      return await role.addPermission(permission);
    } catch (error) {
      console.error('[ERROR] Error agregando permiso a rol:', error);
      throw error;
    }
  }

  /**
   * Remueve un permiso de un rol de economía
   * @param {string} guildId - ID del servidor
   * @param {string} roleId - ID del rol
   * @param {string} permission - Permiso a remover
   * @returns {Promise<boolean>} - true si se removió exitosamente
   */
  static async removePermissionFromRole(guildId, roleId, permission) {
    try {
      const role = await EconomyRole.findOne({ guildId, roleId, isActive: true });
      if (!role) {
        throw new Error('Rol de economía no encontrado');
      }

      // No permitir remover el permiso base ECONOMY
      if (permission === 'ECONOMY' && role.permissions.length === 1) {
        throw new Error('No se puede remover el permiso base ECONOMY');
      }

      return await role.removePermission(permission);
    } catch (error) {
      console.error('[ERROR] Error removiendo permiso de rol:', error);
      throw error;
    }
  }

  /**
   * Obtiene roles con un permiso específico
   * @param {string} guildId - ID del servidor
   * @param {string} permission - Permiso a buscar
   * @returns {Promise<Array<EconomyRole>>} - Array de roles con el permiso
   */
  static async getRolesByPermission(guildId, permission) {
    try {
      return await EconomyRole.findByPermission(guildId, permission);
    } catch (error) {
      console.error('[ERROR] Error obteniendo roles por permiso:', error);
      throw error;
    }
  }

  /**
   * Sincroniza roles de Discord con la base de datos
   * Elimina roles que ya no existen en Discord
   * @param {Object} guild - Guild de Discord
   * @returns {Promise<Object>} - Resultado de la sincronización
   */
  static async syncRolesWithDiscord(guild) {
    try {
      const guildId = guild.id;
      const economyRoles = await this.getEconomyRoles(guildId);
      const discordRoles = guild.roles.cache;
      
      let removedCount = 0;
      let updatedCount = 0;

      for (const economyRole of economyRoles) {
        const discordRole = discordRoles.get(economyRole.roleId);
        
        if (!discordRole) {
          // Rol no existe en Discord, desactivar
          await economyRole.deactivate();
          removedCount++;
        } else if (discordRole.name !== economyRole.name) {
          // Actualizar nombre si cambió
          economyRole.name = discordRole.name;
          await economyRole.save();
          updatedCount++;
        }
      }

      return {
        total: economyRoles.length,
        removed: removedCount,
        updated: updatedCount,
        active: economyRoles.length - removedCount
      };
    } catch (error) {
      console.error('[ERROR] Error sincronizando roles:', error);
      throw error;
    }
  }

  /**
   * Obtiene estadísticas de roles de economía
   * @param {string} guildId - ID del servidor
   * @returns {Promise<Object>} - Estadísticas de roles
   */
  static async getEconomyRoleStats(guildId) {
    try {
      const totalRoles = await EconomyRole.countDocuments({ guildId, isActive: true });
      const rolesByPermission = {};

      const permissions = ['ECONOMY', 'ECONOMY_ADD', 'ECONOMY_REMOVE', 'ECONOMY_VIEW', 'ECONOMY_ADMIN'];
      
      for (const permission of permissions) {
        const count = await EconomyRole.countDocuments({ 
          guildId, 
          permissions: permission, 
          isActive: true 
        });
        rolesByPermission[permission] = count;
      }

      return {
        totalRoles,
        rolesByPermission,
        lastUpdated: new Date()
      };
    } catch (error) {
      console.error('[ERROR] Error obteniendo estadísticas:', error);
      throw error;
    }
  }
}

module.exports = EconomyRoleService;