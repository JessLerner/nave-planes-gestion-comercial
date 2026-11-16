# Publicación en Cloudflare

Cloudflare Worker concentra las APIs y los archivos estáticos en una única publicación. Esta guía describe configuración de repositorio; no acredita qué revisión está activa en un entorno remoto.

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
6. Configurar en Supabase las Redirect URLs del dominio Cloudflare autorizado antes de enviar invitaciones o recuperaciones de contraseña.

El plan Free alcanza para la primera etapa: un Worker con 100.000 solicitudes diarias y Hyperdrive con 100.000 consultas diarias. Si el volumen real los supera, se evalúa Workers Paid antes de que la plataforma deje de responder.
