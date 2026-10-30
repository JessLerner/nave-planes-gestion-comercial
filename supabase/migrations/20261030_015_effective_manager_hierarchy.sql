-- Every commercial resource keeps its effective manager for permissions and
-- temporary supervisor vacancies. Values inherited from a supervisor can be
-- safely propagated; manual exceptions are never overwritten.

do $$ begin
  create type public.manager_assignment_source as enum ('inherited', 'manual');
exception when duplicate_object then null;
end $$;

alter table public.staff_members
  add column if not exists effective_manager_staff_id uuid references public.staff_members(id) on delete set null,
  add column if not exists effective_manager_source public.manager_assignment_source not null default 'inherited';

create index if not exists staff_members_effective_manager_idx
  on public.staff_members(effective_manager_staff_id, active);

-- One transaction changes the manager of a supervisor and of every descendant
-- whose manager is inherited. Manual manager assignments remain untouched.
create or replace function public.set_supervisor_effective_manager(
  p_supervisor uuid,
  p_manager uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_supervisor is null then raise exception 'Supervisor requerido'; end if;
  if p_manager = p_supervisor then raise exception 'Una persona no puede ser su propio gerente'; end if;

  with recursive descendants as (
    select id from public.staff_members where id = p_supervisor
    union all
    select child.id from public.staff_members child
    join descendants parent on child.responsible_staff_id = parent.id
  )
  update public.staff_members resource
     set effective_manager_staff_id = p_manager,
         effective_manager_source = 'inherited',
         updated_at = now()
   where resource.id in (select id from descendants)
     and (resource.id = p_supervisor or resource.effective_manager_source = 'inherited');
end;
$$;

create or replace function public.set_resource_manual_manager(
  p_resource uuid,
  p_manager uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_resource = p_manager then raise exception 'Una persona no puede ser su propio gerente'; end if;
  update public.staff_members
     set effective_manager_staff_id = p_manager,
         effective_manager_source = 'manual',
         updated_at = now()
   where id = p_resource;
end;
$$;
