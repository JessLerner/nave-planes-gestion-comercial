-- Read-only landing and reconciliation metadata for sales announced in the
-- external App Control "ID Ventas" sheet. This does not contact or alter the
-- source system, and it does not change historical sales state.

alter table public.source_sync_runs
  add column if not exists run_status text not null default 'completed',
  add column if not exists error_count integer not null default 0,
  add column if not exists completed_at timestamptz;

alter table public.source_sync_runs
  drop constraint if exists source_sync_runs_run_status_check;

alter table public.source_sync_runs
  add constraint source_sync_runs_run_status_check
  check (run_status in ('running', 'completed', 'failed', 'completed_with_errors'));

alter table public.source_sync_runs
  add constraint source_sync_runs_error_count_check
  check (error_count >= 0);

alter table public.sales_operations
  add column if not exists source_sync_run_id uuid
  references public.source_sync_runs(id) on delete set null;

create index if not exists sales_operations_source_sync_run_idx
  on public.sales_operations(source_sync_run_id);

create table if not exists public.source_sync_errors (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.source_sync_runs(id) on delete cascade,
  source_key text,
  error_code text not null,
  error_message text not null,
  source_row jsonb,
  created_at timestamptz not null default now(),
  check (length(error_code) between 1 and 100),
  check (length(error_message) between 1 and 1000)
);

create index if not exists source_sync_errors_run_idx
  on public.source_sync_errors(run_id, created_at);

alter table public.source_sync_errors enable row level security;

comment on column public.sales_operations.source_sync_run_id is
  'Latest read-only source synchronization that refreshed this external sale.';

comment on table public.source_sync_errors is
  'Validation and transport errors retained per source synchronization run; no source data is modified.';
