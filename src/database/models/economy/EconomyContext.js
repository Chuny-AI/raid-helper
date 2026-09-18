const mongoose = require('mongoose');

const economyContextSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
  slug: { type: String, required: true },
  name: { type: String, required: true, maxlength: 60 },
  createdBy: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

economyContextSchema.index({ guildId: 1, channelId: 1, slug: 1 }, { unique: true });

module.exports = mongoose.model('EconomyContext', economyContextSchema);
