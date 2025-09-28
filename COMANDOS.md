# 📚 Documentación Completa de Comandos - Avalon Raid Helper

**Bot de Discord para gestión de raids y actividades de Albion Online**

---

## 📋 Índice de Comandos

1. [🏛️ Template](#-template) - Gestión de plantillas de raid
2. [⚔️ Raid](#️-raid) - Envío de notificaciones de actividades
3. [🎯 Claim](#-claim) - Sistema de reclamación de actividades
4. [⚙️ Claim Config](#️-claim-config) - Configuración de canales para claims
5. [👑 Roles](#-roles) - Gestión de roles autorizados
6. [💰 Economy](#-economy) - Sistema de economía del servidor
7. [📊 Status](#-status) - Información del servidor
8. [🔄 Split](#-split) - Calculadora de división de botín
9. [📤 Upload Weapons](#-upload-weapons) - Carga de armas
10. [🗃️ Show All Weapons](#️-show-all-weapons) - Lista de armas
11. [📂 Show All Categories](#-show-all-categories) - Lista de categorías
12. [🔄 Migrate](#-migrate) - Migración de templates

---

## 🏛️ Template

**Descripción:** Sistema completo de gestión de plantillas de raid para organizar actividades de Albion Online.

### Subcomandos:

#### `/template list`
**Descripción:** Muestra todos los templates disponibles del servidor  
**Permisos:** Usuarios con roles autorizados, administradores y servidores premium  
**Ejemplo:**
```
/template list
```

#### `/template create`
**Descripción:** Crea un nuevo template para el servidor  
**Permisos:** Usuarios con roles autorizados, administradores y servidores premium  
**Ejemplo:**
```
/template create
```
**Proceso interactivo:**
1. Configuración básica (título, descripción, imagen)
2. Selección de roles autorizados
3. Creación de grupos de armas
4. Configuración de armas individuales
5. Guardado automático

#### `/template edit`
**Descripción:** Edita un template existente del servidor  
**Permisos:** Usuarios con roles autorizados, administradores y servidores premium  
**Parámetros:**
- `template` (requerido): Template a editar
**Ejemplo:**
```
/template edit template:Gankeo T8
```
**Funcionalidades:**
- Editar información básica
- Gestionar grupos de armas
- Modificar armas individuales
- Configurar roles autorizados

#### `/template delete`
**Descripción:** Elimina un template del servidor  
**Permisos:** Usuarios con roles autorizados, administradores y servidores premium  
**Parámetros:**
- `template` (requerido): Template a eliminar
**Ejemplo:**
```
/template delete template:Template Obsoleto
```

#### `/template clone`
**Descripción:** Clona un template existente con un nuevo nombre  
**Permisos:** Usuarios con roles autorizados, administradores y servidores premium  
**Parámetros:**
- `template` (requerido): Template a clonar
- `nombre` (requerido): Nombre para el nuevo template
**Ejemplo:**
```
/template clone template:Gankeo T8 nombre:Gankeo T8 Mejorado
```

---

## ⚔️ Raid

**Descripción:** Envía notificaciones para actividades usando plantillas predefinidas.

### Comando Principal:

#### `/raid`
**Descripción:** Envía una notificación para una actividad usando una plantilla  
**Permisos:** Usuarios con roles autorizados, administradores y servidores premium  
**Parámetros:**
- `template` (requerido): Plantilla para esta actividad
- `titulo` (opcional): Título personalizado para la actividad
- `descripcion` (opcional): Descripción personalizada
- `imagen` (opcional): URL de imagen personalizada
- `hora` (opcional): Hora de la actividad (formato: HH:MM)
- `fecha` (opcional): Fecha de la actividad (formato: DD/MM/YYYY)
- `zona` (opcional): Zona horaria (ej: UTC-5, UTC+2)
- `mencion` (opcional): Mencionar @everyone o @here

**Ejemplos:**
```
/raid template:Gankeo T8

/raid template:Gankeo T8 titulo:Gankeo Especial hora:20:30 mencion:@everyone

/raid template:Dungeon T8 descripcion:Dungeon en Roads fecha:25/12/2024 zona:UTC-5
```

**Funcionalidades:**
- Selección interactiva de armas
- Confirmación automática de participación
- Recordatorios automáticos
- Gestión de listas de participantes

---

## 🎯 Claim

**Descripción:** Sistema de reclamación de actividades y recursos de Albion Online.

### Subcomandos:

#### `/claim create`
**Descripción:** Crear un nuevo claim  
**Permisos:** Usuarios con roles autorizados, administradores y servidores premium  
**Parámetros:**
- `actividad` (requerido): Tipo de actividad (ej: Orbe de Poder, Dungeon T8)
- `mapa` (requerido): Mapa donde se realizará (ej: Caerleon, Thetford)
- `tiempo` (requerido): Tiempo hasta completar (ej: 1h 30m, 45m)
- `descripcion` (opcional): Descripción adicional

**Ejemplos:**
```
/claim create actividad:Orbe de Poder mapa:Caerleon tiempo:2h

/claim create actividad:Dungeon T8 mapa:Roads tiempo:45m descripcion:Solo grupo experimentado
```

#### `/claim complete`
**Descripción:** Marcar un claim como completado  
**Permisos:** Creador del claim, usuarios con roles autorizados o administradores  
**Parámetros:**
- `claim_id` (requerido): ID del claim a completar

**Ejemplo:**
```
/claim complete claim_id:CLAIM_123456
```

#### `/claim cancel`
**Descripción:** Cancelar un claim  
**Permisos:** Creador del claim, usuarios con roles autorizados o administradores  
**Parámetros:**
- `claim_id` (requerido): ID del claim a cancelar

**Ejemplo:**
```
/claim cancel claim_id:CLAIM_123456
```

---

## ⚙️ Claim Config

**Descripción:** Configuración de canales para el sistema de claims.

### Subcomandos:

#### `/claim-config set-claims-channel`
**Descripción:** Configurar el canal donde aparecerán todos los claims  
**Permisos:** Usuarios con roles autorizados, administradores y servidores premium  
**Parámetros:**
- `canal` (requerido): Canal donde aparecerán los claims

**Ejemplo:**
```
/claim-config set-claims-channel canal:#claims
```

#### `/claim-config set-reminders-channel`
**Descripción:** Configurar el canal donde aparecerán los recordatorios  
**Permisos:** Usuarios con roles autorizados, administradores y servidores premium  
**Parámetros:**
- `canal` (requerido): Canal donde aparecerán los recordatorios

**Ejemplo:**
```
/claim-config set-reminders-channel canal:#recordatorios
```

#### `/claim-config set-success-channel`
**Descripción:** Canal para claims que llegaron a su tiempo máximo  
**Permisos:** Usuarios con roles autorizados, administradores y servidores premium  
**Parámetros:**
- `canal` (requerido): Canal para claims exitosos

**Ejemplo:**
```
/claim-config set-success-channel canal:#claims-exitosos
```

#### `/claim-config set-closed-channel`
**Descripción:** Canal para claims cancelados manualmente  
**Permisos:** Usuarios con roles autorizados, administradores y servidores premium  
**Parámetros:**
- `canal` (requerido): Canal para claims cerrados

**Ejemplo:**
```
/claim-config set-closed-channel canal:#claims-cerrados
```

#### `/claim-config remove-claims-channel`
**Descripción:** Eliminar la configuración del canal de claims  
**Permisos:** Usuarios con roles autorizados, administradores y servidores premium

#### `/claim-config remove-reminders-channel`
**Descripción:** Eliminar la configuración del canal de recordatorios  
**Permisos:** Usuarios con roles autorizados, administradores y servidores premium

#### `/claim-config remove-success-channel`
**Descripción:** Eliminar configuración del canal de claims exitosos  
**Permisos:** Usuarios con roles autorizados, administradores y servidores premium

#### `/claim-config remove-closed-channel`
**Descripción:** Eliminar configuración del canal de claims cerrados  
**Permisos:** Usuarios con roles autorizados, administradores y servidores premium

#### `/claim-config view`
**Descripción:** Ver la configuración actual de canales  
**Permisos:** Usuarios con roles autorizados, administradores y servidores premium

---

## 👑 Roles

**Descripción:** Gestiona los roles autorizados para enviar notificaciones a todos los usuarios.

### Subcomandos:

#### `/roles add`
**Descripción:** Agrega un rol a la lista de autorizados  
**Permisos:** Administradores  
**Parámetros:**
- `rol` (requerido): Rol a autorizar

**Ejemplo:**
```
/roles add rol:@Líder de Raid
```

#### `/roles remove`
**Descripción:** Elimina un rol de la lista de autorizados  
**Permisos:** Administradores  
**Parámetros:**
- `rol` (requerido): Rol a desautorizar

**Ejemplo:**
```
/roles remove rol:@Líder de Raid
```

#### `/roles list`
**Descripción:** Lista todos los roles autorizados  
**Permisos:** Administradores

#### `/roles clear`
**Descripción:** Elimina todos los roles autorizados del servidor  
**Permisos:** Administradores

---

## 💰 Economy

**Descripción:** Sistema de economía del servidor para gestionar dinero virtual.

### Subcomandos:

#### `/economy add`
**Descripción:** Añade dinero a un usuario  
**Permisos:** Usuarios con roles autorizados, administradores y servidores premium  
**Parámetros:**
- `usuario` (requerido): Usuario al que añadir dinero
- `cantidad` (requerido): Cantidad de dinero a añadir
- `razon` (opcional): Razón para añadir el dinero

**Ejemplo:**
```
/economy add usuario:@Juan cantidad:1000000 razon:Ganancia por gankeo exitoso
```

#### `/economy remove`
**Descripción:** Elimina dinero de un usuario  
**Permisos:** Usuarios con roles autorizados, administradores y servidores premium  
**Parámetros:**
- `usuario` (requerido): Usuario al que eliminar dinero
- `cantidad` (requerido): Cantidad de dinero a eliminar
- `razon` (opcional): Razón para eliminar el dinero

**Ejemplo:**
```
/economy remove usuario:@Juan cantidad:500000 razon:Penalización por abandono
```

#### `/economy balance`
**Descripción:** Muestra el balance de un usuario  
**Permisos:** Usuarios con roles autorizados, administradores y servidores premium  
**Parámetros:**
- `usuario` (opcional): Usuario del que ver el balance

**Ejemplos:**
```
/economy balance

/economy balance usuario:@Juan
```

#### `/economy top`
**Descripción:** Muestra el top de usuarios con más dinero  
**Permisos:** Usuarios con roles autorizados, administradores y servidores premium  
**Parámetros:**
- `cantidad` (opcional): Número de usuarios a mostrar (máximo 20)

**Ejemplo:**
```
/economy top cantidad:10
```

---

## 📊 Status

**Descripción:** Muestra información de estado del servidor y templates.

### Comando Principal:

#### `/status`
**Descripción:** Información de estado del servidor y templates  
**Permisos:** Todos los usuarios

**Información mostrada:**
- Estado del servidor
- Número de templates
- Estado premium
- Estadísticas de uso
- Información del bot

---

## 🔄 Split

**Descripción:** Calculadora de división de botín entre jugadores.

### Comando Principal:

#### `/split`
**Descripción:** Calcula la división de botín entre jugadores  
**Permisos:** Usuarios con roles autorizados, administradores y servidores premium  
**Parámetros:**
- `motivo` (requerido): Motivo de la división del botín
- `cantidad` (requerido): Cantidad total de dinero a dividir
- `jugadores` (requerido): Número de jugadores entre los que dividir
- `impuesto` (opcional): Porcentaje de impuesto a descontar (0-50%)

**Ejemplos:**
```
/split motivo:Gankeo T8 cantidad:10000000 jugadores:5

/split motivo:Dungeon Roads cantidad:5000000 jugadores:3 impuesto:10
```

**Funcionalidades:**
- Cálculo automático de división
- Aplicación de impuestos
- Formato de moneda legible
- Resumen detallado de la división

---

## 📤 Upload Weapons

**Descripción:** Sube armas desde el archivo weapons.json (solo propietario del bot).

### Comando Principal:

#### `/upload_weapons`
**Descripción:** Carga armas desde weapons.json  
**Permisos:** Propietario del bot

**Funcionalidades:**
- Carga masiva de armas
- Validación de datos
- Actualización de base de datos
- Reporte de resultados

---

## 🗃️ Show All Weapons

**Descripción:** Lista todas las armas disponibles en la base de datos.

### Comando Principal:

#### `/show_all_weapons`
**Descripción:** Muestra todas las armas en la base de datos  
**Permisos:** Usuarios con roles autorizados, administradores y servidores premium

**Información mostrada:**
- Lista completa de armas
- Categorías de armas
- Emojis asociados
- Estadísticas de uso

---

## 📂 Show All Categories

**Descripción:** Lista todas las categorías de armas disponibles.

### Comando Principal:

#### `/show_all_categories`
**Descripción:** Lista todas las categorías de armas  
**Permisos:** Usuarios con roles autorizados, administradores y servidores premium

**Información mostrada:**
- Categorías disponibles
- Número de armas por categoría
- Emojis de categorías

---

## 🔄 Migrate

**Descripción:** Migra un template desde un archivo JSON adjunto.

### Comando Principal:

#### `/migrate`
**Descripción:** Migra un template desde un archivo JSON  
**Permisos:** Usuarios con roles autorizados, administradores y servidores premium  
**Parámetros:**
- `archivo` (requerido): Archivo .json con la definición del template

**Ejemplo:**
```
/migrate archivo:[adjuntar archivo .json]
```

**Funcionalidades:**
- Importación de templates externos
- Validación de estructura JSON
- Conversión automática de formatos
- Integración con sistema existente

---

## 🔧 Configuración y Permisos

### Niveles de Permisos:

1. **Todos los usuarios**: Solo comando `/status`
2. **Usuarios con roles autorizados**: Mayoría de comandos del bot
3. **Administradores**: Gestión de roles y configuración avanzada
4. **Propietario del bot**: Comandos de administración global
5. **Servidores Premium**: Acceso completo a todas las funcionalidades

### Variables de Entorno Requeridas:

```env
TOKEN=tu_token_del_bot
CLIENT_ID=id_del_cliente
GUILD_ID=id_del_servidor
MONGODB_URI=uri_de_mongodb
```

### Ejecución:

```bash
# Desarrollo
npm run dev

# Producción
npm start

# Registro de comandos
npm run register
```

---

## 📞 Soporte y Contribución

Para reportar problemas o sugerir mejoras, contacta con el equipo de desarrollo del bot.

**Versión:** 1.0.0  
**Última actualización:** 2024

---

*Esta documentación cubre todos los comandos disponibles en Avalon Raid Helper. Para obtener ayuda específica sobre un comando, utiliza la funcionalidad de ayuda integrada de Discord.*