# Documento Maestro — NAVE.Plan

**Relevamiento del repositorio:** 06/11/2026
**Naturaleza del producto:** plataforma interna en desarrollo para gestión comercial y operativa de una concesionaria.
**Criterio de lectura:** este documento separa evidencia de código local, documentación de proyecto y validación productiva. Un módulo incompleto es trabajo planificado, no un defecto de un producto finalizado.

## 1. Estado ejecutivo

NAVE.Plan ya tiene una base transaccional y de permisos relevante: autenticación Supabase, RLS, nómina/jerarquía, operaciones, adelantos, importación Fox asistida, métricas comerciales y el circuito de listas de precios. El alcance final todavía es mucho más amplio que el código operativo actual.

La arquitectura efectiva es **React/Vite → Worker Cloudflare (y APIs Vercel compatibles) → Supabase**. Supabase concentra el modelo de negocio y las fuentes externas deben ingresar mediante importadores o funciones protegidas; no son fuentes que el navegador deba consultar directamente.

### Lectura rápida por madurez

| Estado | Módulos |
| --- | --- |
| Operativo con validación pendiente de producción | Acceso, Legajos, proyecciones de estructura, Operaciones, Adelantos, Fox asistido, listas de precios Renault/circuito comercial |
| Implementado en parte | Pacing, Scoring, RRHH histórico/rotación, Fox mappings y métricas, importadores de precios, Extractor, cartera/mora |
| Cerrado localmente, sin evidencia remota | Sprint 5 de RRHH: Incorporaciones/Coaching, borradores privados, avisos de baja, altas/bajas directas y auditoría |
| Esquema o intención sin circuito de negocio terminado | Reclutamiento/documentos, notificaciones completas, App Control, mora mensual, información importante, parte diario de consulta |
| Heredado/simulado o no apto para declarar operativo | Configuración de conectores ETL en memoria, acciones genéricas del `AppContext`, candidatos y cartera en memoria, algunas rutas locales `/api/data` y `/api/connectors/*` que no existen entre las APIs desplegables |

### Riesgos que condicionan el orden de desarrollo

1. **Consolidar la estructura de Legajos en producción.** La migración local `032` y cambios asociados están sin confirmar como conjunto en este checkout; la plataforma entera deriva equipos, vendedores y alcance de esa estructura.
2. **No confundir UI con integración.** Varias pantallas muestran estructura preparada aun si una fuente externa no fue conectada, validada o automatizada.
3. **Priorizar contratos de fuente y permisos antes de dashboards nuevos.** App Control, Fox, scoring y mora necesitan dueños, claves de cruce, vista previa, corrida auditable y validación.
4. **No exponer secretos en el cliente.** El Extractor conserva una configuración local de Supabase que debe retirarse/restringirse antes de habilitarlo como circuito productivo.

## 2. Arquitectura e inventario transversal

### Aplicación y navegación

La aplicación está montada en `src/App.tsx` y mantiene abiertas las pestañas ya visitadas para no perder formularios ni filtros. El menú incluye:

- Control Comercial & Pacing.
- CRM & Reparto de Datos (Fox).
- Operaciones & Scoring.
- Listas de Precios.
- RRHH & Adelantos.
- Cartera & Mora.
- Bases de Datos & ETL.
- Extractor Google & Supabase, visible solamente para `admin`.

Componentes compartidos: `AppContext` (estado y cálculos comunes), `AuthProvider`, encabezado, barra lateral, configuración mensual/calendario, tipos de dominio, utilidades de negocio, parsers de archivos y servicios de precios.

### Seguridad y roles

- **Implementado:** Supabase Auth, login, recuperación/invitación con obligación de elegir contraseña, sesión de aplicación y perfiles.
- **Roles de aplicación actuales:** `admin`, `gerente`, `supervisor`, `rrhh`. El modelo de perfiles admite roles comerciales/dirección ampliados en migraciones recientes.
- **Regla de negocio definida:** vendedores no tienen login. Acceso previsto sólo para Supervisión, Gerencia, Dirección/Administración General y Administración/RRHH.
- **Persistencia:** RLS en las tablas centrales y políticas específicas para nómina, adelantos, reclutamiento, listas y documentos.
- **Pendiente:** regresión completa de permisos por rol en la URL Cloudflare y validación de invitaciones/cuentas reales.

### APIs y servicios existentes

| Endpoint/servicio | Propósito | Estado observado |
| --- | --- | --- |
| `/api/session` | Perfil, alcance y sesión operativa | Implementado; requiere validación de despliegue |
| `/api/operational-data` | Lectura consolidada de equipos, vendedores, operaciones, config., scoring, listas y adelantos | Implementado; alimenta el contexto |
| `/api/resources-directory` | Legajos, filtros, históricos y métricas de rotación | Implementado |
| `/api/resource-update` | Edición/baja lógica de recursos | Implementado; depende de proyección de roster |
| `/api/hr-import` | Previsualización/importación controlada de RRHH | Implementado parcialmente; requiere flujo funcional final |
| `/api/incorporation-*` | Solicitudes, borradores, documentos privados, decisiones y alta directa de Incorporaciones | Implementado y validado localmente en Sprint 5; sin evidencia de despliegue remoto |
| `/api/staff-departure-*` | Avisos de baja, documentos privados y decisiones auditadas | Implementado y validado localmente en Sprint 5; no desactiva Legajos |
| `/api/operations` | Alta de operación y auditoría de scoring | Implementado |
| `/api/wage-advances` | Solicitud y revisión de adelantos | Implementado |
| `/api/fox-leads-import` | Importación de Fox en API | Implementado; la UI principal usa RPC de Supabase para lotes |
| `/api/fox-leads-metrics` | Métricas Fox por jerarquía | Implementado |
| `/api/fox-user-mappings` | Consulta/confirmación de mapeos Fox | Implementado parcialmente |
| `/api/price-lists` | Borradores Renault/MG, importes, publicación, sobrepautas, confirmación e historial | Implementado para el circuito actual |
| `/api/public-config` | Configuración pública necesaria para cliente | Implementado |
| Edge Function `ingest-scoring-sheet` | Ingesta autenticada de filas de scoring | Implementada; depende de extractor y secreto configurados |
| Edge Function `sync-app-control-roster` | Sincronización protegida de roster desde App Control | Existe; integración real pendiente |

`cloudflare/worker.ts` concentra los endpoints anteriores junto con los estáticos. `server.ts` es servidor Express local y conserva rutas de desarrollo/heredadas; no debe tomarse como backend productivo persistente.

### Integraciones externas

| Integración | Uso previsto/actual | Estado real |
| --- | --- | --- |
| Supabase | Auth, PostgreSQL, RLS, Storage, RPC y Edge Functions | Núcleo del sistema; migraciones versionadas. Aplicación efectiva por ambiente debe verificarse. |
| Cloudflare Worker + Hyperdrive | Hosting del frontend y APIs con acceso a PostgreSQL | Publicación documentada; falta regresión integral actual. |
| Vercel | Compatibilidad/fallback de APIs | Disponible como respaldo, no arquitectura objetivo. |
| Fox CRM | Corte manual de leads, métricas y mapeo usuario↔recurso | Importación/RPC presentes; automatización diaria pendiente. |
| App Control Operaciones / Google Sheets | Fuente de ventas, cobros, modelos, orígenes y potencial roster | Contrato documentado; integración por pestaña pendiente. |
| Google Sheets Scoring | Peugeot inicialmente, con clave SX/N° suscripción | Edge Function disponible; automatización/configuración de fuente pendiente. |
| Banco Nación | Cotización vendedor para borrador MG | Consulta desde API existente; requiere validación operativa. |
| OCR local / PDF / XLSX | Lectura asistida de circulares y listas | Renault parser y OCR Stellantis disponibles; adaptadores y revisión humana pendientes. |

## 3. Inventario de datos Supabase

### Núcleo, estructura y acceso

| Grupo | Tablas y relaciones principales |
| --- | --- |
| Identidad | `profiles` se vincula a Auth y puede referir `teams` y `staff_members`. |
| Nómina maestra | `staff_members` conserva DNI, legajo/condición laboral, cargo, responsable, gerente, estado y baja. `hr_areas`, `hr_roles`, `hr_role_source_labels` normalizan área/cargo. |
| Proyecciones comerciales | `teams` y `sellers` son proyecciones derivadas de Legajos, no fuentes independientes. Un supervisor origina equipo; vendedor hereda su gerente desde supervisor cuando aplica. |
| Auditoría RRHH | `hr_import_runs`, `hr_import_rows`, `roster_import_runs`, `roster_change_log`, `staff_status_events`, `roster_reset_backups`, `resource_normalization_rules`, solicitudes/documentos de incorporación, avisos de baja y sus decisiones auditadas. |
| Fox | `fox_import_runs`, `fox_leads`, `fox_lead_daily_snapshots`, `fox_user_mappings`, `fox_user_mapping_suggestions`, `fox_resource_aliases`. |

La migración `20261031_032_legajos_atomic_roster_sync.sql` convierte las proyecciones de equipos/vendedores/perfiles en una reconstrucción atómica activada por cambios en `staff_members`. Es el diseño correcto de autoridad, pero su presencia local no prueba que esté aplicada ni verificada en producción.

### Comercial y operaciones

| Grupo | Tablas y relaciones principales |
| --- | --- |
| Ventas | `sales_operations` usa N° de suscripción como clave de integración externa y referencia vendedor/equipo. |
| Calidad | `scoring_records` actualiza estado de operación; `source_sync_runs` y `scoring_source_rows` conservan corrida y espejo de la fuente. |
| Gestión comercial | `monthly_config`, `leads_distribution`, `cartera_mora`. |
| Adelantos | `wage_advances` y `notifications`; existen triggers de notificación al solicitar/revisar. |
| Reclutamiento | `recruitment_candidates`, `candidate_documents` y bucket privado de Storage: hay esquema/RLS, no flujo de negocio terminado. |

### Listas de precios

El modelo heredado `price_lists` coexiste con el nuevo circuito versionado: `commercial_documents`, `price_list_versions`, `price_list_sources`, `price_list_items`, `price_list_installment_segments`, `price_list_structure_confirmations` y `price_list_item_surcharges`. El nuevo modelo contiene fuente, vigencia, estados, tramos, sobrepautas y confirmación por estructura.

## 4. Fichas de módulos

### 4.1 Acceso, perfiles y alcance

- **Objetivo:** ingresar sólo a mandos autorizados y limitar lectura/escritura por rol y estructura.
- **Existe y funciona en código:** login, recuperación/invitación, cambio inicial de contraseña, hidratación de perfil y políticas RLS.
- **Operativo:** puede funcionar con Auth y perfiles correctamente configurados; no hay evidencia de regresión integral vigente.
- **Incompleto:** ciclo administrativo completo de altas de usuarios, invitaciones verificadas y matriz de pruebas por rol.
- **Simulado/heredado:** ninguno central, aunque `currentUser` se mantiene en estado cliente tras una sesión válida.
- **Dependencias:** Supabase Auth, `profiles`, jerarquía de Legajos y secretos runtime.

### 4.2 RRHH — Legajos, jerarquía, bajas y rotación

- **Objetivo:** convertir Legajos en nómina maestra y derivar estructura comercial sin inferencias desde planillas operativas.
- **Existe:** directorio paginado con búsqueda por nombre/DNI/legajo, filtros por sector/equipo, ficha editable, importación/previsualización, responsables permitidos, cargos/áreas, baja lógica, históricos y panel de retención. Sprint 5 añade solicitudes Supervisor→Gerencia/RRHH/Admin, documentos privados, borradores parciales privados, creación de Coaching, alta directa RRHH, avisos de baja independientes y baja directa controlada.
- **Operativo:** lectura de directorio e interfaz de edición mediante APIs; reglas de DNI/legajo y excepción Coaching/Freelance están modeladas.
- **Incompleto:** validación de OCR con DNI representativos; bitácora individual antes/después fuera de los nuevos circuitos; confirmación de historial/bajas y sincronía de la proyección en ambiente productivo.
- **Simulado:** el estado de una pantalla no debe considerarse evidencia de que la migración o fuente RRHH fue aplicada/conciliada en producción.
- **Dependencias:** `staff_members` y roles; trigger/proyección a `teams`, `sellers`, `profiles`; sesión/alcance; Storage privado y Fox para equivalencias. Las migraciones RRHH 034–038 están validadas sólo en el entorno local.

### 4.3 Adelantos y notificaciones

- **Objetivo:** solicitar, revisar y auditar adelantos sobre ventas y configuración mensual.
- **Existe:** vista por alcance, solicitud, aprobación/rechazo con observaciones y API dedicada; triggers de notificación en esquema.
- **Operativo:** persistencia está implementada con permisos de solicitud/revisión.
- **Incompleto:** finalización de notificaciones de adelantos y regresión con usuarios reales; reglas finales administrativas si cambian las políticas.
- **Simulado:** acciones antiguas del contexto siguen presentes, pero el circuito que debe usarse es `/api/wage-advances`.
- **Dependencias:** perfiles/rol, vendedores, operaciones, `monthly_config`, `wage_advances`, `notifications`.

### 4.4 Control Comercial & Pacing

- **Objetivo:** objetivos, ritmo del mes, proyección, equipos y vendedores sin ventas.
- **Existe:** cálculo de días hábiles, objetivos por equipo, pacing, ranking de vendedores 0/1/2+, recomendaciones y configuración mensual/calendario.
- **Operativo:** los cálculos puros y su lectura desde `operational-data` están implementados.
- **Incompleto:** validación de métricas contra fuente oficial y vistas finales por rol; objetivos/feriados y criterios comerciales deben confirmarse.
- **Simulado:** recomendaciones generadas en cliente y valores de configuración por defecto cuando no llega backend; no deben usarse como decisión comercial sin datos cargados.
- **Dependencias:** Legajos→equipos/vendedores, operaciones, `monthly_config`, calendario y permisos.

### 4.5 Operaciones & Scoring

- **Objetivo:** registrar/consultar ventas, controlar calidad y evitar presentación a fábrica sin scoring aprobado.
- **Existe:** alta de operaciones, estados, auditoría scoring, tableros y persistencia; trigger de `scoring_records` hacia `sales_operations`.
- **Operativo:** API de alta/auditoría y reglas de transición de scoring están implementadas.
- **Incompleto:** importación real desde App Control por fuente oficial, reconciliación de filas, todas las marcas y prueba funcional de extremo a extremo.
- **Simulado:** el contexto protege PII reemplazando cliente por “Cliente protegido” en vistas operativas; no es una fuente de datos. Valores vacíos son el estado inicial esperado si no hubo ingesta.
- **Dependencias:** App Control/ID Ventas, Legajos, `sales_operations`, scoring y permisos.

### 4.6 CRM & Reparto de Datos — Fox

- **Objetivo:** importar cortes de Fox por ID de lead, asociar usuarios Fox a recursos aprobados y mostrar gestión por jerarquía.
- **Existe:** parser de reporte, RPC `import_fox_leads`, importaciones por lote, snapshots diarios, panel de métricas, propuestas de mapeo y confirmación manual.
- **Operativo:** corte asistido/manual y métricas tienen implementación; los lotes se suben a Supabase evitando el límite de CPU de Worker para cargas pesadas.
- **Incompleto:** sincronización diaria, validación de la importación completa, captura/exigencia de supervisor Fox en casos ambiguos, garantía uno-a-uno y pruebas de las rutas de históricos/inactivos en producción.
- **Simulado:** coincidencia aproximada de nombres es sólo sugerencia; no es autorización ni asociación definitiva.
- **Dependencias:** Legajos/jerarquía, tablas Fox, permisos de Supervisión/Administración, fuente/export/API Fox.

### 4.7 Listas de precios y circulares

- **Objetivo:** producir listas comerciales desde circulares oficiales, con fuentes, revisión, publicación jerárquica, sobrepautas y exportación.
- **Existe:** modelo versionado/RLS, API de borradores Renault y MG, publicación a Gerencia, confirmación/sobrepautas por estructura, vista restringida, retiro/historial, exportación XLSX/PDF, parser Renault, reglas de sellado y OCR local Stellantis.
- **Operativo:** el circuito de datos y pantallas está avanzado. La documentación indica migración `033` aplicada el 31/10; debe corroborarse en el proyecto Supabase activo antes de declararlo productivo.
- **Incompleto:** carga de archivos/fuentes, editor administrativo, carga asistida universal, adaptadores y validación de PDFs Peugeot/Citroën/Fiat/Jeep/RAM, contraste obligatorio de OCR, pruebas de autorización y validación con circulares/usuarios reales.
- **Simulado/transitorio:** adicional Renault de $15.000 por cuota hasta validación administrativa; cotización BNA/MG requiere confirmación de operación. Ningún OCR puede publicar precios sin revisión humana.
- **Dependencias:** jerarquía Legajos, Storage privado, tablas de listas, documentos oficiales, BNA para MG y APIs de exportación.

### 4.8 Cartera & Mora

- **Objetivo:** mostrar agrupamiento, deuda y trazabilidad de contratos.
- **Existe:** tipo de dominio, tabla `cartera_mora`, componente visual y acción de importación en contexto.
- **Operativo:** no puede declararse operativo: no hay contrato de importación mensual cerrado ni API específica en el inventario.
- **Incompleto:** formato CSV/XLSX fuente, importador con vista previa, claves, frecuencia, auditoría y permisos.
- **Simulado:** datos iniciales vacíos y carga en memoria; no se debe interpretar la pantalla como cartera real.
- **Dependencias:** informe de mora, N° de suscripción, operaciones, Legajos y alcance comercial.

### 4.9 Bases de Datos & ETL

- **Objetivo:** visibilizar/configurar conectores de fuentes.
- **Existe:** panel de conectores, estado, configuración, prueba, extracción y DDL informativo.
- **Operativo:** no como administración de conectores productivos: las configuraciones viven en estado de cliente y las rutas genéricas `/api/connectors/*` y `/api/data` no pertenecen al conjunto de APIs productivas relevado.
- **Incompleto:** reemplazar por monitor de integraciones reales, ejecuciones, errores y configuración sólo en servidor.
- **Simulado:** lista de conectores, estado conectado/desconectado y acciones de prueba/sync locales/heredadas.
- **Dependencias:** debe consumir corridas reales (`source_sync_runs`, importaciones Fox/RRHH) y secretos administrados fuera del navegador.

### 4.10 Extractor Google & Supabase (sólo admin)

- **Objetivo:** extracción asistida de Sheets/archivos/Fox, exploración, extensión SheetStream y transferencia a Supabase.
- **Existe:** hub con subpestañas, parseo de archivos, explorador/exportación, generación de extensión y prueba de conexión Supabase.
- **Operativo:** herramientas de apoyo local; la Edge Function de scoring ofrece un camino protegido específico.
- **Incompleto:** encuadrar cada extractor en contratos de fuente y permisos; auditoría de cargas y flujos de aprobación.
- **Riesgo/simulado:** la pantalla permite guardar URL/API key en `localStorage` y propone envío directo. No es admisible como patrón productivo para secretos o escrituras privilegiadas.
- **Dependencias:** Google, extensión, Edge Functions, secreto `INGEST_SHARED_SECRET`, Supabase y contratos por fuente.

### 4.11 Reclutamiento y documentos privados

- **Objetivo:** propuesta de alta, documentación privada, revisión RRHH y posterior incorporación a Legajos/cuenta autorizada.
- **Existe:** esquema de candidatos/documentos, bucket y RLS por alcance.
- **Operativo:** sólo base de datos y políticas; no hay módulo visible ni flujo integrado de punta a punta.
- **Incompleto:** pantalla, carga segura, revisión, aprobación, creación controlada de Legajo/equipo/vendedor y alta Auth sólo para roles permitidos.
- **Dependencias:** RRHH, Storage, Legajos, perfiles/Auth y jerarquía comercial.

### 4.12 Funcionalidades documentadas aún no construidas

- Pestaña “Información importante y medios de pago”.
- Parte de venta diario como consulta exclusiva de Gerencia/Administración, sin modificar Parte Diario.
- Integración detallada de todas las pestañas de App Control.
- Scoring por marca adicional a Peugeot.
- Importador mensual de mora/agrupamiento.
- Sincronización diaria automática Fox.
- Bitácora de cambios de Legajos y circuito de nuevas altas completo.

## 5. Fuentes de verdad y claves

| Dominio | Dueño/fuente | Clave | Regla |
| --- | --- | --- | --- |
| Personal y jerarquía | Legajos tras conciliación inicial de Estructura RRHH Activa | UUID interno; DNI obligatorio; legajo salvo Coaching/Freelance | Parte Diario y Equipos de venta no crean personas/equipos. |
| Ventas/cobros | App Control, pestaña `ID Ventas` | N° Suscripción | Upsert, no carga manual duplicada. |
| Scoring Peugeot | Planilla de Scoring | `SX` = N° Suscripción | Conserva origen; categoría no se normaliza sin validación. |
| Leads | Fox CRM | ID externo de lead | Matching de nombre sólo sugiere; el mapeo aprobado es explícito. |
| Precios | Circulares/listas oficiales | marca + vigencia + versión + modelo/plan | GenList no es fuente oficial por sí solo. |
| Mora | Informe mensual aún por definir | N° Suscripción | No hay importación oficial hasta acordar formato. |

## 6. Orden lógico de continuación

1. **Estabilización y evidencia:** registrar qué migraciones están realmente aplicadas y ejecutar regresión Cloudflare de acceso, Legajos, operaciones, adelantos, Fox y listas. Separar cambios locales no confirmados del estado productivo.
2. **Estructura maestra:** cerrar Legajos (proyección atómica, bajas/históricos, auditoría de cambios y flujo de altas). Es prerrequisito de alcance y tableros.
3. **Contratos de datos comerciales:** terminar App Control/ID Ventas, scoring Peugeot y Fox con corrida auditable, claves estables, preview, reversión y responsable de fuente.
4. **Permisos y datos reales:** regresión de roles, invitaciones y RLS; retirar o aislar configuraciones cliente/ETL simuladas.
5. **Completar listas de precios:** fuentes/archivos, revisión administrativa y validación con circulares reales antes de habilitación general.
6. **Módulos dependientes:** cartera/mora, información importante, parte diario de consulta, notificaciones y reclutamiento, solamente con fuente, permisos y circuito acordados.
7. **Optimización posterior:** instrumentar rendimiento y reducir recargas/requests sólo después de confirmar las rutas críticas con datos reales.

## 7. Criterios de “operativo” para los próximos entregables

Un módulo pasa de implementado a operativo cuando cumple simultáneamente:

1. Fuente dueña y contrato de datos aprobados.
2. Importación o escritura protegida, con preview, identificador estable, corrida/auditoría y reversión cuando corresponda.
3. Migración aplicada en el ambiente objetivo y RLS/permisos comprobados.
4. Pantalla conectada a datos reales, sin estados demo para decisiones.
5. Prueba de flujo completo con los roles involucrados y evidencia de resultado.

## 8. Alcance y límites de este relevamiento

El documento refleja el repositorio local y la documentación disponible al 01/11/2026. No ejecuta ni certifica migraciones, no consulta el proyecto Supabase ni confirma que una publicación Cloudflare siga activa. Esas verificaciones son la primera tarea del orden propuesto.
