const mongoose = require('mongoose');

const memberLogConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true, index: true },
  welcomeChannelId: { type: String, required: true },
  farewellChannelId: { type: String, required: true },
  updatedBy: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('MemberLogConfig', memberLogConfigSchema);
