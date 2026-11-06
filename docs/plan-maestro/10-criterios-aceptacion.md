# 10 — Criterios de aceptación y pruebas propuestas

Estos casos son propuestas de validación. Cada uno requiere ambiente de prueba, usuarios autorizados y datos anonimizados o controlados.

| ID | Módulo | Escenario de aceptación | Resultado esperado |
| --- | --- | --- | --- |
| ACC-01 | Roles | Ingresar como Supervisión, Gerencia, Dirección/Administración y RRHH. | Cada rol sólo visualiza/escribe su alcance; vendedor no obtiene login. |
| ACC-02 | Legajos | Modificar cargo/responsable de un recurso que afecta equipo/vendedor. | Proyecciones y pantallas dependientes muestran la estructura vigente, sin duplicados ni pérdida de historial. |
| ACC-03 | Bajas | Ejecutar corrección administrativa y baja real sobre datos de prueba. | Ambas se conservan; sólo baja real modifica rotación; ningún registro se elimina físicamente. |
| ACC-04 | RRHH documentos | Proponer alta con documentos y aprobar/rechazar. | Archivos quedan privados, existe auditoría, se crea a lo sumo un Legajo y Auth sólo para rol habilitado. |
| ACC-04A | Sprint 5 RRHH local | Guardar borrador parcial, adjuntar/reemplazar documentos privados, observar/corregir/autorizar una incorporación y registrar aviso de baja separado. | Se conserva el mismo ID, los borradores ajenos no se exponen, las acciones quedan auditadas y el aviso no desactiva el Legajo. Evidencia local completada el 06/11/2026; pendiente repetir en ambiente objetivo. |
| ACC-05 | Fox corte | Importar dos veces el mismo reporte Fox. | Totales, estados, motivos y tabla por vendedor concilian; segunda carga no duplica. |
| ACC-06 | Fox automático | Simular falla y recuperación de corrida diaria. | Se registra fallo, no se corrompe la última cartera válida y se genera alerta/estado para responsable. |
| ACC-07 | Scoring aislado | Importar fila aprobada/rechazada/anulada de Scoring ligada a una operación. | Se conserva para análisis; no modifica ni bloquea estado de operación/fábrica. |
| ACC-08 | Scoring análisis | Filtrar por marca, período, supervisor, gerencia y código/motivo. | Conteos y detalle coinciden con el archivo de origen y respetan alcance. |
| ACC-09 | Objetivos | Dos gerencias fijan metas en mismo período y una excepción a vendedor. | Sólo administran su estructura; la meta vigente aplicada respeta precedencia/auditoría. |
| ACC-10 | Pacing | Ejecutar caso con ventas, días hábiles y metas conocidos. | Cumplimiento, proyección y ritmo coinciden con cálculo de referencia aprobado. |
| ACC-11 | Adelantos | Gerencia A define mínimo y vendedor de su equipo solicita; Dirección resuelve. | La solicitud usa snapshot de regla/ventas; Gerencia B no puede verla/resolverla; Dirección sí. |
| ACC-12 | Listas permisos | Dirección altera base, Gerencia sobrepauta, Supervisión descarga. | Cada rol sólo ejecuta su acción; se conserva fuente, versión, autor y alcance. |
| ACC-13 | Listas fuente | Cargar circular/archivo y producir borrador OCR/IA. | Ningún importe se publica hasta revisión humana de los campos obligatorios con referencia fuente. |
| ACC-14 | Parte Diario externo | Ejecutar sincronización de `ID Ventas` con cantadas que todavía no tienen N° de suscripción. | El upsert usa un identificador estable de origen del Parte Diario, registra corrida y no escribe en la fuente; la asociación posterior con N° de suscripción queda registrada mediante procedimiento auditable. |
| ACC-15 | Mora | Importar archivo oficial de prueba con deuda y agrupamiento. | Se informa corrida/fecha, se concilia clave, no se inventa estado si faltan columnas. |
| ACC-16 | Formularios y expedientes | Generar Minuta de Ventas, Minuta de Licitaciones y Planilla de Caja para una venta cantada autorizada. | Se conservan versión de plantilla, datos confirmados, usuario/fecha y acceso restringido; se generan dos expedientes PDF de presentación independientes y no se crea ni reemplaza contrato oficial de terminal. |
| ACC-17 | Cobros | Consultar enlaces de dos marcas con rol autorizado/no autorizado. | Sólo aparecen enlaces válidos de la marca correspondiente y no se procesan pagos ni credenciales. |
| ACC-18 | Cantada | Sincronizar una venta cantada dos veces desde Parte Diario. | Se conserva una única operación fuente, identificador/origen/fecha de cantada; no se marca presentada ni aprobada. |
| ACC-19 | Presentación | Seleccionar una cantada y completar requisitos parcialmente. | Se recuperan datos disponibles, se señalan faltantes/discrepancias y no puede quedar “Lista para presentar”. |
| ACC-20 | Plantillas | Completar los tres formularios con las plantillas originales aprobadas. | Se respetan campos, tablas, opciones, estilo y fórmulas; campos no aplicables usan la regla aprobada y faltantes no se inventan. |
| ACC-21 | Expediente administrativo | Generar expediente con usado y sin usado. | Orden exacto aprobado; ambas minutas siempre primero/segundo; cédula sólo cuando aplica; faltantes bloquean completitud. |
| ACC-22 | Contrato PDF | Cargar PDF de 1, 5, inválido y protegido páginas. | Sólo persiste la primera página procesable; inválido/protegido se rechaza sin persistencia; no hay original multipágina ni páginas restantes en Storage/logs. |
| ACC-23 | Expediente caja | Generar expediente de Caja con comprobantes. | Incluye planilla, cupones, comprobantes y DNI condicional en orden; diferencias de importe/medio se muestran. |
| ACC-24 | Presentación efectiva | Generar/descargar y luego confirmar presentación. | Descargar no cambia a Presentada; la confirmación manual autorizada registra responsable/fecha. |
| ACC-25 | Cohortes | Consultar métricas con venta, presentación y Scoring en fechas distintas. | Conteos/conversiones especifican denominador/período y no duplican actualizaciones de Scoring. |
| ACC-26 | Scoring oficial | Reimportar fuente aprobada/rechazada/pendiente/anulada. | Conserva valores originales/corrida/último éxito y no modifica operación, Pacing ni Adelantos. |

## Evidencia mínima por aprobación

Cada caso aceptado debe conservar: versión desplegada, ambiente, usuario/rol de prueba, datos de entrada anonimizados, resultado esperado/obtenido, fecha, responsable y enlaces a corrida/log cuando exista. Un test unitario no reemplaza la prueba de permisos o integración completa.
