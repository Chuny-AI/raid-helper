const zlib = require('node:zlib');

const DEFAULT_IMAGE_WIDTH = 640;
const MAX_IMAGE_WIDTH = 4096;

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xEDB88320 : 0);
  return value >>> 0;
});

const crc32 = (buffer) => {
  let value = 0xFFFFFFFF;
  for (const byte of buffer) value = (value >>> 8) ^ crcTable[(value ^ byte) & 0xFF];
  return (value ^ 0xFFFFFFFF) >>> 0;
};

const pngChunk = (type, data) => {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
};

/** Crea un PNG RGBA transparente de un píxel de alto. */
const transparentPng = (width) => {
  const safeWidth = Math.min(MAX_IMAGE_WIDTH, Math.max(1, Math.trunc(Number(width) || DEFAULT_IMAGE_WIDTH)));
  const header = Buffer.alloc(13);
  header.writeUInt32BE(safeWidth, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8; // profundidad de color
  header[9] = 6; // RGBA

  // Byte de filtro + una fila de píxeles RGBA transparentes.
  const row = Buffer.alloc(1 + safeWidth * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(row)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
};

/**
 * Discord CDN conserva el ancho original en `width`; aceptamos también `w`
 * para URLs que usan el parámetro habitual de CDNs. No descargamos la URL:
 * evita convertir una imagen configurada por un usuario en una petición del
 * servidor a un host arbitrario.
 */
const widthFromImageUrl = (imageUrl) => {
  try {
    const url = new URL(imageUrl);
    const candidate = url.searchParams.get('width') || url.searchParams.get('w');
    const width = Number.parseInt(candidate, 10);
    if (Number.isFinite(width) && width > 0) return Math.min(width, MAX_IMAGE_WIDTH);
  } catch (_) {
    // La validación de la URL se hace en el flujo de creación/edición del raid.
  }
  return DEFAULT_IMAGE_WIDTH;
};

/**
 * Prepara el adjunto transparente que mantiene el ancho del primer embed
 * cuando un raid debe paginarse. Devuelve null si no hay imagen o solo existe
 * un embed.
 */
const createRaidImageSpacer = ({ eventId, imageUrl, embedCount }) => {
  if (!imageUrl || embedCount <= 1) return null;
  const width = widthFromImageUrl(imageUrl);
  const name = `raid-${String(eventId || 'image').replace(/[^a-zA-Z0-9_-]/g, '')}-spacer.png`;
  return {
    name,
    attachment: transparentPng(width),
    width,
    url: `attachment://${name}`,
  };
};

module.exports = {
  DEFAULT_IMAGE_WIDTH,
  transparentPng,
  widthFromImageUrl,
  createRaidImageSpacer,
};
