# 08 — Matriz de brechas funcionales

**Fecha:** 06/11/2026
**Propósito:** contraste propuesto entre el alcance funcional aprobado y el código local. No certifica comportamiento productivo, migraciones aplicadas ni permisos desplegados.

> **Consolidación funcional (01/11/2026):** para Parte Diario, Operaciones, Presentaciones, documentos, Scoring, indicadores y Mora prevalece la especificación de [13](13-especificacion-circuito-comercial-presentaciones-scoring.md). Las menciones previas a “contrato” como producto generado por NAVE.Plan se reinterpretan como **expediente de presentación**; NAVE.Plan no genera ni reemplaza el contrato oficial de la terminal.

## Convenciones

- **Evidencia de código:** archivo, endpoint, migración o prueba presente en este checkout.
- **Operativo verificable:** existe una ruta de persistencia o lectura en el código. Su ejecución contra ambiente real sigue pendiente de prueba.
- **No observado:** no se encontró implementación en el repositorio; no significa que sea imposible ni que sea un error actual.

## 1. FoxCRM: control de datos, no reparto

| Aspecto | Evaluación |
| --- | --- |
| Componentes relacionados | `src/components/crm/CrmLeadsModule.tsx`, `FoxMetricsPanel.tsx`, `FoxReportImportPanel.tsx`, `FoxUserMappingPanel.tsx`, `src/services/fox/parseFoxLeadReport.ts`; APIs `fox-leads-import`, `fox-leads-metrics`, `fox-user-mappings`; migraciones `007`, `027`–`029`; RPC `import_fox_leads`. |
| Existe | Importación asistida de reportes por ID de lead; snapshots, cartera total, sin/con gestión, abiertos, cerrados y vendidos; tabla por vendedor; métricas por estructura; motivos existentes si los entrega el reporte; asociación Fox↔Legajo manual/asistida. |
| Incompleto | Automatización diaria; validación productiva de importación masiva/métricas; completar datos de supervisor Fox y restricciones uno-a-uno; trazabilidad explícita de todos los motivos de cierre en UX si el archivo fuente los trae. |
| No observado | Scheduler/credencial servidor para extracción diaria desde Fox; contrato probado de API/webhook/export programado. |
| Contradicción | El rótulo y parte del contexto hablan de “CRM & Reparto de Datos”. La definición nueva elimina reparto: debe conservarse el control, pero retirar del lenguaje y futuras acciones toda asignación/rotación. No se encontró una implementación de reparto automático que deba eliminarse. |
| Reutilizable | Parser, RPC por lotes, tablas/snapshots, panel de métricas y mapeos. |
| Dependencias/riesgos | Fuente/credenciales Fox, mapeo aprobado con Legajos, volumen de importación, PII mínima y RLS. El matching por nombre no puede autorizar asociación. |
| Aceptación | Tras una corrida diaria idempotente, el tablero muestra los totales esperados, desglose de estados/motivos y tabla por vendedor; una repetición no duplica leads; no existe acción de reparto. |
| Complejidad | **Alta** para automatización (acceso externo, idempotencia y monitoreo); **baja** para renombrar/reordenar la UI. |

## 2. Marketing y campañas fuera de alcance

| Aspecto | Evaluación |
| --- | --- |
| Evidencia | `LeadSource` conserva canales de origen; Fox y Operaciones los muestran como dato histórico. No se encontró módulo de campañas ni automatización de marketing. |
| Decisión | Conservar canales de origen cuando sean parte del dato de venta/lead. No desarrollar campañas, presupuestos, audiencias, performance publicitaria ni reparto asociado. |
| Riesgo | Eliminar campos de origen rompería trazabilidad y reportes. Debe limitarse alcance, no borrar historia. |
| Aceptación | El backlog no contiene funcionalidad de campañas; los orígenes siguen disponibles como atributo de análisis. |
| Complejidad | **Baja**: decisión de alcance/documentación y revisión de nomenclatura. |

## 3. RRHH: Legajos, documentación, altas, bajas y rotación

| Aspecto | Evaluación |
| --- | --- |
| Componentes relacionados | `LegajosDirectory.tsx`, `TurnoverPanels.tsx`, `HrAndAdvancesModule.tsx`, `IncorporationPanel.tsx`, `HrDirectIncorporation.tsx`, `HrDirectDeparture.tsx`, `DepartureNoticesPanel.tsx`; `resources-directory`, `resource-update`, `hr-import`, `incorporation-*`, `staff-departure-*`; migraciones `005`, `006`, `008`–`026`, `032`, `034`–`038`. |
| Existe | Directorio, filtros/edición, responsables, baja lógica, históricos y retención; esquema/RLS/bucket de candidatos y documentos; importación RRHH y proyección de equipos/vendedores desde Legajos. Sprint 5 validó localmente solicitudes de incorporación con borradores parciales/documentos privados, decisiones y creación Coaching, alta directa RRHH, avisos de baja auditados y baja directa con alcance controlado. |
| Incompleto | Bitácora antes/después fuera de los nuevos circuitos; validación de OCR con DNI representativos; confirmación de que bajas, documentos y proyecciones operan en producción. |
| No observado | Agenda de entrevistas como módulo persistente (correctamente opcional/futura); creación de cuenta Auth integrada en alta de RRHH. |
| Contradicción | La subpestaña Reclutamiento usa candidatos del `AppContext` en memoria y no las tablas de reclutamiento; no debe declararse circuito de documentos real. |
| Reutilizable | Modelo/RLS de candidatos, Storage privado, Legajos, APIs de roster y paneles de rotación. |
| Dependencias/riesgos | Legajos es autoridad de jerarquía; migración/proyección debe estar aplicada. Documentación es dato sensible. La baja no debe borrar historia. |
| Aceptación | Una alta propuesta conserva documentos privados, se revisa por Gerencia/RRHH/Admin, crea un único Legajo Coaching y sólo habilita Auth para roles autorizados; una baja diferencia aviso, corrección y baja real, y la rotación cambia sólo con baja real. El cierre Sprint 5 acredita el escenario local, no el ambiente remoto. |
| Complejidad | **Alta**: toca identidad, PII, jerarquía y múltiples proyecciones. Agenda futura: **media**. |

## 4. Scoring: seguimiento y análisis, sin aprobación/bloqueo

| Aspecto | Evaluación |
| --- | --- |
| Componentes relacionados | `OperationsModule.tsx`, `businessLogic.ts`, `operations.ts`, Edge Function `ingest-scoring-sheet`; `sales_operations`, `scoring_records`, `scoring_source_rows`, `source_sync_runs`; migración `001` y docs de scoring. |
| Existe | Ingesta/espejo de filas, cruce por SX/N° de suscripción, filtros de scoring, datos de estado, motivos y controles por equipo. |
| Incompleto | Análisis por códigos, motivo de rechazo/anulación, marca, supervisor, gerencia y objetivo de fábrica; fuentes de otras marcas; automatización segura de la fuente. |
| No observado | Modelo explícito de objetivos de fábrica por marca/período y análisis agregado contra ellos. |
| Contradicción bloqueante | El código permite “Auditar Scoring”, escribe `approved/rejected`, y `canPresentToFactory` bloquea la operación si no está aprobada. Esto contradice directamente el nuevo alcance y debe sustituirse por observación/importación sin mutar ni bloquear operaciones. |
| Reutilizable | Edge Function, normalización de fechas/campos, tablas de fuente, cruce por SX, filtros y visualización de filas. |
| Dependencias/riesgos | Debe evitarse alterar Parte Diario/operación desde Scoring. Hay que conservar histórico y definir catálogo de códigos por marca sin inventar equivalencias. |
| Aceptación | Importar Scoring actualiza sólo su espejo/analítica; ninguna acción cambia estado de venta ni habilita/bloquea fábrica; dashboard filtra por marca, período, supervisor y gerencia y explica códigos/motivos de fuente. |
| Complejidad | **Alta**: retirar acoplamiento de negocio y diseñar analítica/fuentes sin perder histórico. |

## 5. Objetivos comerciales por gerencia, equipo, vendedor y período

| Aspecto | Evaluación |
| --- | --- |
| Componentes relacionados | `PacingDashboard.tsx`, `CalendarConfigModal.tsx`, `AppContext.tsx`, `businessLogic.ts`, `operational-data.ts`; `monthly_config`, `teams.target_override`, `sellers.individual_target`. |
| Existe | Cálculos de pacing, calendario/configuración mensual, objetivo por equipo y valor individual leídos; `target_override` e `individual_target` aparecen en modelo/consulta. |
| Incompleto | Persistencia y UI autorizada para editar objetivos; período comercial explícito por alcance; historial; validación de que un gerente sólo opera su estructura. `update*Target` del contexto es estado cliente/heredado, no evidencia de persistencia. |
| No observado | Tabla/API de objetivos con alcance organizacional, vigencia y auditoría. |
| Contradicción | `monthly_config` tiene un objetivo global y el modal permite alterar reglas en memoria; no satisface autorización por gerencia ni persistencia por equipo/vendedor. |
| Reutilizable | Fórmulas de pacing, tableros, datos de estructura y vistas de equipo/vendedor. |
| Dependencias/riesgos | Legajos/proyección de jerarquía; definición de período y precedencia (vendedor > equipo > gerencia/global); RLS y auditoría para evitar metas ajenas. |
| Aceptación | Gerencia configura una meta de su equipo para un período; puede fijar excepción a vendedor subordinado; se conserva versión/autorizador; el pacing usa la meta vigente correcta y otro gerente no puede verla/modificarla fuera de alcance. |
| Complejidad | **Alta**: nuevo modelo persistente, alcance y reglas de precedencia. |

## 6. Presentación de operaciones y documentación desde plantillas

| Aspecto | Evaluación |
| --- | --- |
| Evidencia | Las tres plantillas fueron relevadas estructuralmente en [13](13-especificacion-circuito-comercial-presentaciones-scoring.md). No se observaron motor de expedientes, endpoints ni entidades de presentación. `sales_operations` sólo conserva datos de operación. |
| Brecha | Funcionalidad nueva: preparar documentación para Administración, no generar contratos oficiales de terminal. Está pendiente aprobar el mapeo por campo, reglas de requisitos, almacenamiento, versiones y permisos. |
| Reutilizable | Datos de operación/cliente sólo tras revisar minimización y autorización; Storage privado/documentos comerciales como referencia técnica, no como modelo final de expedientes. |
| Riesgos | PII, plantilla equivocada, cálculo alterado en Caja, PDF multipágina persistido indebidamente, generación repetida y acceso indebido. |
| Aceptación | Desde una venta cantada autorizada se generan dos expedientes versionados y descargables según rol; no se altera Parte Diario ni se genera/reemplaza el contrato oficial. |
| Complejidad | **Alta**. |

## 7. Cobros: enlaces autorizados por marca; Mercado Pago futuro

| Aspecto | Evaluación |
| --- | --- |
| Evidencia | Datos de cobro existen en `sales_operations` y contrato de App Control. No se observaron entidades, UI, API o integración de links de pago/Mercado Pago. |
| Brecha | Nueva funcionalidad. Mercado Pago queda excluido del primer alcance. |
| Reutilizable | Marca/modelo/operación y políticas de acceso; no hay componente de pago reutilizable. |
| Riesgos | Enlaces falsos, vencidos o de marca equivocada; no almacenar credenciales ni procesar pagos en Nave.Plan sin decisión posterior. |
| Aceptación | Usuario autorizado ve sólo los enlaces aprobados para la marca/operación; el enlace tiene vigencia/autor/respaldo y abrirlo no registra ni procesa pagos en Nave.Plan. |
| Complejidad | **Media** para catálogo/enlaces autorizados; Mercado Pago futuro: **alta**. |

## 8. Adelantos por mínimo configurado por gerencia; resuelve gerencia o Dirección

| Aspecto | Evaluación |
| --- | --- |
| Componentes relacionados | `HrAndAdvancesModule.tsx`, `CalendarConfigModal.tsx`, `wage-advances.ts`; `wage_advances`, `monthly_config`, notificaciones y políticas de `004`. |
| Existe | Solicitud/revisión, persistencia, corte y monto máximo globales, conteo de ventas, alcance de estructura para resolver y notificaciones modeladas. |
| Incompleto | Configuración de mínimo por gerencia/equipo y período; UI/API para ello; autorización explícita de Dirección como aprobador universal; auditoría de reglas aplicadas al momento de solicitud. |
| Contradicción | API y UI aplican `monthly_config.min_sales_for_advance` global. Eso no cumple la regla nueva por gerencia/equipo. |
| Reutilizable | Flujo de solicitud/revisión, alcance de vendedor y triggers de notificación. |
| Dependencias/riesgos | Objetivos/estructura no son equivalentes a regla de adelanto: requiere modelo propio con precedencia y snapshot para no recalificar solicitudes históricas. |
| Aceptación | Cada gerencia define mínimo para período y equipo propio; solicitud guarda la regla/ventas usadas; gerencia correspondiente o Dirección resuelve; gerencias ajenas no pueden configurar ni decidir. |
| Complejidad | **Media-alta**. |

## 9. Listas: precios base restringidos, sobrepautas para Gerencia y superiores

| Aspecto | Evaluación |
| --- | --- |
| Componentes relacionados | `PriceListModule.tsx`, `price-lists.ts`, servicios de precios; migraciones `033`–`036`; tablas versionadas de precios/documentos. |
| Existe | Circuito de versiones, fuentes, publicación, confirmación, sobrepauta por estructura, exportación, vista restringida de Supervisión y RLS específico. |
| Incompleto | Carga de documentos/circulares y revisión administrativa completa; adaptadores de fuente; regresión por rol y validación con fuentes reales. |
| Contradicción a revisar | La documentación anterior describe Administración General/Dirección como quien carga/precios base y Gerencia con sobrepauta sólo creciente. La nueva regla habilita Gerencia y superiores a modificar sobrepautas; confirmar si mantiene el piso/no-reducción antes de alterar restricciones. |
| Reutilizable | Prácticamente todo el módulo, especialmente modelo versionado, permisos, tablas, exportadores, parser Renault y OCR. |
| Dependencias/riesgos | Jerarquía de Legajos, RLS, Storage, fuente oficial. El OCR/IA no puede publicar importes sin revisión humana. |
| Aceptación | Dirección/Administración modifica base/carga circular; Gerencia modifica sobrepauta sólo en alcance permitido; Supervisión sólo consulta/descarga; cada publicación conserva fuente, versión y auditoría. |
| Complejidad | **Media** para permisos/regresión; **alta** para completar importadores/revisión de documentos. |

## 10. IA asistida para circulares con revisión humana

| Aspecto | Evaluación |
| --- | --- |
| Evidencia | OCR local Stellantis y parsers mecánicos. La decisión previa de listas excluía IA. Dependencia `@google/genai` existe, pero no se observó flujo productivo de IA para listas. |
| Brecha/decisión | Definir si IA se incorpora como propuesta no autoritativa. No sustituye parser, fuente, confirmación ni publicación. |
| Reutilizable | Upload/documentos, OCR, modelo de borrador y revisión de listas. |
| Riesgos | Alucinación de importes, privacidad de documentos, costo, trazabilidad y cambios de formato. |
| Aceptación | IA devuelve campos con evidencia/página/confianza, queda como borrador y no puede publicar; revisor humano confirma cada valor exigido. |
| Complejidad | **Media-alta** tras resolver proveedor, privacidad y UX de revisión. |

## 11. Parte Diario: externo ahora, nativo luego

| Aspecto | Evaluación |
| --- | --- |
| Evidencia | `MAPA_DE_FUENTES.md` declara `ID Ventas` de App Control como fuente; `sales_operations` y Operaciones ya modelan datos relacionados. No hay módulo nativo “Parte Diario”. |
| Estado | Mantener fuente externa conectada, sólo lectura/ingesta controlada. Futuro módulo nativo requiere transición explícita de autoridad. |
| Riesgo | Duplicar o sobrescribir contratos; confundir `sales_operations` local con autoridad mientras App Control siga siéndolo. |
| Aceptación | Mientras sea externo, una corrida idempotente refleja ID Ventas y no modifica Parte Diario. El proyecto nativo sólo empieza con contrato de transición aprobado. |
| Complejidad | Integración externa: **alta**. Módulo nativo posterior: **alta**. |

## 12. Mora y agrupamiento

| Aspecto | Evaluación |
| --- | --- |
| Evidencia | `CarteraMoraModule.tsx`, tipo y tabla `cartera_mora`; sin API/importador de fuente oficial observado. |
| Estado | Conservar el módulo como destino de diseño, no habilitarlo como cartera real hasta definir fuente. |
| Reutilizable | Modelo visual y tipo de dominio como referencia; deberán validarse contra formato real. |
| Riesgos | Estado/desfasaje de deuda y exposición de PII. |
| Aceptación | Fuente oficial, frecuencia, campos, clave y responsable aprobados; importación auditable por N° suscripción; tablero indica fecha/corrida y no inventa datos faltantes. |
| Complejidad | **Media-alta**, dependiente de la fuente. |

## 13. Pacing, proyecciones, indicadores, recomendaciones, calendario y productividad

| Aspecto | Evaluación |
| --- | --- |
| Evidencia | `PacingDashboard.tsx`, `businessLogic.ts`, `CalendarConfigModal.tsx`, `AppContext.tsx`, `monthly_config`, operaciones/equipos/vendedores. |
| Existe | Cálculo de ritmo, proyección, comparativas, vendedores 0/1/2+, recomendaciones y calendario mensual. |
| Incompleto | Persistir configuración/calendario y objetivos con autorización; asegurar que recomendaciones usen datos reales y definiciones aprobadas; productividad con reglas formalizadas. |
| Contradicción | Parte de configuración/actualización vive en estado cliente; no debe venderse como administración persistente. |
| Reutilizable | Fórmulas, gráficos, tableros y datos operativos. |
| Riesgos | Metas y días hábiles incorrectos alteran indicadores; recomendaciones no deben convertirse en decisiones automáticas. |
| Aceptación | Con datos de una fuente/cierre conocido, indicadores y proyección coinciden con caso de prueba; cambios autorizados de período/meta persisten y se auditan. |
| Complejidad | **Media**, luego de resolver objetivos persistentes. |

## Consolidación de brechas del circuito comercial

| Alcance aprobado | Evidencia compatible reutilizable | Brecha o contradicción a resolver en planificación |
| --- | --- | --- |
| Venta cantada externa | `sales_operations`, `subscription_number`, `external_id`, `source_updated_at`; documentación de `ID Ventas`; Edge Function de App Control que declara no modificar Parte Diario. | Hoy la operación se nombra/estructura como venta con `pending_scoring`; falta contrato de sincronización idempotente de cantadas, identificador de fuente y relación explícita con presentación. |
| Expediente de presentación | Datos de operación, Legajos, Storage privado/políticas de candidatos y documentos comerciales como referencias técnicas. | No existe módulo, expediente, estados, validación de requisitos, procesamiento seguro ni generador de PDFs. |
| Formularios plantilla | Plantillas originales relevadas en [13](13-especificacion-circuito-comercial-presentaciones-scoring.md); servicios XLSX/PDF ya instalados y exportadores de listas como referencia técnica. | Falta aprobar mapeo por campo: origen, editabilidad, validación, “No aplica”, discrepancias y versión. No puede sustituirse por un formulario genérico. |
| Scoring observado | `scoring_source_rows`, `source_sync_runs`, Edge Function y UI de consulta por alcance. | Debe ampliarse a automatización, mapeos versionados, histórico/indicadores y desacoplar totalmente aprobación/bloqueo interno. |
| Indicadores de tres etapas | Pacing, calendario, equipos/vendedores, operaciones y filtros actuales. | Faltan cohortes/períodos definidos, fechas diferenciadas, atribución histórica y objetivos de fábrica. |
| Mora posterior | Tabla/tipo/componente vacíos que ya informan falta de fuente. | No existe fuente ni integración autorizada; se mantiene pendiente, sin simulaciones ni cobranza. |
