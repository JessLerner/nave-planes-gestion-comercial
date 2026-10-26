-- Nave Planes: master roster imported from the RRHH structure sheet.
-- The source remains read-only. This schema stores only the employment fields
-- required by the platform; document links and scans are intentionally excluded.

create type public.staff_role as enum (
  'administrador_general',
  'gerente',
  'supervisor',
  'vendedor',
  'administracion',
  'rrhh',
  'otro'
);

create table public.staff_members (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  role public.staff_role not null default 'otro',
  active boolean not null default true,
  legajo text,
  dni text,
  employment_type text,
  commercial_structure text,
  location text,
  hire_date date,
  termination_date date,
  source_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (full_name)
);

create unique index staff_members_dni_unique_idx
  on public.staff_members (dni) where dni is not null;

alter table public.teams
  add column if not exists manager_staff_id uuid references public.staff_members(id) on delete set null,
  add column if not exists supervisor_staff_id uuid references public.staff_members(id) on delete set null,
  add column if not exists commercial_structure text;

alter table public.sellers
  add column if not exists staff_member_id uuid references public.staff_members(id) on delete set null,
  add column if not exists legajo text,
  add column if not exists employment_type text;

-- The source sometimes records coaching rather than a factual start date.
-- Unknown dates must remain unknown instead of being fabricated.
alter table public.sellers alter column hire_date drop not null;

create unique index sellers_team_full_name_unique_idx
  on public.sellers (team_id, full_name);

create unique index sellers_staff_member_unique_idx
  on public.sellers (staff_member_id) where staff_member_id is not null;

alter table public.staff_members enable row level security;

drop policy if exists "staff_members_read_authenticated" on public.staff_members;
create policy "staff_members_read_authenticated" on public.staff_members
  for select to authenticated using (true);

drop policy if exists "staff_members_admin_write" on public.staff_members;
create policy "staff_members_admin_write" on public.staff_members
  for all to authenticated
  using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');
