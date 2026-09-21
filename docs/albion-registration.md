# Registro de gremios de Albion

## Preparación

El bot necesita los permisos **Gestionar roles**, **Gestionar apodos**, **Ver canal**, **Enviar mensajes** e **Insertar enlaces**. Sitúa su rol por encima de los roles de gremio y de los miembros cuyo apodo deba cambiar. Activa el intent de miembros del servidor en el portal de Discord.

1. Ejecuta `/setup-registro` como administrador. El panel es privado para quien abrió el comando.
2. Selecciona el servidor de Albion: Americas, Europe o Asia.
3. Selecciona el canal de auditoría para los cambios de roles.
4. Pulsa **Añadir gremio**, escribe el nombre exacto del gremio en Albion y una etiqueta de 1 a 12 letras o números. La búsqueda de Albion confirma el gremio. Selecciona el rol principal para guardarlo.
5. En **Editar un gremio** puedes cambiar el rol principal, añadir hasta 24 roles adicionales, editar la etiqueta o eliminar el gremio. El panel siempre muestra todos los gremios y sus roles en embeds.
6. Ejecuta `/registro-panel` en el canal donde quieres publicar el formulario. El bot publica un embed con el botón **Registrar personaje**.

Ejemplo de configuración:

| Gremio | Rol principal | Tag | Roles adicionales |
| --- | --- | --- | --- |
| Bon Bon Bum | BBB | BBB | Ninguno |
| MONASTERIO | Monasterio | MONS | GUERRA DEL NORTE |

Los gremios se configuran individualmente. La pertenencia a una alianza no concede roles. Puedes asignar cualquier rol adicional a varios gremios si quieres darles el mismo acceso.
Las reglas de alianza creadas con comandos antiguos dejan de aplicarse; sus roles previamente concedidos se retiran tras la verificación confirmada.

## Uso por jugadores

El jugador pulsa **Registrar personaje** y escribe su nombre exacto en el modal. El bot consulta su ficha de Albion, identifica el gremio configurado y asigna el rol principal y los adicionales. Cambia el apodo a `[TAG] NombreDelPersonaje`, respetando el límite de 32 caracteres de Discord. El personaje queda vinculado a una sola cuenta de Discord en ese servidor.

La API pública de Albion muestra el gremio de un personaje, pero no demuestra que la persona de Discord sea su propietaria. El registro automático concede roles basándose en el nombre proporcionado. Un administrador puede pulsar **Desvincular usuario** en `/setup-registro` para liberar un personaje y retirar los roles gestionados.

## Sincronización automática

El bot revisa los registros cada seis horas, en lotes pequeños. Si detecta que un personaje dejó su gremio o pasó a otro configurado, exige una segunda lectura válida de Albion al menos 30 minutos después antes de retirar los roles anteriores. Los errores o respuestas incompletas de la API no retiran roles. Tras confirmar el cambio, asigna los roles del nuevo gremio y actualiza el apodo. Si ya no pertenece a un gremio configurado, restaura el apodo anterior siempre que nadie lo haya editado manualmente mientras tanto.

Las consultas iguales que coinciden en el tiempo se comparten. Las búsquedas se guardan brevemente en caché, y las fichas de personajes solo 30 segundos. Las solicitudes simultáneas a Albion se limitan a dos para reducir las demoras y los picos de tráfico.
El formulario y la búsqueda de gremios esperan hasta 45 segundos por solicitud y reintentan hasta cuatro veces con pausas crecientes. Una búsqueda completa puede tardar varios minutos si Albion responde lentamente; el bot mantiene la interacción abierta. Las comprobaciones periódicas usan límites menores para no bloquear toda la cola.

La configuración, los registros y la propiedad de los roles se separan por servidor de Discord. Los roles concedidos manualmente y ajenos a este sistema no se retiran.
