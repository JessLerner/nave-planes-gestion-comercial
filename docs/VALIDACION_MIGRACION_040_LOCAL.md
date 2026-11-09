# Validación local — migración 040

**Corte:** 08/11/2026.  
**Alcance:** validación exclusivamente local de `20261106_040_access_account_management.sql`. Se ejecutó un reset autorizado sobre la instancia descartable `supabase_db_naveplan_local_bootstrap`; no se conectó a servicios remotos, no se leyó ningún secreto, no hubo despliegues ni commits.

## Fase 1 — diagnóstico

| Comprobación | Resultado | Evidencia | Riesgo pendiente |
| --- | --- | --- | --- |
| Docker Desktop | EJECUTADA | Cliente y servidor Docker `29.9.2`; contenedores `supabase_*_naveplan_local_bootstrap` activos. PostgreSQL figura saludable y publicado en `0.0.0.0:54322`; Kong en `0.0.0.0:54321`. | La conectividad TCP desde este entorno restringido a esos puertos falló; no implica que Docker esté detenido. |
| Supabase CLI | NO VERIFICADA | No existe binario `supabase` en `PATH`. `npx --no-install supabase --version` intentó descargar el paquete y falló por DNS/red hacia `registry.npmjs.org`. | No se puede ejecutar de forma controlada `supabase status` ni `supabase db reset`. |
| Contenido de base local | EJECUTADA, descartabilidad NO CONFIRMADA | Consulta agregada en `supabase_db_naveplan_local_bootstrap`: 42 entradas de ledger, 12 perfiles, 9 Legajos, 9 cargos y ninguna 040. Los perfiles usan exclusivamente el dominio `naveplan.local` y los 9 DNI están en el rango sintético >= 60.000.000. | Los agregados son consistentes con pruebas, pero no prueban por sí solos que la instancia sea descartable. No se inspeccionaron filas con PII. |
| `NAVE_TEST_DATABASE_URL` | NO VERIFICADA | La variable no está definida en esta sesión. | No hay conexión de prueba autorizada que pueda demostrarse limitada a `127.0.0.1:54322`. |
| Manifiesto local | EJECUTADA | `supabase/local-bootstrap-manifest.json` contiene 43 migraciones. La entrada 040 apunta a `.local-supabase/supabase/migrations/20261106000043_040_access_account_management.sql`; su SHA-256 coincide con la fuente. | Ninguno para la copia local; no acredita aplicación SQL. |

## Fase 2 — bloqueada por el ledger de la migración

La autorización posterior confirmó que la instancia es descartable. Se revalidó antes de operar el contenedor `supabase_db_naveplan_local_bootstrap`, la base `postgres` y el destino `127.0.0.1:54322`; no se utilizó ninguna URL remota.

| Prueba | Resultado | Evidencia | Riesgo pendiente |
| --- | --- | --- | --- |
| Reset local sin seed | EJECUTADA | `supabase db reset --local --no-seed` apuntó a `local stack (127.0.0.1:54322)`. La CLI dejó aplicadas las versiones 001–039 (42 entradas locales). | 040 no quedó aplicada. |
| Aplicación de 040 por CLI | FALLIDA | `supabase migration up --local` devolvió `ERROR: duplicate key value violates unique constraint "schema_migrations_pkey" (SQLSTATE 23505)`, clave `(version)=(20261106000043)`, al insertar el ledger de la CLI. | Impide aplicar 040 mediante el mecanismo local de migraciones. |
| Estado atómico tras la falla | EJECUTADA | Lectura posterior: no hay entrada 040, `profile_access_permissions`, `access_account_audit` ni valor enum `administrativo`. | Confirma rollback; no quedaron objetos parciales para seguir probando. |
| Filas históricas con permisos retirados | NO VERIFICADA | Depende de que 040 pueda aplicarse primero. | El escenario no se puede construir de manera representativa hasta resolver el ledger. |
| RLS por cinco roles, JWT y alcances | NO VERIFICADA | Depende de las tablas y políticas de 040. | Sin evidencia para `admin`, `administrativo`, `rrhh`, `gerente` y `supervisor`. |
| Constraint, tablas y ledger | FALLIDA | El constraint no puede existir porque la migración revierte por el conflicto de ledger. | Migración no apta para el mecanismo de Supabase CLI actual. |
| Idempotencia SQL y de migraciones | NO VERIFICADA | La primera aplicación falla y revierte. | No se debe inferir idempotencia. |

### Error exacto y causa

La sentencia final incluida dentro de 040 intenta registrar su propia versión:

```sql
insert into supabase_migrations.schema_migrations(version, name)
values ('20261106000043', '040_access_account_management')
on conflict (version) do nothing;
```

Después de ejecutar el archivo, Supabase CLI registra automáticamente la misma versión en su ledger. Esa segunda inserción falla con la clave duplicada. La transacción de la CLI revierte el contenido completo de 040.

### Corrección propuesta — no aplicada

Separar el registro manual de ledger de la migración: retirar la inserción a `supabase_migrations.schema_migrations` del archivo 040 y, para una futura aplicación manual controlada en producción, registrar la versión como paso externo posterior y explícitamente aprobado. Esto permite que la CLI administre su propio ledger local y conserva una decisión auditable para el ledger remoto incompleto. Requiere autorización antes de modificar 040 o su guía de aplicación.

La preparación de CLI y URL fue verificada posteriormente. La continuación requiere autorización para corregir el conflicto de ledger descrito arriba; hasta entonces no corresponde repetir el reset ni las pruebas dependientes.

## Reintento autorizado tras corrección — detenido por entorno local

### Verificaciones previas y corrección aplicada

| Prueba | Resultado | Evidencia | Riesgo pendiente |
| --- | --- | --- | --- |
| Ledger de migraciones 001–039 | APROBADA | Búsqueda en 43 archivos: 040 era la única migración que referenciaba `supabase_migrations.schema_migrations`; las otras 42 no escriben el ledger. | La aplicación manual de producción debe decidir cómo registrar su ledger sin depender de la CLI. |
| Procedimiento de producción | NO VERIFICADA / DECISIÓN PENDIENTE | `docs/APLICAR_MIGRACION_040_ACCESOS.md` ordena ejecutar 040 en SQL Editor y luego esperar el registro manual del ledger. No hay evidencia local de un procedimiento alternativo tras retirar el `INSERT`. | No se modificó la guía; definir y aprobar el registro manual posterior antes de producción. |
| Corrección del bloqueo | APROBADA | Se eliminó exclusivamente el `INSERT` de `20261106000043` del archivo 040. No se cambiaron permisos, tablas, constraints, RLS, funciones ni tests. | El comentario adyacente sobre reconciliación del ledger queda asociado al procedimiento manual pendiente y no fue modificado. |
| Manifest y copia local | APROBADA | Versión local `20261106000043`; SHA-256 de fuente y manifest: `c0a5b632d054d12c4ca677822356799a2e7a05094abd008a410a2b5aac3984c3`. | Ninguno para la copia local. |
| Contratos de autorización | APROBADA, sin cambios requeridos | Ningún test referenciaba el `INSERT` eliminado. | Deben reejecutarse al recuperar el entorno local. |
| Destino previo al reintento | APROBADA | `docker inspect` confirmó `/supabase_db_naveplan_local_bootstrap` con `0.0.0.0:54322`; `supabase migration list --local` confirmó `127.0.0.1:54322`. | Ninguno antes del reset. |
| Reintento de `db reset --local --no-seed` | EJECUTADA / entorno no recuperado | La CLI mostró `Target: local stack (127.0.0.1:54322)` y `Resetting local database...`. | El contenedor desapareció después del comando. |
| Verificación posterior al reset | FALLIDA | `DbConnectError: failed to connect to postgres ... connect ECONNREFUSED 127.0.0.1:54322`; Docker devolvió `No such container: supabase_db_naveplan_local_bootstrap`. | No se puede continuar con migración, RLS, roles, histórico ni idempotencia. |

### Detención obligatoria

No se inició ni recreó el stack tras el error nuevo. Propuesta no aplicada: diagnosticar por qué `supabase db reset --local --no-seed` eliminó el contenedor sin recuperarlo y, sólo con autorización posterior, recrear el stack local mediante la CLI fijada antes de repetir cualquier prueba.

## Ejecución autónoma posterior — recuperación parcial y bloqueo de infraestructura

| Prueba | Resultado | Evidencia | Riesgo pendiente |
| --- | --- | --- | --- |
| Recuperación del stack | APROBADA PARCIAL | La CLI 3.0.0 recreó `supabase_db_naveplan_local_bootstrap` en `127.0.0.1:54322`; la CLI puede consultar el listado local. | PostgreSQL permanece `unhealthy`; servicios auxiliares no quedaron listos. |
| Aplicación ordenada mediante CLI | FALLIDA | `supabase migration up --local` aplicó 001–005 y falló en 006: `ERROR: relation "storage.buckets" does not exist (SQLSTATE 42P01)` al ejecutar `insert into storage.buckets`. | El stack recreado no inicializó el esquema Storage antes de las migraciones de proyecto. |
| 040, ledger, constraint y RLS | NO VERIFICADA | La aplicación se detuvo en 006, antes de 040. | No hay evidencia de 040 en este stack recreado. |
| Lint | APROBADA | `npm run lint` terminó correctamente. | Las pruebas de contrato y la matriz RLS deben repetirse tras recuperar los servicios locales. |

La causa anterior del contenedor desaparecido fue recuperable: `db reset` había recreado PostgreSQL y la CLI inició su bootstrap interno. La causa vigente es distinta y bloquea el objetivo: el stack creado con Supabase CLI 3.0.0 no tiene Storage listo cuando se intenta aplicar la migración 006. No se modificaron migraciones, políticas ni configuración para forzar el avance.

## Recuperación y validación local completa — 08/11/2026

El diagnóstico confirmó que `[storage] enabled = true` y que el esquema `storage`, incluida `storage.buckets`, terminó de inicializarse después del intento que ejecutó 006. Por lo tanto, el fallo fue una carrera de inicialización: se lanzó la aplicación de migraciones antes de que Storage estuviera listo, no un defecto de la 040.

La CLI no estaba disponible en `PATH` ni en caché y el registro npm no resolvía desde este entorno. Para no descargar ni cambiar la configuración, se ejecutaron las copias derivadas exactas, una por una y cada una dentro de una transacción, exclusivamente contra `supabase_db_naveplan_local_bootstrap` en `127.0.0.1:54322`; el ledger se registró tras cada archivo exitoso. El resultado fue 43 versiones, desde `20261024000001` hasta `20261106000043 | 040_access_account_management`.

| Verificación | Resultado |
| --- | --- |
| Storage y 006 | Aprobada: `rrhh-legajos` existe y es privado. |
| 001–040 y ledger | Aprobada: 43 entradas; 040 aparece una vez. |
| Objetos de 040 | Aprobada: rol `administrativo`, `grants_global_admin` por defecto `false`, tablas, constraint de dos capacidades y RLS presentes. |
| RLS sintética reversible | Aprobada: `admin` leyó permisos y auditoría; `rrhh` sólo auditoría; `gerente`, `supervisor` y `administrativo` no leyeron ninguna. La transacción se revirtió y no dejó fixtures. |
| Idempotencia SQL de 040 | Aprobada: segunda ejecución sin inserción de ledger terminó correctamente; el ledger permaneció en 43 entradas y 040 una vez. |
| Contratos de autorización | Aprobada: `src/security/authorizationContracts.test.ts`, 5/5. |
| Verificación remota / publicación | No ejecutada: no hubo conexión remota, aplicación productiva, despliegue ni commit. |

El procedimiento local debe esperar explícitamente a que `storage.buckets` exista antes de ejecutar migraciones que escriban buckets. La aplicación remota continúa siendo un paso separado, manual y autorizado, conforme a `APLICAR_MIGRACION_040_ACCESOS.md`.
