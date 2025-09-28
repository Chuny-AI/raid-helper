const mongoose = require('mongoose');

/**
 * Esquema para roles de economía por servidor
 * Gestiona qué roles de Discord tienen permisos para usar comandos de economía
 */
const economyRoleSchema = new mongoose.Schema({
  // ID del rol de Discord
  roleId: {
    type: String,
    required: true,
    index: true
  },
  
  // Nombre del rol para referencia
  name: {
    type: String,
    required: true,
    maxlength: 100
  },
  
  // ID del servidor de Discord
  guildId: {
    type: String,
    required: true,
    index: true
  },
  
  // Array de permisos que tiene este rol
  permissions: [{
    type: String,
    enum: ['ECONOMY', 'ECONOMY_ADD', 'ECONOMY_REMOVE', 'ECONOMY_VIEW', 'ECONOMY_ADMIN'],
    required: true
  }],
  
  // Usuario que creó este rol autorizado
  createdBy: {
    type: String,
    required: true
  },
  
  // Fecha de creación
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  // Fecha de última actualización
  updatedAt: {
    type: Date,
    default: Date.now
  },
  
  // Estado activo/inactivo
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Descripción opcional del rol
  description: {
    type: String,
    maxlength: 500,
    default: ''
  }
}, {
  timestamps: true,
  collection: 'economyroles'
});

// Índice compuesto para búsquedas eficientes por servidor y rol
economyRoleSchema.index({ guildId: 1, roleId: 1 }, { unique: true });

// Índice para búsquedas por permisos
economyRoleSchema.index({ guildId: 1, permissions: 1 });

// Middleware para actualizar updatedAt
economyRoleSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Métodos estáticos del modelo
economyRoleSchema.statics = {
  /**
   * Busca roles de economía por servidor
   * @param {string} guildId - ID del servidor
   * @returns {Promise<Array>} - Array de roles de economía
   */
  async findByGuild(guildId) {
    return this.find({ guildId, isActive: true }).sort({ name: 1 });
  },

  /**
   * Busca roles con un permiso específico
   * @param {string} guildId - ID del servidor
   * @param {string} permission - Permiso a buscar
   * @returns {Promise<Array>} - Array de roles con el permiso
   */
  async findByPermission(guildId, permission) {
    return this.find({ 
      guildId, 
      permissions: permission, 
      isActive: true 
    });
  },

  /**
   * Verifica si un rol tiene un permiso específico
   * @param {string} guildId - ID del servidor
   * @param {string} roleId - ID del rol
   * @param {string} permission - Permiso a verificar
   * @returns {Promise<boolean>} - true si tiene el permiso
   */
  async hasPermission(guildId, roleId, permission) {
    const role = await this.findOne({ 
      guildId, 
      roleId, 
      permissions: permission, 
      isActive: true 
    });
    return !!role;
  },

  /**
   * Obtiene todos los permisos de un rol
   * @param {string} guildId - ID del servidor
   * @param {string} roleId - ID del rol
   * @returns {Promise<Array>} - Array de permisos
   */
  async getRolePermissions(guildId, roleId) {
    const role = await this.findOne({ guildId, roleId, isActive: true });
    return role ? role.permissions : [];
  }
};

// Métodos de instancia
economyRoleSchema.methods = {
  /**
   * Agrega un permiso al rol
   * @param {string} permission - Permiso a agregar
   * @returns {Promise<boolean>} - true si se agregó exitosamente
   */
  async addPermission(permission) {
    if (!this.permissions.includes(permission)) {
      this.permissions.push(permission);
      await this.save();
      return true;
    }
    return false;
  },

  /**
   * Remueve un permiso del rol
   * @param {string} permission - Permiso a remover
   * @returns {Promise<boolean>} - true si se removió exitosamente
   */
  async removePermission(permission) {
    const index = this.permissions.indexOf(permission);
    if (index > -1) {
      this.permissions.splice(index, 1);
      await this.save();
      return true;
    }
    return false;
  },

  /**
   * Verifica si el rol tiene un permiso específico
   * @param {string} permission - Permiso a verificar
   * @returns {boolean} - true si tiene el permiso
   */
  hasPermission(permission) {
    return this.permissions.includes(permission);
  },

  /**
   * Desactiva el rol
   * @returns {Promise<void>}
   */
  async deactivate() {
    this.isActive = false;
    await this.save();
  },

  /**
   * Activa el rol
   * @returns {Promise<void>}
   */
  async activate() {
    this.isActive = true;
    await this.save();
  }
};

// Validaciones personalizadas
economyRoleSchema.pre('validate', function(next) {
  // Asegurar que siempre tenga al menos el permiso ECONOMY
  if (this.permissions.length === 0) {
    this.permissions.push('ECONOMY');
  }
  
  // Remover duplicados
  this.permissions = [...new Set(this.permissions)];
  
  next();
});

const EconomyRole = mongoose.model('EconomyRole', economyRoleSchema);

module.exports = EconomyRole;