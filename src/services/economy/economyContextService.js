const EconomyContext = require('../../database/models/economy/EconomyContext');
const { UserError } = require('../../utils/userError');

const requireChannelId = (channelId) => {
  if (!channelId) throw new UserError('Este comando debe usarse dentro de un canal de Discord.');
};

const requireGuildId = (guildId) => {
  if (!guildId) throw new UserError('Este comando debe usarse dentro de un servidor de Discord.');
};

const slugify = (name) => String(name || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const createContext = async ({ guildId, channelId, name, createdBy }) => {
  requireGuildId(guildId);
  requireChannelId(channelId);
  const cleanName = String(name || '').trim().replace(/\s+/g, ' ');
  const slug = slugify(cleanName);
  if (!slug || cleanName.length > 60) {
    throw new UserError('Escribe un nombre de contexto de hasta 60 caracteres con letras o números.');
  }
  try {
    return await EconomyContext.create({ guildId, channelId, slug, name: cleanName, createdBy });
  } catch (error) {
    if (error.code === 11000) throw new UserError('Ya existe un contexto con ese nombre.');
    throw error;
  }
};

const listContexts = (guildId, channelId) => {
  requireGuildId(guildId);
  requireChannelId(channelId);
  return EconomyContext.find({ guildId, channelId }).sort({ name: 1 });
};

const searchContexts = (guildId, channelId, search = '') => {
  requireGuildId(guildId);
  requireChannelId(channelId);
  const term = String(search).trim().slice(0, 60).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const filter = { guildId, channelId };
  if (term) filter.$or = [
    { name: { $regex: term, $options: 'i' } },
    { slug: { $regex: term, $options: 'i' } },
  ];
  return EconomyContext.find(filter).sort({ name: 1 }).limit(25);
};

const requireContext = async (guildId, channelId, slug) => {
  requireGuildId(guildId);
  requireChannelId(channelId);
  if (!slug) throw new UserError('Selecciona un contexto de balance.');
  const context = await EconomyContext.findOne({ guildId, channelId, slug: slugify(slug) });
  if (!context) throw new UserError('El contexto no existe en este canal. Usa `/balance contextos` para ver los disponibles.');
  return context;
};

module.exports = { createContext, listContexts, searchContexts, requireContext, slugify };
