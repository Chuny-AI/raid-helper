const mongoose = require('mongoose');

const weaponDataSchema = new mongoose.Schema({
  emoji: {
    type: String,
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
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    required: true
  },
  image: {
    type: String,
    default: ""
  },
  color: {
    type: String,
    default: ""
  },
  url: {
    type: String,
    default: ""
  },
  roles: {
    type: [String],
    default: []
  },
  notifyAll: {
    type: Boolean,
    default: false
  },
  reminder: {
    type: String,
    default: ""
  },
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

// Un servidor no puede tener dos plantillas con el mismo nombre. La colación
// evita variantes ambiguas como "Avalon" y "avalon", sin afectar a otros
// servidores que sí pueden reutilizar ese título.
templateSchema.index(
  { serverId: 1, title: 1 },
  {
    unique: true,
    name: 'uniq_template_server_title_ci',
    collation: { locale: 'es', strength: 2 }
  }
);

templateSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Template', templateSchema);
