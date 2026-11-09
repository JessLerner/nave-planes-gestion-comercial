-- Gestión de cuentas desde NAVE.Plan. Es independiente del ledger remoto histórico.
--
-- `admin` queda reservado para Dirección y Administración General. El resto
-- del personal administrativo usa el rol técnico `administrativo`, que no
-- concede acceso funcional por sí mismo: cada capacidad debe otorgarse de
-- manera explícita. No se asignan cuentas ni permisos automáticamente.
do $$
begin
  if to_regclass('public.profiles') is null
    or to_regclass('public.staff_members') is null
    or to_regclass('public.hr_roles') is null
    or to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'Account management aborted: Legajos/profile or migration-ledger foundation is missing.';
  end if;
end $$;

alter type public.app_role add value if not exists 'administrativo';

-- A role catalog mapping alone never authorizes a new global account. The
-- operator must explicitly mark only the Dirección / Administración General
-- roles that are allowed to receive `admin` accounts after this migration.
alter table public.hr_roles add column if not exists grants_global_admin boolean not null default false;

create table if not exists public.profile_access_permissions (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  capability text not null,
  granted_by uuid not null references public.profiles(id) on delete restrict,
  granted_at timestamptz not null default now(),
  primary key (profile_id, capability)
);
-- Replace the draft constraint if this migration was exercised in an isolated
-- local database before the temporary capability reduction.
alter table public.profile_access_permissions
  drop constraint if exists profile_access_permissions_capability_check;
alter table public.profile_access_permissions
  add constraint profile_access_permissions_capability_check
  check (capability in ('view_legajos', 'manage_legajos'));
create index if not exists profile_access_permissions_capability_idx
  on public.profile_access_permissions(capability, profile_id);
alter table public.profile_access_permissions enable row level security;
drop policy if exists profile_access_permissions_admin_read on public.profile_access_permissions;
create policy profile_access_permissions_admin_read on public.profile_access_permissions
  for select to authenticated
  using (public.current_app_role() = 'admin');

create table if not exists public.access_account_audit (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('invited','permissions_updated')),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  target_profile_id uuid not null references public.profiles(id) on delete restrict,
  target_staff_member_id uuid not null references public.staff_members(id) on delete restrict,
  target_role public.app_role not null,
  target_email text not null,
  capabilities text[] not null default '{}',
  occurred_at timestamptz not null default now()
);
create index if not exists access_account_audit_target_idx on public.access_account_audit(target_profile_id, occurred_at desc);
alter table public.access_account_audit enable row level security;
drop policy if exists access_account_audit_admin_read on public.access_account_audit;
create policy access_account_audit_admin_read on public.access_account_audit
  for select to authenticated
  using (public.current_app_role() in ('admin','rrhh'));

-- The remote migration ledger is incomplete by design. Record this controlled
-- reconciliation explicitly, rather than attempting a remote `db push`.
