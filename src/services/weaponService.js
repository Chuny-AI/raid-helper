const Weapon = require('../database/models/Weapon');

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
    const weapons = await Weapon.find({ category, isActive: true }).sort({ name: 1 });
    return weapons;
  } catch (error) {
    console.error('[ERROR] Error en getWeaponsByCategory:', error);
    throw error;
  }
};

/**
 * Obtiene todas las categorías de armas
 */
const getWeaponCategories = async () => {
  try {
    const categories = await Weapon.distinct('category', { isActive: true });
    const categoriesWithInfo = [];
    
    for (const category of categories) {
      const sampleWeapon = await Weapon.findOne({ category, isActive: true });
      if (sampleWeapon) {
        categoriesWithInfo.push({
          key: category,
          displayName: sampleWeapon.categoryDisplayName,
          defaultEmoji: sampleWeapon.categoryDefaultEmoji
        });
      }
    }
    
    return categoriesWithInfo.sort((a, b) => a.displayName.localeCompare(b.displayName));
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
    const weapon = await Weapon.findOne({ emojiId, isActive: true });
    return weapon;
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
    const weapons = await Weapon.find({ 
      emojiId: { $in: emojiIds }, 
      isActive: true 
    });
    return weapons;
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

/**
 * Busca armas por nombre
 */
const searchWeapons = async (searchTerm) => {
  try {
    const weapons = await Weapon.find({
      name: { $regex: searchTerm, $options: 'i' },
      isActive: true
    }).sort({ category: 1, name: 1 });
    return weapons;
  } catch (error) {
    console.error('[ERROR] Error en searchWeapons:', error);
    throw error;
  }
};

/**
 * Migra armas desde el archivo JSON
 */
const migrateWeaponsFromJSON = async () => {
  try {
    const weaponsData = require('../weapons/weapons.json');
    const weapons = weaponsData.weapons;
    
    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    for (const [categoryKey, categoryData] of Object.entries(weapons)) {
      // Validar datos de la categoría
      if (!categoryData.displayName || !categoryData.defaultEmoji) {
        console.warn(`[WARNING] Categoría ${categoryKey} tiene datos incompletos, omitiendo...`);
        continue;
      }
      
      for (const weaponData of categoryData.data) {
        try {
          // Validar datos del arma
          if (!weaponData.emoji || !weaponData.name) {
            console.warn(`[WARNING] Arma con datos incompletos, omitiendo:`, weaponData);
            skippedCount++;
            continue;
          }
          
          // Verificar si el arma ya existe
          const existingWeapon = await Weapon.findOne({ emojiId: weaponData.emoji });
          if (existingWeapon) {
            skippedCount++;
            continue;
          }
          
          // Crear nueva arma con validación de longitud
          const weapon = new Weapon({
            emojiId: weaponData.emoji.substring(0, 50), // Limitar a 50 caracteres
            name: weaponData.name.substring(0, 100), // Limitar a 100 caracteres
            category: categoryKey.substring(0, 50), // Limitar a 50 caracteres
            categoryDisplayName: categoryData.displayName.substring(0, 100), // Limitar a 100 caracteres
            categoryDefaultEmoji: categoryData.defaultEmoji.substring(0, 50), // Limitar a 50 caracteres
            image: (weaponData.image || "").substring(0, 500), // Limitar a 500 caracteres
            url: (weaponData.url || "").substring(0, 500), // Limitar a 500 caracteres
            sendBuildToPrivate: true,
            isActive: true
          });
          
          await weapon.save();
          migratedCount++;
        } catch (weaponError) {
          console.error(`[ERROR] Error migrando arma ${weaponData.name}:`, weaponError.message);
          errorCount++;
        }
      }
    }
    
    console.log(`[INFO] Migración de armas completada: ${migratedCount} armas migradas, ${skippedCount} omitidas, ${errorCount} errores`);
    return { migratedCount, skippedCount, errorCount };
  } catch (error) {
    console.error('[ERROR] Error en migrateWeaponsFromJSON:', error);
    throw error;
  }
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
  migrateWeaponsFromJSON
};
