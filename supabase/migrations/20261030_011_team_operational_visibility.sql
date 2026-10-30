-- A team is visible in commercial selectors only when Administration marks it
-- as operational. This is an explicit business decision; it must never be
-- inferred from historical sellers or from a person's former role.
alter table public.teams
  add column if not exists is_sales_team boolean not null default true;

create index if not exists teams_is_sales_team_idx
  on public.teams (is_sales_team);
