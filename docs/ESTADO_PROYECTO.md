# Estado real de NAVE.Plan

**Corte:** 06/11/2026 · **Base:** checkout local sobre `988b75b`, `AGENTS.md`, Documento Maestro, Plan Maestro, migraciones y validaciones locales.
**Alcance de este documento:** evidencia local. No certifica Supabase remoto, Cloudflare remoto, publicación, datos reales, secretos ni comportamiento de producción.

## Lectura rápida

NAVE.Plan conserva una base local de React/Vite, APIs TypeScript, Worker Cloudflare y Supabase. Legajos (`staff_members` + `hr_roles`) sigue siendo la autoridad de estructura; equipos, vendedores y alcance son proyecciones. Sprint 5 queda cerrado localmente para commit: incluye migraciones RRHH 034–038, APIs, pantallas y pruebas. Esto no acredita migraciones ni publicación remotas.

| Estado | Significado en este documento |
| --- | --- |
| **Verificado localmente** | Código y prueba/consulta local con resultado final. |
| **Implementado localmente** | Código/migración presente, pero sin prueba suficiente del circuito indicado. |
| **Pendiente** | Falta comportamiento, seguridad, prueba o contrato de fuente. |
| **No verificado remotamente** | No hay evidencia que permita afirmarlo como publicado u operativo. |

## Evidencia local reciente

- Migraciones RRHH locales registradas: `20261103000037` (034) a `20261105000041` (038). Se verificaron objetos de solicitudes/documentos, avisos de baja, borradores parciales, auditoría de alta directa, función y políticas privadas.
- `npm run lint`, `npm test` (26 pasadas, 5 integraciones aisladas omitidas por falta de variables locales) y `npm run build:cloudflare` finalizaron correctamente en el checkout local. El build conserva una advertencia no bloqueante por bundle JavaScript mayor a 500 kB.
- Pasaron las integraciones locales de Incorporaciones/Coaching, Avisos de baja, Legajos/traslados, `resource-update` y acceso Sprint 5 (borradores privados, Storage y autorización de altas/bajas directas).
- Worker local fue comprobado por HTTP en `127.0.0.1:8788` con Hyperdrive apuntando al PostgreSQL local. Esto no es evidencia de Cloudflare remoto.
- La validación visual local fue aceptada para el cierre del Sprint 5. No es evidencia de despliegue remoto.

## Estado por módulo

| Módulo | Estado local | Pendiente / límite |
| --- | --- | --- |
| Acceso y perfiles | Login, sesión, perfiles y validaciones de handlers existen. Se crearon usuarios sintéticos locales para validación Sprint 5. | Falta regresión completa por rol y evidencia de invitaciones/RLS/despliegue remoto. |
| Legajos y jerarquía | Directorio, edición, baja lógica, históricos, traslados y proyecciones derivadas. Integración local aprobada. | Confirmar comportamiento y datos en ambiente objetivo; mantener `staff_members`/`hr_roles` como única autoridad. |
| Incorporaciones / Coaching | Solicitud, documentos privados, decisión de Gerencia y creación de Coaching validadas localmente. La bandeja, los borradores parciales y el borrado propio están implementados; la integración Sprint 5 verificó borrado físico, auditoría y restricción de borradores/documentos ajenos para Gerencia/RRHH. Migraciones 034–038 presentes en entorno local. | Falta evidencia de ambiente remoto y una matriz ampliada por rol; el OCR de DNI requiere validación representativa independiente. |
| Avisos de baja | Circuito separado de aviso, documento privado y decisión RRHH/Admin validado localmente. | No sustituye una baja operativa; mantener separación explícita. |
| Alta/baja directa RRHH | API y componentes locales para alta directa a Coaching y baja operativa directa; la integración verificó rechazo a Supervisor/Gerencia y autorización para RRHH/Admin. | Falta evidencia de ambiente remoto y, antes de habilitación productiva, una prueba de extremo a extremo con documentos/auditoría y fecha/evento/proyecciones. |
| Adelantos | Solicitud/revisión, persistencia y restricciones de alcance presentes. | Reglas actuales globales: faltan mínimos por gerencia/equipo/período, snapshot y regla de Dirección. |
| Operaciones / Parte Diario | APIs/UI y modelo `sales_operations` existen. | Parte Diario sigue siendo fuente externa; falta contrato de ingesta idempotente y validación de fuente. |
| Scoring | Edge Function, espejo y vistas existen. | Bloqueante funcional: desacoplar aprobación/rechazo/bloqueo de operaciones; mantener Scoring como observación analítica. |
| FoxCRM | Parser, lotes/RPC, snapshots, métricas y mapeos asistidos. | Falta contrato de fuente, automatización, validación productiva y mapeo explícito; no hay reparto automático. |
| Listas y circulares | Modelo versionado, publicación/confirmación, exportación, parser Renault y OCR asistido. | Faltan fuentes/carga/revisión administrativa, adaptadores y regresión con circulares/roles reales. OCR no publica precios. |
| Extractor Google / App Control | Lectura OAuth y Edge Functions específicas existen. | Fuentes, secretos, Apps Script activo, scheduler y ejecución real no verificados. No modificar las fuentes externas. |
| Cartera/Mora | Modelo y UI de destino existen. | Sin fuente oficial, contrato, importador ni frecuencia; no tratar como cartera real. |
| Presentaciones, cobros y reclutamiento final | Hay referencias, esquemas y documentación. | Expedientes, enlaces autorizados, Mercado Pago, Parte Diario nativo y flujo reclutamiento→Legajo no están terminados. |

## Sprint 5: cierre local

- Alcance cerrado: Incorporaciones/Coaching, borradores parciales y privados, documentación privada, decisiones de Gerencia/RRHH/Admin, alta directa RRHH, avisos de baja separados de la baja operativa, baja directa controlada, auditoría y control de alcance.
- Evidencia: validaciones locales, pruebas automatizadas y validación visual local aceptada el 06/11/2026.
- Límite: el cierre habilita el commit local; no habilita migración remota, despliegue ni declaración de operación en producción.
- Seguimiento posterior: validar OCR con DNI representativos y completar una matriz de regresión por rol en el ambiente objetivo antes de habilitar los circuitos remotos.

## Fuentes de continuidad

- `AGENTS.md`: restricciones obligatorias.
- `docs/DOCUMENTO_MAESTRO_NAVE_PLAN.md`: arquitectura e inventario general, actualizado con el cierre local de Sprint 5.
- `docs/plan-maestro/`: brechas, backlog, criterios y decisiones. Es planificación, no evidencia operativa.
- `docs/HANDOFF_CONTINUIDAD_SPRINT5.md`: cierre local, archivos críticos, evidencia y límites de publicación del Sprint 5.
- `docs/LOCAL_SUPABASE_BOOTSTRAP.md`: procedimiento exclusivo de Supabase local.

## Límites y prohibiciones vigentes

- No hay autorización implícita para commit, push, despliegue, migración remota, `supabase link`, `db push` remoto ni cambios de secretos.
- No ejecutar `20261030_012_reset_roster_foundation.sql` en producción.
- No confundir un archivo, migración, test local o Worker local con evidencia de publicación.
