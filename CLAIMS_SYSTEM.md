# 🎯 Sistema de Claims - Avalon Raid Helper

El sistema de claims permite a los usuarios "apartar" actividades o recursos de Albion Online por un tiempo determinado, evitando conflictos y organizando mejor las actividades del gremio.

## 📋 Comandos Disponibles

### `/claim create`
Crear un nuevo claim para apartar una actividad o recurso.

**Parámetros:**
- `actividad` (requerido): Tipo de actividad a reclamar (texto libre, máx. 100 caracteres)
- `mapa` (requerido): Mapa donde se realizará la actividad (texto libre, máx. 100 caracteres)
- `tiempo` (requerido): Tiempo hasta completar (ej: "1h 30m", "45m")
- `descripcion` (opcional): Descripción adicional del claim (máx. 500 caracteres)

**Ejemplo:**
```
/claim create actividad:Orbe de Poder mapa:Caerleon tiempo:2h 15m descripcion:Farmeo en zona roja
```

### `/claim complete`
Marcar un claim como completado.

**Permisos requeridos:**
- Dueño del claim, O
- Administrador del servidor, O  
- Usuario con rol autorizado (configurado con `/roles add`)

**Parámetros:**
- `claim_id` (requerido): ID del claim a completar

**Ejemplo:**
```
/claim complete claim_id:ABC123DEF
```

### `/claim cancel`
Cancelar un claim.

**Permisos requeridos:**
- Dueño del claim, O
- Administrador del servidor, O
- Usuario con rol autorizado (configurado con `/roles add`)

**Parámetros:**
- `claim_id` (requerido): ID del claim a cancelar

**Ejemplo:**
```
/claim cancel claim_id:ABC123DEF
```

## ⚙️ Comandos de Configuración

### `/claim-config set-claims-channel`
Configurar el canal donde aparecerán todos los claims activos del servidor.

**Permisos requeridos:**
- Administrador del servidor, O
- Usuario con rol autorizado (configurado con `/roles add`)

**Parámetros:**
- `canal` (requerido): Canal donde aparecerán los claims activos

**Ejemplo:**
```
/claim-config set-claims-channel canal:#claims
```

### `/claim-config set-reminders-channel`
Configurar el canal donde aparecerán los recordatorios de claims.

**Permisos requeridos:**
- Administrador del servidor, O
- Usuario con rol autorizado (configurado con `/roles add`)

**Parámetros:**
- `canal` (requerido): Canal donde aparecerán los recordatorios

**Ejemplo:**
```
/claim-config set-reminders-channel canal:#recordatorios-claims
```

### `/claim-config set-success-channel`
Configurar el canal donde aparecerán los claims que llegaron a su tiempo máximo.

**Permisos requeridos:**
- Administrador del servidor, O
- Usuario con rol autorizado (configurado con `/roles add`)

**Parámetros:**
- `canal` (requerido): Canal de texto donde aparecerán los claims exitosos

**Ejemplo:**
```
/claim-config set-success-channel canal:#claims-exitosos
```

### `/claim-config set-closed-channel`
Configurar el canal donde aparecerán los claims cancelados manualmente.

**Permisos requeridos:**
- Administrador del servidor, O
- Usuario con rol autorizado (configurado con `/roles add`)

**Parámetros:**
- `canal` (requerido): Canal de texto donde aparecerán los claims cerrados

**Ejemplo:**
```
/claim-config set-closed-channel canal:#claims-cerrados
```

### `/claim-config status`
Ver la configuración actual de canales del servidor.

**Ejemplo:**
```
/claim-config status
```

### `/claim-config remove-claims-channel`
Eliminar la configuración del canal de claims.

### `/claim-config remove-reminders-channel`
Eliminar la configuración del canal de recordatorios.

## 🎮 Ejemplos de Actividades y Mapas

### 🎯 Tipos de Actividades (Ejemplos)
- **Orbes**: Orbe de Poder, Orbe de Energía, Orbe de Valor, Orbe de Sabiduría
- **Cofres**: Cofre de Tesoro, Cofre Legendario, Cofre Mítico
- **Dungeons**: Dungeon Solo T8, Dungeon Grupal T7, Dungeon Corrupted
- **PvP**: Hellgate 2v2, Hellgate 5v5, Hellgate 10v10
- **Expediciones**: Expedición T4, Expedición T5, Expedición T6, Expedición T7, Expedición T8
- **Recursos**: Fibra T8, Piedra T7, Madera T6, Cuero T8, Mineral T8
- **Especiales**: Nodo de Aspectos, Boss de Mundo, Evento Especial
- **Personalizado**: Cualquier actividad que desees especificar

### 🗺️ Mapas de Ejemplo
- **Ciudades Reales**: Caerleon, Thetford, Fort Sterling, Lymhurst, Bridgewatch, Martlock
- **Zonas Rojas**: Cumbres Rocosas, Pantanos Húmedos, Tierras Altas, Bosque Real, Estepa
- **Zonas Negras**: Cualquier zona del Outlands
- **Zonas Azules**: Zonas de inicio y alrededores de ciudades
- **Islas**: Isla Privada, Isla de Gremio
- **Específico**: "Caerleon - Portal Rojo", "Thetford - Dungeon T8", "Outlands - Territorio X"

## ⏰ Sistema de Recordatorios

### Recordatorios Automáticos
- **10 minutos antes**: Primer recordatorio automático
- **5 minutos antes**: Segundo recordatorio automático
- **Sin configuración**: Los recordatorios se envían automáticamente, sin necesidad de configurar nada
- **Formato de tiempo**: Acepta formatos como "1h 30m", "45m", "2h"
- **Tiempo máximo**: 72 horas

### Información de Tiempo
- **Tiempo restante**: Se muestra en tiempo real
- **Hora de finalización**: Se muestra en formato UTC
- **Timestamps dinámicos**: Usa Discord timestamps para mostrar tiempo relativo

## 📊 Características del Sistema

### 📺 Sistema de Canales
- **Canal de Claims Activos**: Solo claims que están esperando a su tiempo
- **Canal de Claims Exitosos**: Claims que llegaron a su tiempo máximo automáticamente  
- **Canal de Claims Cerrados**: Claims cancelados manualmente antes de tiempo
- **Canal de Recordatorios**: Los recordatorios se envían al canal configurado
- **Movimiento Automático**: Los claims se mueven automáticamente entre canales según su estado
- **Configuración Flexible**: Cada servidor puede configurar sus propios canales

### 🔒 Seguridad y Permisos
- **Crear claims**: Cualquier usuario con acceso premium
- **Completar/Cancelar claims**: 
  - Dueño del claim
  - Administradores del servidor
  - Usuarios con roles autorizados (sistema `/roles`)
- **Configurar canales**: Solo administradores
- **Validación completa**: Todos los datos de entrada son validados

### 🔄 Estados de Claims y Flujo de Canales
- **Activo**: Claim en progreso → Aparece en **Canal de Claims**
- **Completado Manualmente**: Claim terminado por el usuario → Se mueve a **Canal de Claims Exitosos**
- **Expirado**: Claim que llegó a su tiempo máximo → Se mueve automáticamente a **Canal de Claims Exitosos**
- **Cancelado**: Claim cancelado por el usuario → Se mueve a **Canal de Claims Cerrados**

### 🔄 Flujo Automático
1. **Creación**: Claim aparece en canal de claims activos
2. **Durante la espera**: Recordatorios se envían al canal de recordatorios
3. **Al completarse/expirar**: Se elimina del canal de claims y se mueve al canal de exitosos
4. **Al cancelarse**: Se elimina del canal de claims y se mueve al canal de cerrados
5. **Limpieza automática**: Los recordatorios se cancelan automáticamente

### 🧹 Limpieza Automática
- Los claims expirados se marcan automáticamente cada 30 minutos
- Los recordatorios se cancelan automáticamente al completar/cancelar
- Actualización automática en canales configurados

## 💡 Consejos de Uso

### ✅ Buenas Prácticas
- Usa descripciones claras para especificar ubicación o detalles
- Completa o cancela tus claims cuando termines
- Usa tiempos realistas para tus actividades
- Los administradores pueden gestionar claims de otros usuarios si es necesario

### ⚠️ Limitaciones
- Requiere servidor premium para usar
- Tiempo máximo de 72 horas por claim
- Solo el dueño, administradores o usuarios autorizados pueden gestionar claims
- Los claims expirados no se pueden reactivar

### 🛡️ Sistema de Permisos
- **Dueños de claims**: Pueden completar/cancelar sus propios claims
- **Administradores**: Pueden gestionar cualquier claim del servidor
- **Roles autorizados**: Configurados con `/roles add`, pueden gestionar cualquier claim
- **Integración completa**: Usa el mismo sistema de roles que las notificaciones

## 🔧 Administración

### Para Administradores
- Pueden ver todos los claims del servidor
- El sistema se limpia automáticamente
- Los logs muestran actividad de claims

### Base de Datos
- Todos los claims se almacenan en MongoDB
- Historial completo de claims
- Índices optimizados para consultas rápidas

## 📈 Ejemplo de Flujo de Trabajo

### Configuración Inicial (Solo Administradores)
1. **Configurar canal de claims**: `/claim-config set-claims-channel canal:#claims`
2. **Configurar canal de recordatorios**: `/claim-config set-reminders-channel canal:#recordatorios`

### Uso Normal
1. **Crear claim**: `/claim create actividad:Orbe de Poder mapa:Caerleon tiempo:1h 30m`
2. **Embed automático**: Aparece en el canal de claims configurado mostrando actividad y mapa
3. **Recordatorios automáticos**: Se envían al canal de recordatorios a los 10 minutos y 5 minutos antes
4. **Completar**: `/claim complete claim_id:ABC123DEF`
5. **Actualización automática**: El estado se actualiza en el canal de claims

## 🆘 Solución de Problemas

### Errores Comunes
- **Formato de tiempo inválido**: Usa formato "1h 30m" o "45m"
- **Claim no encontrado**: Verifica el ID del claim
- **Sin permisos**: Solo puedes gestionar tus propios claims
- **Servidor no premium**: Contacta al administrador para activar premium

### Soporte
Si tienes problemas con el sistema de claims:
1. Verifica que el servidor tenga premium activo
2. Asegúrate de usar el formato correcto de comandos
3. Contacta al soporte si persisten los problemas
