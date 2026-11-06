# Cierre local — NAVE.Plan y Sprint 5

**Corte:** 06/11/2026.
**Alcance de esta nota:** cierre local autorizado para commit sobre `988b75b`. No certifica producción, Cloudflare remoto ni Supabase remoto.

## Punto de partida seguro

- Repositorio: `D:\Jess 2026\PROGRAMAS\nave-planes---gestión-comercial-y-operativa`.
- Base confirmada de Git: `988b75b` (`feat(legajos): validar traslados y proyecciones`).
- Sprint 5 reúne APIs, migraciones 034–038, componentes y pruebas para un único commit local. No restaurar, limpiar, resetear ni mezclar estos cambios con cambios ajenos.
- Hay modificaciones concurrentes también en `resources-directory`, `LegajosDirectory`, bootstrap y manifest local. Revisar `git status --short` antes de editar.

## Documentación vigente y jerarquía

1. `AGENTS.md`: restricciones operativas y de seguridad; prevalece para ejecutar cambios.
2. `docs/DOCUMENTO_MAESTRO_NAVE_PLAN.md`: mapa general y módulos, actualizado con el cierre local de Sprint 5; no prueba estado remoto.
3. `docs/ESTADO_PROYECTO.md`: resumen de estado actualizado al 06/11 con el cierre local del Sprint 5.
4. `docs/plan-maestro/08-matriz-brechas-funcionales.md`, `09-backlog-priorizado.md`, `10-criterios-aceptacion.md`, `11-decisiones-tecnicas-pendientes.md`, `12-investigacion-blk-01-scoring.md`, `13-especificacion-circuito-comercial-presentaciones-scoring.md`: plan y decisiones funcionales. Son propuesta/especificación; no prueban implementación.
5. `docs/LOCAL_SUPABASE_BOOTSTRAP.md`: único procedimiento para entorno Supabase local. No usarlo contra remoto.

### Contradicciones/documentación desactualizada

- La matriz de brechas y el Documento Maestro incorporan el cierre local de Sprint 5; no deben utilizarse como evidencia de despliegue.
- La especificación comercial 13 prevalece sobre textos anteriores incompatibles sobre Scoring, Parte Diario, presentaciones y Mora.

## Evidencia real por estado

### Implementado y verificado localmente

- Bootstrap Supabase local: las versiones locales 034–038 se comprobaron en la historia local y sus objetos existen (solicitudes/documentos de incorporación, avisos de baja, borradores parciales, auditoría/`entry_mode`, función y políticas privadas).
- `npm run lint`, `npm test` (26 pasadas, 5 integraciones aisladas omitidas por falta de variables locales) y `npm run build:cloudflare` finalizaron correctamente en local. El build conserva una advertencia no bloqueante por bundle mayor a 500 kB.
- Integración autenticada de Incorporaciones/Coaching: aprobada para Supervisor → observación → corrección → autorización de Gerencia → Legajo activo `coaching`.
- Integración de Avisos de baja: aprobada; confirma alcance, auditoría y que confirmar un aviso no desactiva el Legajo.
- Integración de Legajos y traslados: aprobada.
- Integración de `resource-update`: aprobada para traslado/proyecciones; la integración Sprint 5 verificó autorización de baja directa para RRHH/Admin y rechazo a Supervisor/Gerencia.
- Integración Sprint 5 de borradores: aprobada para borrado propio, eliminación física de archivos, auditoría y restricción de borradores/documentos ajenos para Gerencia/RRHH, incluido intento de URL firmada.

### Implementado localmente, sin prueba específica suficiente

- Alta/baja directa RRHH: autorización autenticada cubierta; queda pendiente repetir el circuito extremo a extremo en el ambiente objetivo antes de habilitarlo remotamente.
- OCR local y normalización: presentes en `IncorporationPanel.tsx`; no hay validación con DNI real representativo.

### Publicado/comprobado

- **No hay evidencia en este checkout de despliegue o publicación de Sprint 5.** El Worker local no implica Cloudflare remoto ni aplicación publicada.
- No afirmar que migraciones/RLS, rutas o UI estén activas en producción sin verificar el proyecto remoto autorizado.

## Sprint 5: cierre aceptado localmente

| Pedido | Evidencia actual | Falta / riesgo |
| --- | --- | --- |
| Bandeja clara de aprobaciones de Gerencia | Tabla con DNI/fecha/documentos, detalle y acciones inline implementados localmente. | Requiere validación manual visual; no hay evidencia remota. |
| Respuesta visual inmediata y anti doble envío | Incorporaciones y Avisos muestran procesamiento, bloquean acciones y notifican resultado. La validación visual local fue aceptada. | No hay evidencia remota. |
| Eliminar borrador propio | UI/API y la integración autenticada verifican borrado propio, archivos físicos y auditoría. | No hay evidencia remota. |
| Alta directa RRHH | API/UI y autorización RRHH/Admin verificadas localmente. | Pendiente repetir extremo a extremo en ambiente objetivo; no hay evidencia de despliegue. |
| Baja directa RRHH | API/UI y autorización RRHH/Admin verificadas localmente. | Pendiente repetir extremo a extremo en ambiente objetivo; no hay evidencia publicada. |
| Privacidad de borradores/documentos | La integración verificó que Gerencia/RRHH no ven borradores ajenos ni documentos, incluido intento de URL firmada. | Falta matriz completa por rol y evidencia remota. |

## Lectura de la captura aportada

- Usuario visible: `S5 Gerencia Local`.
- Solicitud pendiente: se ven botones Observar/Rechazar/Autorizar y cinco documentos, por lo que el flujo base de revisión se renderiza localmente.
- La captura **no** muestra DNI, fecha de solicitud, una vista individual/modal ni asociación visual de documentos a la tarjeta; por eso no satisface el criterio A de Sprint 5.
- La captura no permite inferir RLS, permisos API, eliminación de borradores, alta/baja directa ni despliegue remoto.

## Archivos de trabajo para continuar

### Sprint 5 — interfaz

- `src/components/hr/IncorporationPanel.tsx` — principal deuda de UI: refactor a bandeja + detalle individual, acciones con estado y borrado de borrador.
- `src/components/hr/HrDirectIncorporation.tsx` — alta directa RRHH local.
- `src/components/hr/HrDirectDeparture.tsx` — baja directa RRHH local.
- `src/components/hr/DepartureNoticesPanel.tsx` — avisos; mantener separados de bajas operativas.
- `src/components/hr/HrAndAdvancesModule.tsx` — integra pestañas, con retorno especial para Supervisor.
- `src/components/hr/LegajosDirectory.tsx` — listado/estado administrativo y edición existente.

### Sprint 5 — API, esquema y pruebas

- `api/incorporation-requests.ts`, `api/incorporation-documents.ts`, `api/incorporation-decisions.ts`, `api/incorporation-drafts.ts`, `api/incorporation-hr-direct.ts`.
- `api/resource-update.ts`, `api/staff-departure-notices.ts`, `api/staff-departure-documents.ts`, `api/staff-departure-decisions.ts`.
- `cloudflare/worker.ts` — rutas RRHH y cuerpo JSON para DELETE.
- `supabase/migrations/20261103_034_incorporation_requests_coaching.sql` a `20261105_038_incorporation_private_drafts_and_hr_direct.sql`.
- `src/test-support/incorporation.integration.test.ts`, `src/test-support/departureNotices.integration.test.ts` y lanzadores `scripts/run-local-*-integration.mjs`.

## Seguimiento posterior al cierre

1. Antes de cualquier habilitación remota: aplicar migraciones sólo con autorización separada y repetir la matriz por rol en el ambiente objetivo.
2. Validar OCR con DNI representativos; no prometer extracción fiable hasta contar con esa evidencia.
3. Mantener avisos de baja separados de la baja operativa y no habilitar permisos comerciales por estado administrativo.

## Entorno local de referencia

- Supabase local: `127.0.0.1:54321` (API) y PostgreSQL `127.0.0.1:54322`.
- El Worker se llegó a validar localmente en `http://127.0.0.1:8788` usando Hyperdrive local y compatibilidad `2026-10-30`; no asumir que siga en ejecución entre sesiones.
- Usuarios locales de prueba creados durante la validación: `sprint5.supervision@naveplan.local`, `sprint5.gerencia@naveplan.local`, `sprint5.rrhh@naveplan.local`. Son datos locales, no evidencia de cuentas remotas.
