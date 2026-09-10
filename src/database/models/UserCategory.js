const mongoose = require('mongoose');

const userWeaponSchema = new mongoose.Schema({
  emojiId: { type: String, required: true },
  emoji: { type: String, default: '' },
  name: { type: String, required: true },
  url: { type: String, default: '' },
}, { _id: false, strict: false });

const userCategorySchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  categoryKey: { type: String, required: true },
  displayName: { type: String, required: true },
  defaultEmoji: { type: String, default: '⚔️' },
  weapons: { type: [userWeaponSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

userCategorySchema.index({ userId: 1, categoryKey: 1 }, { unique: true });

module.exports = mongoose.models.UserCategory
  || mongoose.model('UserCategory', userCategorySchema);
