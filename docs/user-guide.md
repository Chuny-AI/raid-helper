# 📖 Guía de Usuario - Chuny BOT

Esta guía te ayudará a usar todas las funcionalidades de Chuny BOT de manera efectiva.

---

## 🚀 Primeros Pasos

### ¿Qué es Chuny BOT?

Chuny BOT es tu asistente personal para organizar actividades en Albion Online. Te permite:
- Crear notificaciones de raids
- Reservar actividades con el sistema de claims
- Acceder a información de armas y builds
- Dividir botín automáticamente

### Verificar Estado del Bot

Usa `/status` para verificar que el bot esté funcionando correctamente:
```
/status
```

---

## 🎯 Sistema de Raids

### Crear una Notificación de Raid

1. **Comando básico**:
   ```
   /raid template:NombrePlantilla time:30
   ```

2. **Con opciones personalizadas**:
   ```
   /raid template:ZvZ time:45 title:"Raid Especial" description:"Evento importante"
   ```

### Parámetros Disponibles

- `template` (obligatorio): Plantilla a usar
- `time` (obligatorio): Tiempo en minutos (1-60)
- `title` (opcional): Título personalizado
- `description` (opcional): Descripción personalizada
- `color` (opcional): Color en formato hex (#FF0000)
- `image` (opcional): URL de imagen personalizada
- `reminder` (opcional): Tiempo para recordatorio
- `notify_all` (opcional): Notificar a todos (requiere permisos)

### Ejemplos Prácticos

```bash
# Raid básico de 30 minutos
/raid template:Dungeon time:30

# Raid personalizado con recordatorio
/raid template:ZvZ time:60 title:"Guerra de Territorios" reminder:15m

# Raid con notificación masiva (solo admins)
/raid template:Avalon time:45 notify_all:true
```

---

## 🏆 Sistema de Claims

### ¿Qué son los Claims?

Los claims te permiten "reservar" actividades para evitar conflictos entre jugadores.

### Crear un Claim

```
/claim create actividad:"Orbe de Poder T8" mapa:"Caerleon" tiempo:"1h 30m"
```

### Gestionar tus Claims

```bash
# Ver tus claims activos
/claim list

# Cancelar un claim
/claim cancel claim_id:123
```

### Buenas Prácticas

- ✅ Sé específico en la descripción
- ✅ Indica el tiempo realista
- ✅ Cancela claims que no uses
- ❌ No hagas claims excesivamente largos

---

## ⚔️ Base de Datos de Armas

### Ver Todas las Armas

```
/show_all_weapons
```

### Ver Categorías

```
/show_all_categories
```

### Usar en Plantillas

Las armas se integran automáticamente en el editor de plantillas cuando creas o editas una plantilla.

---

## 💰 División de Botín

### Calcular División

```
/split motivo:"Dungeon T8" cantidad_total:1000000 jugadores:5 tax:10
```

### Parámetros

- `motivo`: Descripción de la actividad
- `cantidad_total`: Dinero total a dividir
- `jugadores`: Número de participantes (2-20)
- `tax`: Porcentaje de impuesto (0-50%, opcional)

### Ejemplo

```
/split motivo:"Avalon Road" cantidad_total:5000000 jugadores:8 tax:15
```

Resultado:
- Total: 5,000,000 de plata
- Tax (15%): 750,000 de plata
- Restante: 4,250,000 de plata
- Por jugador: 531,250 de plata

---

## 🔓 Decodificación de Dungeons

### ¿Quién puede usar este comando?

Solo usuarios autorizados por el owner del bot pueden usar `/decode-file`.

### Cómo Decodificar

1. Obtén el archivo de datos del dungeon (.txt o .dat)
2. Usa el comando:
   ```
   /decode-file archivo:[adjunta tu archivo]
   ```

### Información que Obtienes

- Tipo de dungeon
- Nivel de dificultad
- Cofres disponibles
- Mobs presentes
- Recompensas estimadas

---

## 📝 Trabajar con Plantillas

### Ver Plantillas Disponibles

```
/templates
```

### Usar una Plantilla

Las plantillas se usan principalmente con el comando `/raid`:

```
/raid template:NombrePlantilla time:30
```

### Solicitar Nuevas Plantillas

Si necesitas una plantilla específica, contacta a los administradores del servidor.

---

## ❓ Preguntas Frecuentes

### ¿Por qué no veo ciertos comandos?

Los comandos tienen diferentes niveles de acceso:
- **Básicos**: Todos los usuarios
- **Premium**: Solo en servidores premium
- **Roles**: Solo usuarios con roles autorizados
- **Admin**: Solo administradores
- **Owner**: Solo el propietario del bot

### ¿Cómo obtengo acceso premium?

Solo los administradores del servidor pueden solicitar premium al owner del bot.

### ¿Puedo usar el bot en múltiples servidores?

Sí, pero cada servidor tiene sus propias plantillas y configuraciones.

### ¿Los claims expiran?

Sí, los claims tienen tiempo límite basado en el tiempo que especifiques.

---

## 🆘 Obtener Ayuda

### Comandos no Funcionan

1. Verifica que tengas los permisos necesarios
2. Asegúrate de que el servidor tenga premium (si es requerido)
3. Contacta a los administradores

### Reportar Problemas

Si encuentras un bug o tienes sugerencias:
1. Documenta el problema claramente
2. Incluye capturas de pantalla si es posible
3. Contacta al soporte del servidor

---

## 💡 Consejos y Trucos

### Para Raids Efectivos

- Usa plantillas consistentes para tu guild
- Programa raids con suficiente anticipación
- Utiliza recordatorios para eventos importantes

### Para Claims Eficientes

- Sé específico en las descripciones
- Usa tiempos realistas
- Coordina con tu guild para evitar conflictos

### Para División de Botín

- Acuerda el porcentaje de tax antes de la actividad
- Usa el comando inmediatamente después del loot
- Guarda capturas para referencia

---

*¿Necesitas más ayuda? Contacta a los administradores de tu servidor.*