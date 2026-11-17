-- Correct the manager branch of the common organizational-access contract.
-- Legajos remains authoritative.  This migration does not change roster data,
-- RLS, handlers, projections, grants or the function's owner/ACL.

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

  -- auth.uid() is the only identity source. A missing session never produces
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

  -- Manager scope is exclusive: active resources belong only to their active
  -- effective manager. It deliberately has no responsible_staff_id fallback
  -- and does not add the manager's own staff record automatically. Supervisor
  -- scope remains the existing reporting-line tree; global roles remain global.
  with recursive supervisor_hierarchy as (
    select staff.id, array[staff.id]::uuid[] as path, false as cycle
    from public.staff_members staff
    where not v_global
      and v_authorized
      and v_actor.role = 'supervisor'
      and staff.id = v_actor.staff_member_id
    union all
    select child.id, supervisor_hierarchy.path || child.id, child.id = any(supervisor_hierarchy.path)
    from supervisor_hierarchy
    join public.staff_members child on child.responsible_staff_id = supervisor_hierarchy.id
    where not supervisor_hierarchy.cycle and cardinality(supervisor_hierarchy.path) < 100
  ), scoped as (
    select staff.id
    from public.staff_members staff
    where v_global and v_authorized
    union
    select staff.id
    from public.staff_members staff
    where not v_global
      and v_authorized
      and v_actor.role = 'gerente'
      and staff.active
      and staff.effective_manager_staff_id = v_actor.staff_member_id
      and exists (
        select 1
        from public.staff_members manager
        join public.hr_roles manager_role on manager_role.id = manager.role_id
        where manager.id = v_actor.staff_member_id
          and manager.active
          and manager_role.app_role_mapping = 'gerente'::public.app_role
      )
    union
    select id from supervisor_hierarchy where not cycle
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

  with recursive supervisor_hierarchy as (
    select staff.id, array[staff.id]::uuid[] as path, false as cycle
    from public.staff_members staff
    where not v_global
      and v_authorized
      and v_actor.role = 'supervisor'
      and staff.id = v_actor.staff_member_id
    union all
    select child.id, supervisor_hierarchy.path || child.id, child.id = any(supervisor_hierarchy.path)
    from supervisor_hierarchy
    join public.staff_members child on child.responsible_staff_id = supervisor_hierarchy.id
    where not supervisor_hierarchy.cycle and cardinality(supervisor_hierarchy.path) < 100
  ), scoped as (
    select staff.id from public.staff_members staff where v_global and v_authorized
    union
    select staff.id
    from public.staff_members staff
    where not v_global
      and v_authorized
      and v_actor.role = 'gerente'
      and staff.active
      and staff.effective_manager_staff_id = v_actor.staff_member_id
      and exists (
        select 1
        from public.staff_members manager
        join public.hr_roles manager_role on manager_role.id = manager.role_id
        where manager.id = v_actor.staff_member_id
          and manager.active
          and manager_role.app_role_mapping = 'gerente'::public.app_role
      )
    union
    select id from supervisor_hierarchy where not cycle
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

  if p_operation in ('advance.request', 'advance.review', 'pacing.read') then
    select jsonb_build_object('id', config.id, 'start_date', config.start_date, 'end_date', config.end_date, 'status', 'unknown')
      into v_period
    from public.monthly_config config
    where p_as_of between config.start_date and config.end_date
    order by config.start_date desc, config.id
    limit 1;
    v_period := coalesce(v_period, jsonb_build_object('id', null, 'start_date', null, 'end_date', null, 'status', 'missing'));
  end if;

  if v_actor.role = 'supervisor' and not v_global and v_authorized and v_actor.staff_member_id is not null then
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
