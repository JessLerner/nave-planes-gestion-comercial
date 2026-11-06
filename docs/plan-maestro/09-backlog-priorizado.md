# 09 — Backlog priorizado propuesto

**Estado:** propuesta para revisión. No autoriza implementación, migraciones, cambios de permisos ni despliegues.

## Correcciones bloqueantes

| ID | Módulo | Objetivo | Dependencias | Prioridad | Criterio de finalización |
| --- | --- | --- | --- | --- | --- |
| BLK-01 | Scoring | Separar definitivamente Scoring de aprobación/rechazo/bloqueo de operaciones. | Contrato de fuente, Operaciones, modelo de estados histórico. | P0 | No existe acción ni trigger de UI/API que cambie una venta por Scoring; importación sólo alimenta análisis y pruebas demuestran que no bloquea fábrica. |
| BLK-02 | Datos/infra | Verificar en ambiente objetivo la base/migraciones y regresión de permisos antes de ampliar módulos. | Acceso a ambientes y usuarios de prueba. | P0 | Inventario firmado de migraciones/variables/rutas activas y casos críticos por rol con evidencia. |
| BLK-03 | Legajos | Confirmar consistencia de proyección Legajos→equipos/vendedores/perfiles tras alta, cambio y baja. | Migración de roster, RLS, datos de prueba. | P0 | Cada cambio aplicable se refleja de modo consistente en las lecturas dependientes y conserva historial. |
| BLK-04 | UI heredada | Aislar de decisiones operativas las acciones de conectores/configuración que sólo viven en cliente. | Inventario de pantallas y fuentes reales. | P0 | Ninguna pantalla presenta una sincronización/configuración local como conexión productiva; no se eliminan componentes sin decisión aprobada. |
| BLK-05 | Modelo comercial | Definir y aprobar identidad, estados, fechas, relaciones y snapshots históricos de venta cantada, presentación y Scoring observado. | DEC-16; responsables funcionales de Parte Diario, Presentación y Scoring. | P0 | Modelo sin ambigüedades: cada etapa conserva identificador, fuente y fecha propios; Scoring no convierte, presenta, habilita ni bloquea una venta. |

### Evidencia de avance — Sprint 2 / BLK-03 (2026-11-02)

- Se agregaron pruebas sintéticas de comportamiento para alta, traslado entre equipos, cambio de gerencia, baja real, corrección administrativa, conservación histórica, idempotencia/sin duplicados, consistencia de proyecciones y alcance de edición.
- También se incorporó una regresión de integración transaccional contra el trigger real, protegida por `NAVE_TEST_DATABASE_URL` y `NAVE_TEST_DATABASE_ACKNOWLEDGE_ISOLATED=1`; usa datos sintéticos y revierte siempre. Fue ejecutada en Supabase local aislado durante Sprint 3B.
- La prueba local de modelo no acredita que el trigger, RLS o los permisos estén aplicados en Supabase.
- La base aislada y los casos transaccionales contra `staff_members`/`teams`/`sellers`/`profiles` ya tienen evidencia local; permanece pendiente la confirmación del estado real de la migración `032` en el ambiente objetivo.
- Riesgos a resolver antes de declarar BLK-03 completo: no hay una restricción única observada que impida equipos históricos duplicados por supervisor, y cambios directos sobre `hr_roles` no disparan la reconstrucción de proyecciones. Ambos requieren una migración revisada y aprobada, no se modificaron en este sprint.

### Evidencia adicional — Sprint 3B / Supabase local (2026-11-02)

- El bootstrap local reproducible normaliza las 36 migraciones a versiones de 14 dígitos en un árbol derivado e ignorado; `supabase/local-bootstrap-manifest.json` conserva equivalencias, hashes SHA-256 y dependencias. Las migraciones originales no fueron renombradas ni modificadas.
- `supabase start` y, posteriormente, `db reset --local --no-seed` aplicaron las 36 migraciones derivadas, incluida `032`, contra Docker local sin enlace remoto.
- Verificación local: existen las tablas de Legajos requeridas, `rebuild_roster_projections_from_legajos`, `sync_roster_projections_after_legajo_change`, el trigger habilitado y roles Gerente/Supervisor/Vendedor.
- La integración real pasó tras el bootstrap y tras el reset: alta, traslado, cambio de gerencia, baja de vendedor, baja de supervisor con vendedor activo sin equipo, idempotencia, proyecciones sin duplicados en el caso secuencial, preservación histórica y perfil de supervisor vinculado.
- Esto no acredita migraciones, RLS ni autorización efectiva de `resource-update` en el ambiente operativo. Específicamente permanece pendiente una prueba autenticada de API/Worker por rol; tampoco existe una restricción única observada para prevenir duplicados bajo concurrencia.

## Funcionalidades existentes que necesitan completarse

| ID | Módulo | Objetivo | Dependencias | Prioridad | Criterio de finalización |
| --- | --- | --- | --- | --- | --- |
| CMP-01 | Fox | Completar control de cartera, estados, motivos y vendedor sobre importación idempotente. | Legajos/mapeos, reporte Fox. | P1 | Tablero concilia con archivo de corte y conserva trazabilidad de corrida. |
| CMP-02 | RRHH | Validar en ambiente objetivo y completar bitácora transversal de la incorporación/baja ya implementada localmente. | Legajos estable, Storage, Auth, migraciones 034–038 aplicadas en el ambiente objetivo. | P1 | Alta trazable sin duplicar persona; documentos privados; baja/histórico/rotación probados por rol en el ambiente objetivo. |
| CMP-03 | Objetivos/Pacing | Persistir objetivos por período y alcance, con administración de Gerencia. | Jerarquía, modelo de objetivos, RLS. | P1 | Metas de equipo/vendedor tienen vigencia, precedencia, autor y alcance correcto. |
| CMP-04 | Adelantos | Aplicar mínimos por gerencia/equipo y autorizador Dirección. | Objetivos/estructura, reglas de adelanto. | P1 | Solicitud conserva regla aplicada y sólo resolutores permitidos actúan. |
| CMP-05 | Listas | Completar carga/revisión de fuentes y regresión de roles. | Storage, fuentes oficiales, RLS. | P1 | Documentos, valores, publicación y descarga cumplen permisos y auditoría. |
| CMP-06 | Pacing | Persistir calendario/configuración y validar cálculos/productividad con datos reales. | Objetivos persistentes, operaciones. | P2 | Caso de referencia concilia metas, días y proyección. |
| CMP-07 | Scoring | Construir analítica por marca/código/motivo/supervisor/gerencia/objetivo fábrica. | BLK-01, fuente Peugeot. | P1 | Dashboard filtra y agrega sin modificar operaciones. |

## Integraciones pendientes

| ID | Módulo | Objetivo | Dependencias | Prioridad | Criterio de finalización |
| --- | --- | --- | --- | --- | --- |
| INT-01 | Fox | Automatizar extracción diaria en servidor. | Método oficial Fox, secreto/scheduler, CMP-01. | P1 | Corrida diaria monitoreada/idempotente con alerta de falla y sin PII no necesaria. |
| INT-02 | Parte Diario | Sincronizar ventas cantadas desde `ID Ventas`, manteniendo Parte Diario externo sin modificaciones. | BLK-05, contrato por pestaña, identificador estable de origen y responsable fuente. | P1 | Upsert reproducible por identificador de origen, sin duplicados; conserva fecha/fuente de cantada y permite asociación posterior auditable con N° de suscripción sin presentar ni formalizar la venta. |
| INT-03 | Scoring | Automatizar Peugeot y sumar marcas sólo con contrato aprobado. | Sheets/secret, CMP-07. | P2 | Cada fuente tiene corrida, esquema validado y tablero de calidad. |
| INT-04 | Mora | Incorporar fuente oficial de mora/agrupamiento. | Formato, frecuencia, responsable, PII. | P2 | Importación con fecha/corrida y conciliación por N° suscripción. |
| INT-05 | Precios | Adaptadores de circulares Renault/Stellantis/MG con revisión. | Fuentes, CMP-05. | P2 | Un ejemplo real por formato genera borrador revisable y nunca publicación automática. |

## Nuevas funcionalidades

| ID | Módulo | Objetivo | Dependencias | Prioridad | Criterio de finalización |
| --- | --- | --- | --- | --- | --- |
| NEW-01 | Presentación | Preparar expedientes de presentación: documentos, formularios oficiales, validación, PDFs y registro de presentación. No genera contratos oficiales de terminal. | INT-02, plantillas inspeccionadas, Storage/roles, reglas documentales. | P1 | Dos expedientes PDF independientes, ordenados/validados; preparación y presentación efectiva quedan diferenciadas. |
| NEW-05 | Formularios | Validar y aprobar la matriz de mapeo levantada de Minuta de Ventas, Minuta de Licitaciones y Planilla de Caja originales. | Decisión funcional de cada campo y entrega de futuras versiones de plantilla. | P0 | Cada campo tiene origen, regla de no-invención, editabilidad, validación y tratamiento de “No aplica” aprobados; sin sustituir plantillas. |
| NEW-06 | Documento sensible | Diseñar procesamiento temporal de primera página del contrato y carga segura de anexos. | NEW-01, límites/retención aprobados. | P1 | Nunca persiste el PDF multipágina original; sólo se almacena primera página extraída tras validación. |
| NEW-07 | Presentación | Definir estados/transiciones y registrar presentación manual confirmada. | NEW-01, reglas de requisitos. | P1 | Generar/descargar no marca presentada; sólo confirmación explícita y autorizada lo hace. |
| NEW-08 | Indicadores | Modelo analítico cantadas→presentadas→Scoring aprobado, por períodos y estructura histórica. | BLK-05, CMP-03, CMP-07, INT-02/03. | P1 | Conteos únicos y conversiones con cohorte/denominador explícitos, sin mezclar fechas/atribuciones. |
| NEW-02 | Cobros | Catálogo de enlaces de pago autorizados por marca. | Definición de fuente/propietario y permisos. | P2 | Enlaces vigentes/aprobados por marca, visibles sólo al rol permitido; sin procesar pagos. |
| NEW-03 | Información | Pestaña de información importante y medios de pago. | Contenido, responsable y permisos. | P3 | Contenido versionado con autor/fecha y alcance definido. |
| NEW-04 | Parte Diario nativo | Diseñar transición futura de fuente externa a módulo nativo. | INT-02 estabilizada, decisión de autoridad. | P3 | Diseño aprobado de modelo, migración, convivencia y plan de corte; no se implementa antes. |

## Mejoras futuras

| ID | Módulo | Objetivo | Dependencias | Prioridad | Criterio de finalización |
| --- | --- | --- | --- | --- | --- |
| FUT-01 | RRHH | Agenda de entrevistas. | CMP-02, reglas de privacidad. | P3 | Agenda con permisos, recordatorios y trazabilidad acordados. |
| FUT-02 | Precios | IA asistida para extraer borradores de circulares. | CMP-05, decisión de proveedor/privacidad. | P3 | Propuesta con evidencia y revisión humana obligatoria; no publica. |
| FUT-03 | Cobros | Evaluar Mercado Pago. | NEW-02, análisis legal/técnico. | P3 | Decisión documentada; si se aprueba, integración separada con conciliación y seguridad. |
| FUT-04 | Observabilidad | Métricas de rendimiento, auditoría y alertas de integraciones. | BLK-02, INT-01/02/03. | P3 | Tablero técnico de corridas/fallos/latencia con responsables. |

## Secuencia global propuesta

1. **Evidencia y seguridad de base:** BLK-02, BLK-04 y la regresión de acceso. Confirmar ambiente, migraciones aplicadas, rutas activas, secretos de servidor y roles antes de cambiar flujos que afectan PII o permisos.
2. **Estructura organizacional y acceso:** BLK-03, CMP-02 y la matriz de usuarios/permisos. Estabilizar Legajos, bajas, jerarquía, proyecciones y alcance histórico; después completar altas/documentos RRHH. Es prerrequisito de equipos, supervisión, gerencias y autorización transversal.
3. **Calendario, objetivos y productividad:** DEC-03, CMP-03 y CMP-06. Persistir período comercial, objetivos por alcance, calendario y reglas de precedencia antes de tomar decisiones sobre Pacing, recomendaciones o metas por equipo/vendedor.
4. **Adelantos:** DEC-04 y CMP-04, sobre estructura/objetivos ya estables. Aplicar mínimos por gerencia/equipo con snapshot y autorización de Dirección, sin mezclar la lógica de Scoring.
5. **Listas de precios:** DEC-05, CMP-05 e INT-05. Completar fuentes, revisión, permisos y exportación; FUT-02 (IA/OCR) queda posterior y sólo como asistencia revisable.
6. **FoxCRM como control de datos:** CMP-01 e INT-01. Completar mapeos de Legajos, métricas por vendedor y automatización diaria idempotente. No desarrollar reparto ni campañas.
7. **Modelo comercial y Parte Diario externo:** BLK-05, INT-02 y NEW-05. Aprobar identidad/estados y mapeo de formularios; sincronizar cantadas por identificador de origen, sin alterar Parte Diario ni depender de SX inicial.
8. **Presentación de operaciones:** DEC-07, DEC-13 a DEC-16, NEW-01, NEW-06 y NEW-07. Construir expedientes, carga segura, formularios reales, primera página de contrato, PDFs y confirmación manual de presentación.
9. **Scoring oficial y analítica:** BLK-01, DEC-02/17, INT-03 y CMP-07. Desacoplar la aprobación/bloqueo interno, automatizar fuentes oficiales y publicar análisis por estructura/periodo. Esta fase no modifica Operaciones, Pacing ni Adelantos por una sincronización.
10. **Indicadores de embudo comercial:** NEW-08, cuando las tres etapas tengan datos, fechas y atribución histórica confiables. Incorporar cantadas, presentadas, Scoring aprobado, objetivos de fábrica y proyecciones con cohortes explícitas.
11. **Cobros, información y Mora:** NEW-02/03, INT-04 y DEC-08/10. Enlaces autorizados e información se desarrollan con permisos definidos; Mora sólo tras contar con fuente oficial, sin cobranza, pagos ni simulaciones.
12. **Posteriores a estabilización:** NEW-04 (Parte Diario nativo), FUT-01 (agenda), FUT-03 (Mercado Pago) y FUT-04 (observabilidad ampliada). Requieren que los circuitos externos y permisos anteriores ya estén validados.
