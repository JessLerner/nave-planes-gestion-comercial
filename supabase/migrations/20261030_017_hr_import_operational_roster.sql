-- The HR catalogue, rather than application code, determines which role is
-- represented as a commercial seller. This keeps the importer reusable when
-- an organisation renames or adds roles.
alter table public.hr_roles
  add column if not exists creates_seller_record boolean not null default false;

update public.hr_roles
set creates_seller_record = true
where lower(name) = 'vendedor';

-- Freelance sellers are valid commercial resources without a sales team.
alter table public.sellers
  alter column team_id drop not null;

-- A sales team may be created before a branch is configured.
alter table public.teams
  alter column branch drop not null;
