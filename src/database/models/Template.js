const mongoose = require('mongoose');

const weaponDataSchema = new mongoose.Schema({
  id: {
    type: Number,
    required: true
  },
  name: {
    type: String,
    default: ""
  },
  units: {
    type: Number,
    required: true
  },
  image: {
    type: String,
    default: ""
  },
  emoji: {
    type: String,
    required: true
  },
  url: {
    type: String,
    default: ""
  }
});

const weaponSchema = new mongoose.Schema({
  displayName: {
    type: String,
    required: true
  },
  defaultEmoji: {
    type: String,
    required: true
  },
  data: [weaponDataSchema]
});

const templateSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  time: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  color: {
    type: String,
    required: true
  },
  image: {
    type: String,
    required: true
  },
  url: {
    type: String,
    default: ""
  },
  roles: [{
    type: String
  }],
  weapons: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  serverId: {
    type: String,
    required: true,
    index: true
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

// Middleware para actualizar updatedAt
templateSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Template', templateSchema);
