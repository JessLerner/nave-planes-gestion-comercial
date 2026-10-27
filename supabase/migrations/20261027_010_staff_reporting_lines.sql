-- The workforce record, not a dashboard card, is the master of the hierarchy.
-- A resource may report directly to a supervisor and a manager independently
-- of the historical commercial team used by sales reporting.
alter table public.staff_members
  add column if not exists supervisor_staff_id uuid references public.staff_members(id) on delete set null,
  add column if not exists manager_staff_id uuid references public.staff_members(id) on delete set null;

create index if not exists staff_members_supervisor_staff_id_idx
  on public.staff_members (supervisor_staff_id);
create index if not exists staff_members_manager_staff_id_idx
  on public.staff_members (manager_staff_id);
