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

economyBalanceSchema.index({ guildId: 1, userId: 1 }, { unique: true });

economyBalanceSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('EconomyBalance', economyBalanceSchema);
