# Setup interactivo

El comando `/setup` ofrece una configuración inicial sin depender de comandos
separados. Solo pueden abrirlo administradores y cada componente queda ligado
al usuario y al servidor que iniciaron el asistente.

El flujo permite:

- seleccionar los roles gestores de raids, plantillas y notificaciones;
- configurar opcionalmente roles y canal de auditoría de economía;
- comprobar los permisos del bot en el canal actual;
- volver al resumen después de cada cambio sin perder el panel.

La sección de economía define los roles de balance para el servidor y el canal
de auditoría para el canal donde se ejecuta `/setup`. Solo quienes tengan uno
de esos roles pueden usar `/balance`, incluso para crear contextos. Los
contextos, saldos, movimientos y rankings se consultan siempre dentro del canal
donde se ejecuta el comando. «Avalonianas» en dos canales son balances distintos.
Hay que configurar la auditoría en cada canal antes de modificar sus saldos.
Quitar la auditoría de un canal no cambia los roles ni otros canales.
La acción «Quitar roles de balance» revoca el acceso en todos los canales sin
borrar los saldos ni sus movimientos.

Los registros antiguos que no tienen identificador de canal permanecen en
MongoDB. No aparecen en ningún canal porque no se puede determinar a cuál
pertenecen sin una asignación explícita.

Comandos de balance:

- `/balance crear-contexto nombre:<nombre>`: crea un libro de saldos en el canal actual.
- `/balance contextos`: lista los libros del canal actual.
- `/balance ver contexto:<nombre> usuario:<miembro>`: consulta el saldo.
- `/balance agregar|quitar contexto:<nombre> usuario:<miembro> cantidad:<entero> motivo:<texto>`: modifica el saldo y registra la transacción.
- `/balance reiniciar contexto:<nombre> usuario:<miembro>`: deja el saldo en cero y registra la transacción.
- `/balance historial contexto:<nombre> usuario:<miembro>` y `/balance ranking contexto:<nombre>`: consultan movimientos y mayores saldos.

Las respuestas son privadas para el operador. Cada cambio de saldo se registra
atómicamente en MongoDB y se publica en el canal de auditoría configurado. Si
Discord no acepta el mensaje de auditoría, el comando advierte que la operación
sí quedó guardada; el historial conserva el registro.

Los valores se guardan en MongoDB. `/setup` es la única
interfaz de configuración de roles y economía; los antiguos comandos `/roles`
y `/eco` fueron retirados para evitar configuraciones divergentes.
