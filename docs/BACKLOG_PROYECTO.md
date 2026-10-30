# Backlog operativo — Nave.Plan

Este documento reúne el trabajo pendiente. No autoriza cargas ni sincronizaciones
automáticas: cada fuente debe verificarse antes de pasar a producción.

## Bloque 1 — Recursos (prioridad actual)

- [x] Retirar el módulo de Recursos inestable y vaciar la estructura contaminada,
  conservando un respaldo privado.
- [ ] Definir el contrato de datos de **ESTRUCTURA RRHH ACTIVA** como única fuente
  maestra de personal.
- [ ] Construir un importador de sólo previsualización: normaliza nombres y muestra
  errores sin escribir en Supabase.
- [ ] Definir identificador estable de cada recurso (legajo; DNI sólo como control)
  y las reglas explícitas de altas, bajas y cambios de responsable.
- [ ] Construir una pantalla nueva, acotada y auditable: búsqueda, ficha, alta,
  baja lógica, responsable directo y jerarquía; sin inferir cargos ni crear equipos.
- [ ] Construir equipos comerciales sólo después de validar Supervisores y Gerentes
  de la fuente maestra.

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

- [ ] Revisar y aprobar [GenList](https://github.com/JessLerner/GenList) como
  fuente de listas de precios.
- [ ] Definir contrato de salida aprobado: marca, modelo, valor básico, tipo y
  cuotas del plan, cuota pura, cuota 1 restringida a gerencia, valor de
  suscripción por equipo, escalas de cuota y entregas pactadas.
- [ ] Recién después de la aprobación, integrar GenList con Supabase mediante
  importación trazable y versionada.

## Criterios no negociables

- Supabase es el repositorio central; cada fuente conserva su dueño funcional.
- No se generan cargos, equipos, relaciones ni datos comerciales por inferencia.
- Toda importación debe tener vista previa, validación, identificador estable,
  registro de ejecución y posibilidad de reversión.
- Los módulos no se habilitan a usuarios finales hasta estar conectados a datos
  reales y sus permisos hayan sido probados.
