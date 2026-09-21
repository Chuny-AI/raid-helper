const mongoose = require('mongoose');

const albionRegistrationConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true, index: true },
  region: {
    type: String,
    enum: ['americas', 'europe', 'asia'],
    required: true,
    default: 'americas',
  },
  auditChannelId: { type: String, default: null },
  checkIntervalMinutes: { type: Number, min: 60, max: 1440, default: 360 },
  enabled: { type: Boolean, default: true, index: true },
  updatedBy: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('AlbionRegistrationConfig', albionRegistrationConfigSchema);
