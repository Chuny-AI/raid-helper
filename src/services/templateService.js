const Template = require('../database/models/Template');
const Server = require('../database/models/Server');

const TEMPLATE_TITLE_COLLATION = { locale: 'es', strength: 2 };

const duplicateTitleError = (title) => {
  const error = new Error(`Ya existe una plantilla llamada "${String(title || '').trim()}" en este servidor.`);
  error.code = 'TEMPLATE_NAME_CONFLICT';
  return error;
};

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
    }).collation(TEMPLATE_TITLE_COLLATION);
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
      notifyAll: Array.isArray(templateData.roles) && templateData.roles.length > 0,
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
    if (error?.code === 11000) throw duplicateTitleError(templateData?.title);
    throw error;
  }
};

/**
 * Actualiza un template existente, acotado al servidor indicado.
 *
 * `serverId` es obligatorio por el mismo motivo que en `getTemplateById`: el
 * id llega desde un customId o desde una sesión, y un `findByIdAndUpdate` a
 * secas escribiría en el template de cualquier gremio. Que el filtro esté
 * aquí y no en cada llamada es lo que impide que se olvide en la siguiente.
 */
const updateTemplate = async (templateId, updateData, serverId, expectedUpdatedAt = null) => {
  try {
    console.log(`[DEBUG] updateTemplate - Actualizando template ${templateId}`);
    console.log(`[DEBUG] updateTemplate - Datos recibidos:`, JSON.stringify(updateData, null, 2));
    
    // Validar que el templateId sea válido
    if (!templateId) {
      throw new Error('Template ID es requerido');
    }
    if (!serverId) {
      throw new Error('serverId es requerido para actualizar un template');
    }
    
    const safeUpdate = { ...updateData, updatedAt: new Date() };
    if (safeUpdate.roles !== undefined) {
      safeUpdate.notifyAll = Array.isArray(safeUpdate.roles) && safeUpdate.roles.length > 0;
    }

    // Validar estructura de weapons si está presente
    if (safeUpdate.weapons !== undefined) {
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

      safeUpdate.weapons = removeSendBuild(safeUpdate.weapons);
    }

    const filter = { _id: templateId, serverId };
    const hasConcurrencyCheck = expectedUpdatedAt !== null && expectedUpdatedAt !== undefined;
    if (expectedUpdatedAt?.missing === true) {
      // Las plantillas creadas antes de incorporar `updatedAt` no tienen el
      // campo en Mongo. El default de Mongoose no debe convertirse en una
      // fecha fantasma que impida guardarlas por primera vez.
      filter.updatedAt = { $exists: false };
    } else if (hasConcurrencyCheck) {
      filter.updatedAt = new Date(expectedUpdatedAt);
    }

    const result = await Template.findOneAndUpdate(
      filter,
      safeUpdate,
      { new: true, runValidators: true }
    );
    
    if (!result) {
      throw new Error(hasConcurrencyCheck
        ? 'La plantilla cambió en otra sesión. Vuelve a abrir el editor para no sobrescribir esos cambios.'
        : `Template con ID ${templateId} no encontrado en este servidor`);
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
    if (error?.code === 11000) throw duplicateTitleError(updateData?.title);
    throw error;
  }
};

/**
 * Elimina un template del servidor indicado.
 *
 * `serverId` es obligatorio: borrar es irreversible y el id viene de un
 * customId, así que el filtro va en la propia consulta. Un template de otro
 * gremio se comporta como si no existiera (devuelve null).
 */
const deleteTemplate = async (templateId, serverId) => {
  try {
    if (!serverId) {
      throw new Error('serverId es requerido para eliminar un template');
    }

    const deletedTemplate = await Template.findOneAndDelete({ _id: templateId, serverId });
    if (!deletedTemplate) {
      return null;
    }

    await Server.findOneAndUpdate(
      { guildId: serverId },
      { $pull: { templates: templateId } }
    );

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

      const existingTemplate = await getTemplateByName(templateData.title, serverId);

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
  TEMPLATE_TITLE_COLLATION,
  getTemplatesByServer,
  getTemplateByName,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getTemplateNames,
  migrateTemplatesFromFiles
};
