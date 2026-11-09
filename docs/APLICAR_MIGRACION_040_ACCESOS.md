# Aplicación controlada — migración 040 de cuentas y permisos

## Alcance

La migración [20261106_040_access_account_management.sql](../supabase/migrations/20261106_040_access_account_management.sql) añade el perfil técnico `administrativo`, permisos explícitos por capacidad, auditoría de invitaciones y el indicador `hr_roles.grants_global_admin`.

No otorga cuentas, permisos ni acceso global automáticamente. No usar `supabase db push` ni `supabase link` para esta aplicación: el ledger remoto histórico permanece incompleto.

## Prerrequisitos verificables

Ejecutar estas consultas en el SQL Editor de **Supabase main / PRODUCTION** antes de aplicar:

```sql
select to_regclass('public.profiles') as profiles,
       to_regclass('public.staff_members') as staff_members,
       to_regclass('public.hr_roles') as hr_roles,
       to_regclass('supabase_migrations.schema_migrations') as migration_ledger,
       to_regprocedure('public.current_app_role()') as current_app_role;

select version, name
from supabase_migrations.schema_migrations
where version in ('20261106000042', '20261106000043')
order by version;

select role, count(*)
from public.profiles
group by role
order by role;

select id, name, app_role_mapping
from public.hr_roles
where active
order by name;
```

Esperado: todos los objetos existen; está `20261106000042`; y `20261106000043` todavía no está antes de la primera aplicación.

## Aplicación

1. Copiar el contenido completo de la migración 040 en el SQL Editor.
2. Ejecutarlo como una única operación. Si el editor permite bloques explícitos, usar `BEGIN`, el contenido de la migración y `COMMIT`; ante cualquier error, usar `ROLLBACK` y no continuar.
3. Verificar inmediatamente:

```sql
select version, name
from supabase_migrations.schema_migrations
where version = '20261106000043';

select enumlabel
from pg_enum
where enumtypid = 'public.app_role'::regtype
order by enumsortorder;

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('hr_roles', 'profile_access_permissions', 'access_account_audit')
order by table_name, ordinal_position;
```

Se debe observar `20261106000043 | 040_access_account_management`, el valor `administrativo` en `app_role`, la columna `hr_roles.grants_global_admin` y las dos tablas nuevas.

## Configuración posterior obligatoria

Antes de invitar a alguien, clasificar los cargos reales en `hr_roles`:

```sql
-- Sólo para los IDs de cargo ya revisados como Dirección / Administración General.
update public.hr_roles
set app_role_mapping = 'admin', grants_global_admin = true
where id in ('<ID_CARGO_DIRECCION>', '<ID_CARGO_ADMINISTRACION_GENERAL>');

-- Personal administrativo sin acceso total: elegir únicamente los cargos revisados.
update public.hr_roles
set app_role_mapping = 'administrativo', grants_global_admin = false
where id in ('<ID_CARGO_ADMINISTRATIVO_1>', '<ID_CARGO_ADMINISTRATIVO_2>');
```

No ejecutar los ejemplos con marcadores sin reemplazarlos por IDs revisados. No mapear masivamente el área Administración a `admin`.

## Próximo paso después de la migración

1. Guardar `SUPABASE_SERVICE_ROLE_KEY` sólo como secreto de runtime de Cloudflare en `gestioncomercial / Production`.
2. Desplegar el Worker con el código de gestión de cuentas.
3. Invitar una cuenta administrativa de prueba sin permisos y comprobar que no obtiene acceso global.
4. Probar una cuenta de Dirección/Administración General autorizada, Gerencia, RR. HH. y Supervisión; documentar los resultados antes de crear cuentas reales.
