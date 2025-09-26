/**
 * Script de prueba para verificar errores de sintaxis en el sistema de templates
 */

try {
  console.log('🔍 Verificando archivos del sistema de templates...');

  // Verificar archivos principales
  const templateCreate = require('./src/commands/utility/template-create');
  console.log('✅ template-create.js - OK');

  const templateHandlers = require('./src/commands/utility/template-create-handlers');
  console.log('✅ template-create-handlers.js - OK');

  const templateNavigation = require('./src/commands/utility/template-create-navigation');
  console.log('✅ template-create-navigation.js - OK');

  const templateEdit = require('./src/commands/utility/template-edit');
  console.log('✅ template-edit.js - OK');

  const templateDelete = require('./src/commands/utility/template-delete');
  console.log('✅ template-delete.js - OK');

  const templateClone = require('./src/commands/utility/template-clone');
  console.log('✅ template-clone.js - OK');

  const templateInteractionHandler = require('./src/commands/utility/template-interaction-handler');
  console.log('✅ template-interaction-handler.js - OK');

  const templateMiddleware = require('./src/middleware/templateInteractionMiddleware');
  console.log('✅ templateInteractionMiddleware.js - OK');

  // Verificar servicios
  const templateService = require('./src/services/templateService');
  console.log('✅ templateService.js - OK');

  // Verificar modelos
  const Template = require('./src/database/models/Template');
  console.log('✅ Template.js - OK');

  console.log('\n🎉 Todos los archivos se cargan correctamente!');
  console.log('\n📋 Comandos disponibles:');
  console.log('- /template-create');
  console.log('- /template-edit');
  console.log('- /template-delete');
  console.log('- /template-clone');

  process.exit(0);

} catch (error) {
  console.error('❌ Error encontrado:', error.message);
  console.error('\n🔍 Stack trace:');
  console.error(error.stack);
  process.exit(1);
}