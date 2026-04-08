const mongoose = require('mongoose');

const RaidEventSchema = new mongoose.Schema({
  eventId: {
    type: String,
    required: true,
    unique: true
  },
  guildId: {
    type: String,
    required: true
  },
  channelId: {
    type: String,
    required: true
  },
  messageId: {
    type: String,
    required: false
  },
  templateName: {
    type: String,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: String,
  time: String,
  color: String,
  image: String,
  reminder: String,
  rolesToNotify: [String],
  participants: [{
    userId: String,
    username: String,
    assignedWeapons: [{
      weaponId: String,
      weaponName: String,
      category: String,
      emoji: String
    }]
  }],
  cannotGo: [{
    userId: String,
    username: String
  }],
  weaponAssignments: [{
    weaponId: String,
    weaponName: String,
    category: String,
    emoji: String,
    maxCount: Number,
    currentCount: Number,
    assignedUsers: [{
      userId: String,
      username: String
    }]
  }],
  waitList: [{
    userId: String,
    username: String,
    // El grupo (weaponCategory) que el usuario estaba esperando
    requestedGroup: String,
    // Las armas específicas para las que el usuario está esperando
    weaponsWaitingFor: [{ type: String }],
    timestamp: { type: Date, default: Date.now }
  }],
  looters: [{
    userId: String,
    username: String
  }],
  // Estado del raid: 'active' | 'closed'
  status: {
    type: String,
    default: 'active',
    enum: ['active', 'closed']
  },
  // Snapshot del embed serializado para reconstruir embedsMap tras reinicio
  embedSnapshot: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  // Armas deshabilitadas al crear el raid (valores tipo "group~group_1" o "weapon~group_1~0")
  disabledWeapons: [{ type: String }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

RaidEventSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('RaidEvent', RaidEventSchema);
