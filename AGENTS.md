# NAVE.Plan — instrucciones para agentes

## Propósito y alcance

NAVE.Plan es una aplicación de gestión comercial y operativa: estructura de personal (Legajos), equipos y vendedores, operaciones, scoring, leads de FoxCRM, anticipos, recursos, listas de precios/circulares, cartera y módulos de RR. HH. Este repositorio contiene la aplicación y sus contratos de persistencia; no asumir que un módulo presente en código esté desplegado o validado en producción.

Trabajar sólo sobre el alcance pedido. Preservar los circuitos existentes y no transformar una propuesta, documentación o migración en una funcionalidad operativa sin autorización.

## Arquitectura comprobada

- Frontend: React 19 + TypeScript + Vite + Tailwind (`src/`).
- API: módulos TypeScript en `api/`, adaptados por `cloudflare/worker.ts` para rutas `/api/*`; el Worker sirve además los activos compilados.
- Persistencia y autenticación: Supabase (PostgreSQL, Auth, Storage, RLS, migraciones y Edge Functions en `supabase/`). El navegador obtiene únicamente la configuración pública mediante `/api/public-config`; no colocar credenciales de servidor en frontend.
- Worker: Cloudflare Workers con Hyperdrive como opción de conexión para las APIs heredadas. No asumir que está desplegado ni que todas las rutas o cambios locales lo están.
- Integración de hojas: Firebase Auth solicita acceso de sólo lectura a Google Drive/Sheets para el extractor (`src/services/extractor/`).

## Estructura del repositorio

- `src/`: interfaz, autenticación, contexto de datos, componentes, servicios y pruebas de frontend/dominio.
- `api/`: handlers de operaciones, nómina, Fox, recursos, precios, sesión y otros datos operativos.
- `cloudflare/worker.ts`: enrutador/adaptador de los handlers API y activos SPA.
- `supabase/migrations/`: fuente de verdad de los cambios de esquema.
- `supabase/functions/`: Edge Functions. `ingest-scoring-sheet` recibe la ingesta autenticada de scoring; `sync-app-control-roster` consume App Control Operaciones en modo lectura.
- `scripts/`: utilidades y pruebas de bootstrap local; no son comandos de producción.
- `docs/`: decisiones, procedimientos y planes. Tratar los planes y checklists como documentación, no como evidencia de despliegue.
- `apps-script/`: código relacionado con Apps Script; confirmar siempre la versión activa antes de modificar una integración externa.
- `public/`: activos estáticos. `dist/`, `.local-supabase/`, `tmp/` y `node_modules/` son artefactos/locales, no fuente de verdad.

## Usuarios, Legajos y estructura comercial

- Los roles de aplicación comprobados son `admin`, `gerente`, `supervisor` y `rrhh`. La asignación procede de `hr_roles.app_role_mapping` y se proyecta a `profiles`.
- `staff_members` (Legajos) y los cargos en `hr_roles` son la fuente de verdad de la nómina y jerarquía. No mantener una segunda estructura desde pantallas, APIs o importadores.
- La migración `20261031_032_legajos_atomic_roster_sync.sql` reconstruye, en la misma transacción, las proyecciones `teams`, `sellers` y el alcance de `profiles` al cambiar Legajos. Los equipos derivan de supervisores activos; los vendedores, de roles que crean registro de vendedor.
- `teams` y `sellers` son proyecciones operativas. `is_sales_team` decide explícitamente si un equipo participa de selectores y circuitos comerciales; no inferirlo de datos históricos.
- El gerente efectivo se resuelve desde la jerarquía de Legajos y permite excepciones manuales explícitas. No sobrescribir excepciones manuales al recalcular jerarquías.
- La condición operativa (activo/inactivo, cargo, responsable y pertenencia a equipo) es distinta del estado administrativo de incorporación, incluyendo Coaching y Alta Definitiva. No habilitar, deshabilitar, proyectar ni conceder permisos comerciales sólo por un estado administrativo sin la regla de negocio y migración correspondientes.

## Autorización y datos sensibles

- La UI no es una frontera de seguridad. Cada handler debe validar el token de Supabase y aplicar alcance del lado servidor.
- Supervisión se limita a su equipo. Gerencia se limita a equipos subordinados a su gerente efectivo. Administración/Dirección (`admin`) y RR. HH. (`rrhh`) sólo tienen alcance global en los circuitos que lo implementan expresamente; verificar cada API y política antes de extenderlo.
- Datos personales, Legajos, documentos de incorporación, DNI, contactos, operaciones y archivos requieren mínimo privilegio, RLS/políticas adecuadas y respuestas API con el mínimo dato necesario. No registrar ni exponer PII, documentos, URLs privadas, secretos ni credenciales en código, pruebas, logs o documentación.
- Las credenciales de servicio y secretos de ingesta son exclusivamente del servidor/entorno. Usar variables de entorno existentes; nunca copiarlas a archivos versionados ni al cliente.

## Integraciones: estado verificable

- **Supabase:** implementado en código para autenticación, datos operativos, migraciones, RLS y Edge Functions. Aplicación remota, políticas actuales y datos reales deben verificarse en el entorno correspondiente.
- **Cloudflare:** Worker y configuración existen en el repositorio; no constituyen prueba de despliegue ni de que la revisión local esté activa.
- **FoxCRM:** existen parser de reportes, endpoints, migraciones de snapshots/mapeos y RPC de importación. El mapeo y las sugerencias respetan la estructura; no afirmar sincronización automática o datos actuales sin evidencia del entorno.
- **Google Sheets / Drive:** el extractor solicita scopes de sólo lectura. La Edge Function de scoring guarda una corrida y espejo de filas; la fuente no debe modificarse y sus categorías no se traducen automáticamente a aprobación/rechazo.
- **App Control Operaciones:** existe una Edge Function de lectura que exige vendedores `{ name, active }` y no modifica Parte Diario. La disponibilidad de Apps Script, sus secretos y su programación no están verificados por el repositorio.
- **Listas/circulares y otros módulos:** distinguir siempre código/migraciones existentes de flujos pendientes de validación funcional, autorización y despliegue.

## Migraciones y Supabase local

- Crear migraciones incrementales, ordenadas y revisables en `supabase/migrations/`; no editar ni reordenar migraciones históricas aplicadas.
- No ejecutar migraciones remotas, `supabase link`, `db push`, SQL en producción ni reinicios sin autorización explícita. Nunca ejecutar en producción `20261030_012_reset_roster_foundation.sql`: su propósito histórico es destructivo para la nómina/proyecciones.
- Para pruebas locales aisladas, `scripts/generate-local-supabase-migrations.mjs` copia las migraciones a `.local-supabase/` y genera un manifiesto. `supabase/migrations/` sigue siendo la fuente de verdad. No versionar valores de `supabase status --output env`.
- Antes de utilizar `NAVE_TEST_DATABASE_URL`, verificar que apunte sólo a `127.0.0.1:54322` o `localhost:54322`. Las pruebas locales deben usar datos sintéticos y revertir sus transacciones.
- No iniciar, detener, reiniciar ni resetear Supabase/Docker salvo que la tarea lo autorice expresamente.

## Comandos disponibles

No instalar dependencias ni iniciar servicios salvo autorización. Los scripts declarados actualmente son:

```powershell
npm run lint                 # tsc --noEmit
npm test                     # node --import tsx --test src/**/*.test.ts
npm run build                # vite build
npm run build:cloudflare     # vite build --base=/
npm run dev                  # servidor local heredado
npm run cf:dev               # Wrangler local
npm run cf:deploy            # build + despliegue Cloudflare (requiere autorización)
node scripts/generate-local-supabase-migrations.mjs
node scripts/verify-local-legajos-schema.mjs
node scripts/run-local-legajos-integration.mjs
node scripts/run-local-resource-update-integration.mjs
```

Los comandos de Supabase local y su secuencia documentada están en `docs/LOCAL_SUPABASE_BOOTSTRAP.md`; no ejecutarlos por defecto. Los glob de pruebas pueden depender del shell: confirmar los archivos ejecutados y reportar cualquier limitación.

## Política de cambios y entrega

- Antes de editar, revisar estado de Git y los archivos involucrados. Puede haber trabajo simultáneo: no modificar, formatear, restaurar ni incluir cambios ajenos.
- Modificar lo mínimo necesario. Mantener compatibilidad de contratos, datos históricos, autorizaciones y proyecciones; añadir o actualizar pruebas proporcionadas cuando corresponda.
- Prohibido hacer `commit`, `push`, despliegue, publicación, cambio de secretos o cualquier operación sobre producción sin autorización explícita.
- No declarar éxito por la mera presencia de código, una migración o un contenedor. Informar separadamente: **implementado**, **probado** (con comando/entorno), **pendiente** y **bloqueado**.
- Una funcionalidad está terminada sólo si: cumple el alcance y criterios acordados; preserva flujos existentes; valida autorización y datos sensibles; tiene pruebas pertinentes ejecutadas o una limitación explicada; y su estado de migración/despliegue se comunica sin inferencias.
