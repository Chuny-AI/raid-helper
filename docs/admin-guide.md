# 🛡️ Guía de Administrador - Chuny BOT

Esta guía está dirigida a administradores de servidores que desean configurar y gestionar Chuny BOT de manera efectiva.

---

## 🚀 Configuración Inicial

### Verificar Permisos del Bot

Asegúrate de que el bot tenga estos permisos en tu servidor:
- ✅ Enviar mensajes
- ✅ Usar comandos de barra
- ✅ Insertar enlaces
- ✅ Adjuntar archivos
- ✅ Leer historial de mensajes
- ✅ Usar emojis externos
- ✅ Agregar reacciones

### Verificar Estado Premium

```
/premium check
```

Si tu servidor no tiene premium, contacta al owner del bot para activarlo.

---

## 🎯 Gestión de Plantillas

### Crear Plantillas

Como administrador, puedes crear plantillas para tu servidor:

```
/template create
```

Esto abrirá un editor interactivo donde podrás:
1. Configurar información básica (título, descripción, tiempo)
2. Seleccionar armas por categorías
3. Personalizar colores e imágenes
4. Configurar opciones avanzadas

### Editar Plantillas Existentes

```
/template edit
```

### Clonar Plantillas

Para crear variaciones de plantillas existentes:

```
/template clone
```

### Eliminar Plantillas

```
/template delete
```

### Listar Todas las Plantillas

```
/template list
```

---

## 🔐 Gestión de Roles y Permisos

### Sistema de Roles Autorizados

Los roles autorizados pueden usar comandos premium como `/raid` y `/template`.

### Agregar Roles Autorizados

```
/roles add role:@RaidLeaders
```

### Remover Roles Autorizados

```
/roles remove role:@RaidLeaders
```

### Ver Roles Autorizados

```
/roles list
```

### Limpiar Todos los Roles

```
/roles clear
```

### Jerarquía de Permisos

1. **Owner del Bot**: Acceso total
2. **Administradores del Servidor**: Comandos de gestión + premium
3. **Roles Autorizados**: Comandos premium
4. **Usuarios Básicos**: Solo comandos informativos

---

## 🏆 Configuración del Sistema de Claims

### Configurar Canales para Claims

```
/claim-config channel set channel:#claims
```

### Ver Configuración Actual

```
/claim-config channel show
```

### Remover Canal de Claims

```
/claim-config channel remove
```

### Configurar Roles para Claims

```
/claim-config roles add role:@ClaimUsers
/claim-config roles remove role:@ClaimUsers
/claim-config roles list
```

### Gestionar Claims del Servidor

```bash
# Ver todos los claims activos
/claim-config list

# Cancelar claim específico (emergencia)
/claim-config cancel claim_id:123
```

---

## 🔓 Sistema de Decodificación

### Gestionar Usuarios Autorizados

Solo el owner del bot puede gestionar usuarios autorizados para decodificación:

```bash
# El owner puede usar estos comandos:
/decode-users add userid:123456789 reason:"Miembro confiable"
/decode-users remove userid:123456789
/decode-users list
```

Como administrador, puedes solicitar al owner que autorice usuarios específicos.

---

## 📊 Monitoreo y Estadísticas

### Verificar Estado del Bot

```
/status
```

Información que obtienes:
- Estado de conexión
- Latencia del bot
- Número de plantillas en el servidor
- Estado premium
- Tiempo de actividad

### Debug del Servidor

```
/debug
```

Información técnica adicional:
- ID del servidor
- Configuraciones específicas
- Estado de la base de datos

---

## ⚙️ Configuraciones Avanzadas

### Migración de Plantillas

Si tienes plantillas en formato JSON, puedes migrarlas:

```
/migrate json:{"title":"Mi Plantilla","description":"..."}
```

### Actualización de Armas

Solo el owner puede actualizar la base de datos de armas:

```
/upload_weapons
```

---

## 🚨 Resolución de Problemas

### Comandos No Aparecen

1. **Verifica permisos del bot**
2. **Confirma estado premium** con `/premium check`
3. **Revisa roles autorizados** con `/roles list`
4. **Reinicia Discord** (cliente)

### Plantillas No Funcionan

1. **Verifica que existan** con `/template list`
2. **Confirma formato correcto** editando la plantilla
3. **Revisa permisos** del usuario que intenta usarla

### Claims No Funcionan

1. **Configura canal** con `/claim-config channel set`
2. **Verifica roles** con `/claim-config roles list`
3. **Confirma premium** del servidor

### Bot No Responde

1. **Verifica estado** con `/status`
2. **Revisa permisos** del bot en el canal
3. **Contacta al owner** si persiste el problema

---

## 📋 Lista de Verificación para Nuevos Servidores

### Configuración Básica
- [ ] Bot invitado con permisos correctos
- [ ] Premium activado por el owner
- [ ] Roles autorizados configurados
- [ ] Canal de claims configurado (opcional)

### Plantillas
- [ ] Al menos una plantilla básica creada
- [ ] Plantillas probadas con `/raid`
- [ ] Armas configuradas correctamente

### Usuarios
- [ ] Administradores informados sobre comandos
- [ ] Roles distribuidos apropiadamente
- [ ] Usuarios entrenados en uso básico

---

## 🔄 Mantenimiento Regular

### Tareas Semanales
- Revisar plantillas activas
- Verificar claims expirados
- Actualizar roles si es necesario

### Tareas Mensuales
- Revisar estadísticas de uso
- Limpiar plantillas obsoletas
- Evaluar necesidad de nuevas funcionalidades

---

## 📞 Contacto y Soporte

### Para Problemas Técnicos
- Contacta al owner del bot
- Proporciona información detallada del error
- Incluye capturas de pantalla

### Para Solicitudes de Funcionalidades
- Documenta la necesidad claramente
- Explica el beneficio para la comunidad
- Proporciona ejemplos de uso

### Para Activación Premium
- Solo el owner del bot puede activar premium
- Proporciona el ID de tu servidor
- Explica el uso previsto del bot

---

## 💡 Mejores Prácticas

### Gestión de Plantillas
- Usa nombres descriptivos y consistentes
- Mantén plantillas actualizadas
- Elimina plantillas obsoletas regularmente

### Gestión de Roles
- Asigna roles basado en responsabilidad
- Revisa permisos periódicamente
- Documenta cambios importantes

### Comunicación con Usuarios
- Informa sobre nuevas funcionalidades
- Proporciona guías de uso
- Mantén canales de soporte activos

---

*¿Necesitas ayuda adicional? Contacta al owner del bot o consulta la documentación técnica.*