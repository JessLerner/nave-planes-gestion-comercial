-- Supervisors can propose, but only Administración confirms, a Fox identity
-- association. Suggestions are operational audit records, never direct edits.
create table if not exists public.fox_user_mapping_suggestions (
  id uuid primary key default gen_random_uuid(),
  fox_user_key text not null,
  proposed_staff_member_id uuid not null references public.staff_members(id) on delete restrict,
  proposed_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (fox_user_key, proposed_staff_member_id, proposed_by, status)
);

create index if not exists fox_mapping_suggestions_pending_idx
  on public.fox_user_mapping_suggestions(status, created_at);

alter table public.fox_user_mapping_suggestions enable row level security;
