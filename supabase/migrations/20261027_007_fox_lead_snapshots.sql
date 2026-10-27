-- Fox CRM: privacy-preserving daily snapshots.
-- Customer identity fields (name, phone, email, DNI, comments and address)
-- are intentionally excluded. FOX ID is the only lead-level identifier kept.

create table public.fox_import_runs (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null,
  period_start date not null,
  period_end date not null,
  source_file_name text not null,
  source_file_sha256 text not null,
  received_rows integer not null check (received_rows >= 0),
  stored_rows integer not null default 0 check (stored_rows >= 0),
  unmapped_rows integer not null default 0 check (unmapped_rows >= 0),
  status text not null default 'completed' check (status in ('completed', 'failed')),
  summary jsonb not null default '{}'::jsonb,
  imported_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (period_start <= period_end),
  check (snapshot_date >= period_start and snapshot_date <= period_end)
);

create table public.fox_user_mappings (
  fox_user_key text primary key,
  fox_user_name text not null,
  seller_id uuid references public.sellers(id) on delete set null,
  notes text,
  updated_at timestamptz not null default now()
);

create table public.fox_lead_daily_snapshots (
  snapshot_date date not null,
  fox_lead_id text not null,
  entry_date date,
  managed_at timestamptz,
  closed_at timestamptz,
  fox_user_name text,
  fox_user_key text,
  seller_id uuid references public.sellers(id) on delete set null,
  team_id uuid references public.teams(id) on delete set null,
  lead_status text,
  lead_source text,
  channel text,
  branch text,
  brand text,
  close_reason text,
  sold boolean,
  import_run_id uuid not null references public.fox_import_runs(id) on delete cascade,
  imported_at timestamptz not null default now(),
  primary key (snapshot_date, fox_lead_id),
  check (length(trim(fox_lead_id)) > 0)
);

create table public.fox_leads (
  fox_lead_id text primary key,
  first_seen_date date not null,
  last_snapshot_date date not null,
  entry_date date,
  managed_at timestamptz,
  closed_at timestamptz,
  fox_user_name text,
  fox_user_key text,
  seller_id uuid references public.sellers(id) on delete set null,
  team_id uuid references public.teams(id) on delete set null,
  lead_status text,
  lead_source text,
  channel text,
  branch text,
  brand text,
  close_reason text,
  sold boolean,
  last_import_run_id uuid references public.fox_import_runs(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (first_seen_date <= last_snapshot_date)
);

create index fox_lead_daily_snapshots_team_date_idx
  on public.fox_lead_daily_snapshots(team_id, snapshot_date desc);
create index fox_lead_daily_snapshots_seller_date_idx
  on public.fox_lead_daily_snapshots(seller_id, snapshot_date desc);
create index fox_lead_daily_snapshots_status_date_idx
  on public.fox_lead_daily_snapshots(lead_status, snapshot_date desc);
create index fox_import_runs_snapshot_date_idx
  on public.fox_import_runs(snapshot_date desc);

alter table public.fox_import_runs enable row level security;
alter table public.fox_user_mappings enable row level security;
alter table public.fox_lead_daily_snapshots enable row level security;
alter table public.fox_leads enable row level security;
