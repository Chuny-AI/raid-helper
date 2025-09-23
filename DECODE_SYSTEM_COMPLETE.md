# 🚀 Sistema de Decodificación de Calabozos - TODAS LAS OPCIONES

El sistema de decodificación de Avalon Online ahora soporta **múltiples formas** de enviar datos, incluyendo soporte para **40,000+ caracteres**.

## 📋 Opciones Disponibles

### 1. 🔍 `/decode` - Modal Básico (hasta 4,000 caracteres)
- **Uso:** `/decode`
- **Capacidad:** 4,000 caracteres
- **Interfaz:** Modal con área de texto grande
- **Ideal para:** Datos medianos del Cheat Engine

### 2. 📁 `/decode-file` - Archivos sin límites
- **Uso:** `/decode-file archivo:[tu_archivo.txt]`
- **Capacidad:** **Ilimitada** (hasta 8MB por Discord)
- **Formatos:** `.txt`, `.dat`, `.hex`, `.log`
- **Ideal para:** Datos muy largos (40,000+ caracteres)

### 3. 🤖 Auto-Detección en Mensajes
- **Uso:** Simplemente envía los datos hex en cualquier mensaje
- **Detección:** Automática por patrones `AVA_TEMPLE` o `41 56 41 5F`
- **Respuesta:** Embeds hermosos automáticamente
- **Ideal para:** Uso rápido y casual

## 🎯 Cómo elegir el método correcto

### 📏 Por tamaño de datos:
- **< 4,000 caracteres:** Usar `/decode` (modal)
- **4,000 - 40,000+ caracteres:** Usar `/decode-file` con archivo
- **Cualquier tamaño:** Auto-detección en mensajes

### 🎨 Por experiencia deseada:
- **Formal/Privada:** `/decode` o `/decode-file` (efímero)
- **Casual/Compartida:** Auto-detección en canal (público)
- **Datos masivos:** `/decode-file` con archivo

## 📁 Método 1: Comando con Archivo (RECOMENDADO PARA DATOS LARGOS)

### ✅ Ventajas:
- **Sin límites** de tamaño de datos
- Soporte para múltiples formatos
- Información detallada del archivo
- Procesamiento robusto

### 📋 Pasos:
1. Copia los datos hex del Cheat Engine
2. Pégalos en un archivo `.txt`
3. Usa `/decode-file archivo:[tu_archivo.txt]`
4. Recibe embeds hermosos con resultados

### 📄 Formatos de archivo soportados:
- **`.txt`** - Archivo de texto plano
- **`.dat`** - Archivo de datos
- **`.hex`** - Archivo hexadecimal
- **`.log`** - Archivo de registro

## 💬 Método 2: Auto-Detección en Mensajes

### ✅ Ventajas:
- **Súper fácil** - solo envía el mensaje
- Detección automática inteligente
- Respuesta pública para compartir
- Reacciones de estado

### 📋 Pasos:
1. Copia los datos hex del Cheat Engine
2. Envía un mensaje normal con los datos
3. El bot detecta automáticamente los datos
4. Responde con embeds hermosos

### 🔍 Patrones detectados:
- Mensajes que contengan `AVA_TEMPLE`
- Mensajes que contengan `41 56 41 5F` (hex)
- Datos hexadecimales válidos de Avalon

### 📱 Reacciones del bot:
- ✅ - Datos válidos, procesando
- ❌ - Datos inválidos
- 🔍 - Sin jefes encontrados
- ⚠️ - Error en procesamiento

## 🎮 Obtener Datos del Cheat Engine

### Primer piso:
```
AVA_TEMPLE_START_First_Level_01
```

### Segundo piso:
```
AVA_TEMPLE_START
```

## 📊 Información Mostrada (Todos los Métodos)

### 🏰 Embed Principal:
- Número total de jefes encontrados
- Resumen de tipos de cofres con emojis
- Lista de jefes en orden de aparición
- Información del origen (archivo/usuario)

### 👑 Embeds de Jefes Individuales:
- Nombre del jefe con emoji del cofre
- Tipo de cofre (color)
- Posición en el orden
- Capa/nivel del calabozo
- Índice técnico

### 🎨 Colores por Tipo de Cofre:
- 💰 **Doble dorado** - `#FFD700`
- 🟣 **Morado** - `#8A2BE2`
- 🔵 **Azul** - `#0066FF`
- 🟢 **Verde** - `#00FF00`
- ⚪ **Otros** - `#FFFFFF`

## 📈 Comparación de Métodos

| Método | Capacidad | Privacidad | Facilidad | Ideal para |
|--------|-----------|------------|-----------|------------|
| `/decode` | 4K chars | Efímero | Media | Datos medianos |
| `/decode-file` | **Ilimitado** | Efímero | Media | **Datos masivos** |
| Auto-detección | Variable | Público | **Fácil** | Uso casual |

## 🔧 Solución de Problemas

### ❌ "Datos Inválidos"
- Verifica que uses las direcciones correctas del Cheat Engine
- Los datos deben ser hexadecimales válidos
- Intenta limpiar espacios extra o caracteres especiales

### 📁 "Formato de Archivo Inválido"
- Usa archivos `.txt`, `.dat`, `.hex`, o `.log`
- Máximo 8MB por limitaciones de Discord
- El contenido debe ser hexadecimal válido

### 🔍 "Sin Resultados"
- Los datos pueden ser de una zona diferente
- Verifica que estés en un calabozo activo
- Actualiza los datos en el Cheat Engine

### 🤖 Auto-detección no funciona
- El mensaje debe contener patrones de Avalon (`AVA_TEMPLE`)
- Los datos deben ser hexadecimales válidos
- El bot debe tener permisos de lectura y reacción

## 💡 Consejos Pro

### 📁 Para archivos grandes:
- Usa `/decode-file` para datos de 40,000+ caracteres
- Guarda los datos en `.txt` para mejor compatibilidad
- El bot procesa archivos más rápido que modales

### 💬 Para uso casual:
- Simplemente pega los datos en un mensaje
- El bot responde automáticamente
- Perfecto para compartir con el equipo

### 🔒 Para privacidad:
- Usa `/decode` o `/decode-file` (efímeros)
- Solo tú verás los resultados
- Ideal para información sensible

---

*Sistema desarrollado con ❤️ por @chuny-dev para la comunidad de Avalon Online*
*Ahora con soporte completo para datos masivos y detección automática*