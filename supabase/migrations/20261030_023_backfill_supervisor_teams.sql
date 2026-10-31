-- One-time reconciliation for supervisors that already existed before
-- automatic team creation was added to resource updates.

update public.teams team
set name = staff.full_name,
    manager_staff_id = staff.effective_manager_staff_id,
    active = true,
    is_sales_team = true
from public.staff_members staff
join public.hr_roles role on role.id = staff.role_id
where team.supervisor_staff_id = staff.id
  and staff.active = true
  and role.app_role_mapping = 'supervisor'::public.app_role;

insert into public.teams (name, supervisor_staff_id, manager_staff_id, active, is_sales_team)
select staff.full_name, staff.id, staff.effective_manager_staff_id, true, true
from public.staff_members staff
join public.hr_roles role on role.id = staff.role_id
where staff.active = true
  and role.app_role_mapping = 'supervisor'::public.app_role
  and not exists (
    select 1 from public.teams team where team.supervisor_staff_id = staff.id
  )
on conflict (name) do update
set supervisor_staff_id = excluded.supervisor_staff_id,
    manager_staff_id = excluded.manager_staff_id,
    active = true,
    is_sales_team = true;
