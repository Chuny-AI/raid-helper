const mongoose = require('mongoose');

const economyBalanceSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    index: true,
  },
  userId: {
    type: String,
    required: true,
    index: true,
  },
  channelId: { type: String, required: true },
  // Un saldo nunca debe caer silenciosamente en un contexto genérico. El
  // servicio de economía exige este valor y lo usa como parte de su clave de
  // aislamiento junto con el servidor y el canal.
  contextId: { type: String, required: true },
  balance: {
    type: Number,
    required: true,
    default: 0,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

economyBalanceSchema.index({ guildId: 1, channelId: 1, contextId: 1, userId: 1 }, { unique: true });

economyBalanceSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('EconomyBalance', economyBalanceSchema);
