# 🤖 Chuny BOT - Documentación Completa de Comandos

**Bot especializado para Albion Online** - Gestión de raids, plantillas, claims y economía para guilds

---

## 📋 Índice de Contenidos

1. [🎯 Comandos Generales](#-comandos-generales)
2. [⚔️ Sistema de Raids](#️-sistema-de-raids)
3. [📝 Sistema de Plantillas](#-sistema-de-plantillas)
4. [🏆 Sistema de Claims](#-sistema-de-claims)
5. [💰 Sistema de Economía](#-sistema-de-economía)
6. [🔧 Gestión de Armas](#-gestión-de-armas)
7. [💎 División de Botín](#-división-de-botín)
8. [🔐 Administración](#-administración)
9. [🔓 Decodificación](#-decodificación)
10. [💎 Sistema Premium](#-sistema-premium)
11. [🔒 Permisos y Acceso](#-permisos-y-acceso)
12. [📱 Ejemplos de Uso](#-ejemplos-de-uso)

---

## 🎯 Comandos Generales

### `/latency` - Verificar Latencia
**Descripción**: Muestra la latencia del bot y la API de Discord para verificar el rendimiento.

**Sintaxis**: `/latency`

**Permisos**: 👥 Todos los usuarios

**Respuesta**:
```
🏓 Pong!
Latencia del bot: 45ms
Latencia de la API: 120ms
Estado: ✅ Óptimo
```

**Casos de uso**:
- Verificar si el bot está funcionando correctamente
- Diagnosticar problemas de conexión
- Monitorear rendimiento del bot

---

### `/help` - Ayuda General
**Descripción**: Proporciona información de ayuda sobre comandos específicos o ayuda general.

**Sintaxis**: `/help [command:<comando>]`

**Parámetros**:
- `command` (opcional): Comando específico para obtener ayuda detallada

**Permisos**: 👥 Todos los usuarios

**Ejemplos**:
```
/help
/help command:raid
/help command:template
```

---

### `/about` - Información del Bot
**Descripción**: Muestra información detallada sobre el bot, versión y características.

**Sintaxis**: `/about`

**Permisos**: 👥 Todos los usuarios

**Información mostrada**:
- Versión del bot
- Desarrollador
- Funcionalidades principales
- Enlaces útiles
- Estadísticas básicas

---

### `/ping` - Ping Básico
**Descripción**: Comando básico de ping (alias de `/latency`).

**Sintaxis**: `/ping`

**Permisos**: 👥 Todos los usuarios

---

### `/uptime` - Tiempo de Actividad
**Descripción**: Muestra cuánto tiempo ha estado activo el bot.

**Sintaxis**: `/uptime`

**Permisos**: 👥 Todos los usuarios

**Respuesta**:
```
⏰ Tiempo de Actividad
El bot ha estado activo por: 2 días, 14 horas, 32 minutos
Última reinicialización: 15/01/2024 10:30:45
```

---

### `/stats` - Estadísticas del Bot
**Descripción**: Muestra estadísticas detalladas del uso del bot.

**Sintaxis**: `/stats`

**Permisos**: 🛡️ Administradores

**Información mostrada**:
- Número de servidores
- Número de usuarios
- Comandos ejecutados
- Plantillas creadas
- Claims activos
- Uso de memoria

---

## ⚔️ Sistema de Raids

### `/raid` - Crear Raid
**Descripción**: Crea una notificación de raid usando plantillas predefinidas del servidor.

**Sintaxis**: `/raid template:<plantilla> time:<tiempo> [opciones]`

**Parámetros**:
- `template` (requerido): Nombre de la plantilla a usar (autocompletado)
- `time` (requerido): Tiempo en minutos hasta la actividad (1-60)
- `title` (opcional): Título personalizado para la raid
- `description` (opcional): Descripción personalizada
- `color` (opcional): Color del embed en formato hexadecimal (#FFFFFF)
- `image` (opcional): URL de imagen para el embed
- `reminder` (opcional): Minutos antes para recordatorio (1-60)
- `roles_to_notify` (opcional): IDs de roles a notificar separados por comas

**Permisos**: 🎖️ Roles autorizados

**Ejemplos**:
```
/raid template:ZvZ time:30
/raid template:Dungeon time:45 title:Raid Especial T8
/raid template:Ganking time:60 description:Caerleon Roads reminder:15
/raid template:HCE time:20 color:#FF0000 roles_to_notify:123456789,987654321
```

**Características**:
- ✅ Autocompletado de plantillas disponibles
- ✅ Validación de tiempo y parámetros
- ✅ Recordatorios automáticos
- ✅ Notificaciones a roles específicos
- ✅ Embeds personalizables
- ✅ Botones de reacción para unirse

**Respuesta**: Embed interactivo con:
- Información de la actividad
- Tiempo restante (actualización automática)
- Botones para unirse/salir
- Lista de participantes
- Recordatorios automáticos

---

## 📝 Sistema de Plantillas

### `/template list` - Listar Plantillas
**Descripción**: Muestra todas las plantillas disponibles en el servidor con paginación.

**Sintaxis**: `/template list`

**Permisos**: 🎖️ Roles autorizados

**Características**:
- ✅ Lista paginada de plantillas
- ✅ Información básica de cada plantilla
- ✅ Navegación con botones
- ✅ Búsqueda por nombre

**Respuesta**: Embed con lista de plantillas mostrando:
- Nombre de la plantilla
- Descripción breve
- Categorías de armas incluidas
- Fecha de creación
- Autor

---

### `/template create` - Crear Plantilla
**Descripción**: Inicia el proceso interactivo de creación de una nueva plantilla.

**Sintaxis**: `/template create`

**Permisos**: 🎖️ Roles autorizados

**Proceso interactivo**:
1. **Configuración básica**:
   - Título de la plantilla
   - Descripción detallada
   - Imagen/thumbnail

2. **Selección de categorías**:
   - Menú desplegable con categorías de armas
   - Selección múltiple
   - Previsualización en tiempo real

3. **Configuración de armas**:
   - Selección específica por categoría
   - Configuración de cantidad por arma
   - Roles requeridos por arma

4. **Confirmación**:
   - Previsualización final
   - Validación de datos
   - Guardado en base de datos

**Características**:
- ✅ Interfaz completamente interactiva
- ✅ Validación en tiempo real
- ✅ Previsualización antes de guardar
- ✅ Soporte para múltiples grupos de armas
- ✅ Configuración avanzada de roles

---

### `/template edit` - Editar Plantilla
**Descripción**: Edita una plantilla existente del servidor.

**Sintaxis**: `/template edit template:<nombre>`

**Parámetros**:
- `template` (requerido): Nombre de la plantilla a editar (autocompletado)

**Permisos**: 🎖️ Roles autorizados

**Funcionalidades de edición**:
- Modificar título y descripción
- Cambiar imagen/thumbnail
- Agregar/quitar categorías de armas
- Modificar armas específicas
- Actualizar configuración de roles

---

### `/template delete` - Eliminar Plantilla
**Descripción**: Elimina una plantilla existente del servidor.

**Sintaxis**: `/template delete template:<nombre>`

**Parámetros**:
- `template` (requerido): Nombre de la plantilla a eliminar

**Permisos**: 🎖️ Roles autorizados

**Seguridad**:
- ⚠️ Requiere confirmación
- ⚠️ Acción irreversible
- ⚠️ Solo el creador o administradores pueden eliminar

---

## 🏆 Sistema de Claims

### `/claim create` - Crear Claim
**Descripción**: Crea un claim para reservar una actividad específica de Albion Online.

**Sintaxis**: `/claim create actividad:<actividad> mapa:<mapa> tiempo:<duración> [descripcion:<descripción>]`

**Parámetros**:
- `actividad` (requerido): Tipo de actividad (máx. 100 caracteres)
- `mapa` (requerido): Mapa donde se realizará (máx. 100 caracteres)
- `tiempo` (requerido): Duración estimada (formato: "1h 30m", "45m", "2h")
- `descripcion` (opcional): Descripción adicional (máx. 500 caracteres)

**Permisos**: 👥 Todos los usuarios

**Ejemplos**:
```
/claim create actividad:Orbe de Poder T8 mapa:Caerleon tiempo:2h
/claim create actividad:Dungeon Solo mapa:Roads tiempo:45m descripcion:Farm de plata rápido
/claim create actividad:Ganking Group mapa:Thetford tiempo:1h 30m
```

**Características**:
- ✅ Expiración automática basada en tiempo
- ✅ Notificaciones de recordatorio
- ✅ ID único para cada claim
- ✅ Cancelación automática al expirar

---

### `/claim complete` - Completar Claim
**Descripción**: Marca un claim como completado antes de su expiración.

**Sintaxis**: `/claim complete claim_id:<id>`

**Parámetros**:
- `claim_id` (requerido): ID del claim a completar

**Permisos**: 👥 Creador del claim

---

### `/claim cancel` - Cancelar Claim
**Descripción**: Cancela un claim existente.

**Sintaxis**: `/claim cancel claim_id:<id>`

**Parámetros**:
- `claim_id` (requerido): ID del claim a cancelar

**Permisos**: 👥 Creador del claim o administradores

---

### `/claim-config` - Configurar Claims
**Descripción**: Configura el sistema de claims del servidor.

**Sintaxis**: `/claim-config channel:<canal>`

**Parámetros**:
- `channel` (requerido): Canal donde se enviarán los claims

**Permisos**: 🛡️ Administradores

**Configuraciones disponibles**:
- Canal de claims
- Roles autorizados
- Tiempo máximo de claims
- Notificaciones automáticas

---

## 💰 Sistema de Economía

### `/economy add-money` - Añadir Dinero
**Descripción**: Añade dinero a un usuario específico del servidor.

**Sintaxis**: `/economy add-money usuario:<usuario> cantidad:<cantidad> [razon:<razón>]`

**Parámetros**:
- `usuario` (requerido): Usuario al que añadir dinero
- `cantidad` (requerido): Cantidad a añadir (1-999,999,999)
- `razon` (opcional): Razón para añadir el dinero (máx. 200 caracteres)

**Permisos**: 🛡️ Administradores o roles autorizados

**Ejemplo**:
```
/economy add-money usuario:@Juan cantidad:1000000 razon:Recompensa por ZvZ
```

---

### `/economy remove-money` - Quitar Dinero
**Descripción**: Elimina dinero de un usuario específico del servidor.

**Sintaxis**: `/economy remove-money usuario:<usuario> cantidad:<cantidad> [razon:<razón>]`

**Parámetros**:
- `usuario` (requerido): Usuario al que quitar dinero
- `cantidad` (requerido): Cantidad a eliminar (1-999,999,999)
- `razon` (opcional): Razón para quitar el dinero (máx. 200 caracteres)

**Permisos**: 🛡️ Administradores o roles autorizados

---

### `/economy balance` - Ver Balance
**Descripción**: Muestra el balance de dinero de un usuario.

**Sintaxis**: `/economy balance [usuario:<usuario>]`

**Parámetros**:
- `usuario` (opcional): Usuario del que ver el balance (por defecto: tú mismo)

**Permisos**: 👥 Todos los usuarios

**Respuesta**:
```
💰 Balance de @Usuario
Dinero actual: 5,250,000 monedas
Posición en ranking: #15
Última transacción: hace 2 horas
```

---

### `/economy top` - Ranking de Dinero
**Descripción**: Muestra el ranking de usuarios con más dinero del servidor.

**Sintaxis**: `/economy top [limite:<número>]`

**Parámetros**:
- `limite` (opcional): Número de usuarios a mostrar (1-20, por defecto: 10)

**Permisos**: 👥 Todos los usuarios

**Respuesta**: Lista ordenada con:
- Posición en ranking
- Nombre del usuario
- Cantidad de dinero
- Diferencia con el anterior

---

## 🔧 Gestión de Armas

### `/show_all_weapons` - Mostrar Todas las Armas
**Descripción**: Lista todas las armas disponibles en la base de datos del bot.

**Sintaxis**: `/show_all_weapons`

**Permisos**: 👥 Todos los usuarios

**Características**:
- ✅ Lista completa de armas por categoría
- ✅ Emojis representativos
- ✅ Información de tier y tipo
- ✅ Paginación automática

**Respuesta**: Embed con:
- Total de armas disponibles
- Armas organizadas por categoría
- Conteo por categoría
- Navegación por páginas

---

### `/show_all_categories` - Mostrar Categorías
**Descripción**: Lista todas las categorías de armas disponibles.

**Sintaxis**: `/show_all_categories`

**Permisos**: 👥 Todos los usuarios

**Respuesta**:
```
⚔️ Categorías de Armas

• Sword (espadas) - 15 armas
• Bow (arcos) - 12 armas
• Crossbow (ballestas) - 8 armas
• Dagger (dagas) - 10 armas
• Staff (bastones) - 20 armas
...

Total: 8 categorías, 125 armas
```

---

### `/upload_weapons` - Actualizar Base de Datos
**Descripción**: Actualiza la base de datos de armas desde el archivo weapons.json.

**Sintaxis**: `/upload_weapons`

**Permisos**: 👑 Solo owner del bot

**Proceso**:
1. Lee el archivo `weapons.json`
2. Valida formato de datos
3. Actualiza/inserta armas en la base de datos
4. Reporta estadísticas de la operación

**⚠️ Precaución**: Este comando modifica la base de datos y solo debe ser usado por el owner.

---

## 💎 División de Botín

### `/split` - Calcular División
**Descripción**: Calcula la división de botín entre jugadores con soporte para impuestos.

**Sintaxis**: `/split motivo:<razón> cantidad_total:<cantidad> jugadores:<número> [tax:<porcentaje>]`

**Parámetros**:
- `motivo` (requerido): Razón de la división (máx. 100 caracteres)
- `cantidad_total` (requerido): Cantidad total a dividir (mínimo: 1)
- `jugadores` (requerido): Número de jugadores (2-20)
- `tax` (opcional): Porcentaje de impuesto a descontar (0-50%)

**Permisos**: 💎 Solo servidores premium

**Ejemplos**:
```
/split motivo:ZvZ Caerleon cantidad_total:50000000 jugadores:20
/split motivo:Dungeon Group cantidad_total:5000000 jugadores:5 tax:10
/split motivo:HCE T8 cantidad_total:15000000 jugadores:8 tax:15
```

**Respuesta detallada**:
```
💰 División de Botín
Motivo: ZvZ Caerleon

💵 Cantidad Total: 50,000,000 monedas
👥 Jugadores: 20 jugadores
📊 Impuesto (10%): 5,000,000 monedas
💰 Cantidad Neta: 45,000,000 monedas
💎 Por Jugador: 2,250,000 monedas
🔄 Resto: 0 monedas

Distribución recomendada:
• 20 jugadores reciben: 2,250,000 cada uno
• Guild tax: 5,000,000 (10%)
```

---

## 🔐 Administración

### `/roles add` - Añadir Rol Autorizado
**Descripción**: Añade un rol a la lista de roles autorizados para usar comandos premium.

**Sintaxis**: `/roles add role:<rol>`

**Parámetros**:
- `role` (requerido): Rol a autorizar

**Permisos**: 🛡️ Administradores

---

### `/roles remove` - Quitar Rol Autorizado
**Descripción**: Elimina un rol de la lista de roles autorizados.

**Sintaxis**: `/roles remove role:<rol>`

**Parámetros**:
- `role` (requerido): Rol a desautorizar

**Permisos**: 🛡️ Administradores

---

### `/roles list` - Listar Roles Autorizados
**Descripción**: Muestra todos los roles autorizados del servidor.

**Sintaxis**: `/roles list`

**Permisos**: 🛡️ Administradores

---

### `/roles clear` - Limpiar Roles
**Descripción**: Elimina todos los roles autorizados del servidor.

**Sintaxis**: `/roles clear`

**Permisos**: 🛡️ Administradores

**⚠️ Precaución**: Requiere confirmación, acción irreversible.

---

## 🔓 Decodificación

### `/decode-file` - Decodificar Archivo
**Descripción**: Decodifica archivos de dungeons de Albion Online para análisis.

**Sintaxis**: `/decode-file archivo:<archivo>`

**Parámetros**:
- `archivo` (requerido): Archivo a decodificar (máx. 8MB)

**Permisos**: 🔓 Usuarios autorizados para decodificación

**Formatos soportados**:
- Archivos de dungeon (.dungeon)
- Logs de combate
- Archivos de configuración

---

### `/decode-users add` - Autorizar Usuario
**Descripción**: Añade un usuario a la lista de autorizados para decodificación.

**Sintaxis**: `/decode-users add usuario:<usuario>`

**Parámetros**:
- `usuario` (requerido): Usuario a autorizar

**Permisos**: 👑 Solo owner del bot

---

### `/decode-users remove` - Desautorizar Usuario
**Descripción**: Elimina un usuario de la lista de autorizados para decodificación.

**Sintaxis**: `/decode-users remove usuario:<usuario>`

**Parámetros**:
- `usuario` (requerido): Usuario a desautorizar

**Permisos**: 👑 Solo owner del bot

---

### `/decode-users list` - Listar Usuarios Autorizados
**Descripción**: Muestra todos los usuarios autorizados para decodificación.

**Sintaxis**: `/decode-users list`

**Permisos**: 👑 Solo owner del bot

---

## 💎 Sistema Premium

### `/premium set` - Establecer Estado Premium
**Descripción**: Activa o desactiva el estado premium de un servidor.

**Sintaxis**: `/premium set status:<true/false> [server_id:<id>]`

**Parámetros**:
- `status` (requerido): true para activar, false para desactivar
- `server_id` (opcional): ID del servidor (por defecto: servidor actual)

**Permisos**: 👑 Solo owner del bot

**Ejemplos**:
```
/premium set status:true
/premium set status:false server_id:123456789012345678
```

---

### `/premium check` - Verificar Estado Premium
**Descripción**: Verifica el estado premium del servidor actual.

**Sintaxis**: `/premium check [server_id:<id>]`

**Parámetros**:
- `server_id` (opcional): ID del servidor a verificar

**Permisos**: 🛡️ Administradores

**Respuesta**:
```
💎 Estado Premium del Servidor

Estado: ✅ Activo
Activado desde: 15/01/2024
Activado por: @Owner
Funcionalidades disponibles:
• ✅ Plantillas ilimitadas
• ✅ Sistema de claims
• ✅ División de botín
• ✅ Sistema de economía
• ✅ Estadísticas avanzadas
```

---

### `/premium list` - Listar Servidores Premium
**Descripción**: Lista todos los servidores con estado premium activo.

**Sintaxis**: `/premium list`

**Permisos**: 👑 Solo owner del bot

---

## 🔒 Permisos y Acceso

### Niveles de Permisos

#### 👑 Owner del Bot
- Acceso completo a todos los comandos
- Gestión de estado premium
- Administración de usuarios de decodificación
- Comandos de debug y mantenimiento

**Comandos exclusivos**:
- `/premium set`
- `/decode-users add/remove/list`
- `/upload_weapons`
- `/debug`
- `/migrate`

#### 🛡️ Administradores del Servidor
- Gestión de configuración del servidor
- Administración de roles autorizados
- Acceso a estadísticas

**Comandos disponibles**:
- `/roles add/remove/list/clear`
- `/claim-config`
- `/premium check`
- `/stats`
- `/economy` (gestión de dinero)

#### 🎖️ Roles Autorizados
- Uso de funcionalidades principales del bot
- Creación y gestión de plantillas
- Envío de raids

**Comandos disponibles**:
- `/raid`
- `/template list/create/edit/delete`
- `/split` (solo premium)

#### 🔓 Usuarios Autorizados para Decodificación
- Decodificación de archivos específicos

**Comandos disponibles**:
- `/decode-file`

#### 👥 Todos los Usuarios
- Comandos informativos y básicos
- Visualización de información pública

**Comandos disponibles**:
- `/latency`, `/ping`, `/help`, `/about`, `/uptime`
- `/show_all_weapons`, `/show_all_categories`
- `/claim create/complete/cancel`
- `/economy balance/top`

### Funcionalidades Premium

#### 💎 Servidores Premium
- ✅ Plantillas ilimitadas
- ✅ Sistema de claims completo
- ✅ División de botín
- ✅ Sistema de economía
- ✅ Estadísticas avanzadas
- ✅ Soporte prioritario

#### 🆓 Servidores Básicos
- ❌ Funcionalidades limitadas
- ✅ Comandos informativos
- ✅ Ayuda y soporte básico

---

## 📱 Ejemplos de Uso

### Configuración Inicial de Servidor

1. **Activar Premium** (Owner):
```
/premium set status:true
```

2. **Configurar Roles Autorizados** (Admin):
```
/roles add role:@Oficiales
/roles add role:@Líderes de Raid
```

3. **Configurar Canal de Claims** (Admin):
```
/claim-config channel:#claims
```

### Flujo Típico de Raid

1. **Crear Plantilla** (Rol Autorizado):
```
/template create
# Seguir proceso interactivo
```

2. **Programar Raid** (Rol Autorizado):
```
/raid template:ZvZ Caerleon time:30 reminder:10
```

3. **Dividir Botín** (Después de la actividad):
```
/split motivo:ZvZ Caerleon cantidad_total:45000000 jugadores:18 tax:10
```

### Gestión de Claims

1. **Crear Claim**:
```
/claim create actividad:Orbe de Poder T8 mapa:Caerleon tiempo:2h descripcion:Solo para miembros premium
```

2. **Completar Claim**:
```
/claim complete claim_id:ABC123
```

### Gestión de Economía

1. **Añadir Recompensa**:
```
/economy add-money usuario:@Juan cantidad:500000 razon:MVP en ZvZ
```

2. **Ver Ranking**:
```
/economy top limite:15
```

---

## 🚨 Notas Importantes

### Limitaciones y Restricciones

- **Rate Limiting**: Máximo 10 comandos por minuto por usuario
- **Tamaño de archivos**: Máximo 8MB para decodificación
- **Longitud de texto**: Máximo 2000 caracteres en descripciones
- **Tiempo de sesión**: Las sesiones de edición expiran en 30 minutos

### Formatos Aceptados

#### Tiempo
- **Hora específica**: `20:30`, `15:45`
- **Tiempo relativo**: `30`, `45`, `60` (minutos)
- **Duración**: `1h 30m`, `45m`, `2h`

#### Cantidades
- **Números**: `1000000` (1 millón)
- **Con separadores**: `1,000,000`
- **Notación**: Números enteros únicamente

#### Colores
- **Hexadecimal**: `#FF0000`, `#00FF00`, `#0000FF`
- **Formato completo**: Siempre 6 dígitos después del #

### Solución de Problemas Comunes

#### Comandos no aparecen
1. Verificar permisos del bot
2. Confirmar estado premium con `/premium check`
3. Revisar roles autorizados con `/roles list`
4. Reiniciar cliente de Discord

#### Plantillas no funcionan
1. Verificar existencia con `/template list`
2. Confirmar permisos del usuario
3. Revisar formato de la plantilla

#### Claims no funcionan
1. Configurar canal con `/claim-config`
2. Verificar estado premium
3. Confirmar permisos en el canal

---

## 📞 Soporte y Contacto

### Información para Reportes

Cuando contactes soporte, incluye:

- **ID del servidor de Discord**
- **Comando que falla**
- **Mensaje de error exacto**
- **Pasos para reproducir el problema**
- **Hora del incidente**

### Recursos Adicionales

- **Documentación técnica**: Disponible en el repositorio
- **Guía de administrador**: Para configuración avanzada
- **Guía de instalación**: Para hosting propio
- **Troubleshooting**: Para resolución de problemas

---

**© 2024 Chuny BOT - Bot especializado para Albion Online**

*Desarrollado con ❤️ para la comunidad de Albion Online*

---

*Última actualización: Enero 2024*
*Versión de la documentación: 2.0*