# Albions Landing

Landing page oficial de **Albions**, el bot de Discord para organizar raids de Albion Online. Presenta sus capacidades y una galería interactiva con evidencias reales del flujo de raids y del editor de plantillas.

## Desarrollo

```bash
npm install
npm start
```

La aplicación queda disponible en `http://localhost:4200`.

## Verificación

```bash
npm test -- --watch=false
npm run build
```

La compilación de producción se genera en `dist/`.

## Publicación en Render

El repositorio principal incluye un archivo `render.yaml` preparado para publicar esta carpeta como un sitio estático.

1. En Render, selecciona **New > Blueprint**.
2. Conecta el repositorio `Chuny-AI/raid-helper`.
3. Selecciona la rama `main` y aplica el Blueprint.
4. Render creará el servicio `albions-landing` y publicará la carpeta `website/dist`.

Cada cambio posterior en `website/` que llegue a `main` iniciará una publicación automática.

También se puede crear manualmente como **Static Site** con estos valores:

- Root Directory: `website`
- Build Command: `npm ci && npm run build`
- Publish Directory: `dist`
- Node: `22.22.0`
