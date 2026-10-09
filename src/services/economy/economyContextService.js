const EconomyContext = require('../../database/models/economy/EconomyContext');
const { UserError } = require('../../utils/userError');

const requireGuildId = (guildId) => {
  if (!guildId) throw new UserError('Este comando debe usarse dentro de un servidor de Discord.');
};

const slugify = (name) => String(name || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const createContext = async ({ guildId, name, createdBy }) => {
  requireGuildId(guildId);
  const cleanName = String(name || '').trim().replace(/\s+/g, ' ');
  const slug = slugify(cleanName);
  if (!slug || cleanName.length > 60) {
    throw new UserError('Escribe un nombre de contexto de hasta 60 caracteres con letras o números.');
  }
  try {
    return await EconomyContext.create({ guildId, slug, name: cleanName, createdBy });
  } catch (error) {
    if (error.code === 11000) throw new UserError('Ya existe un contexto con ese nombre.');
    throw error;
  }
};

const listContexts = (guildId) => {
  requireGuildId(guildId);
  const filter = { guildId };
  return EconomyContext.find(filter).sort({ name: 1 });
};

const searchContexts = (guildId, search = '') => {
  requireGuildId(guildId);
  const term = String(search).trim().slice(0, 60).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const filter = { guildId };
  if (term) filter.$or = [
    { name: { $regex: term, $options: 'i' } },
    { slug: { $regex: term, $options: 'i' } },
  ];
  return EconomyContext.find(filter).sort({ name: 1 }).limit(25);
};

const requireContext = async (guildId, slug) => {
  requireGuildId(guildId);
  if (!slug) throw new UserError('Selecciona un contexto de balance.');
  const context = await EconomyContext.findOne({ guildId, slug: slugify(slug) });
  if (!context) throw new UserError('El contexto no existe en este servidor. Usa `/balance contextos` para ver los disponibles.');
  return context;
};

module.exports = { createContext, listContexts, searchContexts, requireContext, slugify };
