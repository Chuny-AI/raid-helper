const mongoose = require('mongoose');

const guildRoleSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    index: true
  },
  roleId: {
    type: String,
    required: true,
    index: true
  },
  roleName: {
    type: String,
    required: false,
    maxlength: 100
  },
  addedBy: {
    type: String,
    required: false
  },
  addedAt: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  }
});

guildRoleSchema.index({ guildId: 1, roleId: 1 }, { unique: true });

const GuildRole = mongoose.model('GuildRole', guildRoleSchema);

module.exports = GuildRole;