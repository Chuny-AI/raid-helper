/**
 * Valida si es un color hexadcimal
 * @returns: boolean
 */
const isValidHex = (color) => {
  return /^#[0-9A-F]{6}$/i.test(color);
};

module.exports = {
  isValidHex,
};
