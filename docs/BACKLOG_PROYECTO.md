# Backlog operativo — Nave.Plan

Este documento reúne el trabajo pendiente. No autoriza cargas ni sincronizaciones
automáticas: cada fuente debe verificarse antes de pasar a producción.

## Bloque 1 — Recursos (prioridad actual)

- [x] Retirar el módulo de Recursos inestable y vaciar la estructura contaminada,
  conservando un respaldo privado.
- [ ] Formalizar **ESTRUCTURA RRHH ACTIVA** como fuente de migración y
  conciliación inicial. Después de la transición, Nave.Plan será la nómina
  maestra y la planilla sólo podrá proponer diferencias para revisión.
- [ ] Construir un importador de sólo previsualización: normaliza nombres y muestra
  errores sin escribir en Supabase.
- [ ] Definir identificador estable de cada recurso (UUID interno de Nave.Plan;
  DNI obligatorio y legajo obligatorio, excepto categorías Coaching/Freelance) y las reglas explícitas de altas,
  bajas y cambios de responsable. Coaching/Freelance sin legajo debe poder
  operar y contabilizarse.
- [ ] Construir una pantalla nueva, acotada y auditable: búsqueda, ficha, alta,
  baja lógica, responsable directo y jerarquía; sin inferir cargos ni crear equipos.
- [ ] Construir equipos comerciales sólo después de validar Supervisores y Gerentes
  de la fuente maestra.
- [ ] Reemplazar “Legajos” por una grilla operativa paginada y con búsqueda de
  servidor: nombre y apellido, DNI, legajo o condición Coaching, responsable,
  cargo y estado. No reutilizar la interfaz retirada.
- [ ] Incluir filtros dinámicos de Legajos: búsqueda única por nombre, apellido,
  DNI o legajo; sector; y equipo de venta. Los sectores se administran como
  configuración de cargos/áreas, no como personas fijadas en código. El filtro
  de equipos se construye exclusivamente con recursos activos cuyo cargo sea
  Supervisor y sus equipos vigentes.
- [ ] Permitir que Administración, Gerencia y RRHH editen estado y ejecuten una
  desvinculación lógica; conservar el historial y separar inactivos de la vista
  activa.
- [ ] Modelar vendedores **Freelance**: son vendedores activos sin Supervisor ni
  equipo obligatorio; nunca deben aparecer como casos de error por esa condición.
- [ ] Crear una tabla de equivalencias aprobadas con Fox (`recurso` ↔
  `nombre/ID de Fox`) que admita varios alias por recurso. Las coincidencias
  aproximadas se usan para proponer asociaciones, las ambiguas quedan a
  revisión y una asociación aprobada nunca se reemplaza automáticamente.
- [ ] Diseñar el alta nueva desde Supervisión: documentación requerida en
  storage privado, revisión RRHH, creación del recurso, cargo, responsable,
  equipo y vendedor si aplica. La cuenta Auth sólo se habilita para
  Supervisión, Gerencia, Dirección y Administración/RRHH; vendedores nunca.

## Bloque 2 — Datos comerciales y fuentes

- [ ] Terminar la sincronización diaria de métricas Fox CRM por ID de lead, sin
  almacenar datos personales que no sean necesarios para el reporte.
- [ ] Integrar App Control Operaciones y revisar pestaña por pestaña qué datos son
  fuente oficial. Parte Diario no se modifica.
- [ ] Incorporar las planillas de Scoring de las marcas restantes, una fuente por
  marca, usando N° de Suscripción como clave de cruce.
- [ ] Diseñar la importación mensual de mora y agrupamiento cuando se confirme el
  formato de origen.

## Bloque 3 — Pantallas y permisos

- [ ] Crear pestaña **Información importante y medios de pago** con contenido,
  responsables de actualización y permisos aún por definir.
- [ ] Crear **Parte de venta diario** como vista de consulta. Sólo Gerencia y
  Administración podrán verla; no modifica Parte Diario ni permite edición.
- [ ] Completar las vistas por rol: Administrador, Gerencia y Supervisión, una vez
  reconstruida la estructura de Recursos.
- [ ] Finalizar notificaciones de adelantos, documentación y aprobaciones.

## Bloque 4 — Listas de precios

- [ ] Integrar listas oficiales como flujo de **extracción asistida, revisión y
  publicación**, no como incremento porcentual genérico. GenList queda como
  visor/editor de borradores, nunca como fuente oficial por sí solo.
- [ ] Conservar por cada importación: archivo original, hash, marca, vigencia,
  formato detectado, usuario que revisó, usuario que publicó y estado
  `draft`/`approved`/`superseded`/`rejected`.
- [ ] Crear importadores por formato de origen: Excel de Renault, fichas
  repetidas Fiat y Jeep/Ram, grillas multiproducto Peugeot, detalle por tramo
  Citroën y carga asistida para circulares narrativas o dolarizadas de MG.
- [ ] Normalizar por producto y tramo: modelo, código, valor móvil, plan,
  porcentaje financiado, plazo, cuota pura, cuota 1, derecho de inscripción,
  sellado, seguro, bonificaciones, diferimientos, recuperos, adjudicación y
  cuotas 2-13/14-18/19/20-24/25-72/73-84/85-120 cuando apliquen.
- [ ] Mostrar diferencias entre borrador y lista publicada; bloquear la
  publicación cuando falten campos obligatorios o haya valores no verificables.
- [ ] Definir contrato de salida para la plataforma: catálogo publicado por
  marca/vigencia y vistas restringidas para cuota 1, valor de suscripción y
  sobrepautas de gerencia.
- [ ] Incorporar el esquema Supabase versionado (`price_import_runs`, fuentes,
  planes, tramos y aprobaciones) y APIs Vercel con permisos; no cargar listas
  desde estado local del navegador.

## Criterios no negociables

- Supabase es el repositorio central; cada fuente conserva su dueño funcional.
- No se generan cargos, equipos, relaciones ni datos comerciales por inferencia.
- Toda importación debe tener vista previa, validación, identificador estable,
  registro de ejecución y posibilidad de reversión.
- Los módulos no se habilitan a usuarios finales hasta estar conectados a datos
  reales y sus permisos hayan sido probados.
