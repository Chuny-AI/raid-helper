const mongoose = require('mongoose');

/**
 * Schema para los claims de actividades de Albion Online
 */
const claimSchema = new mongoose.Schema({
  // Información básica del claim
  claimId: {
    type: String,
    required: true,
    unique: true
  },

  // Información del usuario que hizo el claim
  userId: {
    type: String,
    required: true
  },
  username: {
    type: String,
    required: true
  },

  // Información del servidor
  guildId: {
    type: String,
    required: true
  },
  channelId: {
    type: String,
    required: true
  },

  // Información del contenido reclamado
  contentType: {
    type: String,
    required: true,
    maxlength: 100 // Límite de caracteres para el tipo de actividad
  },

  // Mapa donde se realizará la actividad
  mapLocation: {
    type: String,
    required: true,
    maxlength: 100 // Límite de caracteres para el mapa
  },

  // Tiempo y duración
  duration: {
    type: Number, // Duración en milisegundos
    required: true
  },
  durationText: {
    type: String, // Texto legible como "2h 30m"
    required: true
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  claimTime: {
    type: Date,
    required: true // Cuando se debe completar el claim
  },

  // Estado del claim
  status: {
    type: String,
    enum: ['active', 'completed', 'expired', 'cancelled'],
    default: 'active'
  },

  // Información adicional
  description: {
    type: String,
    maxlength: 500,
    default: null
  },

  // Para recordatorios automáticos
  reminders: {
    tenMinutes: {
      sent: { type: Boolean, default: false },
      jobId: { type: String, default: null },
      messageId: { type: String, default: null } // ID del mensaje de recordatorio
    },
    fiveMinutes: {
      sent: { type: Boolean, default: false },
      jobId: { type: String, default: null },
      messageId: { type: String, default: null } // ID del mensaje de recordatorio
    }
  },

  // Job ID para auto-expiración
  expirationJobId: {
    type: String,
    default: null
  },

  // ID del mensaje en el canal de claims (para poder eliminarlo)
  messageId: {
    type: String,
    default: null
  }
});

// Índices para optimizar consultas
claimSchema.index({ guildId: 1, status: 1 });
claimSchema.index({ userId: 1, status: 1 });
claimSchema.index({ claimTime: 1, status: 1 });
claimSchema.index({ createdAt: -1 });

// Método para generar ID único
claimSchema.statics.generateClaimId = function () {
  return Math.random().toString(36).substr(2, 9).toUpperCase();
};

// Método para formatear tiempo restante
claimSchema.methods.getTimeRemaining = function () {
  const now = new Date();
  const remaining = this.claimTime - now;

  if (remaining <= 0) {
    return 'Expirado';
  }

  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
};

// Método para obtener el contenido completo con mapa
claimSchema.methods.getContentDisplay = function () {
  return `${this.contentType} - ${this.mapLocation}`;
};

module.exports = mongoose.model('Claim', claimSchema);
