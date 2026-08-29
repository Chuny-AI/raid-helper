const fs = require('fs');
const path = require('path');
const { isProd } = require('../config/environment');

const PROD_FILE = 'weapons.json';
const DEV_FILE = 'weapons_dev.json';


let warned = false;

/**
 * Devuelve la ruta del catálogo de armas del entorno actual.
 *
 * Los emojis personalizados pertenecen a la aplicación de Discord que los subió,
 * así que el bot de desarrollo no puede renderizar los IDs de producción y
 * viceversa. Cada entorno necesita su propio catálogo.
 */
const getWeaponsPath = () => {
  const prodPath = path.join(__dirname, PROD_FILE);
  if (isProd()) return prodPath;

  const devPath = path.join(__dirname, DEV_FILE);
  if (fs.existsSync(devPath)) return devPath;

  if (!warned) {
    warned = true;
    console.warn(`[WEAPONS] No existe ${DEV_FILE}; se usa ${PROD_FILE}. Los emojis no renderizarán en desarrollo.`);
  }
  return prodPath;
};

/** Carga el catálogo del entorno actual. Sin caché: el archivo puede cambiar. */
const loadWeapons = () => JSON.parse(fs.readFileSync(getWeaponsPath(), 'utf8'));

module.exports = { getWeaponsPath, loadWeapons, isProd, PROD_FILE, DEV_FILE };
