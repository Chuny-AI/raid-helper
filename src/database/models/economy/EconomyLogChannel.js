const mongoose = require('mongoose');

const economyLogChannelSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
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

module.exports = mongoose.model('EconomyLogChannel', economyLogChannelSchema);
