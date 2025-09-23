const mongoose = require('mongoose');

/**
 * Schema para la configuración de canales de claims
 */
const claimChannelConfigSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    unique: true
  },
  guildName: {
    type: String,
    required: true
  },

  claimsChannelId: {
    type: String,
    default: null
  },
  claimsChannelName: {
    type: String,
    default: null
  },

  remindersChannelId: {
    type: String,
    default: null
  },
  remindersChannelName: {
    type: String,
    default: null
  },

  successChannelId: {
    type: String,
    default: null
  },
  successChannelName: {
    type: String,
    default: null
  },

  closedChannelId: {
    type: String,
    default: null
  },
  closedChannelName: {
    type: String,
    default: null
  },

  configuredBy: {
    type: String,
    required: true
  },
  configuredAt: {
    type: Date,
    default: Date.now
  },

  updatedAt: {
    type: Date,
    default: Date.now
  },
  updatedBy: {
    type: String,
    default: null
  }
});

claimChannelConfigSchema.pre('save', function (next) {
  if (this.isModified() && !this.isNew) {
    this.updatedAt = new Date();
  }
  next();
});


module.exports = mongoose.model('ClaimChannelConfig', claimChannelConfigSchema);
