-- A manual manager assignment is authoritative. Imports or hierarchy rebuilds
-- may refresh inherited relationships, but they must not erase an exception
-- deliberately set from the Legajos record.
create or replace function public.preserve_manual_manager_override()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.effective_manager_source = 'manual'::public.manager_assignment_source
     and new.effective_manager_source = 'inherited'::public.manager_assignment_source
     and coalesce(current_setting('nave.allow_manual_manager_reset', true), '') <> 'true' then
    new.effective_manager_staff_id := old.effective_manager_staff_id;
    new.effective_manager_source := old.effective_manager_source;
  end if;
  return new;
end;
$$;

drop trigger if exists staff_members_preserve_manual_manager_override on public.staff_members;
create trigger staff_members_preserve_manual_manager_override
before update of effective_manager_staff_id, effective_manager_source on public.staff_members
for each row execute function public.preserve_manual_manager_override();
