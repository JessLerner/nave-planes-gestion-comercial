-- Landing zone for read-only scoring sheets.  It retains the original row and
-- intentionally does not infer an approval/rejection rule from ambiguous
-- categories; that mapping is configured only after Administración confirms it.

create table if not exists public.source_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source_key text not null,
  source_url text,
  source_sheet text,
  row_count integer not null check (row_count >= 0),
  imported_at timestamptz not null default now(),
  imported_by text not null default 'system'
);

create table if not exists public.scoring_source_rows (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  latest_run_id uuid references public.source_sync_runs(id) on delete set null,
  brand text not null,
  subscription_number text not null,
  client_name text,
  scoring_date date,
  seller_name text,
  supervisor_name text,
  administrator_name text,
  observed_category text,
  rejection_reason_1 text,
  rejection_reason_2 text,
  approval_reason text,
  cancellation_reason text,
  comments text,
  source_row jsonb not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint scoring_source_rows_brand_subscription_unique unique (brand, subscription_number)
);

create index if not exists scoring_source_rows_subscription_idx
  on public.scoring_source_rows(subscription_number);
create index if not exists scoring_source_rows_latest_run_idx
  on public.scoring_source_rows(latest_run_id);

alter table public.source_sync_runs enable row level security;
alter table public.scoring_source_rows enable row level security;

comment on table public.scoring_source_rows is
  'Raw, read-only mirror of scoring sheets. SX is the subscription number used to later match sales_operations.';
