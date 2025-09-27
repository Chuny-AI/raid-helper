# 📚 API Reference - Chuny BOT

Esta documentación describe la API interna del bot, servicios, modelos y utilidades disponibles.

---

## 🗄️ Modelos de Base de Datos

### Template

Modelo para almacenar plantillas de raids del servidor.

```javascript
const templateSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  image: { type: String },
  weapons: { type: mongoose.Schema.Types.Mixed },
  serverId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
```

**Campos:**
- `title`: Título de la plantilla
- `description`: Descripción opcional
- `image`: URL de imagen opcional
- `weapons`: Configuración de armas (formato flexible)
- `serverId`: ID del servidor de Discord
- `createdAt`: Fecha de creación
- `updatedAt`: Fecha de última actualización

### Server

Modelo para configuración de servidores.

```javascript
const serverSchema = new mongoose.Schema({
  serverId: { type: String, required: true, unique: true },
  serverName: { type: String },
  isPremium: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});
```

### AuthorizedRole

Modelo para roles autorizados por servidor.

```javascript
const authorizedRoleSchema = new mongoose.Schema({
  serverId: { type: String, required: true },
  roleId: { type: String, required: true },
  roleName: { type: String },
  addedAt: { type: Date, default: Date.now }
});
```

### Weapon

Modelo para la base de datos de armas.

```javascript
const weaponSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, required: true },
  tier: { type: Number },
  enchantment: { type: Number, default: 0 },
  emojiId: { type: String },
  image: { type: String },
  createdAt: { type: Date, default: Date.now }
});
```

### Claim

Modelo para el sistema de claims.

```javascript
const claimSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  serverId: { type: String, required: true },
  activity: { type: String, required: true },
  map: { type: String, required: true },
  duration: { type: String, required: true },
  description: { type: String },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now }
});
```

### AuthorizedUser

Modelo para usuarios autorizados para decodificación.

```javascript
const authorizedUserSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  username: { type: String },
  reason: { type: String },
  authorizedBy: { type: String, required: true },
  authorizedAt: { type: Date, default: Date.now }
});
```

---

## 🔧 Servicios

### templateService

Servicio para gestión de plantillas.

#### `getTemplatesByServer(serverId)`
Obtiene todas las plantillas de un servidor.

```javascript
const templates = await getTemplatesByServer('123456789');
```

#### `getTemplateByName(serverId, templateName)`
Obtiene una plantilla específica por nombre.

```javascript
const template = await getTemplateByName('123456789', 'ZvZ');
```

#### `createTemplate(templateData)`
Crea una nueva plantilla.

```javascript
const newTemplate = await createTemplate({
  title: 'Nueva Plantilla',
  description: 'Descripción',
  serverId: '123456789',
  weapons: {}
});
```

#### `updateTemplate(templateId, updateData)`
Actualiza una plantilla existente.

```javascript
const updated = await updateTemplate('templateId', {
  title: 'Título Actualizado'
});
```

#### `deleteTemplate(templateId)`
Elimina una plantilla.

```javascript
await deleteTemplate('templateId');
```

### serverService

Servicio para gestión de servidores.

#### `getOrCreateServer(serverId, serverName)`
Obtiene o crea un servidor en la base de datos.

```javascript
const server = await getOrCreateServer('123456789', 'Mi Servidor');
```

#### `isServerPremium(serverId)`
Verifica si un servidor tiene premium.

```javascript
const isPremium = await isServerPremium('123456789');
```

#### `updateServerPremium(serverId, isPremium)`
Actualiza el estado premium de un servidor.

```javascript
await updateServerPremium('123456789', true);
```

#### `getPremiumServers()`
Obtiene todos los servidores premium.

```javascript
const premiumServers = await getPremiumServers();
```

### authorizedRoleService

Servicio para gestión de roles autorizados.

#### `getAuthorizedRoles(serverId)`
Obtiene roles autorizados de un servidor.

```javascript
const roles = await getAuthorizedRoles('123456789');
```

#### `addAuthorizedRole(serverId, roleId, roleName)`
Agrega un rol autorizado.

```javascript
await addAuthorizedRole('123456789', '987654321', 'Raiders');
```

#### `removeAuthorizedRole(serverId, roleId)`
Remueve un rol autorizado.

```javascript
await removeAuthorizedRole('123456789', '987654321');
```

#### `clearAuthorizedRoles(serverId)`
Limpia todos los roles autorizados de un servidor.

```javascript
await clearAuthorizedRoles('123456789');
```

### weaponService

Servicio para gestión de armas.

#### `getAllWeapons()`
Obtiene todas las armas.

```javascript
const weapons = await getAllWeapons();
```

#### `getWeaponsByCategory(category)`
Obtiene armas por categoría.

```javascript
const swords = await getWeaponsByCategory('sword');
```

#### `getWeaponCategories()`
Obtiene todas las categorías de armas.

```javascript
const categories = await getWeaponCategories();
```

#### `createWeapon(weaponData)`
Crea una nueva arma.

```javascript
const weapon = await createWeapon({
  name: 'Espada Legendaria',
  category: 'sword',
  tier: 8,
  emojiId: '123456789'
});
```

### claimService

Servicio para gestión de claims.

#### `createClaim(claimData)`
Crea un nuevo claim.

```javascript
const claim = await createClaim({
  userId: '123456789',
  serverId: '987654321',
  activity: 'Orbe de Poder T8',
  map: 'Caerleon',
  duration: '1h 30m',
  description: 'Descripción opcional'
});
```

#### `getUserClaims(userId, serverId)`
Obtiene claims activos de un usuario.

```javascript
const claims = await getUserClaims('123456789', '987654321');
```

#### `cancelClaim(claimId, userId)`
Cancela un claim.

```javascript
await cancelClaim('claimId', '123456789');
```

---

## 🛠️ Utilidades

### errorEmbeds

Utilidades para crear embeds de error y éxito.

#### `createErrorEmbed(title, description, fields)`
Crea un embed de error.

```javascript
const embed = createErrorEmbed(
  'Error de Permisos',
  'No tienes permisos para usar este comando',
  [{ name: 'Solución', value: 'Contacta a un administrador', inline: false }]
);
```

#### `createSuccessEmbed(title, description, fields)`
Crea un embed de éxito.

```javascript
const embed = createSuccessEmbed(
  'Plantilla Creada',
  'La plantilla se creó exitosamente'
);
```

#### `createPremiumEmbed()`
Crea un embed para requerir premium.

```javascript
const embed = createPremiumEmbed();
```

#### `safeReply(interaction, options)`
Responde de manera segura a una interacción.

```javascript
await safeReply(interaction, {
  embeds: [embed],
  ephemeral: true
});
```

### time

Utilidades para manejo de tiempo.

#### `parseTime(timeString)`
Parsea una cadena de tiempo a milisegundos.

```javascript
const ms = parseTime('1h 30m'); // 5400000
```

#### `formatTime(milliseconds)`
Formatea milisegundos a cadena legible.

```javascript
const formatted = formatTime(5400000); // "1h 30m"
```

### regex

Utilidades para validación con regex.

#### `isValidHex(color)`
Valida si una cadena es un color hexadecimal válido.

```javascript
const isValid = isValidHex('#FF0000'); // true
```

### embed

Utilidades para crear embeds personalizados.

#### `createEmbed(templateData, customData)`
Crea un embed basado en plantilla y datos personalizados.

```javascript
const embed = createEmbed(templateData, {
  title: 'Título Personalizado',
  color: '#FF0000'
});
```

#### `createMassNotificationEmbed(templateData, customData)`
Crea un embed para notificaciones masivas.

```javascript
const embed = createMassNotificationEmbed(templateData, customData);
```

---

## 🔐 Middleware

### premiumCheck

Middleware para verificar estado premium.

#### `checkPremium(interaction)`
Verifica si el servidor tiene premium.

```javascript
const hasPremium = await checkPremium(interaction);
if (!hasPremium) return;
```

### ownerCheck

Middleware para verificar si el usuario es owner.

#### `checkOwner(interaction)`
Verifica si el usuario es el owner del bot.

```javascript
const isOwner = await checkOwner(interaction);
```

#### `isOwner(userId)`
Verifica si un ID de usuario es el owner.

```javascript
const ownerStatus = isOwner('123456789');
```

### roleCheck

Middleware para verificar roles autorizados.

#### `checkAuthorizedUserAccess(interaction)`
Verifica si el usuario tiene acceso basado en roles.

```javascript
const hasAccess = await checkAuthorizedUserAccess(interaction);
```

### commandVisibility

Middleware para visibilidad de comandos.

#### `shouldShowCommand(interaction, commandType)`
Determina si un comando debe ser visible para el usuario.

```javascript
const shouldShow = await shouldShowCommand(interaction, 'premium');
```

#### `shouldShowPremiumCommand(interaction)`
Verifica si comandos premium deben ser visibles.

```javascript
const showPremium = await shouldShowPremiumCommand(interaction);
```

#### `shouldShowOwnerCommand(interaction)`
Verifica si comandos de owner deben ser visibles.

```javascript
const showOwner = await shouldShowOwnerCommand(interaction);
```

---

## 📊 Sistema de Sesiones

### template-sessions

Gestión de sesiones de creación de plantillas.

#### `createTemplateSession(userId, guildId)`
Crea una nueva sesión de plantilla.

```javascript
const sessionId = createTemplateSession('123456789', '987654321');
```

#### `getTemplateSession(sessionId)`
Obtiene datos de una sesión.

```javascript
const session = getTemplateSession(sessionId);
```

#### `updateTemplateSession(sessionId, data)`
Actualiza datos de una sesión.

```javascript
updateTemplateSession(sessionId, {
  currentStep: 'weapon_selection',
  templateData: { title: 'Nueva Plantilla' }
});
```

#### `deleteTemplateSession(sessionId)`
Elimina una sesión.

```javascript
deleteTemplateSession(sessionId);
```

#### `cleanExpiredSessions()`
Limpia sesiones expiradas.

```javascript
cleanExpiredSessions();
```

---

## 🎯 Sistema de Plantillas

### template-create-handlers

Manejadores para creación de plantillas.

#### `handleBasicInfo(interaction, sessionId)`
Maneja la configuración básica de plantillas.

```javascript
await handleBasicInfo(interaction, sessionId);
```

#### `showWeaponCategorySelection(interaction, sessionId)`
Muestra selección de categorías de armas.

```javascript
await showWeaponCategorySelection(interaction, sessionId);
```

#### `handleWeaponSelection(interaction, sessionId, category)`
Maneja selección de armas específicas.

```javascript
await handleWeaponSelection(interaction, sessionId, 'sword');
```

#### `handleFinishGroup(interaction, sessionId)`
Finaliza la configuración de un grupo de armas.

```javascript
await handleFinishGroup(interaction, sessionId);
```

### template-create-navigation

Navegación en el proceso de creación.

#### `handleBack(interaction, sessionId)`
Maneja navegación hacia atrás.

```javascript
await handleBack(interaction, sessionId);
```

#### `handleNext(interaction, sessionId)`
Maneja navegación hacia adelante.

```javascript
await handleNext(interaction, sessionId);
```

#### `handleConfirm(interaction, sessionId)`
Confirma y guarda la plantilla.

```javascript
await handleConfirm(interaction, sessionId);
```

---

## 🔄 Conversión de Datos

### Funciones de Conversión

#### `convertCreationGroupToEditorGroup(creationGroup)`
Convierte formato de creación a formato de editor.

```javascript
const editorGroup = convertCreationGroupToEditorGroup({
  name: 'Tanques',
  weapons: [
    { name: 'Espada', emojiId: '123', units: 2 }
  ]
});
```

#### `syncFromCreationToEdit(sessionId, templateId)`
Sincroniza datos de sesión temporal a plantilla final.

```javascript
await syncFromCreationToEdit(sessionId, templateId);
```

---

## 📝 Eventos

### ready

Evento cuando el bot está listo.

```javascript
client.once('ready', () => {
  console.log(`Bot conectado como ${client.user.tag}`);
});
```

### interactionCreate

Evento para manejar interacciones.

```javascript
client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    // Manejar comandos slash
  } else if (interaction.isButton()) {
    // Manejar botones
  } else if (interaction.isStringSelectMenu()) {
    // Manejar menús de selección
  }
});
```

---

## 🚨 Manejo de Errores

### Patrones de Error

```javascript
// Patrón estándar para servicios
try {
  const result = await operation();
  return result;
} catch (error) {
  console.error('[ERROR] Service operation failed:', error);
  throw new Error('User-friendly error message');
}

// Patrón para comandos
try {
  await commandLogic(interaction);
} catch (error) {
  console.error('[ERROR] Command failed:', error);
  
  const errorEmbed = createErrorEmbed(
    'Error del Sistema',
    'Ocurrió un error ejecutando el comando'
  );
  
  await safeReply(interaction, {
    embeds: [errorEmbed],
    ephemeral: true
  });
}
```

---

## 📊 Logging y Debugging

### Niveles de Log

```javascript
// Error crítico
console.error('[ERROR] Database connection failed:', error);

// Advertencia
console.warn('[WARN] Deprecated function used');

// Información (solo en desarrollo)
if (process.env.NODE_ENV === 'development') {
  console.log('[DEBUG] Session data:', sessionData);
}
```

---

*Esta documentación está en constante actualización. Para más detalles, consulta el código fuente o contacta al equipo de desarrollo.*