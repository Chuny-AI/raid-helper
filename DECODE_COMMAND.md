# 🔍 Comando /decode - Decodificador de Calabozos (MODAL)

El comando `/decode` permite decodificar información de calabozos de Avalon Online desde datos de memoria obtenidos con Cheat Engine usando un **formulario modal** para mayor capacidad de datos.

## 🚀 Cómo usar (ACTUALIZADO)

1. **Ejecutar el comando**: Usa `/decode` en Discord
2. **Completar el modal**: Se abrirá un formulario donde puedes pegar hasta **4000 caracteres** de datos hexadecimales
3. **Obtener resultados**: El bot procesará los datos y mostrará información detallada de los jefes encontrados

## 📋 Obtener los datos del Cheat Engine

### Primer piso:
```
AVA_TEMPLE_START_First_Level_01
```

### Segundo piso:
```
AVA_TEMPLE_START
```

## 💡 Ventajas del modal

- **Mayor capacidad**: Hasta **4000 caracteres** en lugar de los ~2000 de un parámetro normal
- **Mejor interfaz**: Área de texto más grande y cómoda para pegar datos largos
- **Validación mejorada**: Verificación de formato antes del procesamiento

## 📊 Información mostrada

El comando proporciona:

- **Resumen general**: Número total de jefes y tipos de cofres
- **Lista de jefes**: Orden de aparición con capas
- **Detalles individuales**: Cada jefe con su información específica
  - Nombre del jefe
  - Tipo de cofre (color)
  - Posición en el orden
  - Capa/nivel
  - Índice técnico

## � Características visuales

- **Embeds coloridos**: Cada tipo de cofre tiene su color distintivo
- **Emojis descriptivos**: Iconos para cada tipo de cofre
- **Información organizada**: Datos estructurados y fáciles de leer
- **Respuestas efímeras**: Solo tú puedes ver los resultados

## � Límites técnicos

- **Datos máximos**: 4000 caracteres hexadecimales (modal)
- **Jefes mostrados**: Hasta 8 jefes individuales (limitación de Discord)
- **Formato requerido**: Datos hexadecimales válidos del Cheat Engine

## ⚠️ Solución de problemas

### "Datos Inválidos"
- Verifica que hayas copiado correctamente los datos del Cheat Engine
- Asegúrate de usar la dirección correcta (AVA_TEMPLE_START...)
- Los datos deben ser hexadecimales válidos

### "Sin Resultados"
- Los datos pueden ser de una zona diferente
- Verifica que estés en un calabozo activo
- Intenta actualizar los datos en el Cheat Engine

### Error de procesamiento
- Reporta el error técnico al desarrollador
- Intenta con datos más pequeños si es muy largo
- Verifica la conexión y vuelve a intentar

## ⚠️ Notas Importantes
- Los datos deben ser hexadecimales válidos obtenidos del Cheat Engine
- La respuesta es efímera para mantener privacidad
- Se muestran máximo 8 jefes individuales para evitar límites de Discord
- El comando valida automáticamente el formato de entrada

## 🛠️ Manejo de Errores
- **Datos inválidos:** Muestra formato esperado y ejemplos
- **Sin resultados:** Indica posibles causas del problema
- **Error técnico:** Proporciona información de debugging

---
*Hecho con ❤️ por @chuny-dev*