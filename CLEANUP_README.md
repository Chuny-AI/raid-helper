# 🧹 Script de Limpieza de Base de Datos

Este script permite limpiar completamente la base de datos MongoDB para empezar las pruebas desde cero.

## ⚠️ **ADVERTENCIA IMPORTANTE**

**Este script eliminará TODA la información de la base de datos de forma PERMANENTE:**
- Todos los claims y configuraciones de canales
- Todos los servidores y templates
- Todos los roles autorizados
- Todos los eventos de raid
- Todas las categorías y armas
- **TODO será eliminado sin posibilidad de recuperación**

## 🚀 **Cómo usar el script**

### Opción 1: Usando npm script (Recomendado)
```bash
npm run cleanup-db
```

### Opción 2: Ejecutar directamente
```bash
node --env-file=.env cleanup-database.js
```

## 🛡️ **Medidas de Seguridad**

1. **Confirmación requerida**: El script pedirá confirmación antes de ejecutar
2. **Palabra clave**: Debes escribir exactamente `CONFIRMAR` para proceder
3. **Verificación de entorno**: Verifica que tengas configurada la variable `MONGODB_URI`
4. **Cancelación de jobs**: Cancela todos los recordatorios programados antes de limpiar

## 🔧 **Sistema de Permisos Actualizado**

### **Premium Estricto**
- **TODOS** los comandos requieren premium (incluyendo el dueño del bot)
- **NO HAY BYPASS** para el dueño en comandos funcionales
- Solo el comando `/status` es completamente libre

### **Comandos que requieren Premium:**
- `/claim` (crear, completar, cancelar)
- `/claim-config` (todas las configuraciones) + permisos adicionales
- `/raid` (crear raids)
- `/templates` (listar templates)
- `/migrate` (migrar templates)
- `/roles` (gestionar roles autorizados)
- `/show_all_weapons` (mostrar armas)
- `/show_all_categories` (mostrar categorías)
- `/upload_weapons` (subir armas)

### **Comando Libre:**
- `/status` - Información básica del servidor (accesible para todos)

### **Comando Solo para Dueño:**
- `/premium` - Gestionar estado premium de servidores

### **Configuración de Claims - Permisos Adicionales:**
Los comandos `/claim-config` requieren:
1. **Premium activo** en el servidor
2. **Y además** uno de estos:
   - Ser administrador del servidor
   - Tener roles autorizados (configurados con `/roles`)

## 📋 **Comandos Disponibles**

### Claims (Requiere Premium)
```
/claim create actividad:texto mapa:texto tiempo:1h30m [descripcion:texto]
/claim complete claim_id:ABC123
/claim cancel claim_id:ABC123
```

### Configuración de Canales (Requiere Premium + Admin/Roles)
```
/claim-config set-claims-channel canal:#claims-activos
/claim-config set-reminders-channel canal:#recordatorios  
/claim-config set-success-channel canal:#claims-exitosos
/claim-config set-closed-channel canal:#claims-cerrados
/claim-config status
/claim-config remove-claims-channel
/claim-config remove-reminders-channel
/claim-config remove-success-channel
/claim-config remove-closed-channel
```

### Información (Libre)
```
/status
```

### Premium (Solo Dueño)
```
/premium set status:true [server_id:123456789]
/premium check [server_id:123456789]
/premium list
```

## 🔄 **Flujo de Claims**

1. **Crear claim** → Aparece en canal de claims + programa recordatorios (5min, 10min antes del fin) + programa auto-expiración
2. **Recordatorios** → Se envían al canal de recordatorios
3. **Finalización**:
   - **Cancelado** → Se mueve al canal `closed` + cancela recordatorios
   - **Completado** → Se mueve al canal `closed` + cancela recordatorios  
   - **Auto-expirado** → Se mueve al canal `success` con mensaje hermoso + cancela recordatorios

## 🎯 **Para empezar las pruebas:**

1. **Limpiar BD**: `npm run cleanup-db`
2. **Activar premium**: `/premium set status:true`
3. **Configurar canales**: `/claim-config set-claims-channel`, etc.
4. **Crear claims**: `/claim create`
5. **Probar funcionalidades**: Cancelar, completar, esperar auto-expiración

## ⚙️ **Variables de Entorno Necesarias**

Asegúrate de tener en tu `.env`:
```env
MONGODB_URI=mongodb://localhost:27017/avalon-raid-helper
TOKEN=tu_token_de_discord
CLIENT_ID=tu_client_id
BOT_OWNER_ID=tu_user_id
```

---

**Nota**: Este script está diseñado específicamente para entornos de desarrollo y prueba. Nunca ejecutes esto en producción.