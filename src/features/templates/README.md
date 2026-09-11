# Arquitectura de plantillas

El sistema de plantillas utiliza una arquitectura por capas. Creación y edición
comparten el mismo editor y las mismas reglas, evitando que ambos flujos se
comporten de forma distinta.

## Capas

- `domain/`: reglas puras sobre plantillas y grupos de armas. No importa
  Discord, MongoDB ni almacenes de sesiones.
- `application/`: ciclo de vida de casos de uso, transferencias CRUD y sesiones.
  Valida propiedad, servidor y expiración antes de entregar estado editable.
- `presentation/`: definición del comando, controlador CRUD y pantallas del
  editor. Traduce interacciones a llamadas de aplicación.

## Reglas de mantenimiento

1. Las nuevas reglas de plantillas deben escribirse y probarse en `domain/`.
2. El acceso a sesiones debe pasar por el almacén de `application/`; conocer un
   `customId` no debe conceder acceso al estado de otro usuario o servidor.
3. Los componentes de Discord se construyen en `presentation/`.
4. `src/commands/utility/template.js` es únicamente la fachada del comando. No
   contiene estado, pantallas ni reglas de negocio.
5. El enrutador general entrega cada componente a `handleInteraction`; los
   controladores internos son los únicos que interpretan sus identificadores.
6. Las conversiones deben mantener los formatos MongoDB y legacy hasta que una
   migración de datos explícita permita retirar el formato antiguo.

## Estado de la migración

La migración está completa:

- listar, clonar, renombrar, eliminar, importar y exportar están en el
  controlador CRUD;
- creación y edición usan `template-editor-service` y el mismo almacén de
  sesiones;
- información, configuración, roles, grupos, catálogo y armas viven en
  pantallas especializadas;
- los almacenes no exponen sus `Map` y validan usuario, servidor y expiración;
- los handlers y el middleware legacy fueron retirados.
