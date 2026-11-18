-- Common, read-only organizational authorization context.
-- Legajos remains authoritative; teams and sellers are projections only.
-- This migration deliberately does not change roster, profiles, projections or
-- existing consumers.

do $$
begin
  if to_regclass('public.profiles') is null
    or to_regclass('public.staff_members') is null
    or to_regclass('public.hr_roles') is null
    or to_regclass('public.profile_access_permissions') is null
    or to_regclass('public.teams') is null
    or to_regclass('public.sellers') is null
    or to_regclass('public.monthly_config') is null
    or to_regprocedure('auth.uid()') is null then
    raise exception 'organizational_access_context_self requires the existing Auth, Legajos and commercial-projection foundation.';
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname='naveplan_org_access_owner') then
    create role naveplan_org_access_owner nologin nosuperuser nocreatedb nocreaterole nobypassrls noinherit;
  end if;
end $$;

-- The migration executor (postgres) receives membership in this NOLOGIN role
-- so it can create and replace the SECURITY DEFINER function. No application
-- role receives this membership.
grant naveplan_org_access_owner to postgres;
-- PostgreSQL also requires the new function owner to hold CREATE on the
-- containing schema at the moment ownership is transferred.
grant create on schema public to naveplan_org_access_owner;

grant usage on schema public, auth to naveplan_org_access_owner;
grant select on table public.profiles, public.profile_access_permissions, public.staff_members,
  public.hr_roles, public.teams, public.sellers, public.monthly_config to naveplan_org_access_owner;
grant execute on function auth.uid() to naveplan_org_access_owner;

-- This NOLOGIN role can only reach these rows while executing the tightly
-- scoped function below. It owns no table; only postgres has membership for
-- migration administration.
do $$ begin
  create policy organizational_access_owner_profiles_read on public.profiles for select to naveplan_org_access_owner using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy organizational_access_owner_permissions_read on public.profile_access_permissions for select to naveplan_org_access_owner using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy organizational_access_owner_staff_read on public.staff_members for select to naveplan_org_access_owner using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy organizational_access_owner_roles_read on public.hr_roles for select to naveplan_org_access_owner using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy organizational_access_owner_teams_read on public.teams for select to naveplan_org_access_owner using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy organizational_access_owner_sellers_read on public.sellers for select to naveplan_org_access_owner using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy organizational_access_owner_config_read on public.monthly_config for select to naveplan_org_access_owner using (true);
exception when duplicate_object then null; end $$;

create or replace function public.organizational_access_context_self(
  p_operation text,
  p_as_of date default current_date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_actor record;
  v_capabilities text[] := '{}'::text[];
  v_authorized boolean := false;
  v_global boolean := false;
  v_scope jsonb := jsonb_build_object('staff_ids', '[]'::jsonb, 'supervisor_ids', '[]'::jsonb, 'team_ids', '[]'::jsonb, 'includes_all_active_staff', false);
  v_staff_ids jsonb := '[]'::jsonb;
  v_supervisor_ids jsonb := '[]'::jsonb;
  v_team_ids jsonb := '[]'::jsonb;
  v_resources jsonb := '[]'::jsonb;
  v_period jsonb := jsonb_build_object('id', null, 'start_date', null, 'end_date', null, 'status', 'missing');
  v_cycle_detected boolean := false;
  v_inconsistent_reference_detected boolean := false;
begin
  if p_operation not in (
    'legajos.read', 'legajos.manage', 'account.invite', 'departure.report',
    'departure.review', 'advance.request', 'advance.review', 'pacing.read', 'etl.manage'
  ) then
    raise exception using errcode = '22023', message = 'Unsupported organizational operation.';
  end if;

  -- auth.uid() is the only identity source.  A missing session never produces
  -- a roster, aggregate or out-of-scope identifier.
  if v_user_id is null then
    return jsonb_build_object(
      'actor', null, 'authorized', false, 'effective_at', p_as_of,
      'scope', v_scope, 'resources', v_resources, 'period', v_period,
      'integrity', jsonb_build_object('hierarchy_cycle_detected', false, 'inconsistent_reference_detected', false)
    );
  end if;

  select profile.id, profile.role::text as role, profile.staff_member_id
    into v_actor
  from public.profiles profile
  where profile.id = v_user_id;

  if not found then
    return jsonb_build_object(
      'actor', jsonb_build_object('user_id', v_user_id, 'profile_id', null, 'staff_member_id', null, 'role', null, 'capabilities', '[]'::jsonb, 'global', false),
      'authorized', false, 'effective_at', p_as_of,
      'scope', v_scope, 'resources', v_resources, 'period', v_period,
      'integrity', jsonb_build_object('hierarchy_cycle_detected', false, 'inconsistent_reference_detected', false)
    );
  end if;

  select coalesce(array_agg(permission.capability order by permission.capability), '{}'::text[])
    into v_capabilities
  from public.profile_access_permissions permission
  where permission.profile_id = v_user_id;

  v_global := v_actor.role in ('admin', 'rrhh');
  v_authorized := case p_operation
    when 'etl.manage' then v_actor.role = 'admin'
    when 'legajos.read' then v_global or (v_actor.role in ('gerente', 'supervisor') and v_actor.staff_member_id is not null) or (v_actor.role = 'administrativo' and 'view_legajos' = any(v_capabilities))
    when 'legajos.manage' then v_actor.role in ('admin', 'rrhh') or (v_actor.role = 'gerente' and v_actor.staff_member_id is not null) or (v_actor.role = 'administrativo' and 'manage_legajos' = any(v_capabilities))
    when 'account.invite' then v_actor.role in ('admin', 'rrhh') or (v_actor.role = 'gerente' and v_actor.staff_member_id is not null)
    when 'departure.report' then v_actor.role in ('admin', 'rrhh', 'gerente', 'supervisor') and v_actor.staff_member_id is not null
    when 'departure.review' then v_actor.role in ('admin', 'rrhh', 'gerente') and (v_actor.role <> 'gerente' or v_actor.staff_member_id is not null)
    when 'advance.request' then v_actor.role = 'supervisor' and v_actor.staff_member_id is not null
    when 'advance.review' then v_actor.role in ('admin', 'gerente') and (v_actor.role <> 'gerente' or v_actor.staff_member_id is not null)
    when 'pacing.read' then v_actor.role in ('admin', 'rrhh', 'gerente', 'supervisor') and (v_actor.role in ('admin', 'rrhh') or v_actor.staff_member_id is not null)
    else false
  end;

  -- A manager/supervisor only receives its descendant tree.  path prevents a
  -- malformed cycle from expanding the result forever.  Global roles may read
  -- the minimum structural projection for all staff, including inactive ones.
  with recursive hierarchy as (
    select staff.id, array[staff.id]::uuid[] as path, false as cycle
    from public.staff_members staff
    where not v_global and v_authorized and staff.id = v_actor.staff_member_id
    union all
    select child.id, hierarchy.path || child.id, child.id = any(hierarchy.path)
    from hierarchy
    join public.staff_members child on child.responsible_staff_id = hierarchy.id
    where not hierarchy.cycle and cardinality(hierarchy.path) < 100
  ), scoped as (
    select staff.id
    from public.staff_members staff
    where v_global and v_authorized
    union
    select id from hierarchy where not cycle
  )
  select
    coalesce(jsonb_agg(id order by id), '[]'::jsonb),
    coalesce(jsonb_agg(id order by id) filter (where role_mapping = 'supervisor'), '[]'::jsonb),
    coalesce(jsonb_agg(team_id order by team_id) filter (where team_id is not null), '[]'::jsonb)
  into v_staff_ids, v_supervisor_ids, v_team_ids
  from (
    select staff.id, role.app_role_mapping::text as role_mapping,
      (select team.id from public.teams team where team.supervisor_staff_id = staff.id and team.active and team.is_sales_team order by team.created_at, team.id limit 1) as team_id
    from public.staff_members staff
    join scoped on scoped.id = staff.id
    left join public.hr_roles role on role.id = staff.role_id
  ) scope_rows;

  v_scope := jsonb_build_object(
    'staff_ids', v_staff_ids,
    'supervisor_ids', v_supervisor_ids,
    'team_ids', v_team_ids,
    'includes_all_active_staff', v_global and v_authorized
  );

  with recursive hierarchy as (
    select staff.id, array[staff.id]::uuid[] as path, false as cycle
    from public.staff_members staff
    where not v_global and v_authorized and staff.id = v_actor.staff_member_id
    union all
    select child.id, hierarchy.path || child.id, child.id = any(hierarchy.path)
    from hierarchy
    join public.staff_members child on child.responsible_staff_id = hierarchy.id
    where not hierarchy.cycle and cardinality(hierarchy.path) < 100
  ), scoped as (
    select staff.id from public.staff_members staff where v_global and v_authorized
    union select id from hierarchy where not cycle
  ), resource_rows as (
    select staff.id as staff_id, staff.active, role.app_role_mapping::text as role_mapping,
      staff.responsible_staff_id, staff.effective_manager_staff_id,
      (select team.id from public.teams team where team.supervisor_staff_id = staff.id and team.active and team.is_sales_team order by team.created_at, team.id limit 1) as team_id,
      (select seller.id from public.sellers seller where seller.staff_member_id = staff.id and seller.active order by seller.created_at, seller.id limit 1) as seller_id,
      exists(select 1 from public.profiles profile where profile.staff_member_id = staff.id) as has_profile,
      coalesce(role.grants_global_admin, false) as grants_global_admin,
      (staff.effective_manager_staff_id is not null and not exists(select 1 from public.staff_members manager where manager.id = staff.effective_manager_staff_id and manager.active)) as bad_manager_reference
    from public.staff_members staff
    join scoped on scoped.id = staff.id
    left join public.hr_roles role on role.id = staff.role_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'staff_id', staff_id,
    'active', active,
    'role_mapping', role_mapping,
    'responsible_staff_id', responsible_staff_id,
    'effective_manager_staff_id', effective_manager_staff_id,
    'team_id', team_id,
    'seller_id', seller_id,
    'organizational_eligible', case
      when not active then false
      when role_mapping is null then false
      when p_operation = 'account.invite' and has_profile then false
      when p_operation = 'account.invite' and role_mapping = 'admin' and not grants_global_admin then false
      else true end,
    'organizational_exclusion_reasons', to_jsonb(array_remove(array[
      case when not active then 'inactive' end,
      case when role_mapping is null then 'missing_role_mapping' end,
      case when p_operation = 'account.invite' and has_profile then 'already_has_profile' end,
      case when p_operation = 'account.invite' and role_mapping = 'admin' and not grants_global_admin then 'role_not_allowed_for_operation' end,
      case when active and role_mapping = 'supervisor' and team_id is null then 'missing_team_projection' end,
      case when active and role_mapping is not null and seller_id is null and p_operation in ('advance.request', 'advance.review') then 'missing_seller_projection' end
    ]::text[], null))
  ) order by staff_id), '[]'::jsonb), coalesce(bool_or(bad_manager_reference), false)
  into v_resources, v_inconsistent_reference_detected
  from resource_rows;

  -- A calendar range has no administrative open/closed evidence in the current
  -- schema.  Return unknown rather than inferring an approval state.
  if p_operation in ('advance.request', 'advance.review', 'pacing.read') then
    select jsonb_build_object('id', config.id, 'start_date', config.start_date, 'end_date', config.end_date, 'status', 'unknown')
      into v_period
    from public.monthly_config config
    where p_as_of between config.start_date and config.end_date
    order by config.start_date desc, config.id
    limit 1;
    v_period := coalesce(v_period, jsonb_build_object('id', null, 'start_date', null, 'end_date', null, 'status', 'missing'));
  end if;

  if not v_global and v_authorized and v_actor.staff_member_id is not null then
    with recursive hierarchy as (
      select staff.id, array[staff.id]::uuid[] as path, false as cycle
      from public.staff_members staff where staff.id = v_actor.staff_member_id
      union all
      select child.id, hierarchy.path || child.id, child.id = any(hierarchy.path)
      from hierarchy join public.staff_members child on child.responsible_staff_id = hierarchy.id
      where not hierarchy.cycle and cardinality(hierarchy.path) < 100
    )
    select exists(select 1 from hierarchy where cycle) into v_cycle_detected;
  end if;

  return jsonb_build_object(
    'actor', jsonb_build_object('user_id', v_user_id, 'profile_id', v_actor.id, 'staff_member_id', v_actor.staff_member_id, 'role', v_actor.role, 'capabilities', to_jsonb(v_capabilities), 'global', v_global),
    'authorized', v_authorized,
    'effective_at', p_as_of,
    'scope', v_scope,
    'resources', case when v_authorized then v_resources else '[]'::jsonb end,
    'period', v_period,
    'integrity', jsonb_build_object('hierarchy_cycle_detected', v_cycle_detected, 'inconsistent_reference_detected', v_inconsistent_reference_detected)
  );
end;
$$;

alter function public.organizational_access_context_self(text, date) owner to naveplan_org_access_owner;
revoke create on schema public from naveplan_org_access_owner;

revoke all on function public.organizational_access_context_self(text, date) from public;
revoke all on function public.organizational_access_context_self(text, date) from anon;
revoke all on function public.organizational_access_context_self(text, date) from service_role;
grant execute on function public.organizational_access_context_self(text, date) to authenticated;
