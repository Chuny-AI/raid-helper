# 🔧 Guía de Solución de Problemas - Chuny BOT

Esta guía te ayudará a resolver los problemas más comunes que puedes encontrar al usar el Chuny BOT.

---

## 🚨 Problemas Comunes de Usuarios

### El bot no responde a comandos

#### Síntomas
- Los comandos slash no aparecen
- El bot no responde cuando escribes comandos
- Mensaje de "Aplicación no respondió"

#### Soluciones
1. **Verificar que el bot esté online**
   - Busca el bot en la lista de miembros
   - Debe aparecer con estado "En línea" (verde)

2. **Verificar permisos del bot**
   - El bot necesita permisos para leer y enviar mensajes
   - Verificar que el rol del bot esté por encima de otros roles

3. **Reiniciar Discord**
   - Cierra completamente Discord
   - Vuelve a abrirlo y espera unos minutos

4. **Verificar comandos slash**
   ```
   Escribe "/" en el chat y busca los comandos del bot
   Si no aparecen, contacta al administrador
   ```

### "No tienes permisos para usar este comando"

#### Causa
Tu usuario no tiene los roles necesarios para ejecutar el comando.

#### Soluciones
1. **Verificar roles requeridos**
   ```
   /roles list  # (si tienes permisos de admin)
   ```

2. **Contactar administrador**
   - Pide que te agreguen al rol autorizado
   - Verifica que el rol esté configurado correctamente

3. **Comandos que requieren roles especiales**:
   - `/raid` - Rol autorizado
   - `/template` - Rol autorizado
   - `/split` - Rol autorizado
   - `/decode-file` - Usuario autorizado específicamente

### Las plantillas no se cargan

#### Síntomas
- `/template list` muestra lista vacía
- Error al crear raids con plantillas

#### Soluciones
1. **Verificar que existan plantillas**
   ```
   /template list
   ```

2. **Crear nueva plantilla**
   ```
   /template create
   ```

3. **Verificar permisos del servidor**
   - El bot necesita acceso a la base de datos
   - Contactar al administrador si persiste

### Los claims no funcionan

#### Síntomas
- No se pueden crear claims
- Los claims no aparecen en el canal

#### Soluciones
1. **Verificar configuración del canal**
   ```
   /claim-config channel:#tu-canal-claims
   ```

2. **Verificar formato del comando**
   ```
   /claim create activity:Orbe T8 map:Caerleon time:2h
   ```

3. **Verificar permisos del canal**
   - El bot debe poder escribir en el canal de claims
   - Verificar que el canal exista

---

## ⚙️ Problemas de Administración

### No puedo agregar roles autorizados

#### Síntomas
- Error al ejecutar `/roles add`
- "No tienes permisos suficientes"

#### Soluciones
1. **Verificar permisos de Discord**
   - Necesitas permisos de "Administrar servidor"
   - O ser el propietario del servidor

2. **Verificar jerarquía de roles**
   - Tu rol debe estar por encima del rol que intentas agregar
   - El rol del bot debe estar por encima del rol objetivo

3. **Formato correcto**
   ```
   /roles add role:@NombreDelRol
   ```

### El bot no puede crear embeds

#### Síntomas
- Mensajes aparecen como texto plano
- Sin colores ni formato especial

#### Soluciones
1. **Verificar permisos del bot**
   - "Insertar enlaces" (Embed Links)
   - "Usar emojis externos" (Use External Emojis)

2. **Verificar configuración del canal**
   - Algunos canales pueden tener restricciones
   - Probar en otro canal

### Los comandos premium no funcionan

#### Síntomas
- Mensaje de "Servidor no premium"
- Funciones limitadas

#### Soluciones
1. **Verificar estado premium**
   ```
   /premium check
   ```

2. **Activar premium** (solo owner del bot)
   ```
   /premium set status:true
   ```

3. **Contactar soporte**
   - Si pagaste por premium y no funciona
   - Proporcionar ID del servidor

---

## 🔧 Problemas Técnicos

### Error de conexión a la base de datos

#### Síntomas
- "Error interno del servidor"
- Comandos que requieren datos fallan

#### Diagnóstico
```
/debug database  # (solo owner)
```

#### Soluciones para Administradores
1. **Verificar conexión MongoDB**
   ```bash
   # Verificar estado del servicio
   systemctl status mongod
   
   # Verificar logs
   tail -f /var/log/mongodb/mongod.log
   ```

2. **Verificar variables de entorno**
   ```bash
   # Verificar .env
   cat .env | grep MONGODB_URI
   ```

3. **Reiniciar servicios**
   ```bash
   # Reiniciar MongoDB
   sudo systemctl restart mongod
   
   # Reiniciar bot
   pm2 restart chuny-bot
   ```

### Bot desconectándose frecuentemente

#### Síntomas
- Bot aparece offline intermitentemente
- Comandos fallan esporádicamente

#### Soluciones
1. **Verificar logs**
   ```bash
   # Con PM2
   pm2 logs chuny-bot
   
   # Logs del sistema
   tail -f logs/bot.log
   ```

2. **Verificar recursos del servidor**
   ```bash
   # Memoria
   free -h
   
   # CPU
   top
   
   # Espacio en disco
   df -h
   ```

3. **Reiniciar con más memoria**
   ```bash
   pm2 delete chuny-bot
   pm2 start ecosystem.config.js --max-memory-restart 1G
   ```

### Comandos slash no se registran

#### Síntomas
- Comandos nuevos no aparecen
- Cambios en comandos no se reflejan

#### Soluciones
1. **Re-registrar comandos**
   ```bash
   npm run register
   ```

2. **Limpiar comandos globales**
   ```bash
   npm run delete-global
   npm run register
   ```

3. **Verificar CLIENT_ID**
   ```bash
   # Verificar .env
   grep CLIENT_ID .env
   ```

4. **Esperar propagación**
   - Los comandos pueden tardar hasta 1 hora en aparecer
   - Reiniciar Discord cliente puede ayudar

---

## 📊 Diagnóstico Avanzado

### Comandos de Debug (Solo Owner)

#### Información del sistema
```
/debug system
```
**Muestra**:
- Versión de Node.js
- Uso de memoria
- Tiempo de actividad
- Número de servidores

#### Estado de la base de datos
```
/debug database
```
**Muestra**:
- Estado de conexión
- Número de documentos por colección
- Tiempo de respuesta

#### Información de memoria
```
/debug memory
```
**Muestra**:
- Uso de heap
- Memoria externa
- Garbage collection stats

### Logs Importantes

#### Ubicaciones de logs
```bash
# Logs del bot
./logs/bot.log
./logs/error.log

# Logs de PM2
~/.pm2/logs/chuny-bot-out.log
~/.pm2/logs/chuny-bot-error.log

# Logs del sistema
/var/log/syslog
```

#### Filtrar logs por errores
```bash
# Errores recientes
grep "ERROR" logs/bot.log | tail -20

# Errores de conexión
grep "connection" logs/bot.log | grep -i error

# Errores de comandos
grep "Command failed" logs/bot.log
```

---

## 🔍 Herramientas de Monitoreo

### Verificar estado del bot

#### Script de health check
```bash
#!/bin/bash
# health-check.sh

# Verificar proceso
if pgrep -f "node.*index.js" > /dev/null; then
    echo "✅ Bot process running"
else
    echo "❌ Bot process not found"
    exit 1
fi

# Verificar conexión Discord
if curl -s "https://discord.com/api/v10/gateway" > /dev/null; then
    echo "✅ Discord API accessible"
else
    echo "❌ Cannot reach Discord API"
    exit 1
fi

# Verificar MongoDB
if mongosh --eval "db.adminCommand('ping')" > /dev/null 2>&1; then
    echo "✅ MongoDB accessible"
else
    echo "❌ Cannot reach MongoDB"
    exit 1
fi

echo "✅ All systems operational"
```

#### Monitoreo con PM2
```bash
# Estado general
pm2 status

# Monitoreo en tiempo real
pm2 monit

# Información detallada
pm2 show chuny-bot
```

### Alertas automáticas

#### Script de alerta por email
```bash
#!/bin/bash
# alert.sh

if ! pgrep -f "chuny-bot" > /dev/null; then
    echo "Bot is down!" | mail -s "Chuny Bot Alert" admin@example.com
    pm2 restart chuny-bot
fi
```

#### Cron job para monitoreo
```bash
# Agregar a crontab
*/5 * * * * /path/to/health-check.sh
```

---

## 🆘 Contacto de Soporte

### Información a proporcionar

Cuando contactes soporte, incluye:

1. **Información básica**:
   - ID del servidor de Discord
   - Comando que falla
   - Mensaje de error exacto

2. **Información técnica**:
   - Versión del bot
   - Sistema operativo
   - Logs relevantes

3. **Pasos para reproducir**:
   - Qué hiciste antes del error
   - Cuándo empezó el problema
   - Si es intermitente o constante

### Plantilla de reporte de bug

```
**Descripción del problema:**
[Describe qué está pasando]

**Pasos para reproducir:**
1. [Primer paso]
2. [Segundo paso]
3. [Tercer paso]

**Comportamiento esperado:**
[Qué debería pasar]

**Comportamiento actual:**
[Qué está pasando realmente]

**Información adicional:**
- ID del servidor: [ID]
- Comando usado: [comando]
- Error mostrado: [mensaje de error]
- Hora del incidente: [fecha y hora]

**Logs (si tienes acceso):**
```
[Pegar logs relevantes aquí]
```
```

### Canales de soporte

- **GitHub Issues**: Para bugs y solicitudes de características
- **Discord**: Para soporte rápido
- **Email**: Para problemas críticos
- **Documentación**: Para preguntas frecuentes

---

## 📚 Recursos Adicionales

### Documentación relacionada
- [Guía de Usuario](user-guide.md)
- [Guía de Administrador](admin-guide.md)
- [Referencia de Comandos](commands-reference.md)
- [Guía de Instalación](installation-guide.md)

### Enlaces útiles
- [Discord Developer Portal](https://discord.com/developers/applications)
- [MongoDB Atlas](https://www.mongodb.com/atlas)
- [Node.js Documentation](https://nodejs.org/docs/)
- [PM2 Documentation](https://pm2.keymetrics.io/docs/)

---

*¿No encontraste la solución a tu problema? Contacta al equipo de soporte con la información detallada del error.*