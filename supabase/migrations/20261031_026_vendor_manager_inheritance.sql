-- A seller's manager is always inherited from their direct supervisor. This
-- removes historical manual exceptions and makes the reporting line unambiguous.
create or replace function public.preserve_manual_manager_override()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.effective_manager_source = 'manual'::public.manager_assignment_source
     and new.effective_manager_source = 'inherited'::public.manager_assignment_source
     and coalesce(current_setting('nave.allow_manual_manager_reset', true), '') <> 'true'
     and not exists (select 1 from public.hr_roles role where role.id=new.role_id and role.creates_seller_record=true) then
    new.effective_manager_staff_id := old.effective_manager_staff_id;
    new.effective_manager_source := old.effective_manager_source;
  end if;
  return new;
end;
$$;

with seller_resources as (
  select staff.id,
         coalesce(
           supervisor.effective_manager_staff_id,
           case when supervisor_role.app_role_mapping in ('gerente'::public.app_role, 'admin'::public.app_role) then supervisor.id end
         ) as inherited_manager_id
  from public.staff_members staff
  join public.hr_roles role on role.id=staff.role_id and role.creates_seller_record=true
  left join public.staff_members supervisor on supervisor.id=staff.responsible_staff_id
  left join public.hr_roles supervisor_role on supervisor_role.id=supervisor.role_id
)
update public.staff_members staff
   set effective_manager_staff_id = seller_resources.inherited_manager_id,
       effective_manager_source = 'inherited'::public.manager_assignment_source,
       updated_at = now()
  from seller_resources
 where staff.id=seller_resources.id;
