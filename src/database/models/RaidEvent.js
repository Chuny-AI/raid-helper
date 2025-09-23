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
    requestedWeapon: String
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

RaidEventSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('RaidEvent', RaidEventSchema);
