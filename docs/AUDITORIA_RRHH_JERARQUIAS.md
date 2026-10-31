# Auditoría RRHH, legajos y jerarquías

## Resultado

La base posee tablas y campos para representar Recursos, cargos, responsable
directo y gerente efectivo, pero hoy no existe una única implementación que los
mantenga coherentes. La regla de herencia está declarada, no está aplicada como
invariante operativa en todas las altas, cambios, bajas, equipos y permisos.

No se deben habilitar usuarios masivamente hasta completar este bloque.

## Regla de negocio que debe ser única

1. `staff_members` es la nómina maestra y su identidad operativa es el UUID
   interno de la plataforma. El DNI es obligatorio para toda alta; el legajo
   también, salvo las categorías Coaching o Freelance.
2. Cada recurso puede tener un `responsible_staff_id` directo.
3. El gerente efectivo se deriva desde la cadena de responsables, salvo una
   excepción explícita y auditada.
4. Un vendedor freelance puede no tener responsable ni equipo, sin convertirse
   en error ni recibir un gerente inventado.
5. Un equipo comercial es una proyección de la nómina: supervisor activo,
   gerente efectivo del supervisor y vendedores activos que dependen de él.
   No es una segunda fuente de jerarquía.
6. Cambiar cargo, responsable, gerente, estado o condición freelance debe
   recalcular las relaciones afectadas y registrar quién lo hizo, cuándo y el
   valor anterior/nuevo.
7. Las identidades externas de CRM/Fox pueden proponerse por coincidencia
   aproximada de nombre, porque la fuente no tiene identificador de vendedor
   confiable. La asociación aprobada queda persistida como alias/mapping y no
   se vuelve a inferir en cada carga. Los perfiles de acceso de la plataforma,
   en cambio, se vinculan explícitamente a un recurso autorizado.
8. Sólo recursos con función de Supervisión, Gerencia, Dirección o
   Administración/RRHH pueden tener cuenta de acceso. Los vendedores, incluidos
   Freelance o Coaching, nunca reciben acceso a la plataforma.

## Hallazgos confirmados

### Dos modelos de cargo compiten

La tabla conserva el enum heredado `staff_members.role` y el nuevo catálogo
`staff_members.role_id -> hr_roles`. El importador nuevo carga `role_id`, pero
no actualiza el enum heredado. A la vez, `operational-data` todavía exige que
el enum del supervisor sea `supervisor` para devolver equipos. Un recurso
importado puede quedar correctamente como Supervisor en el catálogo y como
`otro` en el enum: el equipo desaparece de la consulta comercial.

**Decisión requerida:** retirar el enum como criterio funcional y usar sólo
`hr_roles` / sus capacidades (`can_supervise_sales_team`,
`creates_seller_record`, `app_role_mapping`).

### Herencia declarada pero no orquestada

La migración `015_effective_manager_hierarchy.sql` define las funciones
`set_supervisor_effective_manager` y `set_resource_manual_manager`, pero las
APIs de importación y edición no las invocan. El importador implementa su
propia búsqueda difusa de nombres y la edición actualiza filas directamente.
Por eso la regla puede existir en SQL y aun así no ejecutarse cuando cambia un
supervisor, gerente o responsable.

**Corrección requerida:** una única función transaccional de recalculado, usada
por importación, edición individual, movimientos masivos y bajas. Debe recorrer
el árbol por UUID, detectar ciclos y actualizar sólo asignaciones heredadas.

### La importación resuelve relaciones por nombre aproximado

La previsualización del navegador y `api/hr-import.ts` emparejan supervisor y
gerente por similitud de nombres. Es una ayuda válida para revisar un archivo,
pero no es una identidad de producción: homónimos, nombres invertidos o
abreviados pueden relacionar recursos equivocados. Actualmente no se conserva
el resultado de ese match como una decisión explícita antes de aplicar.

**Corrección requerida:** usar UUID interno como identidad definitiva, DNI
obligatorio y legajo obligatorio salvo Coaching/Freelance como controles contra duplicados. Los
matches por nombre deben quedar `review` hasta aprobación humana, especialmente
para relaciones jerárquicas. Coaching y Freelance pueden no tener legajo y no
deben bloquearse por ello.

### La edición no sincroniza sus proyecciones

Cambiar cargo, responsable, activo o freelance en `resource-update` no crea,
actualiza, desactiva ni reasigna `teams` y `sellers`. Tampoco actualiza los
vínculos `profiles.staff_member_id`, `profiles.team_id` o el rol de acceso.
La ficha puede mostrar un dato nuevo mientras el módulo comercial sigue usando
la estructura anterior.

**Corrección requerida:** un servicio de movimiento de personal que actualice
nómina, vendedor, equipo, gerente efectivo y perfiles en una transacción.

### La carga inicial no permite todavía la transición a núcleo maestro

`api/hr-import.ts` rechaza toda aplicación si ya existe al menos un recurso.
Sirve para la carga inicial, no para el momento en que Nave.Plan pasa a ser el
núcleo maestro de altas, bajas y movimientos. El DNI debe estar completo para
toda persona; Coaching/Freelance sólo exceptúan el legajo.

**Corrección requerida:** mantener la planilla actual sólo como fuente de
migración y conciliación. Luego, altas nuevas y movimientos se originan en la
plataforma; una importación posterior sólo puede proponer diferencias para
revisión, nunca reemplazar silenciosamente la nómina. Se necesita bitácora,
vista previa y ejecución reversible.

### Legajos no exhibe ni gobierna la jerarquía necesaria

La grilla muestra responsable directo, pero no gerente efectivo, fuente de la
asignación, equipo derivado, conflictos ni historial. El selector de
responsables recibe toda la nómina activa, incluso cuando el usuario no puede
elegirla; el servidor rechaza algunos cambios, pero la interfaz no explica el
alcance.

**Corrección requerida:** ficha con Responsable directo, Gerente efectivo,
Fuente (heredado/manual), Equipo comercial derivado, historial y vista previa
del impacto sobre subordinados antes de confirmar.

### Identidades CRM y perfiles de acceso son problemas distintos

El matching aproximado es válido y necesario para asociar usuarios Fox/CRM con
recursos internos de nombres distintos. Ya existe una tabla de mapeo Fox, pero
la regla debe ser: proponer coincidencia, detectar ambigüedad, aprobar y
persistir alias; nunca sobrescribir una asociación aprobada por una corrida
nueva. Eso no debe confundirse con enlazar una cuenta Auth: acceso a la
plataforma requiere vínculo explícito, rol autorizado y recurso activo.

**Corrección requerida:** dos flujos separados. (1) `recurso <-> identidad
Fox/CRM`: match aproximado controlado y alias aprobado. (2) `recurso <-> cuenta
Auth`: invitación o vínculo explícito, rol app autorizado y alcance de datos.

### Falta auditoría de cambios individuales

Existen corridas de importación, pero no una bitácora de cambios individuales
en personal. Las correcciones de DNI, legajo, cargo, responsable, estado y
condición laboral no dejan antes/después, autor ni motivo.

## Modelo objetivo mínimo

### Entidades

- `staff_members`: recurso y datos laborales; UUID interno inmutable, DNI
  único y obligatorio; legajo único y obligatorio excepto Coaching/Freelance.
- `hr_roles`: catálogo de cargos y capacidades funcionales.
- `staff_relationship_history`: cambios de responsable, gerente manual, cargo,
  estado y condición; con valores previo/nuevo, motivo, autor y fecha.
- `teams`: proyección operativa con supervisor y gerente efectivos; no fuente
  independiente de verdad.
- `sellers`: proyección comercial del recurso cuyo cargo crea vendedor.
- `profiles`: cuenta de acceso vinculada explícitamente al recurso.
- `external_person_aliases` o la extensión de `fox_user_mappings`: identidad
  externa normalizada, nombre de origen, score/propuesta, estado de aprobación,
  recurso vinculado y trazabilidad. Debe admitir varios alias para un recurso.

### Operaciones transaccionales

1. Previsualizar importación RRHH.
2. Aplicar importación diferencial aprobada.
3. Mover recurso individual.
4. Mover equipo completo.
5. Desactivar / desvincular supervisor.
6. Establecer o quitar excepción manual de gerente.
7. Vincular o revocar cuenta de acceso.
8. Alta nueva iniciada por Supervisor: carga de documentación requerida en
   storage privado -> revisión/aprobación RRHH -> creación del recurso UUID ->
   asignación de cargo/responsable/equipo -> creación de vendedor si aplica.

Cada operación debe recalcular descendientes, vendedores, equipos y permisos,
o rechazar el cambio antes de dejar una estructura parcial.

## Criterios de aceptación antes de habilitar usuarios

- Todo recurso activo tiene cargo válido; todo no-freelance comercial tiene
  responsable válido o una excepción documentada.
- Ninguna relación tiene ciclos.
- Cada vendedor visible pertenece al equipo derivado correcto o es freelance.
- Cada equipo tiene supervisor activo, gerente efectivo trazable y vendedores
  coherentes.
- Cambiar un gerente o supervisor actualiza en una transacción a todos los
  descendientes heredados, equipos y permisos afectados.
- Las excepciones manuales no se pisan en recálculos.
- Gerencia sólo ve su estructura real; supervisión sólo su equipo.
- Toda edición presenta y conserva bitácora antes/después.
- La carga inicial no duplica recursos y las conciliaciones posteriores nunca
  pisan datos maestros sin una decisión aprobada.
- Coaching/Freelance sin legajo continúan siendo contabilizados y pueden ser
  vendedores activos sin equipo cuando corresponda.
- Ningún vendedor puede tener perfil de acceso; la invitación sólo está
  disponible para Supervisión, Gerencia, Dirección y Administración/RRHH.
- Un alias Fox aprobado mantiene el vínculo aunque el CRM entregue una variante
  abreviada, invertida o incompleta del nombre.
