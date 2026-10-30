-- Import application runs server-side with the database connection. RLS stays
-- enabled; no browser policy is widened by this migration.
create index if not exists staff_members_effective_manager_idx
  on public.staff_members(effective_manager_staff_id);
