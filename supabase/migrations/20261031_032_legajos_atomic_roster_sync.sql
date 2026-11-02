-- Legajos is the sole roster authority.  Teams, sellers and profile scope are
-- projections, rebuilt in the same database transaction as a roster change.
-- No screen or API may maintain a second hierarchy.

create or replace function public.rebuild_roster_projections_from_legajos()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Resolve every inherited manager from the UUID reporting tree.  A manual
  -- manager set on an ancestor is an explicit boundary; otherwise the nearest
  -- active Gerente/Administrador General is inherited.  This never touches a
  -- manual assignment on the resource itself.
  with recursive ancestry as (
    select resource.id as resource_id, parent.id as ancestor_id, 1 as depth
    from public.staff_members resource
    join public.staff_members parent on parent.id = resource.responsible_staff_id
    where resource.active
    union all
    select ancestry.resource_id, parent.id, ancestry.depth + 1
    from ancestry
    join public.staff_members ancestor on ancestor.id = ancestry.ancestor_id
    join public.staff_members parent on parent.id = ancestor.responsible_staff_id
    where ancestry.depth < 100
  ), candidates as (
    select ancestry.resource_id, ancestor.effective_manager_staff_id as manager_id, ancestry.depth
    from ancestry
    join public.staff_members ancestor on ancestor.id = ancestry.ancestor_id
    where ancestor.active
      and ancestor.effective_manager_source = 'manual'::public.manager_assignment_source
      and ancestor.effective_manager_staff_id is not null
    union all
    select ancestry.resource_id, ancestor.id, ancestry.depth
    from ancestry
    join public.staff_members ancestor on ancestor.id = ancestry.ancestor_id
    join public.hr_roles role on role.id = ancestor.role_id
    where ancestor.active
      and role.app_role_mapping in ('gerente'::public.app_role, 'admin'::public.app_role)
  ), resolved as (
    select distinct on (resource_id) resource_id, manager_id
    from candidates
    order by resource_id, depth
  )
  update public.staff_members resource
  set effective_manager_staff_id = resolved.manager_id,
      effective_manager_source = 'inherited'::public.manager_assignment_source,
      updated_at = now()
  from resolved
  where resource.id = resolved.resource_id
    and resource.active
    and resource.effective_manager_source = 'inherited'::public.manager_assignment_source
    and resource.effective_manager_staff_id is distinct from resolved.manager_id;

  -- An inherited resource with no eligible manager above it must not retain a
  -- manager from the previous structure.
  with recursive ancestry as (
    select resource.id as resource_id, parent.id as ancestor_id, 1 as depth
    from public.staff_members resource
    join public.staff_members parent on parent.id = resource.responsible_staff_id
    where resource.active
    union all
    select ancestry.resource_id, parent.id, ancestry.depth + 1
    from ancestry
    join public.staff_members ancestor on ancestor.id = ancestry.ancestor_id
    join public.staff_members parent on parent.id = ancestor.responsible_staff_id
    where ancestry.depth < 100
  ), candidates as (
    select ancestry.resource_id, ancestry.depth
    from ancestry join public.staff_members ancestor on ancestor.id = ancestry.ancestor_id
    where ancestor.active and ancestor.effective_manager_source = 'manual'::public.manager_assignment_source
      and ancestor.effective_manager_staff_id is not null
    union all
    select ancestry.resource_id, ancestry.depth
    from ancestry
    join public.staff_members ancestor on ancestor.id = ancestry.ancestor_id
    join public.hr_roles role on role.id = ancestor.role_id
    where ancestor.active and role.app_role_mapping in ('gerente'::public.app_role, 'admin'::public.app_role)
  )
  update public.staff_members resource
  set effective_manager_staff_id = null,
      effective_manager_source = 'inherited'::public.manager_assignment_source,
      updated_at = now()
  where resource.active
    and resource.effective_manager_source = 'inherited'::public.manager_assignment_source
    and resource.effective_manager_staff_id is not null
    and not exists (select 1 from candidates where candidates.resource_id = resource.id);

  update public.teams team
  set name = supervisor.full_name,
      manager_staff_id = supervisor.effective_manager_staff_id,
      active = true,
      is_sales_team = true
  from public.staff_members supervisor
  join public.hr_roles role on role.id = supervisor.role_id
  where team.supervisor_staff_id = supervisor.id
    and supervisor.active
    and role.app_role_mapping = 'supervisor'::public.app_role;

  insert into public.teams(name, supervisor_staff_id, manager_staff_id, active, is_sales_team)
  select supervisor.full_name, supervisor.id, supervisor.effective_manager_staff_id, true, true
  from public.staff_members supervisor
  join public.hr_roles role on role.id = supervisor.role_id
  where supervisor.active
    and role.app_role_mapping = 'supervisor'::public.app_role
    and not exists (select 1 from public.teams team where team.supervisor_staff_id = supervisor.id);

  update public.teams team
  set active = false, is_sales_team = false
  where team.supervisor_staff_id is not null
    and not exists (
      select 1
      from public.staff_members supervisor
      join public.hr_roles role on role.id = supervisor.role_id
      where supervisor.id = team.supervisor_staff_id
        and supervisor.active
        and role.app_role_mapping = 'supervisor'::public.app_role
    );

  update public.sellers projection
  set full_name = staff.full_name,
      team_id = team.id,
      active = true,
      dni = staff.dni,
      legajo = staff.legajo,
      employment_type = staff.employment_type
  from public.staff_members staff
  join public.hr_roles role on role.id = staff.role_id
  left join lateral (
    select id from public.teams
    where supervisor_staff_id = staff.responsible_staff_id and active and is_sales_team
    order by created_at, id limit 1
  ) team on true
  where projection.staff_member_id = staff.id
    and staff.active
    and role.creates_seller_record;

  insert into public.sellers(full_name, team_id, active, hire_date, dni, staff_member_id, legajo, employment_type)
  select staff.full_name, team.id, true, null, staff.dni, staff.id, staff.legajo, staff.employment_type
  from public.staff_members staff
  join public.hr_roles role on role.id = staff.role_id
  left join lateral (
    select id from public.teams
    where supervisor_staff_id = staff.responsible_staff_id and active and is_sales_team
    order by created_at, id limit 1
  ) team on true
  where staff.active
    and role.creates_seller_record
    and not exists (select 1 from public.sellers projection where projection.staff_member_id = staff.id);

  update public.sellers projection
  set active = false, termination_date = coalesce(termination_date, current_date)
  where projection.staff_member_id is not null
    and not exists (
      select 1 from public.staff_members staff
      join public.hr_roles role on role.id = staff.role_id
      where staff.id = projection.staff_member_id and staff.active and role.creates_seller_record
    );

  -- Access scope follows the Legajos role and the supervisor's derived team.
  update public.profiles profile
  set role = role.app_role_mapping,
      team_id = case when role.app_role_mapping = 'supervisor'::public.app_role then team.id else null end
  from public.staff_members staff
  join public.hr_roles role on role.id = staff.role_id
  left join lateral (
    select id from public.teams
    where supervisor_staff_id = staff.id and active and is_sales_team
    order by created_at, id limit 1
  ) team on true
  where profile.staff_member_id = staff.id
    and staff.active
    and role.app_role_mapping is not null
    and (profile.role is distinct from role.app_role_mapping
      or profile.team_id is distinct from case when role.app_role_mapping = 'supervisor'::public.app_role then team.id else null end);
end;
$$;

create or replace function public.sync_roster_projections_after_legajo_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1
     or coalesce(current_setting('nave.roster_rebuild_deferred', true), '') = 'true' then
    return null;
  end if;
  perform public.rebuild_roster_projections_from_legajos();
  return null;
end;
$$;

drop trigger if exists staff_members_sync_roster_projections on public.staff_members;
create trigger staff_members_sync_roster_projections
after insert or delete or update on public.staff_members
for each statement execute function public.sync_roster_projections_after_legajo_change();

-- Reconcile the live projections when this migration is applied.
select public.rebuild_roster_projections_from_legajos();
