const {
  createTemplate,
  deleteTemplate: deleteTemplateById,
  getTemplateByName,
  getTemplateNames,
  getTemplatesByServer,
  updateTemplate,
} = require('../../../services/templateService');
const { getOrCreateServer } = require('../../../services/serverService');
const {
  MAX_IMPORT_BYTES,
  TemplateTransferError,
  parseTemplateImport,
  safeExportFileName,
  serializeTemplate,
} = require('../domain/template-transfer');

const allowedAttachmentHosts = new Set(['cdn.discordapp.com', 'media.discordapp.net']);
const allowedAttachmentPathPrefixes = ['/attachments/', '/ephemeral-attachments/'];

const list = async ({ guildId, guildName }) => {
  await getOrCreateServer(guildId, guildName);
  return getTemplatesByServer(guildId);
};

const clone = async ({ guildId, guildName, sourceName, targetName }) => {
  const name = String(targetName || '').trim();
  if (!name || name.length > 100) throw new TemplateTransferError('El nuevo nombre debe tener entre 1 y 100 caracteres.');
  await getOrCreateServer(guildId, guildName);
  const source = await getTemplateByName(sourceName, guildId);
  if (!source) return { status: 'not-found' };
  if (await getTemplateByName(name, guildId)) return { status: 'conflict' };
  const created = await createTemplate({
    title: name,
    description: source.description,
    image: source.image,
    color: source.color || '',
    url: source.url || '',
    roles: source.roles || [],
    weapons: source.weapons || {},
    notifyAll: source.notifyAll || false,
    reminder: source.reminder || '5m',
  }, guildId);
  return { status: 'created', template: created, source };
};

const rename = async ({ guildId, currentName, targetName }) => {
  const name = String(targetName || '').trim();
  if (!name || name.length > 100) throw new TemplateTransferError('El nuevo nombre debe tener entre 1 y 100 caracteres.');
  const current = await getTemplateByName(currentName, guildId);
  if (!current) return { status: 'not-found' };
  const conflict = await getTemplateByName(name, guildId);
  if (conflict && String(conflict._id) !== String(current._id)) return { status: 'conflict' };
  if (current.title === name) return { status: 'unchanged', template: current };
  const updated = await updateTemplate(current._id, { title: name }, guildId);
  return { status: 'updated', template: updated };
};

const exportTemplate = async ({ guildId, templateName }) => {
  const template = await getTemplateByName(templateName, guildId);
  if (!template) return null;
  const content = serializeTemplate(template);
  return {
    template,
    content,
    fileName: safeExportFileName(template.title),
    bytes: Buffer.byteLength(content, 'utf8'),
  };
};

const validateAttachment = (attachment) => {
  if (!attachment?.name?.toLowerCase().endsWith('.json')) {
    throw new TemplateTransferError('El archivo debe tener extensión .json.');
  }
  if (!Number.isFinite(attachment.size) || attachment.size <= 0 || attachment.size > MAX_IMPORT_BYTES) {
    throw new TemplateTransferError('El archivo debe pesar entre 1 byte y 8 MB.');
  }
  let url;
  try { url = new URL(attachment.url); } catch (_) {
    throw new TemplateTransferError('La URL del archivo adjunto no es válida.');
  }
  if (url.protocol !== 'https:'
    || !allowedAttachmentHosts.has(url.hostname.toLowerCase())
    || !allowedAttachmentPathPrefixes.some((prefix) => url.pathname.startsWith(prefix))) {
    throw new TemplateTransferError('El archivo debe proceder de un adjunto seguro de Discord.');
  }
};

const downloadAttachment = async (attachment, fetchImpl = fetch) => {
  validateAttachment(attachment);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  timeout.unref?.();
  try {
    const response = await fetchImpl(attachment.url, { signal: controller.signal, redirect: 'error' });
    if (!response.ok) throw new TemplateTransferError(`Discord rechazó la descarga (${response.status}).`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_IMPORT_BYTES) throw new TemplateTransferError('El archivo descargado supera 8 MB.');
    return buffer.toString('utf8');
  } finally {
    clearTimeout(timeout);
  }
};

const importTemplate = async ({ guildId, guildName, templateName, attachment, fetchImpl }) => {
  await getOrCreateServer(guildId, guildName);
  const name = String(templateName || '').trim();
  if (!name || name.length > 100) throw new TemplateTransferError('El nombre debe tener entre 1 y 100 caracteres.');
  if (await getTemplateByName(name, guildId)) return { status: 'conflict' };
  const json = await downloadAttachment(attachment, fetchImpl);
  const data = parseTemplateImport(json, name);
  const template = await createTemplate(data, guildId);
  return { status: 'created', template };
};

const autocomplete = ({ guildId, query }) => getTemplateNames(guildId, query);
const findByName = ({ guildId, templateName }) => getTemplateByName(templateName, guildId);
const deleteTemplate = ({ guildId, templateId }) => deleteTemplateById(templateId, guildId);

module.exports = {
  allowedAttachmentHosts,
  allowedAttachmentPathPrefixes,
  autocomplete,
  clone,
  deleteTemplate,
  downloadAttachment,
  exportTemplate,
  findByName,
  importTemplate,
  list,
  rename,
  validateAttachment,
};
