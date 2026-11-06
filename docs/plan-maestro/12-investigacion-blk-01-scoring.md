# 12 — Investigación previa BLK-01: Scoring

**Fecha:** 01/11/2026
**Estado:** investigación estática del repositorio. No se modificó código, datos, permisos, base, migraciones ni despliegues. No se ejecutó SQL ni una escritura contra producción.

> **Alcance consolidado:** el único indicador comercial a derivar de este módulo será el resultado **observado de Scoring oficial**. No es presentación a fábrica, aceptación administrativa, agrupamiento, cuota 2, comisión ni liquidación. La evolución funcional, fuentes, cohortes y criterios está consolidada en [13](13-especificacion-circuito-comercial-presentaciones-scoring.md); este informe conserva el detalle técnico de desacople BLK-01.

## Conclusión

Hay dos circuitos distintos:

1. **Ingesta oficial de fuente:** la Edge Function `ingest-scoring-sheet` conserva filas y corridas en `scoring_source_rows` y `source_sync_runs`. Por el código relevado, este flujo no actualiza `sales_operations` ni `scoring_records`.
2. **Auditoría interna heredada:** la interfaz de Operaciones invoca `POST /api/operations` con `action: 'audit'`. La API actualiza la operación, crea un `scoring_records` y el trigger de base vuelve a sincronizar esa decisión con la operación. Este circuito aprueba/rechaza y bloquea/habilita fábrica; contradice la regla funcional vigente.

La corrección debe retirar el segundo circuito de interfaz/API/base, conservando el primero y el histórico. No hay evidencia de que el flujo de ingestión oficial sea quien bloquea una operación.

## 1. Inventario completo del comportamiento contradictorio

| Capa | Archivo y líneas | Comportamiento confirmado en código | Datos afectados |
| --- | --- | --- | --- |
| Tipos | [src/types/index.ts](../../src/types/index.ts) líneas 53–55, 79–100 | Define `OperationStatus` con `pending_scoring`/`apto_fabrica` y `ScoringStatus` con `approved`/`rejected`/`pending`; esos atributos viven en la operación. | Modelo cliente. |
| Esquema | [001_nave_planes_schema.sql](../../supabase/migrations/20261024_001_nave_planes_schema.sql) líneas 7–8, 58–97 | Crea enums, campos `status`, `scoring_status`, `scoring_notes`, `audited_at`, tabla `scoring_records` y check que permite `apto_fabrica` sólo con Scoring aprobado. | `sales_operations`, `scoring_records`. |
| Trigger | [001_nave_planes_schema.sql](../../supabase/migrations/20261024_001_nave_planes_schema.sql) líneas 167–184 | `apply_scoring_to_operation()` corre después de insert/update de `scoring_records`; copia status/notas/fecha y pone `apto_fabrica` si `approved`, o `pending_scoring` en todo otro caso. | Actualiza `sales_operations`. |
| Lógica UI | [businessLogic.ts](../../src/utils/businessLogic.ts) líneas 118–122 | `canPresentToFactory` devuelve verdadero exclusivamente con `approved`. | Sólo cálculo cliente, pero alimenta el bloqueo visual. |
| Contexto cliente | [AppContext.tsx](../../src/context/AppContext.tsx) líneas 485–508 | `auditScoring` llama API, reemplaza localmente `scoring_status`, notas, razones, estado y fecha; comunica “contrato habilitado para fábrica”. | Estado React después de persistir. |
| Endpoint | [api/operations.ts](../../api/operations.ts) líneas 81–106 | Admin/RRHH puede enviar `pending`/`approved`/`rejected`; actualiza directamente la operación y luego inserta una auditoría en `scoring_records`. | Escribe ambas tablas. |
| Tabla UI | [OperationsModule.tsx](../../src/components/operations/OperationsModule.tsx) líneas 335–475 | Muestra columnas “Auditoría Scoring” y “Apto Fábrica”; usa la función anterior para dibujar “Bloqueado”; ofrece “Auditar Scoring” a admin/RRHH. | Lectura + acceso al flujo de escritura. |
| Modal UI | [OperationsModule.tsx](../../src/components/operations/OperationsModule.tsx) líneas 485–635 | Permite “Aprobar (Habilita Fábrica)”, “Pendiente” o “Rechazar (Bloquea)” y guarda motivos/notas. | Dispara la escritura anterior. |
| Datos operativos | [operational-data.ts](../../api/operational-data.ts) líneas 86–110 | Lee de forma separada operaciones (incluye los campos de Scoring) y filas de fuente. La fuente no se une ni modifica la operación en esta consulta. | Sólo lectura. |
| Despliegue Worker | [cloudflare/worker.ts](../../cloudflare/worker.ts) líneas 25–38 y 99–115 | Expone `/api/operations` a través del Worker si la versión desplegada corresponde a este código. | Ruta potencialmente pública autenticada. |

## 2. Circuito de fuente oficial que debe conservarse

| Componente | Archivo y líneas | Evidencia |
| --- | --- | --- |
| Landing zone | [003_scoring_landing_zone.sql](../../supabase/migrations/20261024_003_scoring_landing_zone.sql) líneas 1–47 | Define una copia read-only de origen con categoría observada, motivos de rechazo/aprobación/anulación, comentarios y JSON original. Declara explícitamente que no infiere aprobación/rechazo. |
| Autenticación de ingestión | [ingest-scoring-sheet/index.ts](../../supabase/functions/ingest-scoring-sheet/index.ts) líneas 14–45 | Sólo admite POST JSON con `x-ingest-secret`; la credencial de servicio queda del lado servidor. |
| Identidad/idempotencia | [ingest-scoring-sheet/index.ts](../../supabase/functions/ingest-scoring-sheet/index.ts) líneas 53–104 | Exige SX, rechaza duplicados en lote e inconsistencias de identidad antes de escribir. |
| Escritura de fuente | [ingest-scoring-sheet/index.ts](../../supabase/functions/ingest-scoring-sheet/index.ts) líneas 107–144 | Registra `source_sync_runs` y hace upsert de `scoring_source_rows` por `source_key`; incluye marca, SX, vendedor, supervisor, categoría, motivos y fila original. No consulta/escribe `sales_operations` ni `scoring_records`. |
| Lectura y alcance | [operational-data.ts](../../api/operational-data.ts) líneas 95–110; [OperationsModule.tsx](../../src/components/operations/OperationsModule.tsx) líneas 64–80 y 279–328 | API filtra por rol/estructura y la UI ya muestra filas sincronizadas sin acción de escritura sobre ellas. |

### Datos que el flujo de fuente actual conserva

- Corrida: fuente, hoja, contador, importador y fecha en `source_sync_runs`.
- Fila más reciente por marca + SX: vendedor, supervisor, administrador, categoría literal, motivos de rechazo/aprobación/anulación, comentarios, JSON original, primera/última detección.
- La unicidad actual `(brand, subscription_number)` y `source_key` permiten reimportar un corte sin duplicar su última representación.

**Límite:** el diseño conserva la última fila por marca/SX y las corridas, no un historial versionado de cada variación de esa fila. No debe cambiarse ese modelo sin decidir primero el nivel de historial requerido.

## 3. Qué está conectado y qué no está probado

### Confirmado en código local

- El botón de Auditoría es alcanzable desde la pantalla actual para roles `admin` y `rrhh` ([OperationsModule.tsx](../../src/components/operations/OperationsModule.tsx):467–473).
- El botón llama al contexto, que llama a `/api/operations` con `action: 'audit'` ([AppContext.tsx](../../src/context/AppContext.tsx):485–504).
- La API autoriza a esos roles y muta `sales_operations`, luego inserta `scoring_records` ([operations.ts](../../api/operations.ts):81–106).
- El trigger definido en la migración vuelve a mutar la operación al insertar/actualizar el registro de Scoring ([001](../../supabase/migrations/20261024_001_nave_planes_schema.sql):167–184).
- El Worker local registra la ruta `/api/operations` ([worker.ts](../../cloudflare/worker.ts):25–38).
- La ingesta de planillas es independiente y sólo escribe la landing zone según su código ([ingest](../../supabase/functions/ingest-scoring-sheet/index.ts):107–144).

### Confirmado en ambiente desplegado

**Nada en esta investigación.** No se consultó la base, no se revisó la versión desplegada, no se invocaron APIs y no se hicieron escrituras. Que una migración o ruta exista localmente no prueba que esté activa en Supabase/Cloudflare/Vercel.

### Aún no verificado y requerido antes de un cambio

- Si la migración `001` y el trigger `scoring_records_apply_to_operation` están aplicados en el proyecto Supabase objetivo.
- Si existen políticas posteriores sobre `sales_operations`, `scoring_records`, `scoring_source_rows` o `source_sync_runs`. La migración `001` habilita RLS en las dos primeras (líneas 186–198), pero no define allí una policy de Scoring.
- Si hay clientes desplegados anteriores/posteriores que llaman `action: 'audit'` directamente.
- Si hay procesos externos que escriben en `scoring_records`; el trigger los afectaría aunque no usen la interfaz.
- Si hay operaciones históricas en `apto_fabrica` cuya consistencia depende del check actual.
- Si Pacing u otros reportes externos consumen `status`, `scoring_status`, `scoring_notes` o `audited_at` directamente.

## 4. Mutaciones actuales y alcance del impacto

### Al usar la auditoría interna actual

1. La API actualiza `sales_operations.scoring_status`, `scoring_notes`, `audited_at` y `status` ([operations.ts](../../api/operations.ts):92–100).
2. Inserta una fila en `scoring_records` con `operation_id`, SX, estado, notas, razones, fecha y un `source_row` sintético que indica `nave-planes-web` ([operations.ts](../../api/operations.ts):102–104).
3. Ese insert activa el trigger; éste vuelve a copiar estado/notas/fecha y decide `status` ([001](../../supabase/migrations/20261024_001_nave_planes_schema.sql):171–177).
4. El contexto React replica los valores devueltos y la tabla los utiliza para filtros, etiquetas, bloqueo y acciones ([AppContext.tsx](../../src/context/AppContext.tsx):496–504; [OperationsModule.tsx](../../src/components/operations/OperationsModule.tsx):375–464).

La escritura ocurre dentro de una transacción API; el trigger es una segunda vía de actualización dentro de esa misma operación. `rejection_reasons` no se copia a `sales_operations`; la interfaz los mantiene en memoria tras la respuesta, pero la consulta consolidada de operaciones tampoco los selecciona. Esto es una inconsistencia local de visualización, no una conclusión sobre datos productivos.

### Efecto sobre módulos dependientes

| Módulo | Dependencia | Riesgo al desacoplar |
| --- | --- | --- |
| Operaciones | Renderiza estado y filtros de Scoring/Apto Fábrica. | Hay que sustituirlos por indicadores de fuente, sin perder alta/consulta de operaciones. |
| Pacing | Cuenta operaciones cuyo `status` no sea `caido`; no filtra por `apto_fabrica` en el código relevado. | Bajo para cálculos actuales; debe verificarse cualquier reporte SQL externo. |
| Adelantos | Cuenta ventas donde `status <> 'caido'` ([wage-advances.ts](../../api/wage-advances.ts):47–53). | Bajo en código actual: aprobado/rechazado no excluye ventas. Verificar reglas de negocio reales. |
| Header/Sidebar | Muestran cantidad de operaciones con `scoring_status === 'pending'`. | Deben pasar a usar estado observado de fuente o retirarse, para no exponer workflow interno. |
| Reportes/Integraciones externas | No encontrados en este checkout. | Desconocido hasta inventariar consultas, vistas y consumidores productivos. |

## 5. Propuesta de corrección (sin implementar)

### Principio de diseño

Separar definitivamente **operación comercial** de **observación de Scoring**. La fuente oficial se ingiere, se guarda literalmente y se analiza; nunca decide el estado de una venta dentro de Nave.Plan.

### Cambios propuestos por capa

1. **Modelo nuevo de lectura:** usar `scoring_source_rows` como fuente de análisis. Si hace falta unirlo a operaciones, hacerlo sólo en una consulta/vista de lectura por `brand + subscription_number`, exponiendo campos con prefijo `scoring_*_observed`. No escribir en ninguna de ambas tablas durante ese join.
2. **Interfaz:** retirar de Operaciones el modal, botón, columnas “Apto Fábrica” y los textos/badges que representan aprobación propia. Conservar/expandir la tabla de filas sincronizadas con categorías, códigos/motivos, marca, fecha, vendedor, supervisor y alcance.
3. **Cliente/API:** retirar el método `auditScoring`, el `action: 'audit'` y cualquier mensaje que habilite/bloquee fábrica. Mantener sólo alta/lectura de operaciones si esa carga sigue autorizada.
4. **Base:** en una migración futura, eliminar el trigger y función `apply_scoring_to_operation`; eliminar la restricción `status <> 'apto_fabrica' or scoring_status = 'approved'` y, tras una revisión de consumidores, retirar/descontinuar campos de Scoring propios de `sales_operations` y el modelo de `scoring_records` o mantenerlo únicamente como histórico marcado `legacy` y sin trigger.
5. **Histórico:** no borrar `scoring_records` ni los campos existentes al inicio. Preservarlos para auditoría, identificar su origen (`nave-planes-web`) y documentar que no representan fuente oficial. La UI nueva no debe tomar decisiones desde ellos.
6. **Permisos:** conservar acceso a filas de fuente por alcance. Administración/RRHH global y Supervisión/Gerencia sólo sobre filas atribuibles a su jerarquía; si el supervisor de origen no permite determinar alcance, mostrar el registro sólo a roles globales o en cola de asignación, nunca ampliar acceso por coincidencia incierta.

### Secuencia segura propuesta

1. Inventario read-only de esquema y consumidores en el ambiente objetivo.
2. Pruebas de regresión con datos sintéticos/entorno no productivo para confirmar que la landing zone no toca operaciones.
3. Entrega de UI/API que elimina la acción interna, dejando compatibilidad de lectura para histórico.
4. Migración de desacople: trigger/check/campos, sólo tras revisar operaciones históricas y consumidores.
5. Regresión por rol, importación y Pacing/Adelantos; luego despliegue bajo aprobación separada.

## 6. Riesgos de la corrección

- **Base activa desconocida:** quitar un trigger sin confirmar su presencia o consumidores puede fallar o dejar referencias obsoletas.
- **Historial ambiguo:** `scoring_records` mezcla potencialmente auditoría interna con datos que podrían parecer de fuente. Debe preservarse y etiquetarse, no reinterpretarse.
- **Alcance por nombres:** el filtro actual de fuente compara nombre normalizado de supervisor ([operational-data.ts](../../api/operational-data.ts):100–108); homónimos o cambios de nombre requieren una solución con identidad aprobada.
- **Estados de operación existentes:** cualquier migración debe tratar `apto_fabrica` histórico sin reclasificar ni modificar operaciones por el sólo cambio funcional.
- **RLS/servicio:** la Edge Function usa service role. Las pantallas deben continuar usando APIs autenticadas y no exponer credenciales.

## 7. Pruebas de aceptación propuestas

Las pruebas siguientes son para entorno aislado o datos de prueba; no autorizan escrituras de producción.

| ID | Caso | Preparación | Resultado exigido |
| --- | --- | --- | --- |
| SC-ACC-01 | Fila fuente “aprobada” | Operación con estado comercial conocido; importar una fila oficial con categoría/motivo de aprobación y mismo marca+SX. | La fila se consulta en análisis; todos los campos de `sales_operations` permanecen idénticos antes/después. |
| SC-ACC-02 | Fila fuente “rechazada” | Igual al anterior, con motivo de rechazo. | La fila/motivo se muestra; operación no cambia estado, notas, fecha ni habilitación de fábrica. |
| SC-ACC-03 | Fila fuente “anulada” | Igual al anterior, con motivo de anulación. | El motivo se conserva y filtra; operación vinculada permanece idéntica. |
| SC-ACC-04 | Reimportación | Repetir el mismo lote marca+SX. | No duplica fila vigente; crea/identifica corrida según diseño y no toca operaciones. |
| SC-ACC-05 | Alcance | Ingresar con Supervisor, Gerencia y rol global. | Cada rol ve sólo las filas de su alcance; filas sin atribución confiable no se filtran a un rol local. |
| SC-ACC-06 | Sin acción interna | Ingresar como Admin/RRHH tras la corrección. | No existe botón/modal/API soportada para aprobar, rechazar o bloquear desde Nave.Plan. |
| SC-ACC-07 | Regresión Pacing/adelantos | Ejecutar métricas conocidas antes/después de importación. | Ventas, pacing y elegibilidad de adelanto no cambian por una categoría de Scoring. |
| SC-ACC-08 | Histórico | Consultar filas `scoring_records` heredadas. | Permanecen accesibles a roles autorizados como histórico marcado, pero no afectan la operación ni la analítica de fuente oficial. |

## Decisión solicitada antes de implementar

Autorizar, en un trabajo posterior, el enfoque de **desacople progresivo**: primero retirar la acción interna y publicar analítica de fuente; luego migrar trigger/check/campos tras inventario real de Supabase y consumidores. La alternativa de eliminar inmediatamente tablas/campos históricos no se recomienda porque eleva el riesgo de pérdida de trazabilidad.
