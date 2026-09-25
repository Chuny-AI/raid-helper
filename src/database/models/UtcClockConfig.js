const mongoose = require('mongoose');

const utcClockConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true, index: true },
  channelId: { type: String, required: true, unique: true, index: true },
  updatedBy: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('UtcClockConfig', utcClockConfigSchema);
