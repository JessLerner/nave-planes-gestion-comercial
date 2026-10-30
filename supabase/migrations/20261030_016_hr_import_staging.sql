-- Staging makes every proposed resource import reviewable and reversible
-- before it changes the operative roster.
create type public.hr_import_row_decision as enum ('ready', 'freelance', 'excluded', 'review');

create table public.hr_import_rows (
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

alter table public.hr_import_rows enable row level security;
create index hr_import_rows_run_decision_idx on public.hr_import_rows(import_run_id, decision, approved);
