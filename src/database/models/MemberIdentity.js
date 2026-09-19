const mongoose = require('mongoose');

const memberIdentitySchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  displayName: { type: String, required: true, maxlength: 100 },
  nickname: { type: String, default: null, maxlength: 100 },
  username: { type: String, required: true, maxlength: 100 },
  globalName: { type: String, default: null, maxlength: 100 },
  avatarUrl: { type: String, default: '' },
  isBot: { type: Boolean, default: false },
  updatedAt: { type: Date, default: Date.now },
});

memberIdentitySchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('MemberIdentity', memberIdentitySchema);
