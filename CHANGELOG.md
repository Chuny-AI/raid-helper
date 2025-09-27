# 📝 Changelog - Chuny BOT

Todos los cambios notables de este proyecto serán documentados en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Agregado
- Documentación completa del proyecto
- Guías de usuario y administrador
- Referencia completa de API
- Guía de solución de problemas

### Cambiado
- Mejorado el sistema de logging
- Optimizada la conversión de datos de plantillas

### Corregido
- Problemas de guardado en el sistema de plantillas
- Inconsistencias en el mapeo de emojis de armas
- Manejo de estructuras de datos inconsistentes

---

## [2.1.0] - 2024-01-15

### Agregado
- Sistema de claims para reservar actividades
- Comando `/claim create` para crear claims
- Comando `/claim-config` para configurar canal de claims
- Expiración automática de claims
- Notificaciones de recordatorio para claims

### Mejorado
- Interfaz de creación de plantillas más intuitiva
- Mejor manejo de errores en comandos
- Validación mejorada de datos de entrada

### Corregido
- Error en la paginación de listas de armas
- Problema con caracteres especiales en nombres de plantillas
- Fallo en la sincronización de datos de sesiones

---

## [2.0.0] - 2024-01-01

### Agregado
- Sistema de plantillas completamente rediseñado
- Interfaz interactiva para creación de plantillas
- Soporte para múltiples grupos de armas por plantilla
- Sistema de sesiones para creación de plantillas
- Comando `/template create` con interfaz paso a paso
- Previsualización en tiempo real de plantillas
- Validación avanzada de datos

### Cambiado
- **BREAKING**: Nuevo formato de datos para plantillas
- **BREAKING**: Comandos de plantillas reorganizados
- Mejorada la experiencia de usuario en creación de raids
- Optimizado el rendimiento de la base de datos

### Eliminado
- **BREAKING**: Comandos antiguos de plantillas
- Sistema de plantillas legacy

### Corregido
- Múltiples bugs en el sistema de armas
- Problemas de memoria en sesiones largas
- Errores de validación en datos de plantillas

---

## [1.5.2] - 2023-12-15

### Corregido
- Error crítico en el comando `/raid`
- Problema con emojis personalizados
- Fallo en la conexión a MongoDB Atlas

### Mejorado
- Tiempo de respuesta de comandos
- Manejo de errores más robusto

---

## [1.5.1] - 2023-12-10

### Agregado
- Comando `/split` para división de loot
- Soporte para cálculo de impuestos en divisiones
- Validación de cantidades numéricas

### Corregido
- Error en el formato de números grandes
- Problema con decimales en divisiones

---

## [1.5.0] - 2023-12-01

### Agregado
- Sistema premium para servidores
- Comando `/premium set` y `/premium check`
- Funcionalidades exclusivas para servidores premium
- Límites diferenciados por tipo de servidor

### Mejorado
- Sistema de permisos más granular
- Mejor organización de comandos por categorías

---

## [1.4.0] - 2023-11-15

### Agregado
- Sistema de decodificación de archivos de Albion Online
- Comando `/decode-file` para procesar archivos hexadecimales
- Gestión de usuarios autorizados para decodificación
- Comandos `/decode-users add/remove/list`

### Mejorado
- Seguridad en el manejo de archivos
- Validación de formatos de archivo

---

## [1.3.0] - 2023-11-01

### Agregado
- Base de datos completa de armas de Albion Online
- Comando `/show_all_weapons` para listar armas
- Comando `/show_all_categories` para categorías
- Comando `/upload_weapons` para cargar datos
- Soporte para emojis personalizados de armas

### Mejorado
- Rendimiento en consultas de base de datos
- Interfaz de selección de armas en plantillas

---

## [1.2.0] - 2023-10-15

### Agregado
- Sistema de roles autorizados por servidor
- Comandos `/roles add/remove/clear`
- Configuración granular de permisos
- Soporte para múltiples roles por servidor

### Cambiado
- Sistema de permisos migrado a roles de Discord
- Mejor integración con la jerarquía de roles

---

## [1.1.0] - 2023-10-01

### Agregado
- Comando `/latency` para verificar conexión
- Sistema de logging mejorado
- Comandos de debug para administradores
- Monitoreo de rendimiento

### Mejorado
- Estabilidad general del bot
- Manejo de reconexiones automáticas
- Optimización de memoria

### Corregido
- Múltiples memory leaks
- Problemas de concurrencia en base de datos

---

## [1.0.0] - 2023-09-15

### Agregado
- Sistema básico de raids con plantillas
- Comando `/raid` para crear raids
- Comando `/template list` para ver plantillas
- Integración con MongoDB
- Sistema básico de permisos
- Embeds personalizados para raids
- Reacciones automáticas en raids

### Características iniciales
- Soporte para plantillas de raid personalizables
- Integración completa con Discord
- Base de datos persistente
- Sistema de notificaciones

---

## Tipos de Cambios

- **Agregado** para nuevas funcionalidades
- **Cambiado** para cambios en funcionalidades existentes
- **Obsoleto** para funcionalidades que serán eliminadas pronto
- **Eliminado** para funcionalidades eliminadas
- **Corregido** para corrección de bugs
- **Seguridad** para vulnerabilidades

---

## Notas de Migración

### De v1.x a v2.0.0

**⚠️ Cambios importantes que requieren acción:**

1. **Formato de plantillas**: Las plantillas existentes necesitan ser migradas
   ```bash
   npm run migrate
   ```

2. **Comandos obsoletos**: Algunos comandos han cambiado
   - `!template` → `/template`
   - `!raid` → `/raid`

3. **Permisos**: Revisar configuración de roles autorizados
   ```
   /roles list
   /roles add role:@TuRol
   ```

### De v0.x a v1.0.0

**⚠️ Primera versión estable:**

1. **Instalación limpia recomendada**
2. **Configurar variables de entorno**
3. **Registrar comandos slash**
   ```bash
   npm run register
   ```

---

## Roadmap

### v2.2.0 (Próximo)
- [ ] Sistema de estadísticas avanzadas
- [ ] Integración con APIs de Albion Online
- [ ] Backup automático de datos
- [ ] Dashboard web para administración

### v2.3.0 (Futuro)
- [ ] Sistema de eventos programados
- [ ] Notificaciones push
- [ ] Integración con calendarios externos
- [ ] API REST para terceros

### v3.0.0 (Largo plazo)
- [ ] Rediseño completo de la interfaz
- [ ] Soporte multi-idioma
- [ ] Sistema de plugins
- [ ] Arquitectura distribuida

---

*Para más información sobre versiones específicas, consulta los [releases en GitHub](https://github.com/tu-usuario/chuny-bot/releases).*