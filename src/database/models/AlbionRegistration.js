const mongoose = require('mongoose');

const albionRegistrationSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  discordUserId: { type: String, required: true },
  playerId: { type: String, required: true },
  playerName: { type: String, required: true, maxlength: 100 },
  region: { type: String, enum: ['americas', 'europe', 'asia'], required: true },
  status: {
    type: String,
    enum: ['active', 'unmatched', 'discord_absent'],
    default: 'active',
    index: true,
  },
  assignedRoleIds: { type: [String], default: [] },
  lastGuildId: { type: String, default: null },
  lastGuildName: { type: String, default: null },
  lastAllianceId: { type: String, default: null },
  lastAllianceName: { type: String, default: null },
  consecutiveMismatches: { type: Number, default: 0 },
  lastValidatedAt: { type: Date, default: null },
  nextCheckAt: { type: Date, default: Date.now, index: true },
  lastError: { type: String, default: null, maxlength: 500 },
  registeredAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

albionRegistrationSchema.index({ guildId: 1, discordUserId: 1 }, { unique: true });
albionRegistrationSchema.index({ guildId: 1, region: 1, playerId: 1 }, { unique: true });
albionRegistrationSchema.index({ status: 1, nextCheckAt: 1 });

module.exports = mongoose.model('AlbionRegistration', albionRegistrationSchema);
