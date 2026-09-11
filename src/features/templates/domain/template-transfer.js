const MAX_IMPORT_BYTES = 8 * 1024 * 1024;

class TemplateTransferError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TemplateTransferError';
  }
}

const ensureText = (value, field, maxLength, { required = false } = {}) => {
  if (value === undefined || value === null) {
    if (required) throw new TemplateTransferError(`El campo ${field} es obligatorio.`);
    return '';
  }
  if (typeof value !== 'string') throw new TemplateTransferError(`El campo ${field} debe ser texto.`);
  const text = value.trim();
  if (required && !text) throw new TemplateTransferError(`El campo ${field} no puede estar vacío.`);
  if (text.length > maxLength) throw new TemplateTransferError(`El campo ${field} supera ${maxLength} caracteres.`);
  return text;
};

const ensureWebUrl = (value, field) => {
  const text = ensureText(value, field, 500);
  if (!text) return '';
  let parsed;
  try { parsed = new URL(text); } catch (_) {
    throw new TemplateTransferError(`El campo ${field} debe contener una URL válida.`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new TemplateTransferError(`El campo ${field} solo admite URLs HTTP o HTTPS.`);
  }
  return text;
};

const cloneSafeJson = (value, depth = 0) => {
  if (depth > 12) throw new TemplateTransferError('La estructura del archivo es demasiado profunda.');
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
  if (Array.isArray(value)) return value.map((item) => cloneSafeJson(item, depth + 1));
  if (typeof value !== 'object') throw new TemplateTransferError('El archivo contiene valores no admitidos.');

  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor', '_id', '__v', 'serverId'].includes(key)) continue;
    if (key.startsWith('$') || key.includes('.')) {
      throw new TemplateTransferError(`La clave "${key}" no está permitida en una plantilla.`);
    }
    result[key] = cloneSafeJson(item, depth + 1);
  }
  return result;
};

const parseTemplateImport = (jsonContent, templateName) => {
  let source;
  try { source = JSON.parse(jsonContent); } catch (_) {
    throw new TemplateTransferError('El archivo no contiene un JSON válido.');
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TemplateTransferError('El JSON debe contener un objeto de plantilla.');
  }

  const title = ensureText(templateName, 'nombre', 100, { required: true });
  const weapons = source.weapons === undefined ? {} : cloneSafeJson(source.weapons);
  if (!weapons || typeof weapons !== 'object') {
    throw new TemplateTransferError('El campo weapons debe ser un objeto o una lista.');
  }

  return {
    title,
    description: ensureText(source.description || 'Plantilla importada', 'description', 4000, { required: true }),
    image: ensureWebUrl(source.image || '', 'image'),
    color: ensureText(source.color || '', 'color', 20),
    url: ensureWebUrl(source.url || '', 'url'),
    roles: Array.isArray(source.roles)
      ? Array.from(new Set(source.roles.filter((role) => /^\d{15,20}$/.test(String(role))).map(String))).slice(0, 25)
      : [],
    weapons,
    notifyAll: source.notifyAll === true,
    reminder: ensureText(source.reminder || '5m', 'reminder', 10) || '5m',
  };
};

const serializeTemplate = (template) => JSON.stringify({
  title: template.title,
  description: template.description || '',
  image: template.image || '',
  color: template.color || '',
  url: template.url || '',
  roles: template.roles || [],
  weapons: template.weapons || {},
  notifyAll: template.notifyAll || false,
  reminder: template.reminder || '5m',
}, null, 2);

const safeExportFileName = (title) => {
  const base = String(title || 'template')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return `${base || 'template'}.json`;
};

module.exports = {
  MAX_IMPORT_BYTES,
  TemplateTransferError,
  parseTemplateImport,
  safeExportFileName,
  serializeTemplate,
};
