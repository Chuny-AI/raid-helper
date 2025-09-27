# 🚀 Guía de Instalación - Chuny BOT

Esta guía te ayudará a instalar y configurar el Chuny BOT desde cero.

---

## 📋 Requisitos Previos

### Sistema Operativo
- **Windows**: Windows 10/11 (recomendado)
- **Linux**: Ubuntu 18.04+ o distribuciones similares
- **macOS**: macOS 10.15+

### Software Requerido

#### Node.js
- **Versión**: 18.0.0 o superior
- **Descarga**: [nodejs.org](https://nodejs.org/)
- **Verificación**:
  ```bash
  node --version
  npm --version
  ```

#### MongoDB
- **Opción 1**: MongoDB Atlas (recomendado para principiantes)
- **Opción 2**: MongoDB local
- **Descarga**: [mongodb.com](https://www.mongodb.com/)

#### Git
- **Descarga**: [git-scm.com](https://git-scm.com/)
- **Verificación**:
  ```bash
  git --version
  ```

---

## 🔧 Instalación Paso a Paso

### 1. Clonar el Repositorio

```bash
# Clonar el proyecto
git clone https://github.com/tu-usuario/chuny-bot.git

# Navegar al directorio
cd chuny-bot

# Verificar archivos
ls -la
```

### 2. Instalar Dependencias

```bash
# Instalar todas las dependencias
npm install

# Verificar instalación
npm list --depth=0
```

**Dependencias principales instaladas:**
- `discord.js`: Librería para Discord
- `mongoose`: ODM para MongoDB
- `express`: Servidor web
- `node-schedule`: Programación de tareas

### 3. Configurar Variables de Entorno

#### Crear archivo de configuración
```bash
# Copiar archivo de ejemplo
cp env.example .env

# Editar configuración (usar tu editor preferido)
nano .env
```

#### Configuración básica (.env)
```env
# Discord Bot Configuration
DISCORD_TOKEN=tu_token_del_bot_aqui
CLIENT_ID=id_de_tu_aplicacion_discord

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/chuny-bot
# O para MongoDB Atlas:
# MONGODB_URI=mongodb+srv://usuario:password@cluster.mongodb.net/chuny-bot

# Bot Configuration
BOT_OWNER_ID=tu_user_id_de_discord
PREFIX=!

# Server Configuration (opcional)
PORT=3000
NODE_ENV=production

# Premium Configuration (opcional)
PREMIUM_ROLE_ID=id_del_rol_premium
```

### 4. Configurar Bot de Discord

#### Crear Aplicación en Discord
1. Ve a [Discord Developer Portal](https://discord.com/developers/applications)
2. Clic en "New Application"
3. Nombra tu aplicación (ej: "Chuny BOT")
4. Ve a la sección "Bot"
5. Clic en "Add Bot"
6. Copia el **Token** y ponlo en `DISCORD_TOKEN`
7. Copia el **Application ID** y ponlo en `CLIENT_ID`

#### Configurar Permisos del Bot
**Permisos requeridos:**
- `Send Messages`
- `Use Slash Commands`
- `Embed Links`
- `Attach Files`
- `Read Message History`
- `Manage Messages`
- `Add Reactions`
- `Use External Emojis`

**URL de invitación:**
```
https://discord.com/api/oauth2/authorize?client_id=TU_CLIENT_ID&permissions=274877908032&scope=bot%20applications.commands
```

### 5. Configurar Base de Datos

#### Opción A: MongoDB Atlas (Recomendado)

1. **Crear cuenta**: [mongodb.com/atlas](https://www.mongodb.com/atlas)
2. **Crear cluster gratuito**
3. **Configurar usuario de base de datos**
4. **Obtener string de conexión**
5. **Actualizar MONGODB_URI en .env**

```env
MONGODB_URI=mongodb+srv://usuario:password@cluster.mongodb.net/chuny-bot?retryWrites=true&w=majority
```

#### Opción B: MongoDB Local

1. **Instalar MongoDB Community**
2. **Iniciar servicio**:
   ```bash
   # Windows
   net start MongoDB
   
   # Linux/macOS
   sudo systemctl start mongod
   ```
3. **Configurar URI**:
   ```env
   MONGODB_URI=mongodb://localhost:27017/chuny-bot
   ```

### 6. Inicializar Base de Datos

```bash
# Ejecutar script de inicialización (si existe)
npm run init-db

# O iniciar el bot para crear colecciones automáticamente
npm start
```

---

## 🎯 Configuración Inicial

### 1. Registrar Comandos Slash

```bash
# Registrar comandos en Discord
npm run register

# Verificar comandos registrados
npm run check-commands
```

### 2. Cargar Datos Iniciales

#### Cargar armas (si tienes weapons.json)
```bash
# Usar comando en Discord
/upload_weapons

# O ejecutar script directamente
node scripts/load-weapons.js
```

#### Verificar instalación
```bash
# Iniciar en modo desarrollo
npm run dev

# Verificar logs
tail -f logs/bot.log
```

### 3. Configurar Servidor de Discord

#### Comandos básicos de configuración:
```
/premium set true          # Activar premium (solo owner)
/roles add @RolRaiders     # Agregar rol autorizado
/claim-config #canal       # Configurar canal de claims
```

---

## 🔍 Verificación de Instalación

### Lista de Verificación

- [ ] **Node.js instalado** (v18+)
- [ ] **MongoDB funcionando**
- [ ] **Bot creado en Discord**
- [ ] **Token configurado en .env**
- [ ] **Dependencias instaladas**
- [ ] **Comandos registrados**
- [ ] **Bot conectado a Discord**
- [ ] **Base de datos conectada**
- [ ] **Comandos básicos funcionando**

### Comandos de Prueba

```bash
# Verificar conexión a Discord
/latency

# Verificar base de datos
/templates list

# Verificar permisos
/roles list

# Verificar sistema de armas
/show_all_weapons
```

---

## 🚨 Solución de Problemas Comunes

### Error: "Invalid Token"
```
❌ Problema: Token de Discord inválido
✅ Solución: 
   1. Verificar DISCORD_TOKEN en .env
   2. Regenerar token en Discord Developer Portal
   3. Reiniciar el bot
```

### Error: "Cannot connect to MongoDB"
```
❌ Problema: No se puede conectar a la base de datos
✅ Solución:
   1. Verificar MONGODB_URI en .env
   2. Verificar que MongoDB esté ejecutándose
   3. Verificar credenciales (Atlas)
   4. Verificar firewall/red
```

### Error: "Missing Permissions"
```
❌ Problema: Bot sin permisos suficientes
✅ Solución:
   1. Verificar permisos del bot en el servidor
   2. Mover rol del bot arriba en la jerarquía
   3. Re-invitar bot con permisos correctos
```

### Error: "Commands not appearing"
```
❌ Problema: Comandos slash no aparecen
✅ Solución:
   1. Ejecutar: npm run register
   2. Esperar hasta 1 hora para propagación
   3. Verificar CLIENT_ID en .env
   4. Reiniciar Discord (cliente)
```

### Error: "Module not found"
```
❌ Problema: Dependencias faltantes
✅ Solución:
   1. Ejecutar: npm install
   2. Verificar package.json
   3. Limpiar cache: npm cache clean --force
   4. Reinstalar: rm -rf node_modules && npm install
```

---

## 🔧 Configuración Avanzada

### Variables de Entorno Adicionales

```env
# Logging
LOG_LEVEL=info
LOG_FILE=logs/bot.log

# Rate Limiting
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=10

# Cache
CACHE_TTL=300000

# Backup
BACKUP_INTERVAL=86400000
BACKUP_PATH=./backups

# Monitoring
HEALTH_CHECK_PORT=3001
METRICS_ENABLED=true
```

### Configuración de Producción

#### PM2 (Recomendado)
```bash
# Instalar PM2
npm install -g pm2

# Crear archivo ecosystem
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'chuny-bot',
    script: 'index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    }
  }]
}
EOF

# Iniciar con PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

#### Docker (Alternativo)
```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
EXPOSE 3000

CMD ["npm", "start"]
```

### Configuración de Nginx (Opcional)
```nginx
server {
    listen 80;
    server_name tu-dominio.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 📊 Monitoreo y Mantenimiento

### Logs
```bash
# Ver logs en tiempo real
tail -f logs/bot.log

# Buscar errores
grep "ERROR" logs/bot.log

# Logs con PM2
pm2 logs chuny-bot
```

### Backup de Base de Datos
```bash
# MongoDB local
mongodump --db chuny-bot --out ./backup/$(date +%Y%m%d)

# MongoDB Atlas
mongodump --uri "tu_uri_de_atlas" --out ./backup/$(date +%Y%m%d)
```

### Actualizaciones
```bash
# Actualizar código
git pull origin main

# Actualizar dependencias
npm update

# Reiniciar bot
pm2 restart chuny-bot
```

---

## 🆘 Soporte

### Recursos de Ayuda
- **Documentación**: `/docs`
- **GitHub Issues**: [Reportar problemas](https://github.com/tu-usuario/chuny-bot/issues)
- **Discord**: Servidor de soporte
- **Email**: soporte@chuny-bot.com

### Información del Sistema
```bash
# Información del bot
/debug system

# Información de la base de datos
/debug database

# Información de memoria
/debug memory
```

---

*¿Necesitas ayuda adicional? Consulta la [Guía de Administrador](admin-guide.md) o contacta al soporte técnico.*