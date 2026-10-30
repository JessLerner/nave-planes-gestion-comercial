-- Clean foundation for Recursos. Configuration belongs in the database, never
-- in frontend constants or inferred from names in another system.

create table public.hr_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.hr_roles (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.hr_areas(id) on delete restrict,
  name text not null,
  can_supervise_sales_team boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  unique (area_id, name)
);

insert into public.hr_areas (name, sort_order) values
  ('Ventas', 10), ('Administración', 20), ('Gerencia / Dirección', 30)
on conflict (name) do nothing;

insert into public.hr_roles (area_id, name, can_supervise_sales_team, sort_order)
select area.id, role.name, role.can_supervise_sales_team, role.sort_order
from public.hr_areas area
join (values
  ('Ventas', 'Vendedor', false, 10),
  ('Ventas', 'Supervisor', true, 20),
  ('Administración', 'Administración', false, 10),
  ('Administración', 'RRHH', false, 20),
  ('Administración', 'Mora', false, 30),
  ('Administración', 'Contable', false, 40),
  ('Gerencia / Dirección', 'Gerente', false, 10),
  ('Gerencia / Dirección', 'Director', false, 20)
) as role(area_name, name, can_supervise_sales_team, sort_order) on role.area_name = area.name
on conflict (area_id, name) do nothing;

alter table public.staff_members drop constraint if exists staff_members_full_name_key;
alter table public.staff_members
  add column if not exists area_id uuid references public.hr_areas(id) on delete restrict,
  add column if not exists role_id uuid references public.hr_roles(id) on delete restrict,
  add column if not exists responsible_staff_id uuid references public.staff_members(id) on delete set null,
  add column if not exists is_coaching boolean not null default false,
  add column if not exists is_freelance boolean not null default false;

alter table public.teams
  add column if not exists active boolean not null default true;

create table public.fox_resource_aliases (
  id uuid primary key default gen_random_uuid(),
  staff_member_id uuid not null references public.staff_members(id) on delete cascade,
  fox_user_key text,
  fox_display_name text not null,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (fox_user_key),
  unique (staff_member_id, fox_display_name)
);

create table public.hr_import_runs (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  status text not null check (status in ('preview', 'applied', 'rejected')),
  received_rows integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.hr_areas enable row level security;
alter table public.hr_roles enable row level security;
alter table public.fox_resource_aliases enable row level security;
alter table public.hr_import_runs enable row level security;

create index if not exists staff_members_area_role_active_idx on public.staff_members(area_id, role_id, active);
create index if not exists staff_members_responsible_idx on public.staff_members(responsible_staff_id);
create index if not exists fox_resource_aliases_staff_idx on public.fox_resource_aliases(staff_member_id);
