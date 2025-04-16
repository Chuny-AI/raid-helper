const fs = require("node:fs");
const path = require("node:path");

/**
 * Obtiene los nombres de los templates disponibles en la carpeta templates
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
 * Recibe el nombre del template y devuelve el contenido del archivo en un objeto JSON
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

module.exports = {
  getDataFromTemplate,
  getAllNameTemplates,
};
