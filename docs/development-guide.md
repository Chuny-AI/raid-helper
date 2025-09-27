# 🛠️ Guía de Desarrollo - Chuny BOT

Esta guía está dirigida a desarrolladores que desean contribuir al proyecto o entender su arquitectura interna.

---

## 🏗️ Arquitectura del Proyecto

### Estructura de Directorios

```
avalon-raid-helper/
├── src/
│   ├── commands/utility/      # Comandos slash del bot
│   ├── database/models/       # Modelos de MongoDB con Mongoose
│   ├── events/               # Event handlers de Discord.js
│   ├── lib/template/         # Librerías del sistema de plantillas
│   ├── middleware/           # Middleware de autenticación y permisos
│   ├── services/             # Servicios de lógica de negocio
│   ├── utils/                # Utilidades y helpers
│   └── weapons/              # Base de datos de armas (JSON)
├── docs/                     # Documentación del proyecto
├── .env.example              # Plantilla de variables de entorno
├── package.json              # Dependencias y scripts NPM
└── index.js                  # Punto de entrada principal
```

### Stack Tecnológico

- **Runtime**: Node.js v22.12.0
- **Discord API**: Discord.js v14.16.2
- **Base de Datos**: MongoDB con Mongoose v8.0.3
- **Web Framework**: Express v5.1.0 (para endpoints adicionales)
- **Scheduler**: Node Schedule v2.1.1
- **Estilo de Código**: CommonJS (require/module.exports)

---

## 🚀 Configuración del Entorno de Desarrollo

### Prerrequisitos

```bash
# Versiones requeridas
node --version  # v22.12.0 o superior
npm --version   # 10.8.3 o superior
```

### Instalación

1. **Clonar y configurar**:
   ```bash
   git clone https://github.com/M8-Babbage/avalon-raid-helper.git
   cd avalon-raid-helper
   npm install
   ```

2. **Configurar variables de entorno**:
   ```bash
   cp .env.example .env
   ```

3. **Configurar MongoDB**:
   - Local: `mongodb://localhost:27017/chuny-bot`
   - Atlas: `mongodb+srv://user:pass@cluster.mongodb.net/chuny-bot`

4. **Crear aplicación de Discord**:
   - Ve a [Discord Developer Portal](https://discord.com/developers/applications)
   - Crea una nueva aplicación
   - Obtén CLIENT_ID y TOKEN
   - Configura permisos del bot

### Scripts de Desarrollo

```bash
npm run dev              # Desarrollo con nodemon
npm run register         # Registrar comandos slash
npm run check-commands   # Verificar comandos registrados
npm run delete-global    # Eliminar comandos globales
```

---

## 📝 Convenciones de Código

### Estilo General

```javascript
// ✅ Usar CommonJS
const { SlashCommandBuilder } = require('discord.js');
const service = require('../services/myService');

// ✅ Async/await preferido sobre .then()
async function handleCommand(interaction) {
  try {
    const result = await service.getData();
    return result;
  } catch (error) {
    console.error('Error:', error);
  }
}

// ✅ Nombres descriptivos en camelCase
const templateCreationSessions = new Map();
const isUserAuthorized = true;
```

### Estructura de Comandos

```javascript
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('comando')
    .setDescription('Descripción del comando')
    .addStringOption(option =>
      option
        .setName('parametro')
        .setDescription('Descripción del parámetro')
        .setRequired(true)
    ),

  async execute(interaction) {
    try {
      // Lógica del comando
      await interaction.reply('Respuesta');
    } catch (error) {
      console.error('Error en comando:', error);
      await interaction.reply({
        content: 'Error ejecutando comando',
        ephemeral: true
      });
    }
  }
};
```

### Manejo de Errores

```javascript
// ✅ Try-catch en funciones async
try {
  const result = await riskyOperation();
  return result;
} catch (error) {
  console.error('[ERROR] Operación falló:', error);
  throw new Error('Mensaje amigable para el usuario');
}

// ✅ Usar embeds para errores de usuario
const { createErrorEmbed } = require('../utils/errorEmbeds');

const errorEmbed = createErrorEmbed(
  'Título del Error',
  'Descripción del error',
  [{ name: 'Solución', value: 'Pasos para resolver', inline: false }]
);
```

---

## 🗄️ Base de Datos

### Modelos Principales

#### Template
```javascript
const templateSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  image: String,
  weapons: { type: mongoose.Schema.Types.Mixed },
  serverId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
```

#### Server
```javascript
const serverSchema = new mongoose.Schema({
  serverId: { type: String, required: true, unique: true },
  serverName: String,
  isPremium: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});
```

#### AuthorizedRole
```javascript
const authorizedRoleSchema = new mongoose.Schema({
  serverId: { type: String, required: true },
  roleId: { type: String, required: true },
  roleName: String,
  addedAt: { type: Date, default: Date.now }
});
```

### Servicios de Base de Datos

```javascript
// Ejemplo: templateService.js
const Template = require('../database/models/Template');

const getTemplatesByServer = async (serverId) => {
  try {
    return await Template.find({ serverId }).sort({ createdAt: -1 });
  } catch (error) {
    console.error('Error obteniendo templates:', error);
    throw error;
  }
};

const updateTemplate = async (templateId, updateData) => {
  try {
    return await Template.findByIdAndUpdate(
      templateId,
      { ...updateData, updatedAt: new Date() },
      { new: true }
    );
  } catch (error) {
    console.error('Error actualizando template:', error);
    throw error;
  }
};
```

---

## 🔐 Sistema de Permisos

### Middleware de Autenticación

```javascript
// middleware/premiumCheck.js
const { isServerPremium } = require('../services/serverService');

const checkPremium = async (interaction) => {
  const serverId = interaction.guild.id;
  const isPremium = await isServerPremium(serverId);
  
  if (!isPremium) {
    const embed = createPremiumEmbed();
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return false;
  }
  
  return true;
};
```

### Filtros de Comandos

```javascript
// utils/commandFilter.js
const commandVisibilityMap = {
  'raid': 'premium_roles_admin',
  'templates': 'premium_roles_admin',
  'premium': 'owner',
  'status': 'all'
};

const filterCommand = async (interaction) => {
  const commandName = interaction.commandName;
  const commandType = commandVisibilityMap[commandName];
  
  // Lógica de filtrado basada en tipo
  switch (commandType) {
    case 'owner':
      return await shouldShowOwnerCommand(interaction);
    case 'premium_roles_admin':
      return await checkPremiumAndRoles(interaction);
    default:
      return true;
  }
};
```

---

## 🎨 Sistema de Plantillas

### Arquitectura de Sesiones

```javascript
// lib/template/template-sessions.js
const templateCreationSessions = new Map();

const createSession = (userId, guildId) => {
  const sessionId = `${userId}_${guildId}_${Date.now()}`;
  const sessionData = {
    userId,
    guildId,
    currentStep: 'basic_info',
    templateData: {},
    createdAt: new Date()
  };
  
  templateCreationSessions.set(sessionId, sessionData);
  return sessionId;
};
```

### Conversión de Datos

```javascript
// Conversión entre formatos de creación y edición
const convertCreationGroupToEditorGroup = (creationGroup) => {
  if (!creationGroup || !creationGroup.weapons) {
    return { weapons: [] };
  }

  const editorWeapons = creationGroup.weapons.map(weapon => ({
    name: weapon.name,
    emoji: weapon.emojiId || weapon.emoji, // Mapeo de emojiId a emoji
    quantity: weapon.units || weapon.quantity || 1, // Soporte para ambos formatos
    image: weapon.image || '',
    url: weapon.url || '',
    sendBuildToPrivate: weapon.sendBuildToPrivate || false
  }));

  return {
    name: creationGroup.name,
    weapons: editorWeapons
  };
};
```

---

## 🧪 Testing y Debugging

### Logging

```javascript
// Usar console.error para errores, evitar console.log en producción
console.error('[ERROR] Template creation failed:', error);
console.warn('[WARN] Deprecated function used');

// Para debugging temporal
if (process.env.NODE_ENV === 'development') {
  console.log('[DEBUG] Session data:', sessionData);
}
```

### Scripts de Verificación

```javascript
// Ejemplo: verificar comandos registrados
const checkCommands = async () => {
  try {
    const commands = await rest.get(Routes.applicationCommands(clientId));
    console.log(`Comandos registrados: ${commands.length}`);
    
    commands.forEach(cmd => {
      console.log(`- ${cmd.name}: ${cmd.description}`);
    });
  } catch (error) {
    console.error('Error verificando comandos:', error);
  }
};
```

---

## 🔄 Flujo de Desarrollo

### Agregar Nuevo Comando

1. **Crear archivo de comando**:
   ```javascript
   // src/commands/utility/nuevo-comando.js
   const { SlashCommandBuilder } = require('discord.js');
   
   module.exports = {
     data: new SlashCommandBuilder()
       .setName('nuevo-comando')
       .setDescription('Descripción'),
     
     async execute(interaction) {
       // Implementación
     }
   };
   ```

2. **Registrar en commandFilter.js**:
   ```javascript
   const commandVisibilityMap = {
     'nuevo-comando': 'premium_roles_admin'
   };
   ```

3. **Registrar comando**:
   ```bash
   npm run register
   ```

### Agregar Nuevo Modelo

1. **Crear modelo**:
   ```javascript
   // src/database/models/NuevoModelo.js
   const mongoose = require('mongoose');
   
   const nuevoSchema = new mongoose.Schema({
     campo: { type: String, required: true }
   });
   
   module.exports = mongoose.model('NuevoModelo', nuevoSchema);
   ```

2. **Crear servicio**:
   ```javascript
   // src/services/nuevoService.js
   const NuevoModelo = require('../database/models/NuevoModelo');
   
   const crear = async (data) => {
     return await NuevoModelo.create(data);
   };
   
   module.exports = { crear };
   ```

---

## 📊 Monitoreo y Performance

### Métricas Importantes

- Tiempo de respuesta de comandos
- Uso de memoria de sesiones
- Conexiones a base de datos
- Errores por comando

### Optimizaciones

```javascript
// ✅ Limpiar sesiones expiradas
const cleanExpiredSessions = () => {
  const now = Date.now();
  const TIMEOUT = 30 * 60 * 1000; // 30 minutos
  
  for (const [sessionId, session] of templateCreationSessions) {
    if (now - session.createdAt.getTime() > TIMEOUT) {
      templateCreationSessions.delete(sessionId);
    }
  }
};

// ✅ Usar índices en MongoDB
templateSchema.index({ serverId: 1, createdAt: -1 });
```

---

## 🚀 Deployment

### Variables de Entorno Requeridas

```env
# Bot Configuration
CLIENT_ID=tu_client_id
TOKEN=tu_bot_token
BOT_OWNER_ID=tu_discord_user_id

# Database
MONGODB_URI=mongodb://localhost:27017/chuny-bot

# Development
GUILD_ID=id_servidor_pruebas
GUILD_COMMANDS=true
NODE_ENV=production
```

### Proceso de Deploy

1. **Preparar entorno**:
   ```bash
   npm ci --production
   npm run register
   ```

2. **Verificar configuración**:
   ```bash
   npm run check-commands
   ```

3. **Iniciar aplicación**:
   ```bash
   npm start
   ```

---

## 🤝 Contribuir al Proyecto

### Proceso de Contribución

1. **Fork del repositorio**
2. **Crear rama feature**: `git checkout -b feature/nueva-funcionalidad`
3. **Implementar cambios** siguiendo las convenciones
4. **Escribir tests** si es aplicable
5. **Commit con mensaje descriptivo**
6. **Push y crear Pull Request**

### Checklist para Pull Requests

- [ ] Código sigue las convenciones del proyecto
- [ ] Funcionalidad probada localmente
- [ ] Documentación actualizada si es necesario
- [ ] No hay console.log en código de producción
- [ ] Manejo de errores implementado
- [ ] Variables de entorno documentadas

---

## 📚 Recursos Adicionales

### Documentación Externa

- [Discord.js Guide](https://discordjs.guide/)
- [MongoDB Documentation](https://docs.mongodb.com/)
- [Mongoose Documentation](https://mongoosejs.com/docs/)
- [Node.js Documentation](https://nodejs.org/docs/)

### Herramientas Recomendadas

- **IDE**: Visual Studio Code
- **Extensions**: Discord.js Snippets, MongoDB for VS Code
- **Database GUI**: MongoDB Compass
- **API Testing**: Postman (para endpoints Express)

---

*¿Tienes preguntas sobre el desarrollo? Abre un issue en GitHub o contacta al equipo de desarrollo.*