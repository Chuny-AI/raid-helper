const mongoose = require('mongoose');

const temporaryVoiceConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true, index: true },
  generatorChannelIds: {
    type: [String],
    required: true,
    validate: {
      validator: (values) => Array.isArray(values) && values.length > 0 && values.length <= 25,
      message: 'Debes configurar entre 1 y 25 canales generadores.',
    },
  },
  updatedBy: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('TemporaryVoiceConfig', temporaryVoiceConfigSchema);
