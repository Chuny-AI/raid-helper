const mongoose = require('mongoose');

/**
 * Esquema para usuarios autorizados a usar el comando decode-file
 */
const authorizedUserSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  username: {
    type: String,
    required: false // Opcional para referencia
  },
  authorizedBy: {
    type: String,
    required: true // ID del usuario que autorizó
  },
  authorizedAt: {
    type: Date,
    default: Date.now
  },
  reason: {
    type: String,
    required: false // Razón de la autorización
  },
  active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true // Agrega createdAt y updatedAt automáticamente
});

// Índices para optimizar búsquedas
authorizedUserSchema.index({ userId: 1, active: 1 });

const AuthorizedUser = mongoose.model('AuthorizedUser', authorizedUserSchema);

module.exports = AuthorizedUser;