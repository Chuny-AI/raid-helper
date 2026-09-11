const Weapon = require('../database/models/Weapon');
const { loadWeapons, PROD_FILE, DEV_FILE } = require('../weapons/weaponsSource');

/**
 * Catálogo efectivo del proceso actual.
 *
 * Producción y desarrollo pueden compartir Mongo, pero no comparten emojis de
 * Discord. Por eso los selectores interactivos deben leer el JSON del entorno
 * y no la unión de documentos activos almacenados en la base de datos.
 */
const getCurrentCatalog = () => (loadWeapons()?.weapons || {});

const catalogWeapon = (category, group, weapon) => ({
  emojiId: String(weapon.emoji || weapon.emojiId || '').trim(),
  name: String(weapon.name || '').trim(),
  units: Number.parseInt(weapon.units ?? weapon.quantity, 10) || 1,
  image: String(weapon.image || ''),
  url: String(weapon.url || weapon.link || ''),
  category,
  categoryDisplayName: String(group.displayName || category),
  categoryDefaultEmoji: String(group.defaultEmoji || ''),
  sendBuildToPrivate: weapon.private !== false,
  isActive: true,
});

const flattenCurrentCatalog = () => Object.entries(getCurrentCatalog()).flatMap(([category, group]) =>
  (group?.data || []).map((weapon) => catalogWeapon(category, group, weapon)));

/**
 * Obtiene todas las armas activas
 */
const getAllWeapons = async () => {
  try {
    const weapons = await Weapon.find({ isActive: true }).sort({ category: 1, name: 1 });
    return weapons;
  } catch (error) {
    console.error('[ERROR] Error en getAllWeapons:', error);
    throw error;
  }
};

/**
 * Obtiene armas por categoría
 */
const getWeaponsByCategory = async (category) => {
  try {
    const group = getCurrentCatalog()[String(category)];
    if (!group) return [];
    return (group.data || [])
      .map((weapon) => catalogWeapon(String(category), group, weapon))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  } catch (error) {
    console.error('[ERROR] Error en getWeaponsByCategory:', error);
    throw error;
  }
};

/**
 * Obtiene las categorías del catálogo JSON activo, con su nombre y emoji.
 * Leer el archivo del entorno evita mezclar los emojis de dos aplicaciones de
 * Discord cuando desarrollo y producción utilizan la misma base de datos.
 */
const getWeaponCategories = async () => {
  try {
    return Object.entries(getCurrentCatalog())
      .map(([key, group]) => ({
        key,
        displayName: group?.displayName || key,
        defaultEmoji: String(group?.defaultEmoji || ''),
      }))
      .sort((a, b) => String(a.displayName).localeCompare(String(b.displayName), 'es'));
  } catch (error) {
    console.error('[ERROR] Error en getWeaponCategories:', error);
    throw error;
  }
};

/**
 * Obtiene un arma por su emoji ID
 */
const getWeaponByEmojiId = async (emojiId) => {
  try {
    return flattenCurrentCatalog().find((weapon) => weapon.emojiId === String(emojiId)) || null;
  } catch (error) {
    console.error('[ERROR] Error en getWeaponByEmojiId:', error);
    throw error;
  }
};

/**
 * Obtiene múltiples armas por sus emoji IDs
 */
const getWeaponsByEmojiIds = async (emojiIds) => {
  try {
    const requested = new Set((emojiIds || []).map(String));
    return flattenCurrentCatalog().filter((weapon) => requested.has(weapon.emojiId));
  } catch (error) {
    console.error('[ERROR] Error en getWeaponsByEmojiIds:', error);
    throw error;
  }
};

/**
 * Crea una nueva arma
 */
const createWeapon = async (weaponData) => {
  try {
    const weapon = new Weapon(weaponData);
    const savedWeapon = await weapon.save();
    return savedWeapon;
  } catch (error) {
    console.error('[ERROR] Error en createWeapon:', error);
    throw error;
  }
};

/**
 * Actualiza un arma existente
 */
const updateWeapon = async (emojiId, updateData) => {
  try {
    const weapon = await Weapon.findOneAndUpdate(
      { emojiId },
      { ...updateData, updatedAt: Date.now() },
      { new: true }
    );
    return weapon;
  } catch (error) {
    console.error('[ERROR] Error en updateWeapon:', error);
    throw error;
  }
};

/**
 * Elimina un arma (marca como inactiva)
 */
const deleteWeapon = async (emojiId) => {
  try {
    const weapon = await Weapon.findOneAndUpdate(
      { emojiId },
      { isActive: false, updatedAt: Date.now() },
      { new: true }
    );
    return weapon;
  } catch (error) {
    console.error('[ERROR] Error en deleteWeapon:', error);
    throw error;
  }
};

/** Escapa los metacaracteres de expresión regular de un texto. */
const escapeRegex = (texto) => String(texto).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Busca armas por nombre (subcadena, sin distinguir mayúsculas).
 *
 * El término se escapa antes de construir el `$regex`: sin escapar, un texto
 * como `(a+)+$` se envía tal cual al motor de expresiones regulares de Mongo y
 * puede colgar la consulta (ReDoS), y metacaracteres como `.` convertirían la
 * búsqueda en algo distinto de lo que el usuario escribió.
 */
const searchWeapons = async (searchTerm) => {
  try {
    const weapons = await Weapon.find({
      name: { $regex: escapeRegex(searchTerm), $options: 'i' },
      isActive: true
    }).sort({ category: 1, name: 1 });
    return weapons;
  } catch (error) {
    console.error('[ERROR] Error en searchWeapons:', error);
    throw error;
  }
};

/**
 * Aplana el catálogo JSON del entorno y construye las operaciones de inserción.
 *
 * Cada operación es un upsert cuyo update solo lleva `$setOnInsert`: si el arma
 * ya existe (mismo `emojiId`) Mongo no escribe nada. Así la carga es automática
 * en cada arranque y nunca pisa lo que se haya editado desde el bot.
 *
 * Función pura: no toca la BD, así se puede probar sin Mongo.
 *
 * @param {{weapons: Object}} catalogo
 * @returns {{ops: Array, emojiIds: string[]}}
 */
const buildWeaponSeedOps = (catalogo) => {
  const grupos = (catalogo && catalogo.weapons) || {};
  const ops = [];
  const emojiIds = [];
  // Set en paralelo al array: la comprobación de duplicados con `includes`
  // recorría todo lo acumulado en cada arma (O(n²) sobre el catálogo entero).
  const vistos = new Set();

  for (const [categoryKey, categoryData] of Object.entries(grupos)) {
    if (!categoryData || !categoryData.displayName || !categoryData.defaultEmoji) {
      throw new Error(`La categoría ${categoryKey} no tiene displayName o defaultEmoji`);
    }

    for (const arma of categoryData.data || []) {
      const emojiId = String(arma.emoji || arma.emojiId || "").trim();
      const name = String(arma.name || "").trim();
      if (!emojiId || !name) {
        throw new Error(`Arma incompleta en ${categoryKey}: ${JSON.stringify(arma)}`);
      }
      if (vistos.has(emojiId)) {
        throw new Error(`emojiId repetido en el catálogo: ${emojiId} (${name})`);
      }
      vistos.add(emojiId);
      emojiIds.push(emojiId);

      ops.push({
        updateOne: {
          filter: { emojiId },
          update: {
            $setOnInsert: {
              emojiId,
              name: name.substring(0, 100),
              category: categoryKey.substring(0, 50),
              categoryDisplayName: categoryData.displayName.substring(0, 100),
              categoryDefaultEmoji: String(categoryData.defaultEmoji).substring(0, 50),
              image: String(arma.image || "").substring(0, 500),
              url: String(arma.url || "").substring(0, 500),
              sendBuildToPrivate: true,
              isActive: true,
              createdAt: new Date(),
            },
          },
          upsert: true,
        },
      });
    }
  }

  if (ops.length === 0) throw new Error("El catálogo de armas está vacío");
  return { ops, emojiIds };
};

/**
 * emojiIds de TODOS los catálogos conocidos (producción y desarrollo).
 *
 * La desactivación de armas obsoletas se mide contra esta unión, no contra el
 * catálogo del entorno actual: los dos catálogos tienen emojis distintos para
 * las mismas armas (los emojis personalizados pertenecen a la aplicación de
 * Discord que los subió), así que si ambos entornos apuntan a la misma base de
 * datos, medir solo contra el propio desactivaría en cada arranque todas las
 * armas del otro. Un archivo que no exista se ignora.
 *
 * @returns {Set<string>}
 */
const loadKnownEmojiIds = () => {
  const fs = require('fs');
  const path = require('path');
  const conocidos = new Set();

  for (const file of [PROD_FILE, DEV_FILE]) {
    const ruta = path.join(__dirname, '../weapons', file);
    try {
      if (!fs.existsSync(ruta)) continue;
      for (const id of buildWeaponSeedOps(JSON.parse(fs.readFileSync(ruta, 'utf8'))).emojiIds) {
        conocidos.add(id);
      }
    } catch (e) {
      console.error(`[WARN] No se pudo leer el catálogo ${file}:`, e?.message);
    }
  }

  return conocidos;
};

/**
 * Carga en la colección `weapons` las armas del catálogo del entorno actual
 * (weapons.json en producción, weapons_dev.json en desarrollo) que todavía no
 * estén en la base de datos. Las que ya existen se dejan intactas.
 *
 * Pensado para correr en cada arranque: es idempotente y no escribe nada si
 * la colección ya está completa.
 *
 * Las armas que ya no están en ningún catálogo se marcan `isActive: false`.
 * Antes la carga solo insertaba, así que un arma retirada del JSON seguía
 * apareciendo en los selectores para siempre. Se desactivan en vez de borrarlas:
 * todas las consultas filtran por `isActive`, es reversible (vuelven a activarse
 * si regresan al catálogo) y los templates ya creados guardan su propia copia
 * del arma, así que no se rompen.
 *
 * @returns {Promise<{total:number, insertadas:number, existentes:number, desactivadas:number, reactivadas:number}>}
 */
const seedWeaponsFromCatalog = async () => {
  const { ops, emojiIds } = buildWeaponSeedOps(loadWeapons());

  const res = await Weapon.bulkWrite(ops, { ordered: false });
  const insertadas = res.upsertedCount || 0;

  const conocidos = [...loadKnownEmojiIds()];
  const [obsoletas, recuperadas] = await Promise.all([
    Weapon.updateMany(
      { emojiId: { $nin: conocidos }, isActive: true },
      { $set: { isActive: false } },
    ),
    // Un arma que vuelve al catálogo ya existe en BD, así que el upsert de
    // arriba (`$setOnInsert`) no la tocaría y seguiría desactivada.
    Weapon.updateMany(
      { emojiId: { $in: emojiIds }, isActive: false },
      { $set: { isActive: true } },
    ),
  ]);

  const desactivadas = obsoletas.modifiedCount || 0;
  const reactivadas = recuperadas.modifiedCount || 0;
  if (desactivadas > 0) {
    console.log(`[INFO] ${desactivadas} arma(s) fuera del catálogo desactivadas.`);
  }
  if (reactivadas > 0) {
    console.log(`[INFO] ${reactivadas} arma(s) reactivadas al volver al catálogo.`);
  }

  return {
    total: emojiIds.length,
    insertadas,
    existentes: emojiIds.length - insertadas,
    desactivadas,
    reactivadas,
  };
};

module.exports = {
  getAllWeapons,
  getWeaponsByCategory,
  getWeaponCategories,
  getWeaponByEmojiId,
  getWeaponsByEmojiIds,
  createWeapon,
  updateWeapon,
  deleteWeapon,
  searchWeapons,
  buildWeaponSeedOps,
  loadKnownEmojiIds,
  seedWeaponsFromCatalog,
};
