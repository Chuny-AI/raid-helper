# Setup interactivo

El comando `/setup` ofrece una configuración inicial sin depender de comandos
separados. Solo pueden abrirlo administradores y cada componente queda ligado
al usuario y al servidor que iniciaron el asistente.

El flujo permite:

- seleccionar los roles gestores de raids, plantillas y notificaciones;
- configurar opcionalmente roles y canal de auditoría de economía;
- seleccionar uno o varios canales generadores de salas de voz temporales;
- comprobar los permisos del bot en el canal actual;
- volver al resumen después de cada cambio sin perder el panel.

La sección «Salas temporales» admite hasta 25 canales de voz generadores. Cada
generador debe estar dentro de una categoría donde el bot tenga permisos para
ver y gestionar canales, conectarse y mover miembros. Al entrar una persona se
crea una sala en esa categoría, sincronizada con sus permisos, y se traslada a
la persona. La sala se conserva mientras tenga participantes y se elimina al
quedar vacía. Los canales creados se registran para poder limpiarlos después de
un reinicio del bot.

Las salas de voz de los raids no se configuran en `/setup`: al iniciar el
evento se crean en la categoría elegida con el parámetro `activity_category`.
El canal elegido con `activity_channel` solo determina dónde se publica el raid
y se envían las menciones; puede pertenecer a otra categoría. Si no se indica
una categoría de voz, se usa la del canal de publicación o la raíz del servidor.
El parámetro de rol de visibilidad del raid controla quién puede ver cada sala.

La sección de economía define los roles de balance y el canal de auditoría del servidor.
Solo quienes tengan uno de esos roles pueden usar `/balance`, incluso para crear contextos.
Cada contexto es una categoría única del servidor. Sus saldos, movimientos y rankings
se comparten en todos los canales e hilos. Configurar una vez la auditoría permite
modificar balances desde cualquier lugar del servidor.

Al actualizar, los saldos antiguos de la misma categoría y usuario se suman aunque
procedan de distintos canales. Se conserva todo el historial y una copia de los registros
originales en `economy_scope_migrations`. Si había varias configuraciones de auditoría,
se conserva la más reciente. Los registros sin categoría explícita se mantienen sin
asignarles una categoría arbitraria.

Comandos de balance:

- `/balance crear-contexto nombre:<nombre>`: crea una categoría del servidor.
- `/balance eliminar-contexto contexto:<nombre> confirmar:true`: elimina la categoría, todos sus saldos e historial, y registra la eliminación en auditoría.
- `/balance contextos`: lista las categorías, el saldo total y la deuda de cada una.
- `/balance ver contexto:<nombre> usuario:<miembro>`: consulta el saldo.
- `/balance agregar|quitar contexto:<nombre> usuario:<miembro> cantidad:<entero> motivo:<texto>`: modifica el saldo y registra el movimiento.
- `/balance reiniciar contexto:<nombre> usuario:<miembro>`: deja el saldo en cero.
- `/balance historial contexto:<nombre> usuario:<miembro>` y `/balance ranking contexto:<nombre>`: consultan movimientos y mayores saldos.

Las respuestas son privadas para el operador. Cada cambio de saldo se registra
atómicamente en MongoDB y se publica en el canal de auditoría configurado. Si
Discord no acepta el mensaje de auditoría, el comando advierte que la operación
sí quedó guardada; el historial conserva el registro.

Los valores se guardan en MongoDB. `/setup` es la única
interfaz de configuración de roles y economía; los antiguos comandos `/roles`
y `/eco` fueron retirados para evitar configuraciones divergentes.
