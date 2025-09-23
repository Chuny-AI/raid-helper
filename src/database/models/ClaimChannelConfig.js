const mongoose = require('mongoose');

/**
 * Schema para la configuración de canales de claims
 */
const claimChannelConfigSchema = new mongoose.Schema({
  // Información del servidor
  guildId: {
    type: String,
    required: true,
    unique: true
  },
  guildName: {
    type: String,
    required: true
  },

  // Canal para mostrar todos los claims activos
  claimsChannelId: {
    type: String,
    default: null
  },
  claimsChannelName: {
    type: String,
    default: null
  },

  // Canal para enviar recordatorios de claims
  remindersChannelId: {
    type: String,
    default: null
  },
  remindersChannelName: {
    type: String,
    default: null
  },

  // Canal para claims que llegaron a su tiempo máximo (success)
  successChannelId: {
    type: String,
    default: null
  },
  successChannelName: {
    type: String,
    default: null
  },

  // Canal para claims cancelados manualmente (closed)
  closedChannelId: {
    type: String,
    default: null
  },
  closedChannelName: {
    type: String,
    default: null
  },

  // Información de configuración
  configuredBy: {
    type: String,
    required: true
  },
  configuredAt: {
    type: Date,
    default: Date.now
  },

  // Última actualización
  updatedAt: {
    type: Date,
    default: Date.now
  },
  updatedBy: {
    type: String,
    default: null
  }
});

// Middleware para actualizar updatedAt
claimChannelConfigSchema.pre('save', function (next) {
  if (this.isModified() && !this.isNew) {
    this.updatedAt = new Date();
  }
  next();
});

// Los índices ya están definidos en el schema con unique: true

module.exports = mongoose.model('ClaimChannelConfig', claimChannelConfigSchema);
