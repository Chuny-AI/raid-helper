const mongoose = require('mongoose');

/**
 * Modelo para el balance de usuarios por servidor
 * Cada usuario puede tener un balance diferente en cada servidor
 */
const userBalanceSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  serverId: {
    type: String,
    required: true,
    index: true
  },
  balance: {
    type: Number,
    default: 0,
    min: 0
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

userBalanceSchema.index({ userId: 1, serverId: 1 }, { unique: true });

userBalanceSchema.methods.addMoney = function (amount) {
  this.balance += amount;
  this.lastUpdated = new Date();
  return this.save();
};

userBalanceSchema.methods.removeMoney = function (amount) {
  if (this.balance >= amount) {
    this.balance -= amount;
    this.lastUpdated = new Date();
    return this.save();
  }
  throw new Error('Saldo insuficiente');
};

userBalanceSchema.statics.findOrCreateBalance = async function (userId, serverId) {
  let balance = await this.findOne({ userId, serverId });
  if (!balance) {
    balance = new this({ userId, serverId, balance: 0 });
    await balance.save();
  }
  return balance;
};

userBalanceSchema.statics.getTopBalances = async function (serverId, limit = 10) {
  return this.find({ serverId })
    .sort({ balance: -1 })
    .limit(limit)
    .lean();
};

module.exports = mongoose.model('UserBalance', userBalanceSchema);