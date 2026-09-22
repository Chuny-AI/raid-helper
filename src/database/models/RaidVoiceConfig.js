const mongoose = require('mongoose');

const raidVoiceConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true, index: true },
  categoryId: { type: String, required: true },
  updatedBy: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('RaidVoiceConfig', raidVoiceConfigSchema);
