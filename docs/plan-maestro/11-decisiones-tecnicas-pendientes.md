# 11 — Decisiones técnicas pendientes

Estas definiciones deben resolverse antes de implementar las tareas relacionadas. No son bloqueos genéricos: previenen cambios de modelo o permisos incompatibles.

| ID | Decisión requerida | Afecta | Opciones/criterio | Riesgo si se posterga |
| --- | --- | --- | --- | --- |
| DEC-01 | Fuente y mecanismo diario de Fox | INT-01, CMP-01 | API oficial, webhook o export programado; siempre servidor, secreto y corrida idempotente. | Automatización frágil o extracción no autorizada. |
| DEC-02 | Catálogo de estados/códigos Scoring por marca | BLK-01, CMP-07, INT-03 | Conservar texto fuente y mapear sólo equivalencias aprobadas, versionadas por marca. | Interpretación errónea de rechazo/anulación. |
| DEC-03 | Objetivos: alcance y precedencia | CMP-03, CMP-06, CMP-04 | Período comercial; regla global/gerencia/equipo/vendedor; definir cuál prevalece y auditoría. | Pacing y adelantos inconsistentes. |
| DEC-04 | Reglas de adelanto | CMP-04 | Mínimo por gerencia o equipo, tope/plazo, aprobadores y snapshot histórico. | Recalificar solicitudes históricas o dar acceso a gerencia ajena. |
| DEC-05 | Sobrepautas de listas | CMP-05 | Confirmar si Gerencia puede disminuir o sólo aumentar sobre base y si Dirección/Admin comparten misma facultad. | RLS/API contradicen política aprobada. |
| DEC-06 | Política de IA/OCR para circulares | FUT-02, INT-05 | Proveedor, datos enviados, costo, retención, evidencia de página/confianza y revisión obligatoria. | Exponer documentos o publicar importes incorrectos. |
| DEC-07 | Formularios oficiales y expedientes de presentación | NEW-01, NEW-05, NEW-06, NEW-07 | Mapeo aprobado de las tres plantillas, datos confirmados, versión, armado de ambos expedientes, validación documental y retención. No incluye generación ni firma de contratos oficiales. | Construir expedientes incompatibles con las plantillas o confundirlos con contratos de terminal. |
| DEC-08 | Enlaces de cobro | NEW-02 | Fuente autorizada, propietario, vigencia, marca/modelo/plan y permisos; Mercado Pago fuera de fase inicial. | Links vencidos/fraudulentos o alcance ambiguo. |
| DEC-09 | Parte Diario externo→nativo | INT-02, NEW-04 | Dueño actual, contrato bidireccional limitado a cambios autorizados desde NAVE.Plan, idempotencia, prevención de bucles y condiciones de transición/corte. | Duplicar ventas, bucles o perder autoridad del dato. |
| DEC-10 | Fuente oficial de mora | INT-04 | Archivo/API, frecuencia, columnas, dueño, PII y reconciliación por N° suscripción. | Mostrar mora desactualizada o incorrecta. |
| DEC-11 | Entrevistas RRHH | FUT-01 | Si se incorpora: responsables, agenda, recordatorios, visibilidad y retención. | Agregar calendario sin circuito de selección ni privacidad. |
| DEC-12 | Producción y observabilidad | BLK-02 | Qué Supabase/Worker son objetivo, migraciones activas, logs, alertas y responsables. | Confundir código local con estado productivo. |
| DEC-13 | Mapeo de plantillas originales | NEW-05, NEW-01 | Aprobar por campo la matriz ya relevada: fuente, editabilidad, validación, “No aplica”, contradicciones y versión de plantilla. | Diseñar formularios incompatibles o alterar cálculos de Caja. |
| DEC-14 | Reglas documentales por marca | NEW-01/06/07 | Requisitos, anexos aplicables, tamaños/formatos y definición explícita de “No aplica”. | Omitir/requerir documentos por suposición. |
| DEC-15 | Retención documental | NEW-01/06 | Plazo, borrado, acceso, auditoría de descargas y responsable de conservación. | Almacenar PII financiera sin política aprobada. |
| DEC-16 | Relación y atribución operativa | BLK-05, NEW-08 | Clave entre cantada/presentación/Scoring; los indicadores operativos usan estructura actual y la trazabilidad organizativa se conserva separadamente. | Duplicar o atribuir mal operaciones al cambiar estructura. |
| DEC-17 | Frecuencia Scoring | INT-03 | Periodicidad, ventana de error/reintento, límites Google Sheets y responsable de alertas. | Prometer tiempo real o perder última información válida. |
| DEC-18 | Seña, anulaciones y traspaso | INT-02, NEW-01/07 | Efecto de Cancelar seña, comprobantes/efectivo, aprobador de cambio de titular y conciliación del cobro reutilizado. | Alterar cobros o SX sin control. |
| DEC-19 | Drive documental | NEW-01/06/07 | Permisos, nombres, reintentos, cambio de equipo y fallo parcial entre Supabase y Drive. | Exponer PII o dejar expedientes inconsistentes. |

## Principios técnicos que ya orientan el plan

- Legajos es la autoridad de personal; equipos y vendedores son proyecciones derivadas.
- Parte Diario, mientras siga externo, recibe desde NAVE.Plan sólo modificaciones autorizadas y con contrato idempotente que evita bucles; la hoja no es un canal de edición manual ordinaria.
- Toda fuente externa debe tener clave estable, corrida, validación y comportamiento idempotente.
- Los datos sensibles y secretos quedan fuera del navegador; RLS y alcance organizacional se comprueban en el ambiente objetivo.
- OCR o IA sólo pueden asistir un borrador: la fuente y la revisión humana son requisitos de publicación.
