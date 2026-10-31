# Migración gradual a Cloudflare

La aplicación seguirá publicada en Vercel hasta que esta versión haya sido validada. El Worker concentra las once APIs existentes y los archivos estáticos en una única publicación, evitando el límite de funciones del plan Hobby.

## Preparación local

1. Ejecutar `npm install` para instalar Wrangler.
2. Copiar `.dev.vars.example` como `.dev.vars` y completar únicamente las credenciales locales.
3. Ejecutar `npm run build:cloudflare` y luego `npm run cf:dev`.

## Configuración en Cloudflare

1. En **Workers & Pages**, crear un Worker desde este repositorio o con `npx wrangler login` y `npm run cf:deploy`.
2. En **Workers > nave-planes-gestion-operativa > Settings > Variables and Secrets**, cargar `SUPABASE_URL` y `SUPABASE_ANON_KEY` como secretos.
3. Crear un Hyperdrive en **Workers & Pages > Hyperdrive**, usando la conexión directa de Supabase. No cargar la contraseña de base como variable del Worker.
4. Agregar al `wrangler.jsonc` la vinculación que entregue Cloudflare:

```jsonc
"hyperdrive": [{ "binding": "HYPERDRIVE", "id": "ID_REAL_DEL_HYPERDRIVE" }]
```

5. Publicar con `npm run cf:deploy`, probar login, Legajos, actualización de recursos, adelantos, operaciones e importación Fox en la URL `workers.dev`.
6. Recién después, mover el dominio desde Vercel al Worker.

El plan Free alcanza para la primera etapa: un Worker con 100.000 solicitudes diarias y Hyperdrive con 100.000 consultas diarias. Si el volumen real los supera, se evalúa Workers Paid antes de que la plataforma deje de responder.
