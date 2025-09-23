const mongoose = require('mongoose');

const authorizedRoleSchema = new mongoose.Schema({
  roleId: {
    type: String,
    required: true,
    unique: true
  },
  roleName: {
    type: String,
    required: true
  },
  serverId: {
    type: String,
    required: true,
    index: true
  },
  addedBy: {
    type: String,
    required: true
  },
  addedAt: {
    type: Date,
    default: Date.now
  }
});

authorizedRoleSchema.index({ serverId: 1, roleId: 1 });

module.exports = mongoose.model('AuthorizedRole', authorizedRoleSchema);
