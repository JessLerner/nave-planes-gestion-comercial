-- Safe reconciliation for databases updated manually from the Supabase SQL editor.
-- It never deletes roster, commercial or user data. Run this file once, after
-- the base Nave.Plan schema has been created.

alter table public.teams
  add column if not exists active boolean not null default true,
  add column if not exists is_sales_team boolean not null default true;

alter table public.staff_members
  add column if not exists area_id uuid references public.hr_areas(id) on delete restrict,
  add column if not exists role_id uuid references public.hr_roles(id) on delete restrict,
  add column if not exists responsible_staff_id uuid references public.staff_members(id) on delete set null,
  add column if not exists is_coaching boolean not null default false,
  add column if not exists is_freelance boolean not null default false,
  add column if not exists effective_manager_staff_id uuid references public.staff_members(id) on delete set null;

do $$ begin
  create type public.manager_assignment_source as enum ('inherited', 'manual');
exception when duplicate_object then null;
end $$;

alter table public.staff_members
  add column if not exists effective_manager_source public.manager_assignment_source not null default 'inherited';

alter table public.hr_roles
  add column if not exists creates_seller_record boolean not null default false,
  add column if not exists app_role_mapping public.app_role;

create unique index if not exists hr_roles_app_role_mapping_unique
  on public.hr_roles(app_role_mapping) where app_role_mapping is not null;

insert into public.hr_roles (area_id,name,active,sort_order,app_role_mapping)
select area.id, 'Administrador General', true, 5, 'admin'
from public.hr_areas area
where area.name = 'Gerencia / Dirección'
on conflict (area_id,name) do update set app_role_mapping = excluded.app_role_mapping;

update public.hr_roles set app_role_mapping = 'gerente' where lower(name) = 'gerente';
update public.hr_roles set app_role_mapping = 'supervisor' where lower(name) = 'supervisor';
update public.hr_roles set app_role_mapping = 'rrhh' where lower(name) = 'rrhh';
update public.hr_roles set creates_seller_record = true where lower(name) = 'vendedor';

create table if not exists public.hr_role_source_labels (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.hr_roles(id) on delete cascade,
  source_label text not null,
  unique (role_id, source_label)
);

insert into public.hr_role_source_labels(role_id,source_label)
select role.id, labels.source_label
from public.hr_roles role
join (values
  ('Vendedor', 'VENDEDOR PDA'),
  ('Supervisor', 'SUPERVISOR PDA'),
  ('Administración', 'ADMINISTRACION PDA'),
  ('Administración', 'ADMISNTRACION PDA'),
  ('Administración', 'GESTION COMERCIALIZADORAS'),
  ('Administración', 'RESPONSABLE GESTION COMERCIALIZADORAS'),
  ('Administración', 'CAPACITACION PDA'),
  ('Administración', 'MAESTRANZA PDA'),
  ('Gerente', 'GERENTE PDA'),
  ('Director', 'DIRECCION PDA')
) as labels(role_name,source_label) on labels.role_name = role.name
on conflict (role_id,source_label) do nothing;

do $$ begin
  create type public.hr_import_row_decision as enum ('ready', 'freelance', 'excluded', 'review');
exception when duplicate_object then null;
end $$;

create table if not exists public.hr_import_runs (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  status text not null check (status in ('preview', 'applied', 'rejected')),
  received_rows integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.hr_import_rows (
  id uuid primary key default gen_random_uuid(),
  import_run_id uuid not null references public.hr_import_runs(id) on delete cascade,
  source_line integer not null,
  source_payload jsonb not null,
  normalized_payload jsonb not null,
  decision public.hr_import_row_decision not null,
  review_note text,
  approved boolean not null default false,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (import_run_id, source_line)
);

alter table public.sellers alter column team_id drop not null;
alter table public.teams alter column branch drop not null;
alter table public.sales_operations add column if not exists used_car_details jsonb;
alter table public.wage_advances add column if not exists review_notes text;

do $$ begin
  alter table public.sales_operations add constraint sales_operations_used_car_details_object
    check (used_car_details is null or jsonb_typeof(used_car_details) = 'object');
exception when duplicate_object then null;
end $$;

create index if not exists teams_is_sales_team_idx on public.teams (is_sales_team);
create index if not exists staff_members_area_role_active_idx on public.staff_members(area_id, role_id, active);
create index if not exists staff_members_responsible_idx on public.staff_members(responsible_staff_id);
create index if not exists staff_members_effective_manager_idx on public.staff_members(effective_manager_staff_id, active);
create index if not exists hr_import_rows_run_decision_idx on public.hr_import_rows(import_run_id, decision, approved);
