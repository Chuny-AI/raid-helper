const mongoose = require('mongoose');

const economyTransactionSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: ['add', 'remove', 'reset'],
    required: true,
  },
  userId: {
    type: String,
    required: false,
  },
  fromUserId: {
    type: String,
    required: false,
  },
  toUserId: {
    type: String,
    required: false,
  },
  affectedUserIds: {
    type: [String],
    default: [],
  },
  executorId: {
    type: String,
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  description: {
    type: String,
    default: '',
    maxlength: 300,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

economyTransactionSchema.index({ guildId: 1, affectedUserIds: 1, createdAt: -1 });

module.exports = mongoose.model('EconomyTransaction', economyTransactionSchema);
