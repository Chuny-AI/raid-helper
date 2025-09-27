# 🤖 Chuny BOT

**Bot de Discord especializado para la gestión de actividades y raids en Albion Online**

[![Discord.js](https://img.shields.io/badge/Discord.js-v14.16.2-blue.svg)](https://discord.js.org/)
[![Node.js](https://img.shields.io/badge/Node.js-v22.12.0-green.svg)](https://nodejs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Database-green.svg)](https://www.mongodb.com/)
[![License](https://img.shields.io/badge/License-Custom-red.svg)](LICENSE)

---

## 📋 Descripción

Chuny BOT es un bot de Discord diseñado específicamente para comunidades de Albion Online. Facilita la organización de raids, gestión de plantillas de actividades, sistema de claims, decodificación de dungeons y mucho más.

### ✨ Características Principales

- 🎯 **Sistema de Raids**: Crea notificaciones de actividades usando plantillas personalizables
- 📝 **Gestión de Plantillas**: Editor completo para crear y modificar plantillas de raids
- 🏆 **Sistema de Claims**: Reserva actividades y recursos con tiempo limitado
- 🔓 **Decodificación de Dungeons**: Herramientas para decodificar información de dungeons
- ⚔️ **Base de Datos de Armas**: Catálogo completo de armas de Albion Online
- 💎 **Sistema Premium**: Funcionalidades avanzadas para servidores premium
- 🔐 **Control de Permisos**: Sistema granular de roles y autorizaciones
- 📊 **División de Botín**: Calculadora automática para repartir ganancias

---

## 🚀 Instalación Rápida

### Prerrequisitos

- [Node.js](https://nodejs.org/) v22.12.0 o superior
- [MongoDB](https://www.mongodb.com/) (local o MongoDB Atlas)
- Una aplicación de Discord con permisos de bot

### Pasos de Instalación

1. **Clona el repositorio**
   ```bash
   git clone https://github.com/M8-Babbage/avalon-raid-helper.git
   cd avalon-raid-helper
   ```

2. **Instala las dependencias**
   ```bash
   npm install
   ```

3. **Configura las variables de entorno**
   ```bash
   cp .env.example .env
   ```
   
   Edita el archivo `.env` con tus credenciales:
   ```env
   CLIENT_ID=tu_client_id_del_bot
   TOKEN=tu_token_del_bot
   MONGODB_URI=tu_uri_de_mongodb
   BOT_OWNER_ID=tu_discord_user_id
   GUILD_ID=id_del_servidor_de_pruebas
   GUILD_COMMANDS=true
   ```

4. **Registra los comandos**
   ```bash
   npm run register
   ```

5. **Inicia el bot**
   ```bash
   npm start
   ```

---

## 🎮 Comandos Disponibles

### 📊 Comandos Básicos (Todos los usuarios)
- `/status` - Muestra el estado del bot y estadísticas del servidor

### 🎯 Gestión de Raids (Premium + Roles autorizados)
- `/raid` - Crea notificaciones de raids usando plantillas
- `/templates` - Lista todas las plantillas disponibles del servidor

### 📝 Gestión de Plantillas (Premium + Roles autorizados)
- `/template create` - Crea una nueva plantilla interactivamente
- `/template edit` - Edita plantillas existentes
- `/template delete` - Elimina plantillas
- `/template clone` - Clona plantillas existentes
- `/template list` - Lista todas las plantillas

### ⚔️ Sistema de Armas (Premium + Roles autorizados)
- `/show_all_weapons` - Lista todas las armas disponibles
- `/show_all_categories` - Muestra categorías de armas

### 🏆 Sistema de Claims (Premium)
- `/claim create` - Crea un claim para reservar actividades
- `/claim list` - Lista tus claims activos
- `/claim cancel` - Cancela un claim existente
- `/claim-config` - Configura canales para claims (Admin)

### 🔓 Decodificación (Usuarios autorizados)
- `/decode-file` - Decodifica dungeons desde archivos
- `/decode-users` - Gestiona usuarios autorizados (Owner)

### 💰 Utilidades (Premium)
- `/split` - Calcula división de botín entre jugadores

### 🔐 Administración
- `/roles` - Gestiona roles autorizados (Admin)
- `/premium` - Gestiona estado premium (Owner)
- `/upload_weapons` - Actualiza base de datos de armas (Owner)

---

## ⚙️ Configuración

### Sistema de Permisos

El bot implementa un sistema de permisos por niveles:

- **👑 Owner**: Acceso completo a todos los comandos
- **🛡️ Administradores**: Comandos de gestión y configuración
- **🎖️ Roles Autorizados**: Comandos de raids y plantillas
- **👥 Usuarios Premium**: Comandos básicos en servidores premium
- **🆓 Usuarios Básicos**: Solo comandos informativos

### Sistema Premium

- **Activación**: Solo el owner puede activar premium con `/premium set`
- **Funcionalidades Premium**:
  - Creación y uso de plantillas
  - Sistema de claims
  - División de botín
  - Comandos de raids
- **Verificación**: Usa `/premium check` para verificar el estado

### Gestión de Roles

Los administradores pueden autorizar roles específicos:
```
/roles add @RolRaiders    # Autoriza un rol
/roles remove @RolRaiders # Desautoriza un rol
/roles list               # Lista roles autorizados
/roles clear              # Limpia todos los roles
```

---

## 🛠️ Scripts Disponibles

```bash
npm start              # Inicia el bot en producción
npm run dev            # Inicia en modo desarrollo con nodemon
npm run register       # Registra comandos slash
npm run delete-global  # Elimina comandos globales
npm run check-commands # Verifica comandos registrados
```

---

## 🏗️ Arquitectura del Proyecto

```
avalon-raid-helper/
├── src/
│   ├── commands/          # Comandos slash del bot
│   ├── database/          # Modelos de MongoDB
│   ├── events/            # Eventos de Discord.js
│   ├── lib/               # Librerías compartidas
│   ├── middleware/        # Middleware de permisos
│   ├── services/          # Servicios de negocio
│   ├── utils/             # Utilidades y helpers
│   └── weapons/           # Base de datos de armas
├── .env.example           # Plantilla de variables de entorno
├── package.json           # Dependencias y scripts
└── README.md             # Este archivo
```

---

## 🔧 Tecnologías

- **[Node.js](https://nodejs.org/)** - Runtime de JavaScript
- **[Discord.js v14](https://discord.js.org/)** - Librería para Discord API
- **[MongoDB](https://www.mongodb.com/)** - Base de datos NoSQL
- **[Mongoose](https://mongoosejs.com/)** - ODM para MongoDB
- **[Express](https://expressjs.com/)** - Framework web (para endpoints adicionales)
- **[Node Schedule](https://github.com/node-schedule/node-schedule)** - Programador de tareas

---

## 📚 Guías Adicionales

### Para Usuarios
- [Guía de Comandos Básicos](docs/user-guide.md)
- [Cómo Crear Plantillas](docs/template-guide.md)
- [Sistema de Claims](docs/claims-guide.md)

### Para Administradores
- [Configuración del Servidor](docs/admin-guide.md)
- [Gestión de Permisos](docs/permissions-guide.md)
- [Activación Premium](docs/premium-guide.md)

### Para Desarrolladores
- [Guía de Desarrollo](docs/development-guide.md)
- [API Reference](docs/api-reference.md)
- [Contribuir al Proyecto](docs/contributing.md)

---

## 🤝 Contribuir

¡Las contribuciones son bienvenidas! Si tienes sugerencias o mejoras:

1. Fork el repositorio
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

---

## 📄 Licencia

Este proyecto está bajo la Licencia Custom Attribution - ver el archivo [LICENSE](LICENSE) para más detalles.

---

## 👨‍💻 Autor

**Edwin J. Páez** - [@M8-Babbage](https://github.com/M8-Babbage)

---

## 🆘 Soporte

Si necesitas ayuda o tienes preguntas:

- 📧 Contacta al desarrollador
- 🐛 Reporta bugs en [Issues](https://github.com/M8-Babbage/avalon-raid-helper/issues)
- 💡 Sugiere nuevas características

---

## 📈 Estado del Proyecto

- ✅ Sistema de raids funcional
- ✅ Editor de plantillas completo
- ✅ Sistema de claims implementado
- ✅ Decodificación de dungeons
- ✅ Sistema premium activo
- 🔄 Mejoras continuas en desarrollo

---

*Bot desarrollado con ❤️ para la comunidad de Albion Online*