# Fase 1 — Diseño técnico de `organizational_access_context`

Fecha: 2026-11-10  
Estado: implementación local preparada en migración 042 y adaptador tipado, sin consumidores conectados. La validación SQL/RPC integrada está bloqueada hasta disponer de Supabase local aislado.

Documento rector: `docs/AUDITORIA_TRANSVERSAL_JERARQUIAS_PERMISOS_2026-11-10.md`.  
Plan Maestro relacionado: `REV-20261108-03`, `REV-20261108-14`, `REV-20261108-15`.

## 1. Propósito y límites

`organizational_access_context` es el contrato de lectura que debe responder, para una identidad autenticada y una operación, quién es el actor, cuál es su alcance vigente y qué recursos/equipos relacionados puede consultar. Reutiliza Legajos y sus proyecciones; no crea una nómina, equipos alternativos ni permisos nuevos.

No resuelve ni reemplaza:

- reglas comerciales de ventas, topes, importes, fechas de adelanto ni objetivos;
- estado de Scoring o fuentes de Parte Diario;
- cambios de cuenta Auth ni capacidades diferidas de 040;
- reescritura histórica de la jerarquía actual.

## 2. Inventario Fase 0: superficies ETL

| Superficie | Ubicación | Operación real | Estado después de Fase 0 |
|---|---|---|---|
| Navegación Bases de Datos & ETL | `src/components/layout/Sidebar.tsx` | Abre panel heredado de conectores | Sólo `admin` la recibe. |
| Carga de componente ETL | `src/App.tsx`, `DatabaseConnectorsModule.tsx` | Montaba panel aun si se forzaba pestaña | Sólo `admin` monta; el componente también se niega. |
| Worker Cloudflare | `cloudflare/worker.ts` | No tiene handlers de conectores locales | Rechaza explícitamente rutas ETL locales para que no devuelvan la SPA. |
| Conectores / importación local | `server.ts`: `/api/connectors/*`, `/api/data*` | Puede abrir DB remota según configuración entregada, escribir cache local e importar datos | Exige Bearer de Supabase válido y `profiles.role='admin'`. |
| Explorador local Extractor | `server.ts`: records, logs, stats, config, reset, export, SSE | Lee/escribe `.extractor_db.json` y expone información de la cache local | Exige el mismo guard admin para las superficies de navegador. |
| Webhook `/api/ingest` local | `server.ts` | Escribe cache local si conoce clave de ingestión | No es interfaz de usuario: conserva secreto de ingestión propio. No está expuesto por el Worker. Debe migrarse luego a una función protegida por contrato de fuente, no ampliarse ahora. |
| `ExtractorHubModule` / cliente Supabase | `src/components/extractor`, `src/services/extractor` | Herramienta heredada; puede almacenar URL/API key en `localStorage` y escribir directo | Ya estaba sólo UI admin; sigue siendo no apta como integración productiva. No se habilitó ni se modificó su circuito. |
| Edge Function `ingest-scoring-sheet` | `supabase/functions/ingest-scoring-sheet` | Ingesta real específica de Scoring con secreto de servicio | Fuera de la contención UI; no se modificó. |
| Edge Function `sync-app-control-roster` | `supabase/functions/sync-app-control-roster` | Integración prevista con App Control mediante secreto | Pendiente de contrato/fuente; no se modificó. |

El inventario confirma que no hay un endpoint Worker operativo de conectores que se pueda “proteger” sin crear una funcionalidad nueva. La medida correcta fue impedir el acceso a superficies simuladas/heredadas y negar sus URLs en el Worker publicado.

## 3. Contrato funcional

### 3.1 Entrada pública

```ts
type OrganizationalOperation =
  | 'legajos.read'
  | 'legajos.manage'
  | 'account.invite'
  | 'departure.report'
  | 'departure.review'
  | 'advance.request'
  | 'advance.review'
  | 'pacing.read'
  | 'etl.manage';

type OrganizationalAccessRequest = {
  operation: OrganizationalOperation;
  asOf?: 'current' | string; // ISO date; default current_date
  include?: Array<'resources' | 'teams' | 'eligibility'>;
};
```

La identidad **no** se recibe como parámetro desde el navegador. Se obtiene del token Supabase validado por el handler o de `auth.uid()` cuando el contrato se invoque mediante RPC autenticada.

### 3.2 Salida

```ts
type OrganizationalAccessContext = {
  actor: {
    userId: string;
    profileId: string;
    staffMemberId: string | null;
    role: 'admin' | 'administrativo' | 'rrhh' | 'gerente' | 'supervisor';
    capabilities: Array<'view_legajos' | 'manage_legajos'>;
    global: boolean;
  };
  effectiveAt: string;
  scope: {
    staffIds: string[];
    supervisorIds: string[];
    teamIds: string[];
    includesAllActiveStaff: boolean;
  };
  resources: Array<{
    staffId: string;
    active: boolean;
    roleMapping: string | null;
    responsibleStaffId: string | null;
    effectiveManagerStaffId: string | null;
    teamId: string | null;
    sellerId: string | null;
    // Sólo recursos dentro del alcance. Nunca se devuelven IDs, motivos ni
    // conteos de personal ajeno.
    organizationalEligible: boolean;
    organizationalExclusionReasons: OrganizationalEligibilityReason[];
  }>;
  period: {
    id: string | null;
    startDate: string | null;
    endDate: string | null;
    status: 'unknown' | 'missing';
  };
};

type OrganizationalEligibilityReason =
  | 'outside_scope'
  | 'inactive'
  | 'missing_role_mapping'
  | 'already_has_profile'
  | 'role_not_allowed_for_operation'
  | 'missing_team_projection'
  | 'missing_seller_projection'
  | 'not_sales_resource';
```

`organizationalEligible` se calcula por operación. Nunca contiene reglas comerciales y nunca se usa como fuente de verdad de personal. Los recursos ajenos se omiten por completo; `outside_scope` se usa internamente para telemetría/denegación del servidor, no se entrega al cliente.

### 3.3 Integración futura con el contrato específico de Adelantos

El contexto organizativo resuelve únicamente identidad, rol efectivo, jerarquía vigente y alcance sobre el recurso. No decide ventas mínimas, fecha límite ni importe máximo de un adelanto. Esas reglas permanecen en un contrato propio del módulo, propuesto como `advance_eligibility_policy`, que consume el alcance ya resuelto y no vuelve a recorrer `staff_members`, `teams`, `sellers` ni relaciones de responsable.

| Responsabilidad | `organizational_access_context` | `advance_eligibility_policy` |
|---|---|---|
| Actor y recurso alcanzable | Determina actor autenticado, Gerencia/Supervisión efectiva, subordinación y vigencia | Sólo acepta recurso ya dentro de alcance; no puede ampliarlo. |
| Elegibilidad comercial | Expone estado estructural y motivos organizativos, por ejemplo `outside_scope`, `inactive`, `missing_team_projection` o `not_sales_resource` | Evalúa y conserva `sales_below_minimum`, `advance_deadline_elapsed` y `advance_amount_exceeds_limit`. |
| Configuración | No configura importes, ventas ni fechas | Lee reglas generales vigentes y excepciones individuales autorizadas. |
| Seguridad al solicitar | Devuelve el alcance que habilita a consultar/solicitar | Revalida reglas y excepción en el servidor antes de persistir una solicitud. |

La fase funcional de Adelantos debe prever dos registros distintos, ambos con vigencia y auditoría de actor, fecha, valores anteriores/nuevos y resultado:

1. **Regla general:** Gerencia configura ventas mínimas, fecha límite e importe máximo para su ámbito autorizado y período de vigencia. Una edición futura no reescribe la evaluación histórica: cada solicitud conserva el snapshot de regla aplicado.
2. **Excepción individual:** sólo Gerencia autorizada para el recurso subordinado puede aprobar una excepción, con motivo obligatorio, trazabilidad y vigencia limitada. La excepción modifica sólo la evaluación comercial de esa solicitud/recurso; no cambia la regla general, el rol ni la jerarquía.

Antes de habilitar el formulario, el backend devuelve al Supervisor la evaluación previa y los motivos estables. La interfaz debe mostrar esos motivos y bloquear el envío cuando el resultado sea no elegible sin excepción aplicable, evitando solicitudes destinadas al rechazo automático. Al guardar, el servidor ejecuta de nuevo: token y rol, alcance mediante `organizational_access_context`, regla general vigente, excepción autorizada y límites comerciales. La UI nunca es la decisión definitiva.

No se añade en esta Fase 1 ninguna capacidad administrativa de 040 ni se implementan tablas, configuración, excepciones o rutas de Adelantos. La autorización de Gerencia para administrar reglas y excepciones se concretará en la fase funcional `REV-20261108-09`, contra la matriz aprobada y sin conceder a Gerencia alcance fuera de sus subordinados.

### 3.4 Algoritmo de resolución

1. Leer `profiles` y capacidades de 040 para la identidad autenticada.
2. Validar que, cuando la operación depende de nómina, `profiles.staff_member_id` referencia un Legajo vigente; registrar `missing_staff_link` internamente si no.
3. Construir una única vez el árbol descendente desde `staff_members.responsible_staff_id`, limitando profundidad y detectando ciclos.
4. Resolver Gerencia efectiva desde `effective_manager_staff_id`; una asignación `manual` sigue siendo límite explícito establecido por Legajos.
5. Derivar `teamId` y `sellerId` desde `teams`/`sellers` sólo como proyecciones. Si falta la proyección, devolver el motivo; no crearla ni ocultar el Legajo.
6. Aplicar la matriz por `operation`, rol y capacidades ya existentes. `admin` global autorizado para ETL; no se concede una capacidad nueva.
7. Resolver período desde `monthly_config` sólo para operaciones que lo necesitan. Como no existe evidencia administrativa de apertura/cierre, un rango de fechas no prueba que esté abierto: devolver `unknown` cuando haya un rango coincidente y `missing` cuando no exista. No crear estados ni modificar `monthly_config`.
8. Para una fecha histórica, usar eventos de estado y cambios de roster como evidencia. Si el modelo no permite reconstruir exactamente un instante, devolver un estado explícito de no reconstruible y no usar jerarquía actual como si fuera histórica.

## 4. Diseño SQL y seguridad

### 4.1 Forma inicial implementable

En esta fase se implementa exclusivamente `organizational_access_context_self(p_operation, p_as_of)`. Obtiene actor con `auth.uid()` y no acepta identidad, perfil, Legajo ni alcance enviados por el cliente.

`organizational_access_context_for(p_actor_user_id, ...)` queda sólo documentada como alternativa futura: no se implementa, no se concede `EXECUTE` al Worker y no se habilita una vía privilegiada. Hyperdrive usa una conexión PostgreSQL de backend y no equivale a una sesión Supabase con `auth.uid()`; cualquier integración futura exige una estrategia de identidad y autorización probada por separado.

### 4.2 Reglas obligatorias para `SECURITY DEFINER`

- `LANGUAGE sql`/`plpgsql`, `SECURITY DEFINER`, `SET search_path = public, pg_temp` explícito; todas las relaciones calificadas con esquema.
- Propietario dedicado no-superusuario, con privilegios mínimos. Evitar que la función sea dueña de objetos ajenos.
- `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated`; conceder `EXECUTE` sólo a los roles necesarios.
- La variante `self` puede concederse a `authenticated` sólo si usa `auth.uid()` y no expone columnas fuera del contrato. Se implementará como `SECURITY DEFINER` porque RLS actual de Legajos permite una lectura demasiado amplia y una función `SECURITY INVOKER` no permite imponer una proyección mínima independiente. La función no escribe, no acepta actor y tendrá `EXECUTE` revocado de `PUBLIC`, `anon` y `service_role` antes de concederse sólo a `authenticated`.
- La variante `for` debe concederse exclusivamente a un rol de backend dedicado. Si Hyperdrive no puede usar ese rol, **no** desplegar esa variante `SECURITY DEFINER`; usar un resolver del servidor que ejecute SQL parametrizado bajo la credencial backend existente, con revisión de mínimo privilegio.
- No usar `set_config` controlable por cliente como sustituto de identidad ni confiar en un `actor_id` del body.
- No devolver DNI, correo, documentos ni nombres cuando la operación sólo necesita IDs/motivos; los consumidores piden los campos mínimos en una consulta posterior autorizada.
- Toda llamada debe ser `STABLE` sólo si no registra auditoría ni depende de cambios dentro de la consulta. No mezclar escritura/auditoría con la resolución de alcance.

### 4.3 Hyperdrive y RLS

Hyperdrive entrega una conexión PostgreSQL de servidor; no propaga automáticamente `auth.uid()` de Supabase. Por eso:

- los handlers deben validar el Bearer con Supabase antes de resolver el contexto;
- RLS protege llamadas directas del navegador, pero no sustituye autorización de handler bajo una conexión backend;
- el diseño debe probar ambas rutas: RPC autenticada/RLS y handler Hyperdrive con identidad validada;
- no se debe asumir que una función que usa `auth.uid()` funciona igual desde Hyperdrive.

## 5. Comparación con los cinco mecanismos actuales

| Mecanismo actual | Operaciones | Resultado que se comparará contra el contrato |
|---|---|---|
| `api/resources-directory.ts` | Legajos, históricos, rotación | conjunto de Legajos/equipos visibles y gerente efectivo |
| `api/access-users.ts` | invitaciones/cuentas | elegibles y motivos de cada exclusión |
| `api/staff-departure-notices.ts` | avisos de baja | avisos visibles y recursos reportables |
| `api/wage-advances.ts` | solicitud/revisión | vendedor administrable, equipo y razón de no elegibilidad |
| `api/operational-data.ts` | Pacing/operaciones | equipos, vendedores y operaciones en alcance, independientemente de ventas |

Adicionalmente se compararán las funciones RLS de incorporaciones y bajas contra `self`, sin sustituirlas hasta que las pruebas de paridad sean aprobadas.

### Fixtures y aserciones comparativas

1. Admin global, RRHH, administrativo con/ sin las dos capacidades existentes, Gerente, Supervisor y usuario sin perfil.
2. Un gerente con dos supervisores, cada uno con varios vendedores; un equipo ajeno.
3. Un vendedor trasladado: mismo `seller.id`, nuevo responsable/equipo, evento en `roster_change_log`.
4. Supervisor inactivo y vendedor activo sin equipo proyectado, para verificar `missing_team_projection` sin ocultar el Legajo.
5. Cuenta pendiente, cuenta verificada y Legajo sin cuenta, para invitaciones.
6. Configuración mensual vigente, ninguna vigente y futura decisión de período cerrado.
7. Cero ventas: estructura disponible en Pacing y adelanto no elegible por `sales_below_minimum`, no por ausencia de estructura.
8. Regla general vigente, modificada y vencida; excepción individual de Gerencia con motivo; excepción de Gerencia ajena rechazada sin ampliar alcance.
9. Solicitudes/documentos de incorporación y bajas: llamadas directas autorizadas/no autorizadas por RLS y handler.

Cada fixture compara conjuntos de IDs y razones, no textos ni PII. Las pruebas de integración usarán una base Supabase local aislada y revertirán sus transacciones/fixtures.

## 6. Secuencia de implementación propuesta

1. Aprobar este diseño, matriz y semántica de período cerrado.
2. Crear migración incremental exclusivamente con la variante `self`, permisos y pruebas SQL de seguridad. No editar 032, 040 ni 041.
3. Agregar adaptador TypeScript de lectura y pruebas de paridad, sin reemplazar consumidores.
4. Ejecutar comparación local contra los cinco mecanismos y resolver divergencias de datos/proyección antes de cambiar comportamiento.
5. Reemplazar un consumidor por vez, empezando por lectura de Legajos/Pacing; cada reemplazo conserva un rollback de código y métricas de paridad.
6. Después del contrato y sus pruebas de paridad, abordar en `REV-20261108-09` las reglas generales y excepciones de Adelantos; luego Bajas e Invitaciones. No continuar automáticamente desde esta fase.

## 7. Reversión y riesgos

| Riesgo | Contención / reversión |
|---|---|
| Función con privilegios excesivos | Revocar `EXECUTE` y retirar consumidor en el mismo despliegue; no eliminar datos. |
| Diferencia entre RLS y Hyperdrive | Mantener consumidor previo, bloquear reemplazo y corregir pruebas de paridad. |
| Proyección comercial faltante | Informar motivo; reconstrucción sólo mediante proceso Legajos autorizado, nunca INSERT manual de `teams`/`sellers`. |
| Bloqueo involuntario de Admin en ETL local | Restaurar las guardias de Fase 0 desde el commit/revisión anterior; no hay datos Production afectados. |
| Configuración de período no definida | El contrato devuelve `unknown`; no permitir que se use para aprobar adelantos. |
| Excepción usada para ampliar jerarquía | Resolver siempre el alcance antes de cargar la excepción; rechazar recurso fuera de `scope` y registrar el intento. |
| Regla modificada retroactivamente | Versionar vigencia y guardar snapshot evaluado en la solicitud; no recalcular historial con la regla actual. |
| Rutas heredadas aún servidas por otro host | Inventariar host y aplicar la misma autenticación antes de habilitar cualquier operación. |

## 8. Evidencia de Fase 0

- Nueva guardia pura `api/lib/local-etl-access.ts`: falta de sesión 401, token válido de Supervisor 403, Admin 200.
- Nueva prueba `src/security/etlAccessContracts.test.ts`: verifica guardia de navegación, montaje, componente, servidor local y Worker.
- `npm run lint`: aprobado.
- `npm test`: 30 aprobadas, 0 fallos, 5 integraciones aisladas omitidas por falta de variables/acknowledgement local.
- `npm run build:cloudflare`: aprobado; persiste sólo advertencia no bloqueante por bundle mayor a 500 kB.
- No se inició servidor local, no se conectó a servicios externos, no se consultó Production ni se desplegó.
