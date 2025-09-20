const UserCategory = require('../database/models/UserCategory');

/**
 * Obtener todas las categorías de un usuario
 * @param {string} userId - ID del usuario
 * @returns {Promise<Array>} Array de categorías del usuario
 */
const getUserCategories = async (userId) => {
  try {
    const categories = await UserCategory.find({ userId }).sort({ createdAt: 1 });
    return categories;
  } catch (error) {
    console.error('[ERROR] Error obteniendo categorías de usuario:', error);
    throw error;
  }
};

/**
 * Obtener una categoría específica de un usuario
 * @param {string} userId - ID del usuario
 * @param {string} categoryKey - Clave de la categoría
 * @returns {Promise<Object|null>} Categoría del usuario o null
 */
const getUserCategory = async (userId, categoryKey) => {
  try {
    const category = await UserCategory.findOne({ userId, categoryKey });
    return category;
  } catch (error) {
    console.error('[ERROR] Error obteniendo categoría de usuario:', error);
    throw error;
  }
};

/**
 * Crear una nueva categoría de usuario
 * @param {string} userId - ID del usuario
 * @param {string} categoryKey - Clave de la categoría
 * @param {string} displayName - Nombre de visualización
 * @param {string} defaultEmoji - Emoji por defecto
 * @returns {Promise<Object>} Categoría creada
 */
const createUserCategory = async (userId, categoryKey, displayName, defaultEmoji) => {
  try {
    const category = new UserCategory({
      userId,
      categoryKey,
      displayName,
      defaultEmoji,
      weapons: []
    });
    
    await category.save();
    return category;
  } catch (error) {
    console.error('[ERROR] Error creando categoría de usuario:', error);
    throw error;
  }
};

/**
 * Actualizar una categoría de usuario
 * @param {string} userId - ID del usuario
 * @param {string} categoryKey - Clave de la categoría
 * @param {Object} updateData - Datos a actualizar
 * @returns {Promise<Object|null>} Categoría actualizada o null
 */
const updateUserCategory = async (userId, categoryKey, updateData) => {
  try {
    const category = await UserCategory.findOneAndUpdate(
      { userId, categoryKey },
      { ...updateData, updatedAt: Date.now() },
      { new: true }
    );
    return category;
  } catch (error) {
    console.error('[ERROR] Error actualizando categoría de usuario:', error);
    throw error;
  }
};

/**
 * Eliminar una categoría de usuario
 * @param {string} userId - ID del usuario
 * @param {string} categoryKey - Clave de la categoría
 * @returns {Promise<boolean>} True si se eliminó, false si no existía
 */
const deleteUserCategory = async (userId, categoryKey) => {
  try {
    const result = await UserCategory.deleteOne({ userId, categoryKey });
    return result.deletedCount > 0;
  } catch (error) {
    console.error('[ERROR] Error eliminando categoría de usuario:', error);
    throw error;
  }
};

/**
 * Agregar armas a una categoría de usuario
 * @param {string} userId - ID del usuario
 * @param {string} categoryKey - Clave de la categoría
 * @param {Array} weapons - Array de armas a agregar
 * @returns {Promise<Object|null>} Categoría actualizada o null
 */
const addWeaponsToUserCategory = async (userId, categoryKey, weapons) => {
  try {
    const category = await UserCategory.findOne({ userId, categoryKey });
    if (!category) {
      return null;
    }

    // Agregar nuevas armas sin duplicar
    const existingWeaponIds = new Set(category.weapons.map(w => w.emojiId));
    const newWeapons = weapons.filter(weapon => !existingWeaponIds.has(weapon.emojiId));
    
    category.weapons.push(...newWeapons);
    await category.save();
    
    return category;
  } catch (error) {
    console.error('[ERROR] Error agregando armas a categoría de usuario:', error);
    throw error;
  }
};

/**
 * Actualizar armas de una categoría de usuario
 * @param {string} userId - ID del usuario
 * @param {string} categoryKey - Clave de la categoría
 * @param {Array} weapons - Array completo de armas
 * @returns {Promise<Object|null>} Categoría actualizada o null
 */
const updateUserCategoryWeapons = async (userId, categoryKey, weapons) => {
  try {
    const category = await UserCategory.findOneAndUpdate(
      { userId, categoryKey },
      { weapons, updatedAt: Date.now() },
      { new: true }
    );
    return category;
  } catch (error) {
    console.error('[ERROR] Error actualizando armas de categoría de usuario:', error);
    throw error;
  }
};

/**
 * Verificar si una categoría existe para un usuario
 * @param {string} userId - ID del usuario
 * @param {string} categoryKey - Clave de la categoría
 * @returns {Promise<boolean>} True si existe, false si no
 */
const userCategoryExists = async (userId, categoryKey) => {
  try {
    const count = await UserCategory.countDocuments({ userId, categoryKey });
    return count > 0;
  } catch (error) {
    console.error('[ERROR] Error verificando existencia de categoría de usuario:', error);
    throw error;
  }
};

module.exports = {
  getUserCategories,
  getUserCategory,
  createUserCategory,
  updateUserCategory,
  deleteUserCategory,
  addWeaponsToUserCategory,
  updateUserCategoryWeapons,
  userCategoryExists
};
