# Ejemplo de Uso del Comando /migrate

## Migrar desde JSON

Para migrar un template desde JSON, usa el comando `/migrate` con el parámetro `json`:

```
/migrate json:"{\"title\":\"Avaloniana\",\"time\":\"1h\",\"description\":\"**Reglas**\\n\\n**Comidas:** Todos deben llevar 6 comidas de cada tipo que sean requeridas.\",\"color\":\"#00FFFF\",\"image\":\"https://example.com/image.png\",\"url\":\"\",\"roles\":[\"1234567890123456789\"],\"weapons\":{\"tank\":{\"displayName\":\"Martillo relámpago\",\"defaultEmoji\":\"1286454020675862549\",\"data\":[{\"id\":126,\"name\":\"\",\"units\":1,\"image\":\"\",\"emoji\":\"1415437240846258237\",\"url\":\"\"}]}}}"
```

## Migrar desde archivos

Para migrar todos los templates desde la carpeta `/src/templates`:

```
/migrate from_files:true
```

## Estructura del JSON

El JSON debe seguir esta estructura:

```json
{
  "title": "Nombre del Template",
  "time": "1h",
  "description": "Descripción del template",
  "color": "#00FFFF",
  "image": "URL de la imagen",
  "url": "URL del template (opcional)",
  "roles": ["ID1", "ID2"],
  "notifyAll": false,
  "weapons": {
    "weapon_key": {
      "displayName": "Nombre del arma",
      "defaultEmoji": "emoji_id",
      "data": [
        {
          "id": 123,
          "name": "",
          "units": 1,
          "image": "",
          "emoji": "emoji_id",
          "url": ""
        }
      ]
    }
  }
}
```

## Notas Importantes

- Solo administradores pueden usar este comando
- El JSON debe estar correctamente escapado
- No se pueden crear templates duplicados (mismo título)
- Las URLs se añaden automáticamente si no están presentes
