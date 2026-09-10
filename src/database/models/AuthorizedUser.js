const mongoose = require('mongoose');

const authorizedUserSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true },
  username: { type: String, default: '' },
  reason: { type: String, default: '' },
  active: { type: Boolean, default: true, index: true },
  authorizedBy: { type: String, required: true },
  authorizedAt: { type: Date, default: Date.now },
  revokedBy: { type: String, default: null },
  revokedAt: { type: Date, default: null },
});

module.exports = mongoose.models.AuthorizedUser
  || mongoose.model('AuthorizedUser', authorizedUserSchema);
