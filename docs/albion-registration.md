# Registro de Albion

## Configuración

1. Concede al bot **Gestionar roles** y coloca su rol por encima de todos los roles que asignará.
2. Ejecuta `/register-setup configurar region:<Americas|Europe|Asia> auditoria:#canal`.
3. Añade una o varias reglas:
   - `/register-setup gremio nombre:<nombre exacto> roles:<@Rol1> <@Rol2>`
   - `/register-setup alianza jugador:<personaje de la alianza> roles:<@Rol3> <@Rol4>`
4. Revisa las reglas y sus IDs con `/register-setup reglas`.
5. En el canal donde quieras publicar el formulario, ejecuta `/panel`. El mensaje tendrá un botón permanente para abrir el formulario.

Cada usuario puede usar `/register jugador:<nombre exacto>` o el botón del panel. La región y las reglas pertenecen únicamente a ese servidor de Discord. Un personaje solo puede vincularse a una cuenta de Discord dentro del mismo servidor.

`/register-setup quitar tipo:<gremio|alianza> id:<ID>` retira una regla. `/register-setup desvincular usuario:@persona` retira los roles asignados por este sistema y libera su personaje para otro registro.

## Sincronización

El bot revisa personajes cada seis horas en lotes pequeños. Si detecta una salida del gremio o alianza, programa otra comprobación 30 minutos después. Dos respuestas válidas que confirman la pérdida retiran los roles correspondientes. Si la API falla o devuelve datos incompletos, conserva los roles y reintenta. Cuando un usuario vuelve al Discord, valida su personaje de nuevo.

La API `gameinfo` de Albion puede responder con retraso y no autentica que quien introduce un nombre sea el dueño del personaje. Los administradores deben supervisar el canal de auditoría para detectar registros indebidos. Un personaje no se puede usar por dos usuarios del mismo Discord.
