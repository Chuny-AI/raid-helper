# 🏛️ Avalon Raid Helper

**Bot de Discord para gestión de raids y actividades de Albion Online**

## 📖 Documentación

Para obtener información completa sobre todos los comandos disponibles, consulta:

**[📚 COMANDOS.md](./COMANDOS.md)** - Documentación completa de todos los comandos

## 🚀 Inicio Rápido

### Instalación

1. Clona el repositorio
2. Instala las dependencias: `npm install`
3. Configura las variables de entorno en `.env`
4. Ejecuta el bot: `npm start`

### Variables de Entorno

```env
TOKEN=tu_token_del_bot
CLIENT_ID=id_del_cliente
GUILD_ID=id_del_servidor
MONGODB_URI=uri_de_mongodb
```

## 🎯 Características Principales

- **Sistema de Templates**: Crea y gestiona plantillas de raid personalizadas
- **Notificaciones de Raid**: Envía notificaciones organizadas con selección de armas
- **Sistema de Claims**: Reclama actividades y recursos de Albion Online
- **Economía del Servidor**: Gestiona dinero virtual y recompensas
- **Decodificación de Archivos**: Analiza datos de herramientas de Albion Online
- **Gestión de Roles**: Controla permisos y accesos
- **Calculadora de Botín**: Divide ganancias entre jugadores

## 📋 Comandos Principales

| Comando | Descripción |
|---------|-------------|
| `/template` | Gestión completa de plantillas de raid |
| `/raid` | Envío de notificaciones de actividades |
| `/claim` | Sistema de reclamación de actividades |
| `/economy` | Gestión de economía del servidor |
| `/roles` | Administración de roles autorizados |

**Ver documentación completa:** [COMANDOS.md](./COMANDOS.md)

## 🔧 Scripts Disponibles

```bash
npm start          # Ejecutar en producción
npm run dev        # Ejecutar en desarrollo
npm run register   # Registrar comandos slash
```

## 📞 Soporte

Para obtener ayuda o reportar problemas, contacta con el equipo de desarrollo.

---

**Versión:** 1.0.0  
**Licencia:** ISC

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