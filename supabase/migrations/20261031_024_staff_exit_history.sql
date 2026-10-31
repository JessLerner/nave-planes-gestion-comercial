-- A deactivation is not always a real departure. Preserve the distinction so
-- roster corrections do not distort turnover metrics.

alter table public.staff_members
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivation_type text check (deactivation_type in ('termination', 'administrative_correction')),
  add column if not exists deactivation_reason text;

create table if not exists public.staff_status_events (
  id uuid primary key default gen_random_uuid(),
  staff_member_id uuid not null references public.staff_members(id) on delete restrict,
  event_type text not null check (event_type in ('termination', 'administrative_correction')),
  reason text,
  supervisor_staff_id uuid references public.staff_members(id) on delete set null,
  manager_staff_id uuid references public.staff_members(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now()
);

alter table public.staff_status_events enable row level security;
create index if not exists staff_status_events_supervisor_date_idx
  on public.staff_status_events(supervisor_staff_id, occurred_at desc);
create index if not exists staff_status_events_staff_date_idx
  on public.staff_status_events(staff_member_id, occurred_at desc);

-- Existing inactive records predate the explicit decision control. They are
-- retained as administrative corrections and therefore do not count as churn.
update public.staff_members
set deactivated_at = coalesce(deactivated_at, updated_at, now()),
    deactivation_type = coalesce(deactivation_type, 'administrative_correction')
where active = false;
