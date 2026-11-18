# Auditoría transversal: arquitectura, jerarquías y permisos

Fecha: 2026-11-10
Alcance: revisión estática del repositorio y pruebas locales. No se consultaron datos de Production, no se modificaron cuentas, ni se ejecutaron migraciones o despliegues.

## Resultado ejecutivo

Los síntomas no describen seis fallas independientes. El modelo de Legajos ya declara correctamente una autoridad única (`staff_members` + `hr_roles`) y una proyección transaccional hacia `teams`, `sellers` y parte de `profiles`. Sin embargo, los módulos consumen esa estructura mediante cinco resoluciones de alcance distintas: CTEs recursivos propios, `profiles.team_id`, `teams.manager_staff_id`, `effective_manager_staff_id` y relaciones históricas. Eso hace que una misma persona pueda resultar visible en Legajos, invisible para invitaciones y sin equipos en Pacing.

La prioridad es establecer un contrato de lectura/autorización único sobre Legajos y reemplazar los filtros locales gradualmente. No se recomienda crear una segunda nómina ni duplicar equipos. Las proyecciones existentes se reutilizan.

Hallazgos críticos:

1. **ETL no está restringido en la navegación:** `Sidebar` agrega `database` para todos los roles y `App` monta el módulo sin guardia. Sólo `extractor` tiene una guardia de interfaz. Esto explica el acceso visual de Supervisión; no se halló una ruta Worker para `/api/connectors/*`, por lo que su ejecución de servidor no está acreditada ni protegida por el router actual.
2. **La jerarquía se recalcula por módulo:** invitaciones, Legajos, bajas, incorporaciones y adelantos usan filtros diferentes. La discrepancia de recursos elegibles es compatible con este diseño, pero su causa de datos concreta requiere una consulta de diagnóstico de sólo lectura.
3. **Pacing puede perder estructura cuando falla o no coincide su filtro operativo:** `AppContext` empieza con arreglos vacíos y descarta silenciosamente el error de `/api/operational-data`; esa API filtra equipos y vendedores por `profiles.team_id` para Supervisión y por `teams.manager_staff_id` para Gerencia. Pacing confunde esa ausencia con “no hay equipos”. Las ventas no son necesarias para construir la estructura, pero hoy llegan en la misma carga.
4. **Gerencia no puede iniciar avisos de baja:** la API acepta POST solamente de Supervisión, aunque su GET sí resuelve el árbol de Gerencia. Es una contradicción explícita con el requisito funcional.
5. **Adelantos mezcla la proyección comercial con el alcance:** resuelve la elegibilidad mediante `sellers.team_id` y `teams.manager_staff_id`, mientras Avisos obtiene recursos desde Legajos. Si una proyección está ausente/desactualizada, Adelantos queda vacío aun cuando Legajos sea correcto.
6. **La personalización de correos no está cerrada en código:** existe plantilla local de invitación, pero no plantilla de recuperación ni configuración de SMTP/remitente versionada. Supabase Auth mantiene esas configuraciones fuera del repositorio; no se puede afirmar su estado sin inspección de consola autorizada.

## 1. Fuentes de verdad y dependencias

### 1.1 Autoridad prevista

| Dominio | Fuente prevista | Proyección/consumidor | Evidencia |
|---|---|---|---|
| Personal activo, cargo, responsable, vigencia | `public.staff_members` + `public.hr_roles` | Legajos, cuentas, bajas, incorporaciones | `supabase/migrations/20261031_032_legajos_atomic_roster_sync.sql:5-202` |
| Gerencia efectiva | `staff_members.effective_manager_staff_id` con fuente `inherited`/`manual` | equipos, Legajos, controles de Gerencia | `supabase/migrations/20261030_015_effective_manager_hierarchy.sql:9-60` |
| Equipo comercial | `public.teams` derivado de supervisor activo | Pacing, operaciones, adelantos | reconstrucción en `032`, bloque de equipos |
| Vendedor comercial | `public.sellers` derivado de Legajos con `creates_seller_record` | Pacing, operaciones, adelantos | reconstrucción en `032`, bloque de vendedores |
| Cuenta y rol aplicativo | `profiles` vinculado al Legajo | sesión, navegación, cuentas | `api/session.ts` |
| Traslado y baja | `staff_members`, `roster_change_log`, `staff_status_events` | histórico y proyecciones | `api/resource-update.ts:128-144`; `20261027_008_roster_management.sql:18-30` |
| Período operativo / adelantos | `monthly_config` | Pacing y adelantos | `20261024_001_nave_planes_schema.sql:45-55` |

La migración 032 implementa el principio correcto: al cambiar Legajos, reconstruye gerencia derivada, equipos, vendedores y alcance de perfiles en la misma transacción. Conserva IDs históricos de vendedores y desactiva, en lugar de borrar, proyecciones inactivas.

### 1.2 Resoluciones paralelas detectadas

| Módulo | Fuente realmente consultada | Regla de alcance | Divergencia/riesgo |
|---|---|---|---|
| Legajos / directorio | `staff_members`, `hr_roles`, `teams` | CTE recursivo por `responsible_staff_id`; para Gerencia añade `effective_manager_staff_id` | Es la vista más cercana a la autoridad, pero vuelve a escribir la lógica de árbol. `api/resources-directory.ts:58-84`. |
| Cuentas e invitaciones | `staff_members`, `hr_roles`, `profiles`, `auth.users` | CTE propio para Gerencia; descarta personal con perfil ya vinculado | `eligible_staff` puede omitir a un recurso por cuenta pendiente/orfandad, rol sin mapeo, inactividad o alcance; no entrega motivo de exclusión. `api/access-users.ts:26-33`. |
| Avisos de baja | `staff_departure_notices` + Legajos | GET: CTE para Gerencia; Supervisión ve sólo lo que reportó. POST: sólo Supervisor | La UI carga el selector desde directorio, no desde la autorización del POST. `api/staff-departure-notices.ts:5-7`; `DepartureNoticesPanel.tsx:3`. |
| Incorporaciones | solicitudes + Legajos | CTE repetido en API y función RLS | El contrato RLS y el handler duplican jerarquía. `20261106_039...sql:112-146`; `api/incorporation-requests.ts`. |
| Adelantos | `sellers`, `teams`, `monthly_config`, `sales_operations` | Supervisor por `profiles.team_id`; Gerencia por `teams.manager_staff_id` | Depende enteramente de proyecciones comerciales y no publica por qué un Legajo no es elegible. `api/wage-advances.ts:25-60`. |
| Pacing / operaciones | `/api/operational-data`: `teams`, `sellers`, operaciones, configuración | Supervisor: `teams.id=profiles.team_id`; Gerencia: `teams.manager_staff_id=profiles.staff_member_id` | Si falla la API o cualquier proyección, el contexto queda vacío y Pacing interpreta “sin equipos”. `api/operational-data.ts:50-152`; `AppContext.tsx:139-215`. |
| ETL / conectores | estado de frontend y endpoints no enrutados | navegación sin control de rol | Base de Datos & ETL queda visible para todos. `Sidebar.tsx:81-87`; `App.tsx:72`. |

### 1.3 Datos simulados y circuitos no conectados

`AppContext` conserva acciones de conectores, sincronización, alta de equipos, vendedores, metas y otros cambios que llaman a `/api/connectors/*` o `/api/data`. Esas rutas no están presentes en `cloudflare/worker.ts`, que sólo enruta las APIs declaradas. Por tanto, el módulo “Bases de Datos & ETL” no debe tratarse como un canal operativo autenticado hasta que exista una ruta de servidor con autorización y trazabilidad. El DDL copiable del componente tampoco es fuente de esquema: la fuente de verdad son las migraciones.

## 2. Auditoría de autorización

### 2.1 Estado observado

- Las APIs Worker relevantes verifican token de Supabase antes de consultar. La prueba estática cubre rutas sensibles en `src/security/authorizationContracts.test.ts`.
- Las APIs conectadas por Hyperdrive aplican autorizaciones en handler; esas reglas son necesarias aun con RLS porque la conexión de servidor no debe depender de que el navegador filtre datos.
- Incorporaciones y Avisos tienen RLS de lectura reutilizable, pero con funciones distintas y CTEs propios: `can_access_incorporation` y `can_access_departure_notice` (`20261106_039...sql:112-191`).
- La migración 040 limita las capacidades diferidas a `view_legajos` y `manage_legajos`. Esta auditoría no propone ampliarlas.

### 2.2 Matriz objetivo a aprobar

Esta matriz es el contrato propuesto; no afirma que todos los módulos actuales ya lo cumplan.

| Capacidad | Dirección / Adm. General (`admin`) | Administración común | RRHH | Gerencia | Supervisión |
|---|---|---|---|---|---|
| Ver estructura de Legajos | Global | Sólo capacidad explícita `view_legajos` | Global en circuitos RRHH | Subárbol vigente | Equipo/subárbol propio |
| Editar Legajos / traslados | Global | Sólo `manage_legajos` explícito | Global | Subárbol vigente, sin tocar accesos | No |
| Crear / decidir incorporación | Decidir global | No | Directa y decisión global | Decide solicitudes subordinadas | Crea/edita sus borradores |
| Iniciar aviso de baja | Global si se habilita el circuito | No | Global si se habilita el circuito | Vendedores y supervisores subordinados | Recursos subordinados directos/vigentes |
| Decidir aviso de baja | Global | No | Global | No, salvo decisión explícita futura | No |
| Solicitar adelanto | No | No | No | No | Vendedores de su equipo vigente |
| Revisar adelanto | Global | No | Según decisión de negocio explícita; hoy no | Vendedores de equipos subordinados | No |
| Cuentas / invitaciones | Global; único rol que otorga capacidades | No | Global según política, sin otorgar admin/capacidades | Sólo supervisores subordinados | No |
| Pacing / operaciones | Global | Sólo capacidad futura autorizada | Global sólo donde el circuito lo requiera | Equipos subordinados | Equipo propio |
| ETL, conectores, importaciones | Global, autorización global explícita | No | No por defecto | No | No |

Para ETL la regla debe aplicarse en tres niveles: navegación, carga de componente y handler/API. Ocultar un botón no es una frontera de seguridad.

## 3. Diagnóstico por síntoma

| Síntoma Production | Hecho en código | Diagnóstico | Verificación pendiente |
|---|---|---|---|
| Supervisión ve Bases de Datos & Pipelines ETL | `database` no está condicionado en `Sidebar`; `App` lo monta sin guardia | Defecto confirmado de interfaz. El router no contiene endpoints de conectores, por lo que no se acredita acceso servidor, pero no hay defensa de servidor implementada para ese circuito. | Inventariar cualquier endpoint externo/Pages que pudiera atender `/api/connectors/*` y denegarlo con 403 a no-admin. |
| Avisos reconoce estructura; Adelantos no | Avisos usa directorio de Legajos; Adelantos usa `sellers`/`teams` filtrados por `profiles.team_id` o `manager_staff_id` | Divergencia estructural confirmada. Falta saber qué proyección o vínculo concreto está ausente en los datos afectados. | Consulta de diagnóstico agregada por recurso: rol, activo, responsable, gerente efectivo, equipo proyectado, vendedor proyectado, `profiles.team_id`. |
| Pacing muestra 0 equipos/vendedores | Contexto inicia vacío; `/api/operational-data` combina estructura, ventas, adelantos y período y el `catch` no expone error | No se puede atribuir a ventas: equipos/vendedores se consultan independientemente. Hipótesis: error de API oculto, `profiles.team_id` nulo/desactualizado, equipo inactivo/no comercial o filtro Gerencia no coincidente. | Capturar respuesta HTTP y conteos por cada etapa del contrato de alcance, sin datos personales. |
| Invitaciones muestra pocos elegibles | Elegibilidad exige: Legajo activo, `app_role_mapping`, regla admin global, sin `profiles.staff_member_id`, y alcance de actor | El filtro existe y puede excluir correctamente, pero no explica el motivo al operador. No hay evidencia suficiente para atribuirlo a un supervisor específico. | Resolver lista única con `eligible` + `exclusion_reasons` por cada candidato en alcance. |
| Gerencia debe iniciar bajas de subordinados | `staff-departure-notices` rechaza todo POST que no sea Supervisor | Defecto confirmado de contrato. El GET de Gerencia ya conoce el árbol, pero el POST no lo reutiliza. | Definir si Gerencia reporta en su nombre, conserva supervisor efectivo y cómo auditar el actor. |
| Recuperación usa correo estándar Supabase | Hay redirect institucional en `AuthProvider`, y plantilla local de invitación; no hay plantilla recovery/SMTP/remitente en el repositorio | Configuración incompleta/no verificable desde código. Las plantillas y SMTP pertenecen a Supabase Auth. | Auditar sólo metadatos de Auth Dashboard: plantilla invite/recovery, remitente SMTP, Site URL, Redirect URLs, expiración. Nunca valores secretos. |

## 4. Contrato común propuesto: `organizational_access_context`

No se propone una nueva nómina. Se propone una única consulta o función SQL estable, con un adaptador TypeScript pequeño para handlers, reutilizando `staff_members`, `hr_roles`, `teams`, `sellers`, `profiles` y los campos efectivos existentes.

### Entrada

- `actor_user_id` (derivado exclusivamente del token validado).
- `as_of_date` opcional; por defecto fecha actual.
- `operation` declarativa (`legajos.read`, `advance.request`, `departure.report`, `account.invite`, `pacing.read`, `etl.manage`).

### Salida mínima

```text
actor: { profile_id, staff_member_id, app_role, capabilities[] }
scope: { global, staff_ids[], supervisor_ids[], team_ids[] }
resources: [{ staff_id, active, role, supervisor_id, manager_id,
              team_id, seller_id, eligibility: boolean, exclusion_reasons[] }]
period: { id, start_date, end_date, status }
```

### Reglas

1. **Identidad:** `profiles` sólo aporta identidad de login, rol y capacidades; su vínculo debe referenciar el Legajo activo para operaciones de nómina.
2. **Jerarquía vigente:** se obtiene una vez desde `responsible_staff_id`, respetando el límite de ciclo, y se complementa con `effective_manager_staff_id` para vacancias/excepciones manuales existentes.
3. **Estructura comercial:** `teams` y `sellers` se leen como proyecciones, nunca como autoridad. El contrato informa `projection_missing` si Legajos es válido pero falta una proyección; no oculta al recurso.
4. **Vigencia histórica:** para bajas, traslados y períodos cerrados se usa la evidencia de `staff_status_events` y `roster_change_log`; no se reescribe la jerarquía actual para representar el pasado.
5. **Explicabilidad:** invitaciones, adelantos y selectores reciben motivos de exclusión estables (`inactive`, `no_access_role_mapping`, `already_has_profile`, `outside_scope`, `not_seller`, `missing_team_projection`, `no_open_period`, `sales_below_minimum`).
6. **Autorización en servidor:** cada handler pregunta al contrato por una capacidad; UI sólo consume el resultado. RLS de documentos y solicitudes delega en las mismas funciones SQL o en un predicado base compartido.

### Implementación recomendada

Fase inicial: una función SQL de lectura `security definer` con `search_path=public`, sin permisos de escritura, y vistas/CTEs internos. Debe fijar explícitamente quién puede ejecutarla, no aceptar `actor_id` arbitrario y obtener el actor de `auth.uid()` para llamadas directas. Los handlers Hyperdrive pueden usar el mismo SQL parametrizado con el usuario validado. Sólo si la consulta demuestra ser insuficiente se evaluará una vista materializada; no se justifica una nueva tabla en esta etapa.

## 5. Mapa de módulos y corrección por causa raíz

| Fase | Causa de origen | Archivos/componentes afectados | Cambio esperado | Migración | Riesgo / reversión |
|---|---|---|---|---|---|
| 0. Contención | ETL visible sin autorización consistente | `Sidebar.tsx`, `App.tsx`, `DatabaseConnectorsModule.tsx`, router y endpoints reales | Denegar navegación/carga y devolver 403 server-side a no-admin; retirar DDL operativo de roles no autorizados | No, salvo RLS/endpoints que se detecten | Bajo; revertir el guard y ruta en el mismo despliegue si bloquea admin. |
| 1. Contrato de alcance | Cinco CTEs y tres representaciones de equipo | migración incremental, `api/lib/organizational-access.ts` propuesto, `resources-directory`, `access-users`, `operational-data`, bajas, incorporaciones, adelantos | Un resultado reusable y explicable por operación | Probable: función SQL/RLS incremental; no editar 032/040/041 | Alto si cambia alcance; publicar detrás de pruebas comparativas y conservar ruta anterior durante verificación. |
| 2. Proyecciones y diagnóstico | Falta de estado observable de `teams`/`sellers`/`profiles.team_id` | contrato y endpoint de diagnóstico admin | Detectar proyección faltante y repararla sólo a través de Legajos/rebuild autorizado, nunca manual por pantalla | No necesariamente | Medio; consultas sólo lectura primero. |
| 3. Pacing separado de ventas | Estructura y ventas viajan en una respuesta y los errores se silencian | `operational-data.ts`, `AppContext.tsx`, `PacingDashboard.tsx` | Cargar/representar estructura aunque no haya ventas, período u objetivos; mostrar error accionable de fuente | No, salvo estado de período aprobado | Medio; no tocar Scoring ni Parte Diario. |
| 4. Adelantos/Bajas | Selectores no tienen el mismo contrato y Gerencia no puede reportar bajas | `wage-advances.ts`, `HrAndAdvancesModule.tsx`, `staff-departure-notices.ts`, `DepartureNoticesPanel.tsx` | Selectores explicables por elegibilidad; Gerencia inicia aviso sólo para subordinados | Posible auditoría de actor/tipo de originador | Medio; pruebas de no-escalación de alcance y de período cerrado. |
| 5. Cuentas | Elegibilidad sin motivos y estado Auth externo | `access-users.ts`, panel, contrato | Mostrar estados/motivos sin PII innecesaria; conservar 040 limitado | Sólo si se requiere auditoría adicional | Medio; prohibir tocar cuentas verificadas sin flujo aprobado. |
| 6. Correos Auth | Configuración fuera de repo | Supabase Auth Dashboard y plantillas fuente controlada | Plantillas invite y recovery institucionales, SMTP/remitente, URLs y expiración verificados | No | Bajo si se prueba con cuenta controlada; rollback restaurando plantilla previa documentada. |

## 6. Pruebas requeridas antes de implementar

Todas deben ejecutarse contra Supabase local aislado, usando API administrativa oficial para Auth cuando haga falta y rollback/limpieza verificables. No usar inserciones SQL en `auth.*`.

| Fixture/caso | Debe demostrar |
|---|---|
| Supervisor + varios vendedores | Mismo conjunto visible en Legajos, Avisos, Adelantos y Pacing; servidor rechaza vendedor ajeno. |
| Gerente + varios supervisores/vendedores | Alcance de subárbol y de gerente efectivo; puede iniciar aviso para vendedor/supervisor subordinado, no para ajeno. |
| Recurso invitado pendiente | No es elegible para nueva invitación; permite sólo reenvío/corrección pre-verificación y registra auditoría. |
| Recurso con cuenta verificada | Nunca aparece como re-invitable ni permite corrección pre-verificación. |
| Traslado de vendedor | Conserva `seller.id`, deja evento de traslado, cambia equipo/alcance y no duplica proyección. |
| Personal inactivo | Fuera de selectores operativos; permanece visible sólo en histórico autorizado. |
| Período abierto/cerrado | Estructura continúa visible sin ventas; adelanto sólo opera con período abierto. Hoy no existe estado de cierre explícito: decidir modelo antes de probar. |
| Sin ventas | Pacing muestra equipos/vendedores y cero ventas, no “sin estructura”. |
| Adelanto elegible/no elegible | Motivos deterministas: ventas, tope, fecha, período, alcance y proyección. |
| Acceso directo no autorizado | 401 sin token y 403 para cada API restringida, incluida ETL/conectores y mutaciones. |
| RLS de documentos | Incorporaciones y bajas mantienen denegación directa aunque se evite la UI. |
| Auth/correo | Invite, reenvío, recuperación y redirect válido con remitente/plantilla institucional; sin exponer tokens. |

### Criterios de aceptación

- Un mismo fixture produce la misma membresía jerárquica en Legajos, Pacing, Adelantos, Bajas e Invitaciones, salvo exclusiones declaradas por operación.
- Cada exclusión es retornada con un motivo y es verificable con consulta de contrato.
- Ningún rol no admin alcanza ETL mediante UI ni petición directa.
- Los handlers y RLS no contienen un nuevo CTE de jerarquía fuera del contrato común.
- Pacing separa explícitamente `estructura disponible`, `período disponible`, `objetivos disponibles` y `ventas disponibles`.
- Traslado/baja conserva identidad e historial; no se editan períodos cerrados sin regla autorizada.
- No se amplían capacidades de 040 ni se cambian cuentas reales durante pruebas.

## 7. Riesgos y decisiones que requieren autorización

1. **Definir semántica de Administración común y RRHH** para cada operación global. El código actual les concede alcances distintos según módulo.
2. **Definir “período cerrado”.** `monthly_config` tiene fechas, pero no estado de cierre; no se debe inferirlo del calendario.
3. **Definir el comportamiento de Gerencia en bajas:** crear aviso en nombre propio, mantener supervisor responsable original, y si puede afectar un supervisor directo.
4. **Autorizar el contrato SQL/RLS incremental** después de ejecutar comparación local. No modificar migraciones 032, 040 o 041 ya aplicadas.
5. **Aprobar configuración de correo en Supabase Auth:** dominio/remitente SMTP, textos de invitación/recuperación, expiración y entorno de prueba. No registrar secretos.
6. **Confirmar qué ruta/servicio atiende conectores ETL** si existe fuera de este Worker. La ausencia en `cloudflare/worker.ts` no prueba ausencia de otro despliegue.

## 8. Seguimiento en Plan Maestro

- `REV-20261108-03` (Accesos y permisos): mantener **Para probar**. Esta auditoría agrega dependencia de contrato común; no valida invitaciones pendientes ni implementa cambios.
- `REV-20261108-15` (Pacing): es la tarea existente para la inconsistencia de estructura. Agregar la auditoría transversal como dependencia de arquitectura antes de parches visuales.
- `REV-20261108-14` (Extractor/ETL): relacionar el hallazgo de guardia de ETL y completar inventario de endpoints externos. No crear una tarea duplicada.

## Evidencia de esta auditoría

- `npm run lint`: aprobado (TypeScript sin emisión).
- `npm test`: 28 aprobadas, 0 fallos, 5 integraciones aisladas omitidas por falta de variables/acknowledgement local. Las pruebas existentes cubren contratos estáticos, modelo de proyección y autorización parcial; no prueban aún el contrato transversal propuesto ni Production.
- Estado de repositorio preservado: existían cambios locales previos en cuentas/invitaciones y documentación; esta auditoría sólo agrega este informe.
