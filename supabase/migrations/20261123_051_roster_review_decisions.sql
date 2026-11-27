create schema if not exists naveplan_private;
create table naveplan_private.roster_review_decisions (
  review_token text primary key check (length(review_token)=64),
  source_hash text not null,
  scope jsonb not null,
  decision text not null check (decision in ('apply','keep','terminate','error','hire','pending')),
  decision_hash text not null,
  staff_id uuid references public.staff_members(id),
  actor_id uuid not null references public.profiles(id),
  decided_at timestamptz not null default now(),
  before_value jsonb,
  after_value jsonb not null,
  reason text,
  effective_date date
);
revoke all on naveplan_private.roster_review_decisions from public, anon, authenticated, service_role;
alter table naveplan_private.roster_review_decisions enable row level security;
