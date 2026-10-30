-- Reset the failed roster import before rebuilding Resources from the sole
-- authoritative source: ESTRUCTURA RRHH ACTIVA.  Commercial, scoring and
-- Fox data is intentionally outside this migration.

create table if not exists public.roster_reset_backups (
  id uuid primary key default gen_random_uuid(),
  reset_reason text not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.roster_reset_backups enable row level security;

drop policy if exists "roster_reset_backups_admin_only" on public.roster_reset_backups;
create policy "roster_reset_backups_admin_only" on public.roster_reset_backups
  for all to authenticated
  using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');

begin;

insert into public.roster_reset_backups (reset_reason, snapshot)
select
  'Reset approved by Administración: rebuild Recursos from ESTRUCTURA RRHH ACTIVA only.',
  jsonb_build_object(
    'staff_members', coalesce((select jsonb_agg(to_jsonb(staff) order by staff.full_name) from public.staff_members staff), '[]'::jsonb),
    'sellers', coalesce((select jsonb_agg(to_jsonb(seller) order by seller.full_name) from public.sellers seller), '[]'::jsonb),
    'teams', coalesce((select jsonb_agg(to_jsonb(team) order by team.name) from public.teams team), '[]'::jsonb),
    'profile_links', coalesce((select jsonb_agg(jsonb_build_object('id', profile.id, 'staff_member_id', profile.staff_member_id, 'team_id', profile.team_id) order by profile.id) from public.profiles profile where profile.staff_member_id is not null or profile.team_id is not null), '[]'::jsonb),
    'roster_import_runs', coalesce((select jsonb_agg(to_jsonb(run) order by run.created_at) from public.roster_import_runs run), '[]'::jsonb),
    'roster_change_log', coalesce((select jsonb_agg(to_jsonb(log) order by log.created_at) from public.roster_change_log log), '[]'::jsonb)
  );

-- Keep authenticated users, but remove all links to the discarded structure.
update public.profiles
set staff_member_id = null,
    team_id = null
where staff_member_id is not null or team_id is not null;

-- These tables only describe the discarded import attempts.
delete from public.roster_change_log;
delete from public.roster_import_runs;

-- No operational rows currently reference the roster. Delete in dependency
-- order; sales, scoring, Fox, price lists, advances and HR documents remain.
delete from public.sellers;
delete from public.teams;
delete from public.staff_members;

commit;
