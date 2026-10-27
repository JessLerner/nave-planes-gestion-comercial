-- Master roster administration.  No customer or document data is stored here.
-- A resource is never physically deleted: departures are represented by active=false
-- and a termination date, preserving the operational and Fox history.

create table if not exists public.roster_import_runs (
  id uuid primary key default gen_random_uuid(),
  source_file_name text not null,
  source_label text not null default 'ESTRUCTURA RRHH ACTIVA OK',
  received_rows integer not null check (received_rows > 0),
  created_staff integer not null default 0 check (created_staff >= 0),
  created_sellers integer not null default 0 check (created_sellers >= 0),
  unresolved_rows integer not null default 0 check (unresolved_rows >= 0),
  summary jsonb not null default '{}'::jsonb,
  imported_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.roster_change_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('staff_member', 'seller', 'team', 'import')),
  entity_id uuid,
  action text not null check (action in ('created', 'updated', 'deactivated', 'imported')),
  before_value jsonb,
  after_value jsonb,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.roster_import_runs enable row level security;
alter table public.roster_change_log enable row level security;

