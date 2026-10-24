# Sincronización de nómina desde App Control Operaciones

Esta función sólo lee la respuesta existente del Apps Script de App Control Operaciones. No escribe, edita ni modifica Parte Diario.

Configurar en Supabase Edge Functions:

```text
APP_CONTROL_OPERACIONES_URL=<URL /exec publicada de Apps Script>
INGEST_SHARED_SECRET=<secreto largo y aleatorio>
```

La función acepta `POST` con el encabezado `x-ingest-secret`. Requiere que el Apps Script entregue vendedores como `{ name, active }`; así no puede reactivar por error a personal dado de baja. Descarta filas cuyo vendedor sea `Convencional`, de manera insensible a mayúsculas y acentos, y hace *upsert* de supervisores y vendedores activos.
