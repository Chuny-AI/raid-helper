const mongoose = require('mongoose');

const userCategorySchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  categoryKey: {
    type: String,
    required: true
  },
  displayName: {
    type: String,
    required: true,
    maxlength: 100
  },
  defaultEmoji: {
    type: String,
    required: true,
    maxlength: 50
  },
  weapons: [{
    emojiId: {
      type: String,
      required: true,
      maxlength: 50
    },
    name: {
      type: String,
      required: true,
      maxlength: 100
    },
    categoryDisplayName: {
      type: String,
      required: true,
      maxlength: 100
    },
    units: {
      type: Number,
      default: 1,
      min: 1
    },
    url: {
      type: String,
      default: "",
      maxlength: 500
    },
    sendBuildToPrivate: {
      type: Boolean,
      default: false
    }
  }],
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
userCategorySchema.index({ userId: 1, categoryKey: 1 }, { unique: true });

// Middleware para actualizar updatedAt
userCategorySchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('UserCategory', userCategorySchema);
