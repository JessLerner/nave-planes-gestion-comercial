# Ingesta de Scoring

La hoja fuente se lee, nunca se modifica. Cada importación guarda una corrida y un espejo de la última fila vista en `scoring_source_rows`.

- La clave operativa es `SX`, que equivale a `N° Suscripción` de Parte Diario.
- `CLIENTE` se conserva como control, no como clave única: un reemplazo puede crear una SX nueva para el mismo cliente.
- `CATEGORIA` no se traduce automáticamente a aprobado/rechazado hasta validar sus valores con Administración.

## Puente seguro

El extractor debe enviar solamente filas que haya leído de una hoja visible y autenticada a la Edge Function `ingest-scoring-sheet`. El cuerpo es:

```json
{
  "brand": "Peugeot",
  "sourceUrl": "https://docs.google.com/spreadsheets/d/...",
  "sheetName": "Nombre real de la pestaña",
  "rows": [{ "SX": "...", "CLIENTE": "..." }]
}
```

Debe incluir el encabezado `x-ingest-secret` con el secreto configurado en Supabase. La clave de servicio de Supabase nunca va en la extensión ni en el navegador.
