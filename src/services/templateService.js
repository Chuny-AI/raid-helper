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
    
    // Agregar el template al servidor
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
      // Remover el template del servidor
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
    const templates = await Template.find({ serverId }, 'title');
    return templates.map(template => ({
      name: template.title,
      value: template.title
    }));
  } catch (error) {
    console.error('[ERROR] Error en getTemplateNames:', error);
    throw error;
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
      
      // Verificar si el template ya existe
      const existingTemplate = await Template.findOne({
        title: templateData.title,
        serverId
      });
      
      if (!existingTemplate) {
        // Añadir URL vacía si no existe
        if (!templateData.url) {
          templateData.url = "";
        }
        
        // Añadir URL y sendBuildToPrivate a cada arma si no existen
        if (templateData.weapons) {
          Object.keys(templateData.weapons).forEach(weaponKey => {
            if (templateData.weapons[weaponKey].data) {
              templateData.weapons[weaponKey].data.forEach(weapon => {
                if (!weapon.url) {
                  weapon.url = "";
                }
                // Añadir sendBuildToPrivate si no existe (por defecto true)
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
