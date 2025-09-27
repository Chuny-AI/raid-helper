# 📋 Referencia de Comandos - Chuny BOT

Guía completa de todos los comandos disponibles en el Chuny BOT, organizados por categoría y nivel de acceso.

---

## 🎯 Comandos Generales

### `/latency`
**Descripción**: Muestra la latencia del bot y la API de Discord.

**Uso**: `/latency`

**Permisos**: Todos los usuarios

**Ejemplo de respuesta**:
```
🏓 Pong!
Latencia del bot: 45ms
Latencia de la API: 120ms
```

---

## ⚔️ Sistema de Raids

### `/raid`
**Descripción**: Crea una raid usando una plantilla existente.

**Uso**: `/raid template:<nombre> time:<tiempo> [title:<título>]`

**Parámetros**:
- `template` (requerido): Nombre de la plantilla a usar
- `time` (requerido): Hora de la raid (formato: HH:MM o "ahora")
- `title` (opcional): Título personalizado para la raid

**Permisos**: Usuarios con roles autorizados

**Ejemplos**:
```
/raid template:ZvZ time:20:30
/raid template:Dungeon time:ahora title:Raid Especial
/raid template:Ganking time:15:45 title:Ganking Caerleon
```

**Respuesta**: Embed con información de la raid y botones de reacción para unirse.

---

## 📝 Sistema de Plantillas

### `/template list`
**Descripción**: Muestra todas las plantillas disponibles en el servidor.

**Uso**: `/template list`

**Permisos**: Usuarios con roles autorizados

**Respuesta**: Lista paginada de plantillas con información básica.

### `/template create`
**Descripción**: Inicia el proceso de creación de una nueva plantilla.

**Uso**: `/template create`

**Permisos**: Usuarios con roles autorizados

**Proceso**:
1. Configuración básica (título, descripción, imagen)
2. Selección de categorías de armas
3. Configuración de armas específicas
4. Confirmación y guardado

**Características**:
- Interfaz interactiva con botones y menús
- Previsualización en tiempo real
- Validación de datos
- Soporte para múltiples grupos de armas

---

## 🏆 Sistema de Claims

### `/claim create`
**Descripción**: Crea un nuevo claim para reservar una actividad.

**Uso**: `/claim create activity:<actividad> map:<mapa> time:<duración> [description:<descripción>]`

**Parámetros**:
- `activity` (requerido): Tipo de actividad (ej: "Orbe de Poder T8")
- `map` (requerido): Mapa donde se realizará (ej: "Caerleon")
- `time` (requerido): Duración estimada (ej: "1h 30m")
- `description` (opcional): Descripción adicional

**Permisos**: Todos los usuarios

**Ejemplos**:
```
/claim create activity:Orbe de Poder T8 map:Caerleon time:2h
/claim create activity:Dungeon Solo map:Roads time:45m description:Farm de plata
```

**Características**:
- Expiración automática
- Notificaciones de recordatorio
- Cancelación automática al expirar

### `/claim-config`
**Descripción**: Configura el canal donde se enviarán los claims.

**Uso**: `/claim-config channel:<canal>`

**Parámetros**:
- `channel` (requerido): Canal de texto donde enviar claims

**Permisos**: Administradores

**Ejemplo**:
```
/claim-config channel:#claims
```

---

## ⚔️ Base de Datos de Armas

### `/show_all_weapons`
**Descripción**: Muestra todas las armas disponibles en la base de datos.

**Uso**: `/show_all_weapons`

**Permisos**: Todos los usuarios

**Respuesta**: Lista paginada de armas con emojis, nombres y categorías.

### `/show_all_categories`
**Descripción**: Muestra todas las categorías de armas disponibles.

**Uso**: `/show_all_categories`

**Permisos**: Todos los usuarios

**Respuesta**: Lista de categorías con conteo de armas por categoría.

### `/upload_weapons`
**Descripción**: Carga armas desde el archivo weapons.json a la base de datos.

**Uso**: `/upload_weapons`

**Permisos**: Solo owner del bot

**Proceso**:
- Lee el archivo `weapons.json`
- Valida formato de datos
- Inserta/actualiza armas en la base de datos
- Reporta estadísticas de la operación

---

## 💰 Sistema de División de Loot

### `/split`
**Descripción**: Calcula la división de loot entre jugadores.

**Uso**: `/split reason:<razón> total:<cantidad> players:<jugadores> [tax:<impuesto>]`

**Parámetros**:
- `reason` (requerido): Razón de la división (ej: "ZvZ Caerleon")
- `total` (requerido): Cantidad total a dividir
- `players` (requerido): Número de jugadores
- `tax` (opcional): Porcentaje de impuesto (0-100)

**Permisos**: Usuarios con roles autorizados

**Ejemplos**:
```
/split reason:ZvZ Caerleon total:50000000 players:20
/split reason:Dungeon Group total:5000000 players:5 tax:10
```

**Respuesta**: Embed con cálculos detallados de la división.

---

## 🔓 Sistema de Decodificación

### `/decode-file`
**Descripción**: Decodifica archivos hexadecimales de Albion Online.

**Uso**: `/decode-file` (con archivo adjunto)

**Permisos**: Usuarios autorizados para decodificación

**Proceso**:
1. Subir archivo .txt con datos hexadecimales
2. El bot procesa y decodifica el contenido
3. Respuesta con información decodificada

**Formatos soportados**:
- Datos de dungeon
- Información de jugadores
- Estadísticas de combate

### `/decode-users add`
**Descripción**: Agrega un usuario a la lista de autorizados para decodificación.

**Uso**: `/decode-users add user:<usuario> [reason:<razón>]`

**Parámetros**:
- `user` (requerido): Usuario a autorizar
- `reason` (opcional): Razón de la autorización

**Permisos**: Solo owner del bot

### `/decode-users remove`
**Descripción**: Remueve un usuario de la lista de autorizados.

**Uso**: `/decode-users remove user:<usuario>`

**Permisos**: Solo owner del bot

### `/decode-users list`
**Descripción**: Muestra todos los usuarios autorizados para decodificación.

**Uso**: `/decode-users list`

**Permisos**: Solo owner del bot

---

## 👥 Gestión de Roles

### `/roles add`
**Descripción**: Agrega un rol a la lista de roles autorizados del servidor.

**Uso**: `/roles add role:<rol>`

**Parámetros**:
- `role` (requerido): Rol a autorizar

**Permisos**: Administradores del servidor

**Ejemplo**:
```
/roles add role:@Raiders
```

### `/roles remove`
**Descripción**: Remueve un rol de la lista de autorizados.

**Uso**: `/roles remove role:<rol>`

**Permisos**: Administradores del servidor

### `/roles clear`
**Descripción**: Limpia todos los roles autorizados del servidor.

**Uso**: `/roles clear`

**Permisos**: Administradores del servidor

**Confirmación**: Requiere confirmación antes de ejecutar.

---

## 💎 Sistema Premium

### `/premium set`
**Descripción**: Establece el estado premium de un servidor.

**Uso**: `/premium set status:<true/false> [server:<servidor>]`

**Parámetros**:
- `status` (requerido): true para activar, false para desactivar
- `server` (opcional): ID del servidor (por defecto: servidor actual)

**Permisos**: Solo owner del bot

**Ejemplos**:
```
/premium set status:true
/premium set status:false server:123456789012345678
```

### `/premium check`
**Descripción**: Verifica el estado premium del servidor actual.

**Uso**: `/premium check`

**Permisos**: Administradores

**Respuesta**: Estado premium actual y fecha de activación.

---

## 🔧 Comandos de Administración

### `/debug`
**Descripción**: Comandos de debugging y diagnóstico del sistema.

**Subcomandos**:
- `/debug system`: Información del sistema
- `/debug database`: Estado de la base de datos
- `/debug memory`: Uso de memoria
- `/debug cache`: Estado del cache

**Permisos**: Solo owner del bot

**Ejemplos**:
```
/debug system
/debug database
/debug memory
```

### `/migrate`
**Descripción**: Ejecuta migraciones de base de datos.

**Uso**: `/migrate [version:<versión>]`

**Parámetros**:
- `version` (opcional): Versión específica a migrar

**Permisos**: Solo owner del bot

**Precaución**: ⚠️ Comando peligroso - puede modificar la estructura de datos.

---

## 📊 Comandos de Información

### `/help`
**Descripción**: Muestra ayuda general del bot.

**Uso**: `/help [command:<comando>]`

**Parámetros**:
- `command` (opcional): Comando específico para obtener ayuda

**Permisos**: Todos los usuarios

### `/about`
**Descripción**: Información sobre el bot y sus características.

**Uso**: `/about`

**Permisos**: Todos los usuarios

**Respuesta**: Información del bot, versión, autor y enlaces útiles.

---

## 🎮 Comandos de Utilidad

### `/ping`
**Descripción**: Comando básico de ping (alias de `/latency`).

**Uso**: `/ping`

**Permisos**: Todos los usuarios

### `/uptime`
**Descripción**: Muestra el tiempo que el bot ha estado activo.

**Uso**: `/uptime`

**Permisos**: Todos los usuarios

### `/stats`
**Descripción**: Estadísticas del bot y uso de comandos.

**Uso**: `/stats`

**Permisos**: Administradores

**Información mostrada**:
- Número de servidores
- Número de usuarios
- Comandos ejecutados
- Tiempo de actividad
- Uso de memoria

---

## 🔒 Niveles de Permisos

### Todos los Usuarios
- `/latency`, `/ping`
- `/show_all_weapons`
- `/show_all_categories`
- `/help`, `/about`
- `/uptime`
- Claims (crear)

### Usuarios con Roles Autorizados
- `/raid`
- `/template list`
- `/template create`
- `/split`

### Administradores del Servidor
- `/roles add/remove/clear`
- `/claim-config`
- `/premium check`
- `/stats`

### Usuarios Autorizados para Decodificación
- `/decode-file`

### Solo Owner del Bot
- `/premium set`
- `/decode-users add/remove/list`
- `/upload_weapons`
- `/debug`
- `/migrate`

---

## 📝 Notas Importantes

### Formato de Tiempo
- **Hora específica**: `20:30`, `15:45`
- **Tiempo relativo**: `ahora`, `en 30m`, `en 2h`
- **Duración**: `1h 30m`, `45m`, `2h`

### Formato de Cantidades
- **Números**: `1000000` (1 millón)
- **Con separadores**: `1,000,000` o `1.000.000`
- **Notación K/M**: `1M`, `500K`

### Limitaciones
- **Rate Limiting**: Máximo 10 comandos por minuto por usuario
- **Tamaño de archivos**: Máximo 8MB para decodificación
- **Longitud de texto**: Máximo 2000 caracteres en descripciones

### Comandos Premium
Algunos comandos requieren que el servidor tenga estado premium:
- Plantillas ilimitadas
- Claims extendidos
- Estadísticas avanzadas
- Backup automático

---

*Para más información sobre comandos específicos, usa `/help command:<nombre_comando>` o consulta la documentación completa.*