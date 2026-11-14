# Fase 1 — Validación local del contrato organizativo

Fecha: 2026-11-10  
Estado: implementación local preparada; validación SQL/RPC bloqueada. No hay cambios en Production, cuentas reales, migraciones remotas, consumidores ni Cloudflare.

## Implementación preparada

- `supabase/migrations/20261110_042_organizational_access_context_self.sql`: agrega sólo la RPC de lectura `organizational_access_context_self(text,date)`.
- La identidad se toma exclusivamente de `auth.uid()`. No hay parámetro `actor_user_id`, variante `for`, rol Hyperdrive ni concesión al Worker.
- La función devuelve una proyección mínima: IDs de recursos ya alcanzables, estado, rol mapeado, proyecciones de equipo/vendedor, período `unknown|missing` e indicadores de integridad. No devuelve nombres, DNI, correo, documentos, ni recursos/motivos/conteos fuera de alcance.
- `api/lib/organizational-access.ts`: adaptador RPC tipado, sin importación por módulos existentes y sin conexión Hyperdrive.
- `src/security/organizationalAccessContracts.test.ts`: contrato del adaptador, respuesta mínima, derivación desde `auth.uid()` y privilegios de ejecución de la migración.

## Matriz de paridad planificada

| Integración actual | Operación del contrato | Comparación requerida | Estado |
|---|---|---|---|
| `api/resources-directory.ts` | `legajos.read` / `legajos.manage` | Conjunto de Legajos, Gerencia efectiva y proyecciones | No ejecutada: requiere DB local. |
| `api/access-users.ts` | `account.invite` | Recursos elegibles dentro de alcance; no exponer excluidos ajenos | No ejecutada: requiere DB local. |
| `api/staff-departure-notices.ts` | `departure.report` / `departure.review` | Subordinación de Supervisión/Gerencia y denegación fuera de alcance | No ejecutada: requiere DB local. |
| `api/wage-advances.ts` | `advance.request` / `advance.review` | Sólo alcance organizativo; ventas/topes/fechas quedan fuera del contrato | No ejecutada: requiere DB local. |
| `api/operational-data.ts` | `pacing.read` | Equipos y vendedores derivados, separados de ventas y objetivos | No ejecutada: requiere DB local. |

Las cinco comparaciones usarán los mismos fixtures y fecha de referencia. Toda diferencia se clasificará como esperada, error existente, regresión o posible escalamiento de privilegios; esta fase no cambia reglas actuales para ocultarla.

## Pruebas realmente ejecutadas

| Comprobación | Resultado |
|---|---|
| `npm run lint` | Aprobado. |
| `npm test` | 33 aprobadas, 0 fallos, 5 omitidas. Incluye 3 pruebas nuevas del contrato/adaptador. |
| `npm run build:cloudflare` | Aprobado. Advertencia existente: bundle mayor a 500 kB. No se desplegó. |
| `git diff --check` | Aprobado. |

## Integraciones no ejecutadas y bloqueo

Las cinco pruebas de integración ya existentes, más la nueva batería SQL/RPC de Fase 1, requieren `NAVE_TEST_DATABASE_URL`, credenciales Auth locales y `NAVE_TEST_DATABASE_ACKNOWLEDGE_ISOLATED=1`.

En el diagnóstico inicial de este entorno:

- el motor Docker del sandbox no tenía acceso al socket, aunque Docker Linux sí respondió fuera del sandbox;
- no hay `NAVE_TEST_DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `DATABASE_URL` ni `POSTGRES_URL` configurados;
- Docker no puede acceder al motor `dockerDesktopLinuxEngine`.

Por ello no se aplicó 042 localmente, no se inspeccionó el propietario real de la función, no se verificaron `EXECUTE` contra un JWT local y no se ejecutaron fixtures. No se sustituyó esta evidencia con consultas o SQL remotos.

### Reintento de bootstrap 2026-11-10

Se comprobó Docker Linux fuera del sandbox (`29.9.2`, Linux/amd64). La instancia previa se identificó como `naveplan_local_bootstrap`, con etiqueta de workdir `.local-supabase`, puerto PostgreSQL `127.0.0.1:54322` y ledger local hasta 040: era descartable. Se detuvo sólo esa instancia local, se regeneró el árbol con 45 migraciones (incluye 041 y 042) y se actualizó el generador para declarar esas dependencias.

`npx.cmd --yes supabase@3.0.0 --version` confirmó la CLI 3.0.0. Sin embargo, los intentos locales `start --debug` no crearon contenedores ni imprimieron un error de arranque; sólo devolvieron las advertencias deprecadas de Auth. La inspección posterior confirmó cero contenedores de `naveplan_local_bootstrap`. La base local no está disponible para aplicar ni probar 042.

## Revisión de seguridad y decisiones pendientes

- La función propuesta usa `SECURITY DEFINER` sólo para producir una proyección mínima independiente de las políticas actuales de Legajos y leer las capacidades existentes. No escribe datos ni acepta actor controlable por cliente.
- `search_path` fijo: `pg_catalog, public`; relaciones calificadas; `EXECUTE` revocado de `PUBLIC`, `anon` y `service_role`, concedido únicamente a `authenticated`.
- Falta verificar en la instancia local el propietario efectivo y que no sea un rol con privilegios excesivos. Si el owner no satisface mínimo privilegio, la migración no debe promocionarse sin una estrategia de owner aprobada.
- Hyperdrive no se usa ni se habilita. Su futura integración requiere validar Bearer en servidor y no puede asumir `auth.uid()`.
- `monthly_config` no se modifica. Un rango coincidente devuelve `unknown`, nunca `open`.
- Adelantos conserva sus motivos y reglas comerciales en su contrato propio; no se implementan tablas/configuraciones/excepciones en esta fase.

## Reversión

Mientras 042 no se aplique, la reversión es descartar los archivos locales de Fase 1 mediante una revisión humana; no se ejecutó ningún descarte automático. Para una futura aplicación local, la reversión debe ser una migración incremental autorizada que revoque `EXECUTE` y retire la función, sin tocar Legajos, proyecciones, perfiles ni datos históricos. Ningún consumidor se conecta al adaptador, por lo que no existe cambio de comportamiento que revertir.

## Próximo paso autorizado requerido

Restablecer el arranque de Supabase CLI 3.0.0 para el workdir local (sin enlazar proyectos ni usar URLs remotas). Luego: generar árbol local, aplicar 042, inspeccionar owner/ACL, ejecutar fixtures de los 16 escenarios y la matriz de paridad antes de evaluar consumidores.
