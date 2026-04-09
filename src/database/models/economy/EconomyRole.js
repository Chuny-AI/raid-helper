const mongoose = require('mongoose');

const economyRoleSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    index: true,
  },
  roleId: {
    type: String,
    required: true,
  },
  roleName: {
    type: String,
    required: true,
  },
  addedBy: {
    type: String,
    required: true,
  },
  addedAt: {
    type: Date,
    default: Date.now,
  },
});

economyRoleSchema.index({ guildId: 1, roleId: 1 }, { unique: true });

module.exports = mongoose.model('EconomyRole', economyRoleSchema);
