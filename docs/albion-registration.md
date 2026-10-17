# Registro de gremios de Albion

## Preparación

El bot necesita los permisos **Gestionar roles**, **Gestionar apodos**, **Expulsar miembros**, **Ver canal**, **Enviar mensajes** e **Insertar enlaces**. Sitúa su rol por encima de los roles de gremio y de los miembros cuyo apodo deba cambiar o a quienes deba expulsar. El propietario del servidor no puede ser expulsado. El panel muestra si faltan los permisos de roles, apodos o expulsión. Activa el intent de miembros del servidor en el portal de Discord.

1. Ejecuta `/setup-registro` como administrador. El panel es privado para quien abrió el comando.
2. Selecciona el servidor de Albion: Americas, Europe o Asia.
3. Selecciona el canal de auditoría para los cambios de roles.
4. Pulsa **Añadir gremio**, escribe el nombre exacto del gremio en Albion y una etiqueta de 1 a 12 letras o números. La búsqueda de Albion confirma el gremio. Selecciona el rol principal para guardarlo.
5. En **Editar un gremio** puedes cambiar el rol principal, añadir hasta 24 roles adicionales, editar la etiqueta o eliminar el gremio. El panel muestra todos los gremios; en configuraciones grandes resume los roles adicionales para respetar los límites de Discord. Al editar un gremio puedes ver su lista completa de roles.
6. Ejecuta `/registro-panel` en el canal donde quieres publicar el formulario. El bot publica un embed con el botón **Registrar personaje**.

Ejemplo de configuración:

| Gremio | Rol principal | Tag | Roles adicionales |
| --- | --- | --- | --- |
| Bon Bon Bum | BBB | BBB | Ninguno |
| MONASTERIO | Monasterio | MONS | GUERRA DEL NORTE |

Los gremios se configuran individualmente. La pertenencia a una alianza no concede roles. Puedes asignar cualquier rol adicional a varios gremios si quieres darles el mismo acceso.
Las reglas de alianza creadas con comandos antiguos dejan de aplicarse; sus roles previamente concedidos se retiran tras la verificación confirmada.

## Uso por jugadores

El jugador pulsa **Registrar personaje** y escribe su nombre exacto en el modal. El bot consulta su ficha de Albion, identifica el gremio configurado y asigna el rol principal y los adicionales. Cambia el apodo a `[TAG] NombreDelPersonaje`, respetando el límite de 32 caracteres de Discord. El personaje queda vinculado a una sola cuenta de Discord en ese servidor y al gremio en el que se registró.

Volver a enviar el registro o reingresar en Discord no cambia el gremio vinculado ni reinicia una comprobación de salida pendiente. Si el personaje vuelve a su gremio original, el bot puede restaurar su acceso. Para vincularlo a otro gremio, un administrador debe usar primero **Desvincular usuario** y el jugador debe registrarse de nuevo.

La API pública de Albion muestra el gremio de un personaje, pero no demuestra que la persona de Discord sea su propietaria. El registro automático concede roles basándose en el nombre proporcionado. Un administrador puede pulsar **Desvincular usuario** en `/setup-registro` para liberar un personaje y retirar los roles gestionados.

## Sincronización automática

Todos los días a la **1:00 a. m., hora de Colombia (`America/Bogota`)**, el bot inicia una revisión completa de los usuarios registrados en sus servidores de Discord. Recorre todos los registros en lotes de 20, aunque su próxima revisión individual todavía no haya vencido. También comprueba los registros marcados como ausentes para recuperar posibles reingresos que no hayan generado un evento. La revisión continúa si falla un usuario y espera cualquier lote periódico que ya esté en curso. Registra en la consola el inicio, la finalización y los errores del proceso diario.

El proceso se programa automáticamente cuando el bot se conecta a Discord y se vuelve a programar al reiniciar. El bot debe estar encendido a la 1:00 a. m. para ejecutar la revisión diaria. Además conserva las revisiones individuales cada seis horas y los reintentos pendientes, procesados en lotes cada cinco minutos.

El bot confirma por sí mismo las salidas consultando la API de Albion; no requiere confirmación de un usuario o administrador. Cuando detecta que el personaje dejó su gremio de registro, espera al menos **72 horas** desde la primera detección y exige al menos **tres lecturas válidas del mismo gremio de destino**, separadas por **12 horas**. Una lectura del gremio original cancela la sospecha; un destino distinto reinicia la confirmación. Los errores o respuestas incompletas de la API no retiran roles ni provocan expulsiones.

Si la API confirma que el personaje dejó su gremio de registro, el bot retira los roles gestionados, restaura el apodo anterior siempre que nadie lo haya editado manualmente y **expulsa al usuario de este servidor de Discord**, incluso si el nuevo gremio también está configurado en ese Discord. No transfiere automáticamente el registro ni los roles al nuevo gremio. Esta salida también se comprueba si el registro ya no tiene roles asignados. Es una expulsión, no un baneo.

La confirmación se guarda antes de retirar roles. Si faltan permisos, la jerarquía impide expulsar o Discord falla, el bot registra el error en el canal de auditoría y vuelve a intentarlo una hora después, aunque los roles ya se hayan retirado o el bot se haya reiniciado. Una salida confirmada se vuelve a comprobar cuando el usuario entra otra vez: solo una ficha válida que lo ubique en su gremio original restaura el acceso. Eliminar una regla de gremio retira sus roles, pero no causa expulsiones por sí solo; también cancela las expulsiones pendientes originadas por esa regla y conserva el gremio vinculado sin transferirlo a otro. Desvincular un usuario libera el personaje y su gremio vinculado sin expulsarlo.

Las consultas iguales que coinciden en el tiempo se comparten. Las búsquedas se guardan brevemente en caché, y las fichas de personajes solo 30 segundos. Las solicitudes simultáneas a Albion se limitan a dos para reducir las demoras y los picos de tráfico. Al añadir un gremio se exige una ficha completa cuyo ID coincida con el resultado de búsqueda; las respuestas incompletas se informan como errores y no se guardan.
El formulario y la búsqueda de gremios esperan hasta 45 segundos por solicitud y reintentan hasta cuatro veces con pausas crecientes. Una búsqueda completa puede tardar varios minutos si Albion responde lentamente; el bot mantiene la interacción abierta. Las comprobaciones periódicas usan límites menores para no bloquear toda la cola.

La configuración, los registros y la propiedad de los roles se separan por servidor de Discord. Los roles concedidos manualmente y ajenos a este sistema no se retiran.
