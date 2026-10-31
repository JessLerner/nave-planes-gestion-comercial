-- Rebuild derived operational tables from Legajos. This never deletes a
-- resource or historic Fox bucket: `staff_members` + `hr_roles` remains the
-- only source of who is active, who supervises and who sells.

create or replace function public.rebuild_roster_projections_from_legajos()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Every active seller inherits the manager currently assigned to the direct
  -- supervisor. Freelance/no-responsible sellers deliberately remain null.
  update public.staff_members seller
  set effective_manager_staff_id = coalesce(
        supervisor.effective_manager_staff_id,
        case when supervisor_role.app_role_mapping in ('gerente'::public.app_role, 'admin'::public.app_role) then supervisor.id end
      ),
      effective_manager_source = 'inherited'::public.manager_assignment_source,
      updated_at = now()
  from public.hr_roles seller_role
  left join public.staff_members supervisor on supervisor.id=seller.responsible_staff_id
  left join public.hr_roles supervisor_role on supervisor_role.id=supervisor.role_id
  where seller.role_id=seller_role.id
    and seller.active=true
    and seller_role.creates_seller_record=true;

  -- Team projection: one active commercial team for each active Supervisor in
  -- Legajos, with its manager copied from that supervisor's effective manager.
  update public.teams team
  set name=supervisor.full_name,
      manager_staff_id=supervisor.effective_manager_staff_id,
      active=true,
      is_sales_team=true
  from public.staff_members supervisor
  join public.hr_roles role on role.id=supervisor.role_id
  where team.supervisor_staff_id=supervisor.id
    and supervisor.active=true
    and role.app_role_mapping='supervisor'::public.app_role;

  insert into public.teams(name,supervisor_staff_id,manager_staff_id,active,is_sales_team)
  select supervisor.full_name,supervisor.id,supervisor.effective_manager_staff_id,true,true
  from public.staff_members supervisor
  join public.hr_roles role on role.id=supervisor.role_id
  where supervisor.active=true
    and role.app_role_mapping='supervisor'::public.app_role
    and not exists (select 1 from public.teams team where team.supervisor_staff_id=supervisor.id)
  on conflict (name) do update set
    supervisor_staff_id=excluded.supervisor_staff_id,
    manager_staff_id=excluded.manager_staff_id,
    active=true,
    is_sales_team=true;

  update public.teams team
  set active=false,is_sales_team=false
  where team.supervisor_staff_id is not null
    and not exists (
      select 1 from public.staff_members supervisor
      join public.hr_roles role on role.id=supervisor.role_id
      where supervisor.id=team.supervisor_staff_id and supervisor.active=true
        and role.app_role_mapping='supervisor'::public.app_role
    );

  -- Seller projection uses the direct responsible set in Legajos to locate
  -- the supervisor's team. Existing seller IDs are preserved for operations.
  update public.sellers projection
  set full_name=staff.full_name,
      team_id=team.id,
      active=true,
      dni=staff.dni,
      legajo=staff.legajo,
      employment_type=staff.employment_type
  from public.staff_members staff
  join public.hr_roles role on role.id=staff.role_id
  left join public.teams team on team.supervisor_staff_id=staff.responsible_staff_id
    and team.active=true and team.is_sales_team=true
  where projection.staff_member_id=staff.id
    and staff.active=true
    and role.creates_seller_record=true;

  insert into public.sellers(full_name,team_id,active,hire_date,dni,staff_member_id,legajo,employment_type)
  select staff.full_name,team.id,true,null,staff.dni,staff.id,staff.legajo,staff.employment_type
  from public.staff_members staff
  join public.hr_roles role on role.id=staff.role_id
  left join public.teams team on team.supervisor_staff_id=staff.responsible_staff_id
    and team.active=true and team.is_sales_team=true
  where staff.active=true
    and role.creates_seller_record=true
    and not exists (select 1 from public.sellers projection where projection.staff_member_id=staff.id)
  on conflict (staff_member_id) where staff_member_id is not null do update set
    full_name=excluded.full_name,team_id=excluded.team_id,active=true,dni=excluded.dni,
    legajo=excluded.legajo,employment_type=excluded.employment_type;

  update public.sellers projection
  set active=false,termination_date=coalesce(termination_date,current_date)
  where projection.staff_member_id is not null
    and not exists (
      select 1 from public.staff_members staff
      join public.hr_roles role on role.id=staff.role_id
      where staff.id=projection.staff_member_id and staff.active=true
        and role.creates_seller_record=true
    );
end;
$$;

select public.rebuild_roster_projections_from_legajos();
