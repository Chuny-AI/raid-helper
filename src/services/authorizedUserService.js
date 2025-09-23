const AuthorizedUser = require('../database/models/AuthorizedUser');

/**
 * Servicio para gestionar usuarios autorizados para decode-file
 */
class AuthorizedUserService {

  /**
   * Verifica si un usuario está autorizado para usar decode-file
   * @param {string} userId - ID del usuario de Discord
   * @returns {Promise<boolean>} - true si está autorizado
   */
  static async isUserAuthorized(userId) {
    try {
      const user = await AuthorizedUser.findOne({
        userId: userId,
        active: true
      });

      console.log(`[AUTH] Verificación de autorización para ${userId}: ${user ? 'AUTORIZADO' : 'NO AUTORIZADO'}`);
      return !!user;
    } catch (error) {
      console.error('[ERROR] Error verificando autorización:', error);
      return false;
    }
  }

  /**
   * Autoriza a un usuario para usar decode-file
   * @param {string} userId - ID del usuario de Discord
   * @param {string} authorizedBy - ID del usuario que autoriza
   * @param {string} username - Nombre de usuario (opcional)
   * @param {string} reason - Razón de la autorización (opcional)
   * @returns {Promise<Object>} - Usuario autorizado o error
   */
  static async authorizeUser(userId, authorizedBy, username = null, reason = null) {
    try {
      // Verificar si ya existe
      const existingUser = await AuthorizedUser.findOne({ userId });

      if (existingUser) {
        if (existingUser.active) {
          console.log(`[AUTH] Usuario ${userId} ya está autorizado`);
          return { success: false, message: 'Usuario ya está autorizado' };
        } else {
          // Reactivar usuario
          existingUser.active = true;
          existingUser.authorizedBy = authorizedBy;
          existingUser.authorizedAt = new Date();
          if (username) existingUser.username = username;
          if (reason) existingUser.reason = reason;

          await existingUser.save();
          console.log(`[AUTH] Usuario ${userId} reactivado por ${authorizedBy}`);
          return { success: true, user: existingUser, action: 'reactivated' };
        }
      }

      // Crear nuevo usuario autorizado
      const newUser = new AuthorizedUser({
        userId,
        username,
        authorizedBy,
        reason,
        active: true
      });

      await newUser.save();
      console.log(`[AUTH] Usuario ${userId} autorizado por ${authorizedBy}`);
      return { success: true, user: newUser, action: 'created' };

    } catch (error) {
      console.error('[ERROR] Error autorizando usuario:', error);
      return { success: false, message: 'Error interno al autorizar usuario' };
    }
  }

  /**
   * Revoca la autorización de un usuario
   * @param {string} userId - ID del usuario de Discord
   * @param {string} revokedBy - ID del usuario que revoca
   * @returns {Promise<Object>} - Resultado de la revocación
   */
  static async revokeUser(userId, revokedBy) {
    try {
      const user = await AuthorizedUser.findOne({ userId, active: true });

      if (!user) {
        console.log(`[AUTH] Usuario ${userId} no encontrado o ya revocado`);
        return { success: false, message: 'Usuario no encontrado o ya revocado' };
      }

      user.active = false;
      await user.save();

      console.log(`[AUTH] Autorización de ${userId} revocada por ${revokedBy}`);
      return { success: true, user: user };

    } catch (error) {
      console.error('[ERROR] Error revocando autorización:', error);
      return { success: false, message: 'Error interno al revocar autorización' };
    }
  }

  /**
   * Obtiene lista de usuarios autorizados
   * @param {boolean} activeOnly - Solo usuarios activos
   * @returns {Promise<Array>} - Lista de usuarios autorizados
   */
  static async getAuthorizedUsers(activeOnly = true) {
    try {
      const filter = activeOnly ? { active: true } : {};
      const users = await AuthorizedUser.find(filter)
        .sort({ authorizedAt: -1 });

      console.log(`[AUTH] Obtenidos ${users.length} usuarios autorizados`);
      return users;

    } catch (error) {
      console.error('[ERROR] Error obteniendo usuarios autorizados:', error);
      return [];
    }
  }

  /**
   * Obtiene información de un usuario autorizado específico
   * @param {string} userId - ID del usuario de Discord
   * @returns {Promise<Object|null>} - Información del usuario o null
   */
  static async getUserInfo(userId) {
    try {
      const user = await AuthorizedUser.findOne({ userId });
      return user;
    } catch (error) {
      console.error('[ERROR] Error obteniendo info de usuario:', error);
      return null;
    }
  }

  /**
   * Importa múltiples usuarios de una lista de IDs
   * @param {Array<string>} userIds - Lista de IDs de usuarios
   * @param {string} authorizedBy - ID del usuario que autoriza
   * @param {string} reason - Razón de la autorización masiva
   * @returns {Promise<Object>} - Resultado de la importación
   */
  static async importUsers(userIds, authorizedBy, reason = 'Importación masiva') {
    try {
      const results = {
        success: 0,
        failed: 0,
        existing: 0,
        errors: []
      };

      for (const userId of userIds) {
        try {
          const result = await this.authorizeUser(userId, authorizedBy, null, reason);

          if (result.success) {
            if (result.action === 'created') {
              results.success++;
            } else {
              results.existing++;
            }
          } else {
            results.failed++;
            results.errors.push(`${userId}: ${result.message}`);
          }
        } catch (error) {
          results.failed++;
          results.errors.push(`${userId}: ${error.message}`);
        }
      }

      console.log(`[AUTH] Importación masiva completada: ${results.success} éxitos, ${results.failed} fallos, ${results.existing} existentes`);
      return results;

    } catch (error) {
      console.error('[ERROR] Error en importación masiva:', error);
      return { success: 0, failed: userIds.length, existing: 0, errors: [error.message] };
    }
  }
}

module.exports = AuthorizedUserService;