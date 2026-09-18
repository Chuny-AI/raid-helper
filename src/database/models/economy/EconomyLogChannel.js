const mongoose = require('mongoose');

const economyLogChannelSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
  },
  sourceChannelId: { type: String, required: true },
  channelId: {
    type: String,
    required: true,
  },
  setBy: {
    type: String,
    required: true,
  },
  setAt: {
    type: Date,
    default: Date.now,
  },
});

economyLogChannelSchema.index({ guildId: 1, sourceChannelId: 1 }, { unique: true });

module.exports = mongoose.model('EconomyLogChannel', economyLogChannelSchema);
