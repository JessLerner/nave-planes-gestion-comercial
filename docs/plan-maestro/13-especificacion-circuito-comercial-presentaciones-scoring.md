# 13 — Especificación consolidada: circuito comercial, presentaciones y Scoring

**Estado:** especificación funcional para planificación. No está implementada ni verifica ambientes desplegados.
**Prevalencia:** reemplaza definiciones anteriores incompatibles sobre Parte Diario, Operaciones, documentos, Scoring, indicadores y Mora.

## 1. Circuito comercial definitivo

```text
Parte Diario externo
  └─ venta cantada ──► Expediente de presentación ──► presentación registrada ──► Scoring oficial observado
       (fuente/fecha A)       (preparación/fecha B)          (fecha C)              (fecha D)
```

Las etapas son independientes. Una cantada puede no presentarse; una presentada puede no tener Scoring; un Scoring aprobado no implica presentación a fábrica, aceptación administrativa, agrupamiento, cuota 2 ni pago/comisión.

| Etapa | Fuente de verdad | Identificador y fecha | No hace |
| --- | --- | --- | --- |
| Venta cantada | Parte Diario externo / Google Sheets | Identificador externo estable + fecha de cantada | No se formaliza, presenta ni aprueba automáticamente. |
| Preparación/presentación | NAVE.Plan, confirmación del supervisor | ID de expediente + fecha de preparación/presentación + responsable | No envía correo ni crea contrato oficial de terminal. |
| Scoring | Google Sheet oficial de cada marca, copia de consulta | marca + N° suscripción + fecha resultado/corrida | No muta ventas ni decide fábrica. |
| Mora/agrupamiento | Fuente oficial aún no definida | Pendiente | No se infiere de Scoring ni se simula. |

## 2. Fuentes, relación y atribución histórica

- Parte Diario permanece externo y no se modifica. Nave.Plan sólo consulta/sincroniza por upsert idempotente.
- La relación primaria propuesta entre cantada, expediente y Scoring es el identificador de origen más N° de suscripción cuando exista; antes de que exista, debe conservarse la clave externa de Parte Diario y permitir vinculación explícita/auditable posterior. No se debe usar sólo nombre de cliente.
- Cada etapa conserva fuente, identificador, fecha propia, estado, responsable cuando corresponda y snapshot histórico de vendedor, equipo, supervisor y gerencia.
- Un cambio posterior de Legajo/equipo no puede reatribuir silenciosamente indicadores de períodos previos.
- Reimportar Scoring o Parte Diario actualiza la representación vigente sin contar una operación varias veces. Las métricas deben contar identidad de operación, no filas/corridas.

## 3. Estados y transiciones propuestos

| Estado de presentación | Entrada permitida | Salida permitida | Regla |
| --- | --- | --- | --- |
| Sin iniciar | Cantada sincronizada sin expediente | En preparación | No presupone documentos ni Scoring. |
| En preparación | Supervisor inicia expediente | Incompleta / Lista para presentar | Se guardan borradores y faltantes. |
| Incompleta | Falla requisito o discrepancia pendiente | En preparación / Lista para presentar | Impide marcar completo, no borra información. |
| Lista para presentar | Requisitos validados y PDFs definitivos | Presentada / En preparación | Descargar no cambia este estado. |
| Presentada | Confirmación manual autorizada de envío/procedimiento externo | — o corrección controlada a definir | Registra responsable y fecha; NAVE.Plan no afirma haber enviado correo. |

Las etiquetas y el tratamiento de una reversión desde Presentada requieren validación antes de implementar. El resultado de Scoring se mantiene como atributo observado separado, nunca como transición de presentación.

## 4. Diseño funcional: módulo Presentación

El supervisor, dentro de su alcance, selecciona una venta cantada y obtiene los datos estructurados disponibles desde Parte Diario/Legajos. El módulo:

1. muestra la identidad, origen y datos recuperados;
2. solicita documentos con requisito explícito por marca/condición;
3. propone datos extraídos sólo cuando la técnica y privacidad aprobadas lo permitan;
4. señala campos faltantes y contradicciones, sin sobrescribir silenciosamente;
5. permite corrección manual de campos editables;
6. llena los tres formularios oficiales tras confirmación;
7. genera PDFs, valida orden/requisitos y produce dos expedientes descargables;
8. registra preparación y, por acto separado, la presentación efectiva.

No es un generador de contrato oficial: ese contrato sigue en el sistema de la marca. Tampoco integra correo, pagos, cobranza o liquidación de comisiones en el alcance inicial.

## 5. Formularios oficiales y mapeo inicial inspeccionado

Se inspeccionaron los tres archivos originales recibidos. El levantamiento siguiente describe su estructura efectiva; la matriz de origen/editabilidad/reglas sigue pendiente de aprobación funcional. No se detectaron macros ni listas de validación en la Planilla de Caja. La revisión estructural no autoriza alterar ninguna plantilla.

### A — Minuta de Ventas

Es un DOCX A4 vertical, con once tablas de ancho fijo centradas, cinco secciones y opciones impresas de selección. Los campos relevados son:

| Sección | Campos/opciones de la plantilla | Origen inicial propuesto |
| --- | --- | --- |
| 01 Datos comerciales | fecha de venta, sucursal, supervisor, vendedor, monto abonado; tipo de consumidor: Consumidor final / Responsable inscripto. | Cantada, Legajos, comprobantes confirmados. |
| 02 Datos del plan | N° solicitud, marca, modelo de ahorro, financiación, titular, fecha nacimiento, CUIL/CUIT, domicilio, ciudad, provincia, CP, teléfonos, mails, GO, adhesión a débito automático. Plan: Subite / Reencauce / Volver al Ahorro / No aplica. Franja contacto: mañana / mediodía / tarde. | Parte Diario, documentación, datos confirmados por supervisor. |
| 03 Auto usado | entrega usado Sí/No; modalidad Llave x llave/No aplica; estado Sin prenda/Prendado/Otro; marca, modelo, versión, año, patente, kilometraje, tasación declarada, INFO AUTO y origen. | Parte Diario/documentación; cédula y tasación sólo si aplican. |
| 04 Forma de venta | Telefónica / Presencial / Hogar. | Dato confirmado, no inferido. |
| 05 Bonificaciones | Chequera oficial / Patentamiento 8% / Sin bonificaciones; descuento en suscripción Sí/No; importe/descuento autorizado y autorizado por. | Fuente comercial/autorización verificable. |

### B — Minuta de Licitaciones

Es un DOCX vertical de 8,5 × 11 pulgadas, con seis tablas de ancho fijo centradas, una imagen interna y advertencia expresa de no presentar como garantizadas condiciones dependientes de plan/autorización. Se genera siempre.

| Sección | Campos/opciones de la plantilla | Regla de llenado |
| --- | --- | --- |
| 1 Identificación comercial | N° solicitud; medio de contacto preferido: WhatsApp / llamada telefónica / otros. | Datos disponibles/confirmados. |
| 2 Condiciones comerciales acordadas | adjudicación acordada (cuota de adjudicación); porcentaje de licitación conversado/monto estimado; bonificaciones; tipo: sorteo licitación / sobreadjudicación / entrega pactada; condiciones particulares para licitar. | No inventar. Donde la condición no aplique, usar “No aplica” sólo en el campo que lo prevé. |
| 3 Información relevante | posee ingresos; tipo de ingresos: monotributo / recibo sueldo / otros; posee garantes. | Documento o confirmación explícita. |

### C — Planilla de Caja

Es un XLSX de una hoja (`Hoja1`) configurada para impresión apaisada sobre el área `B3:D20`, sin panel inmovilizado ni validaciones de datos. Usa encabezados verdes y campos de ingreso amarillos, bordes medios y tipografía Calibri de 14–18 puntos. Su único cálculo relevado es `C19 = SUM(C14:C18)`, con formato moneda; debe preservarse y recalcularse en el motor de planilla antes de generar el PDF.

| Área | Campos de la plantilla | Regla de llenado |
| --- | --- | --- |
| Encabezado | Fecha, Supervisor, Empresa (prellenada `NAVE.PLAN`). | Fecha de operación/presentación según decisión pendiente; supervisor histórico de la operación. |
| Identificación | SX, Cliente, Marca de suscripción, Vendedor. | Cantada/presentación confirmada. |
| Traspaso | Importe, SX inicial, Traspaso de cash. | Sólo con soporte comprobable. |
| Medios de pago | Plataforma, Importe, Empresa de pago; filas LAPOS presencial, Efectivo, Transferencia, Mercado Pago. | Debe conciliar con cupones/comprobantes; no crea integración de Mercado Pago. |
| Total | Suma de importes C14:C18. | Validar contra comprobantes y señalar diferencia. |

**Puerta obligatoria antes de implementación:** aprobar por campo su fuente prioritaria, transformación, editabilidad, validación, condición de “No aplica”, tratamiento de contradicciones y versión de plantilla. No se sustituyen por formularios genéricos.

## 6. Expedientes PDF

### Administrativo — un PDF por operación, orden invariable

1. Minuta de Ventas.
2. Minuta de Licitaciones.
3. Frente del contrato: sólo primera página.
4. Anexo de adhesión a débito automático.
5. Anexo de entrega pactada.
6. DNI cliente, frente y dorso.
7. DNI titular de débito, frente y dorso.
8. Constancia CBU o tarjeta adherida.
9. Cédula del usado, únicamente si hay usado.

Las dos minutas siempre ocupan posiciones 1 y 2. Reglas de marca pueden sumar/definir aplicabilidad, pero no cambiar el orden general. Si falta un obligatorio, el sistema lo muestra y no permite marcar el expediente completo.

### Caja — PDF independiente

1. Planilla de Caja generada desde su Excel original.
2. Cupones de pago.
3. Comprobantes de tarjeta de crédito/débito que correspondan.
4. DNI del titular del medio de pago cuando sea distinto del titular del plan.

No se mezclan comprobantes de Caja en el administrativo salvo una autorización funcional posterior. Diferencias entre importes/medio declarado y comprobantes son advertencias bloqueantes o revisables según regla explícita aún pendiente.

## 7. Tratamiento especial: frente del contrato

El PDF multipágina original es **efímero**. La secuencia requerida es validar → extraer sólo página 1 en memoria/procesamiento temporal → descartar original y páginas restantes → persistir únicamente la página 1 autorizada para el expediente. Nunca se sube el original a Storage ni se registra su contenido en logs.

| Caso | Resultado |
| --- | --- |
| PDF válido de una página | Se persiste esa página. |
| PDF válido de cinco páginas | Sólo se persiste página 1. |
| PDF inválido/protegido/no procesable | Se rechaza, sin persistencia. |
| Error de proceso | Se limpia el temporal, no queda copia persistente. |

La implementación deberá fijar límite de tamaño, tipo MIME, validación de firma, antivirus/escaneo permitido, timeout, limpieza `finally`, prohibición de logs de contenido y prueba de Storage negativa.

## 8. Scoring: consulta, seguimiento y analítica

Flujo: **Google Sheets oficial privada → sincronización autenticada periódica → copia de consulta NAVE.Plan**. No hay escritura hacia Sheets ni aprobación/rechazo/anulación interna.

- Conservar categoría, códigos, motivos y texto originales.
- Usar mapeos comunes sólo si son versionados y aprobados por marca; no inferir equivalencias.
- Registrar fuente, corrida, última sincronización exitosa, error y última información válida.
- La frecuencia se define técnicamente: no se promete tiempo real.
- Estados observables: aprobado, pendiente, rechazado, anulado cuando la fuente los provea.
- Desglose: marca, gerencia, supervisor, vendedor, equipo, período, código/motivo rechazo y motivo anulación.

Indicadores: operaciones únicas por resultado observado; porcentaje de aprobación con denominador y cohorte declarados; comparación de cantadas/presentadas/aprobadas; objetivos de fábrica, cumplimiento y proyección. La aprobación cuenta como referencia comercial de posibles comisiones, sin calcular ni pagar comisión.

El circuito interno de `auditScoring`, `apply_scoring_to_operation`, `canPresentToFactory` y `apto_fabrica` está identificado como incompatible. Su retiro será progresivo y documentado en [12](12-investigacion-blk-01-scoring.md); no se eliminan aún tablas/campos/históricos.

## 9. Seguridad documental y permisos

- Storage privado, sesión autenticada y alcance organizacional.
- Validación de tamaño, tipo/formato, PDFs procesables y protección frente a archivo malicioso.
- Credenciales exclusivamente servidor; ningún documento sensible se envía a OCR/IA externo sin decisión de privacidad y técnica aprobada.
- Registro de acción/metadato de documento, nunca contenido sensible en logs.
- Descargas controladas y auditables; conservación/eliminación sujeta a política pendiente.
- Supervisión opera sólo su estructura; roles globales conforme matriz a confirmar. Documentos de venta no reutilizan automáticamente las políticas de candidatos sin revisión.

## 10. Componentes reutilizables y dependencias

| Reutilizable | Uso compatible | Validación pendiente |
| --- | --- | --- |
| `ingest-scoring-sheet`, `scoring_source_rows`, `source_sync_runs` | Copia idempotente y consulta de Scoring. | Scheduler/Google privado, historial de cambios y RLS de fuentes. |
| `sales_operations`, `external_id`, N° suscripción | Representar/sincronizar cantada y enlazar fases. | Semántica, identificador estable y no duplicación. |
| Legajos/equipos/perfiles | Alcance y snapshots organizacionales. | Regla de atribución histórica. |
| Auth/RLS/Storage existentes | Base de acceso privado. | Diseño específico para expedientes/descargas/retención. |
| XLSX/PDF, parsers y exportadores existentes | Referencia de infraestructura documental. | Compatibilidad real con las tres plantillas; no son generador de expedientes. |
| Pacing y cálculos | Tableros posteriores con datos de tres etapas. | Cohortes, objetivos fábrica y metas persistentes. |

## 11. Implementación por etapas propuesta

1. **Diseño y evidencia:** confirmar ambiente/consumidores, aprobar el mapeo ya relevado de plantillas, definir identificadores, reglas de requisitos, retención y atribución histórica.
2. **Datos de cantadas:** INT-02, sincronización sólo lectura/idempotente desde Parte Diario, sin presentación automática.
3. **Desacople Scoring:** BLK-01/BLK-05; retirar acciones internas y asegurar que fuente no modifica operaciones.
4. **Expediente:** modelo, permisos, carga segura, formularios reales, PDFs y estados de preparación/presentación.
5. **Automatización/análisis:** INT-03, CMP-07, NEW-08; fuentes por marca, corridas y métricas con cohortes.
6. **Mora:** sólo después de fuente oficial; Parte Diario nativo y pagos/comisiones quedan fuera de esta secuencia.

## 12. Pruebas de aceptación

Aplican ACC-18 a ACC-26 de [10](10-criterios-aceptacion.md), más estas verificaciones obligatorias:

- Venta cantada sin presentación ni Scoring sigue visible sólo en etapa cantada.
- Presentación preparada/descargada no se marca Presentada hasta confirmación explícita.
- Minutas aparecen siempre en posiciones 1 y 2 del administrativo.
- La primera página del contrato es la única que persiste y aparece en el PDF final.
- Reimportación de misma fila no altera Pacing/Adelantos/operación ni duplica conteos.
- Un cambio futuro de equipo/gerencia no altera el snapshot histórico utilizado en el indicador aprobado.

## 13. Decisiones aún necesarias

1. Aprobar el mapeo por campo y la versión operativa de las plantillas ya inspeccionadas.
2. Aprobar identificador para vincular cantada→presentación→Scoring cuando aún no existe SX.
3. Aprobar reglas de documentos/anexos por marca, discrepancias y reversión de Presentada.
4. Definir retención/eliminación, límites y controles de documentos sensibles.
5. Definir cohortes/denominadores, período comercial y objetivos de fábrica.
6. Definir scheduler/frecuencia/alertas para Google Sheets privadas y fuentes futuras de Mora.
