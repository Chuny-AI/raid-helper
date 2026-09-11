# Setup interactivo

El comando `/setup` ofrece una configuración inicial sin depender de comandos
separados. Solo pueden abrirlo administradores y cada componente queda ligado
al usuario y al servidor que iniciaron el asistente.

El flujo permite:

- seleccionar los roles gestores de raids, plantillas y notificaciones;
- configurar opcionalmente roles y canal de auditoría de economía;
- comprobar los permisos del bot en el canal actual;
- volver al resumen después de cada cambio sin perder el panel.

Los valores se guardan en las colecciones existentes. `/setup` es la única
interfaz de configuración de roles y economía; los antiguos comandos `/roles`
y `/eco` fueron retirados para evitar configuraciones divergentes.
