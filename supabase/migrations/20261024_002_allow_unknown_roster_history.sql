-- Initial roster import from App Control Operaciones.
-- The source table does not contain branch or hire date; do not fabricate them.
alter table public.teams alter column branch drop not null;
alter table public.sellers alter column hire_date drop not null;
