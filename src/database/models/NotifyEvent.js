const mongoose = require('mongoose');

const notifyEventSchema = new mongoose.Schema({
  notifyId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  guildId: {
    type: String,
    required: true,
    index: true,
  },
  channelId: {
    type: String,
    required: true,
  },
  messageId: {
    type: String,
    required: true,
  },
  createdBy: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  hora: {
    type: String,
    required: true,
  },
  /** Total de miembros no-bot al crear la notificación (para calcular "sin responder") */
  totalMembers: {
    type: Number,
    default: 0,
  },
  /** IDs de usuarios que confirmaron asistencia */
  attending: {
    type: [String],
    default: [],
  },
  /** IDs de usuarios que indicaron que no asistirán */
  not_attending: {
    type: [String],
    default: [],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('NotifyEvent', notifyEventSchema);
