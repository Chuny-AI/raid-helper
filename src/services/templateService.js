const Template = require('../database/models/Template');
const Server = require('../database/models/Server');

/**
 * Obtiene todos los templates de un servidor
 */
const getTemplatesByServer = async (serverId) => {
  try {
    return await Template.find({ serverId });
  } catch (error) {
    console.error('[ERROR] Error en getTemplatesByServer:', error);
    throw error;
  }
};

/**
 * Obtiene un template específico por nombre y servidor
 */
const getTemplateByName = async (templateName, serverId) => {
  try {
    return await Template.findOne({
      title: templateName,
      serverId
    });
  } catch (error) {
    console.error('[ERROR] Error en getTemplateByName:', error);
    throw error;
  }
};

/**
 * Obtiene un template por su _id, acotado al servidor indicado.
 *
 * Los handlers de botones reciben el _id dentro del customId, así que antes de
 * modificar o borrar hay que confirmar que ese template es de este servidor:
 * un `findById` a secas no distingue entre gremios.
 * @returns {Promise<Object|null>} null si no existe o es de otro servidor
 */
const getTemplateById = async (templateId, serverId) => {
  try {
    return await Template.findOne({ _id: templateId, serverId });
  } catch (error) {
    // Un _id con formato inválido (viene de un customId) lanza CastError
    console.error('[ERROR] Error en getTemplateById:', error.message);
    return null;
  }
};

/**
 * Crea un nuevo template
 */
const createTemplate = async (templateData, serverId) => {
  try {
    // Validar que el título no sea null o undefined
    if (!templateData.title) {
      console.log('[ERROR] createTemplate - Title es null o undefined:', templateData.title);
      throw new Error('Title es requerido y no puede ser null');
    }

    const template = new Template({
      ...templateData,
      serverId
    });

    const savedTemplate = await template.save();

    await Server.findOneAndUpdate(
      { guildId: serverId },
      { $push: { templates: savedTemplate._id } }
    );

    return savedTemplate;
  } catch (error) {
    console.error('[ERROR] Error en createTemplate:', error);
    throw error;
  }
};

/**
 * Actualiza un template existente
 */
const updateTemplate = async (templateId, updateData) => {
  try {
    console.log(`[DEBUG] updateTemplate - Actualizando template ${templateId}`);
    console.log(`[DEBUG] updateTemplate - Datos recibidos:`, JSON.stringify(updateData, null, 2));
    
    // Validar que el templateId sea válido
    if (!templateId) {
      throw new Error('Template ID es requerido');
    }
    
    // Validar estructura de weapons si está presente
    if (updateData.weapons !== undefined) {
      console.log(`[DEBUG] updateTemplate - Validando estructura de weapons`);
      console.log(`[DEBUG] updateTemplate - weapons type:`, typeof updateData.weapons);
      console.log(`[DEBUG] updateTemplate - weapons isArray:`, Array.isArray(updateData.weapons));

      // Remover sendBuildToPrivate si existe
      const removeSendBuild = (data) => {
        if (Array.isArray(data)) {
          return data.map(item => removeSendBuild(item));
        } else if (data && typeof data === 'object') {
          const cleaned = {};
          for (const [k, v] of Object.entries(data)) {
            if (k === 'sendBuildToPrivate') continue;
            cleaned[k] = removeSendBuild(v);
          }
          return cleaned;
        }
        return data;
      };

      updateData.weapons = removeSendBuild(updateData.weapons);
    }
    
    const result = await Template.findByIdAndUpdate(
      templateId,
      updateData,
      { new: true }
    );
    
    if (!result) {
      throw new Error(`Template con ID ${templateId} no encontrado`);
    }
    
    console.log(`[DEBUG] updateTemplate - Template actualizado exitosamente`);
    console.log(`[DEBUG] updateTemplate - Resultado:`, {
      id: result._id,
      title: result.title,
      weaponsType: typeof result.weapons,
      weaponsLength: Array.isArray(result.weapons) ? result.weapons.length : 'N/A'
    });
    
    return result;
  } catch (error) {
    console.error('[ERROR] Error en updateTemplate:', error);
    console.error('[ERROR] Template ID:', templateId);
    console.error('[ERROR] Update data:', JSON.stringify(updateData, null, 2));
    throw error;
  }
};

/**
 * Elimina un template
 */
const deleteTemplate = async (templateId, serverId = null) => {
  try {
    const template = await Template.findById(templateId);
    if (!template) {
      return null;
    }

    const deletedTemplate = await Template.findByIdAndDelete(templateId);

    if (deletedTemplate) {
      // Usar el serverId del template si no se proporciona
      const guildId = serverId || template.serverId;
      await Server.findOneAndUpdate(
        { guildId },
        { $pull: { templates: templateId } }
      );
    }

    return deletedTemplate;
  } catch (error) {
    console.error('[ERROR] Error en deleteTemplate:', error);
    throw error;
  }
};

/** Escapa los metacaracteres de expresión regular de un texto. */
const escapeRegex = (texto) => String(texto).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Obtiene los nombres de los templates de un servidor, opcionalmente filtrados.
 *
 * El filtro se aplica en la consulta, no después: con `limit(25)` a secas Mongo
 * devolvía siempre los 25 primeros por orden natural y el filtrado en memoria
 * solo podía descartar de esos 25, así que en un servidor con más templates los
 * que quedaban fuera no aparecían nunca por mucho que el usuario escribiera su
 * nombre completo. Se ordena por título para que el corte sea estable.
 *
 * @param {string} serverId
 * @param {string} [query] Texto escrito por el usuario en el autocompletado.
 * @returns {Promise<Array<{name: string, value: string}>>} máximo 25 (límite de Discord)
 */
const getTemplateNames = async (serverId, query = '') => {
  try {
    const filtro = { serverId };
    const texto = String(query || '').trim();
    // Se escapa: el texto viene tal cual del autocompletado y sin escapar un
    // `(a+)+` o un `.` cambiarían (o colgarían) la consulta.
    if (texto) filtro.title = { $regex: escapeRegex(texto), $options: 'i' };

    // Usar lean() para consulta más rápida y limitar a 25 resultados
    const templates = await Template.find(filtro, 'title')
      .sort({ title: 1 })
      .limit(25)
      .lean()
      .maxTimeMS(2000); // Timeout de 2 segundos

    return templates.map(template => ({
      name: template.title,
      value: template.title
    }));
  } catch (error) {
    console.error('[ERROR] Error en getTemplateNames:', error);

    // En caso de error, devolver array vacío en lugar de lanzar error
    // para que el autocomplete no falle
    return [];
  }
};

/**
 * Migra templates desde archivos JSON a la base de datos
 */
const migrateTemplatesFromFiles = async (serverId) => {
  try {
    const fs = require('fs');
    const path = require('path');

    const templatesPath = path.join(__dirname, '../templates');
    const templateFiles = fs.readdirSync(templatesPath).filter(file => file.endsWith('.json'));

    const migratedTemplates = [];

    for (const file of templateFiles) {
      const filePath = path.join(templatesPath, file);
      const templateData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      const existingTemplate = await Template.findOne({
        title: templateData.title,
        serverId
      });

      if (!existingTemplate) {
        if (!templateData.url) {
          templateData.url = "";
        }

        if (templateData.weapons) {
          Object.keys(templateData.weapons).forEach(weaponKey => {
            if (templateData.weapons[weaponKey].data) {
              templateData.weapons[weaponKey].data.forEach(weapon => {
                if (!weapon.url) {
                  weapon.url = "";
                }
                if (weapon.sendBuildToPrivate === undefined) {
                  weapon.sendBuildToPrivate = true;
                }
              });
            }
          });
        }

        const template = await createTemplate(templateData, serverId);
        migratedTemplates.push(template);
      }
    }

    return migratedTemplates;
  } catch (error) {
    console.error('[ERROR] Error en migrateTemplatesFromFiles:', error);
    throw error;
  }
};

module.exports = {
  getTemplatesByServer,
  getTemplateByName,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getTemplateNames,
  migrateTemplatesFromFiles
};
