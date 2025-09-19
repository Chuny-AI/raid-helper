const mongoose = require('mongoose');

const serverSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  guildName: {
    type: String,
    required: true
  },
  templates: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Template'
  }],
  premium: {
    type: Boolean,
    default: false
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
serverSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Server', serverSchema);
