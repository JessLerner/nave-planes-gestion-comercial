-- Drafts are intentionally incomplete. Submission remains the validation boundary.
alter table public.incorporation_requests
  alter column surname drop not null,
  alter column given_names drop not null,
  alter column dni drop not null,
  alter column role_id drop not null,
  alter column area_id drop not null;

alter table public.incorporation_requests drop constraint if exists incorporation_requests_dni_check;
alter table public.incorporation_requests drop constraint if exists incorporation_requests_complete_when_submitted;
alter table public.incorporation_requests add constraint incorporation_requests_complete_when_submitted check (
  status in ('borrador','observado') or (
    nullif(btrim(surname),'') is not null and nullif(btrim(given_names),'') is not null
    and length(regexp_replace(coalesce(dni,''),'\D','','g')) between 7 and 8
    and birth_date is not null and role_id is not null and area_id is not null and planned_start_date is not null
  )
);

drop index if exists public.incorporation_active_dni_unique;
create unique index incorporation_active_dni_unique on public.incorporation_requests ((regexp_replace(dni,'\D','','g')))
  where status in ('pendiente_aprobacion','observado') and nullif(regexp_replace(coalesce(dni,''),'\D','','g'),'') is not null;
