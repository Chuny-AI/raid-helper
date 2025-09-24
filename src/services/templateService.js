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
 * Crea un nuevo template
 */
const createTemplate = async (templateData, serverId) => {
  try {
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
    return await Template.findByIdAndUpdate(
      templateId,
      updateData,
      { new: true }
    );
  } catch (error) {
    console.error('[ERROR] Error en updateTemplate:', error);
    throw error;
  }
};

/**
 * Elimina un template
 */
const deleteTemplate = async (templateId, serverId) => {
  try {
    const deletedTemplate = await Template.findByIdAndDelete(templateId);

    if (deletedTemplate) {
      await Server.findOneAndUpdate(
        { guildId: serverId },
        { $pull: { templates: templateId } }
      );
    }

    return deletedTemplate;
  } catch (error) {
    console.error('[ERROR] Error en deleteTemplate:', error);
    throw error;
  }
};

/**
 * Obtiene los nombres de todos los templates de un servidor
 */
const getTemplateNames = async (serverId) => {
  try {
    // Usar lean() para consulta más rápida y limitar a 25 resultados
    const templates = await Template.find({ serverId }, 'title')
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
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getTemplateNames,
  migrateTemplatesFromFiles
};
