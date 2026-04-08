const { MessageFlags } = require('discord.js');
const { logDiscordError } = require('./logging');

const isInteractionAcknowledged = (interaction) => Boolean(interaction?.deferred || interaction?.replied);

const normalizeEphemeralOptions = (options) => {
  if (!options || typeof options !== 'object') return options;
  const normalized = { ...options };

  if ('ephemeral' in normalized) {
    if (normalized.ephemeral) {
      normalized.flags = MessageFlags.Ephemeral;
    }
    delete normalized.ephemeral;
  }

  return normalized;
};

const normalizeEditOptions = (options) => {
  if (!options || typeof options !== 'object') return options;
  const normalized = { ...options };
  delete normalized.ephemeral;
  delete normalized.flags;
  return normalized;
};

const safeDeferReply = async (interaction, options = {}) => {
  if (isInteractionAcknowledged(interaction)) return false;
  try {
    await interaction.deferReply(normalizeEphemeralOptions(options));
    return true;
  } catch (error) {
    logDiscordError('safeDeferReply failed', error);
    return false;
  }
};

const safeDeferUpdate = async (interaction) => {
  if (isInteractionAcknowledged(interaction)) return false;
  try {
    await interaction.deferUpdate();
    return true;
  } catch (error) {
    logDiscordError('safeDeferUpdate failed', error);
    return false;
  }
};

const wrapInteractionMethods = (interaction) => {
  if (!interaction || interaction.__ephemeralWrapped) return interaction;

  const wrap = (methodName, normalizer) => {
    const original = interaction[methodName]?.bind(interaction);
    if (typeof original !== 'function') return;
    interaction[methodName] = (options, ...rest) => original(normalizer(options), ...rest);
  };

  const originalReply = interaction.reply?.bind(interaction);
  const originalFollowUp = interaction.followUp?.bind(interaction);
  const originalEditReply = interaction.editReply?.bind(interaction);

  if (originalReply) {
    interaction.reply = (options, ...rest) => {
      const payload = normalizeEphemeralOptions(options);
      if (interaction.replied && originalFollowUp) {
        return originalFollowUp(payload, ...rest);
      }
      if (interaction.deferred && originalEditReply) {
        return originalEditReply(normalizeEditOptions(payload), ...rest);
      }
      return originalReply(payload, ...rest);
    };
  }

  wrap('followUp', normalizeEphemeralOptions);
  wrap('deferReply', normalizeEphemeralOptions);
  wrap('editReply', normalizeEditOptions);
  wrap('update', normalizeEditOptions);

  interaction.__ephemeralWrapped = true;
  return interaction;
};

module.exports = {
  isInteractionAcknowledged,
  normalizeEphemeralOptions,
  normalizeEditOptions,
  safeDeferReply,
  safeDeferUpdate,
  wrapInteractionMethods,
};
