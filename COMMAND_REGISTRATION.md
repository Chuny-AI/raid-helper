# Sistema de Registro de Comandos

Este bot incluye un sistema flexible para registrar comandos tanto globalmente como en servidores específicos, ideal para desarrollo y producción.

## Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto con las siguientes variables:

```env
# Discord Bot Configuration
DISCORD_TOKEN=your_discord_token_here
CLIENT_ID=your_bot_client_id_here
BOT_OWNER_ID=464241835930419210

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/avalon-raid-helper

# Command Registration Configuration
# Set to true to register commands only in a specific guild (for development)
# Set to false to register commands globally (for production)
GUILD_COMMANDS=false

# Guild ID for development (only used when GUILD_COMMANDS=true)
# Get this by right-clicking on your server and selecting "Copy Server ID"
GUILD_ID=your_guild_id_here
```

## Modos de Funcionamiento

### Modo de Desarrollo (Guild Commands)
- **Ventaja**: Los comandos se actualizan instantáneamente (sin cache)
- **Uso**: Ideal para testing y desarrollo
- **Configuración**: `GUILD_COMMANDS=true` y `GUILD_ID=tu_servidor_id`

### Modo de Producción (Global Commands)
- **Ventaja**: Los comandos están disponibles en todos los servidores
- **Desventaja**: Pueden tardar hasta 1 hora en actualizarse
- **Configuración**: `GUILD_COMMANDS=false`

## Scripts Disponibles

### Iniciar el Bot
```bash
# Modo desarrollo (con watch)
npm start

# Modo producción
npm run start:prod
```

### Registrar Comandos Manualmente
```bash
# Registrar comandos globalmente
npm run register:global

# Registrar comandos en servidor específico
npm run register:guild

# Limpiar comandos globales
npm run clear:global

# Limpiar comandos de servidor
npm run clear:guild
```

### Usar el Script de Registro Directamente
```bash
# Registrar comandos globalmente
node register-commands.js global

# Registrar comandos en servidor específico
node register-commands.js guild

# Limpiar comandos globales
node register-commands.js clear-global

# Limpiar comandos de servidor
node register-commands.js clear-guild

# Ver ayuda
node register-commands.js
```

## Flujo de Trabajo Recomendado

### Para Desarrollo:
1. Configura `GUILD_COMMANDS=true` en tu `.env`
2. Agrega tu `GUILD_ID` en el `.env`
3. Ejecuta `npm start` - los comandos se registrarán automáticamente en tu servidor
4. Los cambios se reflejan instantáneamente

### Para Producción:
1. Configura `GUILD_COMMANDS=false` en tu `.env`
2. Ejecuta `npm run start:prod` - los comandos se registrarán globalmente
3. Los cambios pueden tardar hasta 1 hora en reflejarse

## Solución de Problemas

### Comandos No Aparecen
- Verifica que `DISCORD_TOKEN` y `CLIENT_ID` sean correctos
- Para guild commands, verifica que `GUILD_ID` sea correcto
- Asegúrate de que el bot tenga permisos en el servidor

### Error de Permisos
- El bot necesita el scope `applications.commands`
- Para guild commands, el bot debe estar en el servidor

### Comandos Cacheados
- Usa guild commands para desarrollo (`GUILD_COMMANDS=true`)
- Los comandos globales pueden tardar hasta 1 hora en actualizarse

## Estructura de Archivos

```
├── index.js                 # Punto de entrada principal
├── register-commands.js     # Script para registro manual
├── package.json            # Scripts npm
├── .env                    # Variables de entorno (crear manualmente)
└── src/
    └── commands/           # Comandos del bot
```

## Notas Importantes

- **Guild Commands**: Se actualizan instantáneamente, perfectos para desarrollo
- **Global Commands**: Tardan hasta 1 hora en actualizarse, ideales para producción
- **Cache**: Discord cachea los comandos globales, los guild commands no tienen cache
- **Límites**: Discord tiene límites de rate para comandos globales (200 por día)
