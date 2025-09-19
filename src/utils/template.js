const fs = require("node:fs");
const path = require("node:path");
const { getTemplateNames, getTemplateByName } = require("../services/templateService");

/**
 * Obtiene los nombres de los templates disponibles en la carpeta templates (para migración)
 * @returns {Array<{name: string, value: string}>}
 */
const getAllNameTemplates = () => {
  console.log(`[INFO] Obteniendo los templates disponibles`);
  const templatesPath = path.join(__dirname, "../templates");
  const files = fs.readdirSync(templatesPath).map((file) => file.split(".")[0]);
  const templates = files.map((file) => {
    return {
      name: file.charAt(0).toUpperCase() + file.slice(1),
      value: file,
    };
  });
  return templates;
};

/**
 * Recibe el nombre del template y devuelve el contenido del archivo en un objeto JSON (para migración)
 * @param {*} templateName: string - Nombre del template
 * @returns: object - Contenido del archivo JSON
 */
const getDataFromTemplate = (templateName) => {
  console.log(templateName)
  console.log(`[INFO] Obteniendo el template ${templateName}`);
  const template = (templateName + ".json")
  const foldersPath = path.join(__dirname, `../templates/${template}`);
  const contentFile = fs.readFileSync(foldersPath, "utf-8");
  try {
    console.log(`[INFO] Obteniendo el template ${templateName}`);
    return JSON.parse(contentFile);
  } catch (error) {
    console.error(`[ERROR] No se pudo leer el archivo ${foldersPath}`);
    return null;
  }
};

/**
 * Obtiene los nombres de los templates de un servidor desde la base de datos
 * @param {string} serverId - ID del servidor
 * @returns {Array<{name: string, value: string}>}
 */
const getTemplatesForServer = async (serverId) => {
  try {
    return await getTemplateNames(serverId);
  } catch (error) {
    console.error('[ERROR] Error obteniendo templates del servidor:', error);
    return [];
  }
};

/**
 * Obtiene un template específico de un servidor desde la base de datos
 * @param {string} templateName - Nombre del template
 * @param {string} serverId - ID del servidor
 * @returns {object|null} - Contenido del template o null si no existe
 */
const getTemplateForServer = async (templateName, serverId) => {
  try {
    return await getTemplateByName(templateName, serverId);
  } catch (error) {
    console.error('[ERROR] Error obteniendo template del servidor:', error);
    return null;
  }
};

module.exports = {
  getDataFromTemplate,
  getAllNameTemplates,
  getTemplatesForServer,
  getTemplateForServer,
};
