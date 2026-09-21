const mongoose = require('mongoose');

const temporaryVoiceChannelSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  channelId: { type: String, required: true, unique: true, index: true },
  generatorChannelId: { type: String, required: true },
  ownerId: { type: String, required: true },
  raidId: { type: String, default: null, index: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('TemporaryVoiceChannel', temporaryVoiceChannelSchema);
