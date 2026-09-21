const mongoose = require('mongoose');

const albionMembershipRuleSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  entityType: { type: String, enum: ['guild', 'alliance'], required: true },
  entityId: { type: String, required: true },
  entityName: { type: String, required: true, maxlength: 100 },
  entityTag: { type: String, default: '', maxlength: 40 },
  primaryRoleId: { type: String, default: null },
  additionalRoleIds: { type: [String], default: [] },
  roleIds: {
    type: [String],
    required: true,
    validate: {
      validator: (values) => Array.isArray(values) && values.length > 0 && values.length <= 25,
      message: 'Selecciona entre 1 y 25 roles.',
    },
  },
  createdBy: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

albionMembershipRuleSchema.index(
  { guildId: 1, entityType: 1, entityId: 1 },
  { unique: true },
);

module.exports = mongoose.model('AlbionMembershipRule', albionMembershipRuleSchema);
