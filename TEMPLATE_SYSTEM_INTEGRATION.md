# Sistema de Templates de Discord - Documentación de Integración

Este documento explica cómo integrar el sistema completo de templates de Discord con la aplicación existente.

## 🎯 Resumen del Sistema

El sistema implementa comandos completos para crear, editar, clonar y eliminar templates de raids desde Discord, con interfaz interactiva usando modales, select menus y botones.

### Comandos Implementados:
- `/template-create` - Crear nuevos templates
- `/template-edit` - Modificar templates existentes  
- `/template-clone` - Clonar templates
- `/template-delete` - Eliminar templates
- `/templates` - Listar templates (ya existía)

## 📁 Archivos Creados

### Comandos Principales:
```
src/commands/utility/
├── template-create.js          # Comando principal de creación
├── template-create-handlers.js # Handlers para modales y selecciones
├── template-create-navigation.js # Navegación y confirmación
├── template-edit.js            # Comando de edición completo
├── template-delete.js          # Comando de eliminación
├── template-clone.js           # Comando de clonado
└── template-interaction-handler.js # Handler centralizado
```

### Middleware:
```
src/middleware/
└── templateInteractionMiddleware.js # Middleware para interactions
```

## 🔧 Integración Requerida

### 1. Registro de Comandos

Agregar los nuevos comandos al sistema de registro:

```javascript
// En tu archivo de registro de comandos (register-commands.js o similar)
const templateCreate = require('./src/commands/utility/template-create');
const templateEdit = require('./src/commands/utility/template-edit');
const templateDelete = require('./src/commands/utility/template-delete');
const templateClone = require('./src/commands/utility/template-clone');

// Agregar a la lista de comandos
commands.push(
  templateCreate.data,
  templateEdit.data,
  templateDelete.data,
  templateClone.data
);
```

### 2. Handler de Interactions

Integrar el middleware en tu sistema principal de interactions:

```javascript
// En tu archivo principal de interactions (index.js o events handler)
const { handleTemplateInteractions } = require('./src/middleware/templateInteractionMiddleware');

client.on('interactionCreate', async (interaction) => {
  try {
    // Manejar template interactions primero
    const templateHandled = await handleTemplateInteractions(interaction);
    if (templateHandled) {
      return; // Si fue manejada por el sistema de templates, no procesar más
    }
    
    // Continuar con otros handlers...
    if (interaction.isChatInputCommand()) {
      // Tu lógica existente de comandos
    }
    
  } catch (error) {
    console.error('Error handling interaction:', error);
  }
});
```

### 3. Comandos con Autocomplete

Asegurar que el autocomplete esté integrado:

```javascript
// En tu handler de autocomplete
if (interaction.isAutocomplete()) {
  const command = client.commands.get(interaction.commandName);
  
  if (command && command.autocomplete) {
    try {
      await command.autocomplete(interaction);
    } catch (error) {
      console.error('Error in autocomplete:', error);
    }
  }
}
```

## ✅ Verificación de Compatibilidad

### Modelos de Base de Datos ✅
- ✅ Template.js ya existe y es compatible
- ✅ Weapon.js ya existe y es compatible  
- ✅ Server.js ya existe y es compatible

### Servicios ✅
- ✅ templateService.js - Se actualizó `deleteTemplate` para mayor robustez
- ✅ weaponService.js - Compatible sin cambios
- ✅ serverService.js - Compatible sin cambios

### Utilidades ✅
- ✅ errorEmbeds.js - Compatible
- ✅ regex.js - Compatible (para validar hex colors)
- ✅ Sistema existente de raids - Compatible

## 🎮 Flujo de Usuario

### Crear Template:
1. `/template-create` → Modal info básica → Modal config adicional
2. → Selección de roles → Selección de categorías de armas
3. → Configuración específica de armas → Resumen → Confirmación

### Editar Template:
1. `/template-edit [template]` → Overview con botones
2. → Editar sección específica → Aplicar cambios → Guardar

### Funciones Adicionales:
- **Clone**: `/template-clone [template] [nuevo-nombre]`
- **Delete**: `/template-delete [template]` → Confirmación → Eliminar

## ⚡ Características Técnicas

### Escalabilidad:
- ✅ Paginación automática para 130+ armas (25 por página)
- ✅ Select menus con límites de Discord respetados
- ✅ Timeouts y manejo de errores robusto

### Seguridad:
- ✅ Verificación de premium en todos los comandos
- ✅ Validación de inputs (hex colors, URLs, etc.)
- ✅ Sesiones temporales con cleanup automático

### Performance:
- ✅ Consultas optimizadas con lean() y límites
- ✅ Timeouts para evitar bloqueos
- ✅ Manejo eficiente de memoria con sesiones

## 🧪 Testing

### Casos de Prueba Sugeridos:

1. **Creación Básica**:
   ```
   /template-create
   → Completar todos los pasos
   → Verificar que se guarda correctamente
   → Confirmar disponibilidad en /raid
   ```

2. **Edición Completa**:
   ```
   /template-edit [template-existente]
   → Modificar cada sección
   → Verificar cambios persisten
   → Confirmar funcionalidad en raids
   ```

3. **Manejo de Armas**:
   ```
   → Seleccionar múltiples categorías
   → Configurar diferentes cantidades
   → Verificar emojis y URLs se guardan
   ```

4. **Edge Cases**:
   ```
   → Cancelar en diferentes pasos
   → Navegar hacia atrás
   → Sesiones expiradas
   → Errores de red/DB
   ```

## 🚀 Deployment

### Checklist de Despliegue:
- [ ] Archivos subidos al servidor
- [ ] Comandos registrados en Discord
- [ ] Middleware integrado en event handlers
- [ ] Verificar premium check funciona
- [ ] Probar autocomplete
- [ ] Validar creación de raids con templates nuevos

### Comandos de Registro:
```bash
# Registrar nuevos comandos
node register-commands.js

# Verificar que aparecen en Discord
/template-<TAB> # Debería mostrar autocompletado
```

## 🛠 Troubleshooting

### Problemas Comunes:

1. **Comandos no aparecen**: Verificar registro y permisos del bot
2. **Interactions fallan**: Revisar integration del middleware  
3. **Autocomplete vacío**: Verificar premium y conexión DB
4. **Sesiones expiradas**: Normal después de inactividad, reiniciar comando

### Logs a Revisar:
```javascript
// Buscar en logs:
[ERROR] Error en template-create
[ERROR] Error en handleTemplateInteractions
```

## 📊 Métricas y Monitoreo

El sistema incluye logging detallado para monitorear:
- Creaciones/ediciones exitosas
- Errores de validación  
- Performance de queries
- Uso por servidor

¡El sistema está listo para producción! 🎉