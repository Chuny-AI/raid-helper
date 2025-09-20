const mongoose = require('mongoose');

const weaponSchema = new mongoose.Schema({
  emojiId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    maxlength: 50
  },
  name: {
    type: String,
    required: true,
    maxlength: 100
  },
  category: {
    type: String,
    required: true,
    index: true,
    maxlength: 50
  },
  categoryDisplayName: {
    type: String,
    required: true,
    maxlength: 100
  },
  categoryDefaultEmoji: {
    type: String,
    required: true,
    maxlength: 50
  },
  image: {
    type: String,
    default: "",
    maxlength: 500
  },
  url: {
    type: String,
    default: "",
    maxlength: 500
  },
  sendBuildToPrivate: {
    type: Boolean,
    default: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Índice compuesto para búsquedas eficientes
weaponSchema.index({ category: 1, isActive: 1 });
weaponSchema.index({ emojiId: 1, isActive: 1 });

// Middleware para actualizar updatedAt
weaponSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Weapon', weaponSchema);
