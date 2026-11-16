
# NAVE.Plan

NAVE.Plan es una plataforma interna de gestión comercial y operativa. Reúne Legajos, estructura de equipos y vendedores, operaciones, scoring, FoxCRM, adelantos, recursos y listas de precios.

## Aplicación vigente

El circuito principal es React/Vite en `src/`, APIs TypeScript en `api/`, el adaptador de Cloudflare en `cloudflare/worker.ts` y Supabase en `supabase/` para datos, autenticación, políticas y funciones. La presencia de estos archivos no acredita su despliegue ni validación en un ambiente remoto.

## Carpetas principales

- `src/`: interfaz, autenticación, componentes, servicios y pruebas de frontend.
- `api/`: handlers de datos operativos, nómina, Fox, recursos y precios.
- `cloudflare/`: Worker que adapta las APIs y sirve la aplicación.
- `supabase/`: migraciones, políticas, Edge Functions y contratos de persistencia.
- `scripts/`: utilidades y validaciones locales; no son comandos de producción.
- `docs/`: decisiones, procedimientos y documentación del proyecto.
- `apps-script/`: integración relacionada con Google Apps Script; confirmar siempre la versión activa antes de modificarla.

## Componentes heredados o locales

`server.ts` conserva un prototipo Express local con rutas de desarrollo y ETL. No es el backend desplegable actual ni debe modificarse o eliminarse sin una tarea, evidencia de no uso y pruebas suficientes. Los directorios `dist/`, `.local-supabase/`, `tmp/` y `node_modules/` son artefactos locales, no fuentes de verdad.

## Dónde continuar

- [Instrucciones operativas](AGENTS.md)
- [Documento Maestro](docs/DOCUMENTO_MAESTRO_NAVE_PLAN.md)
- [Estado del Proyecto](docs/ESTADO_PROYECTO.md)

Las tareas, decisiones operativas, bloqueos y evidencias se gestionan en el Panel de escritorio indicado en `AGENTS.md`; no se duplican en este README.
