-- Notice and review workflow only. It deliberately does not change Legajos,
-- commercial projections, FoxCRM, objectives, sales or staff_members.active.
create type public.staff_departure_notice_status as enum ('PENDIENTE_REVISION','OBSERVADO','CONFIRMADO','CANCELADO');
create type public.staff_departure_notice_reason as enum ('RENUNCIA','DESVINCULACION_EMPRESA','ABANDONO_INFORMADO','FINALIZACION_CONTRATO','OTRO');
create type public.staff_departure_notice_decision as enum ('OBSERVADO','CONFIRMADO','CANCELADO');

create table public.staff_departure_notices (
  id uuid primary key default gen_random_uuid(),
  staff_member_id uuid not null references public.staff_members(id) on delete restrict,
  supervisor_staff_id uuid not null references public.staff_members(id) on delete restrict,
  manager_staff_id uuid references public.staff_members(id) on delete set null,
  status public.staff_departure_notice_status not null default 'PENDIENTE_REVISION',
  reason public.staff_departure_notice_reason not null,
  reported_departure_date date not null,
  received_at timestamptz not null default now(),
  observations text,
  episode_number integer not null default 1 check (episode_number > 0),
  administrative_justification text,
  reported_by uuid not null references public.profiles(id) on delete restrict,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (episode_number = 1 or nullif(btrim(administrative_justification),'') is not null),
  unique (staff_member_id, episode_number)
);
create index staff_departure_notices_inbox_idx on public.staff_departure_notices(status,created_at desc);
create index staff_departure_notices_scope_idx on public.staff_departure_notices(supervisor_staff_id,manager_staff_id,created_at desc);

create table public.staff_departure_notice_documents (
  id uuid primary key default gen_random_uuid(), notice_id uuid not null references public.staff_departure_notices(id) on delete cascade,
  storage_path text not null unique, original_filename text not null, content_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760), uploaded_by uuid not null references public.profiles(id) on delete restrict,
  uploaded_at timestamptz not null default now(), unique(notice_id)
);
create table public.staff_departure_notice_decisions (
  id uuid primary key default gen_random_uuid(), notice_id uuid not null references public.staff_departure_notices(id) on delete cascade,
  decision public.staff_departure_notice_decision not null, reason text not null, decided_by uuid not null references public.profiles(id) on delete restrict,
  decided_at timestamptz not null default now()
);

create or replace function public.can_access_departure_notice(supervisor_id uuid, reporter_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select reporter_id=auth.uid() or public.current_app_role() in ('admin','rrhh') or (public.current_app_role()='gerente' and supervisor_id in (
    with recursive hierarchy as (select staff_member_id as id from public.profiles where id=auth.uid() union select child.id from public.staff_members child join hierarchy parent on child.responsible_staff_id=parent.id) select id from hierarchy
  ))
$$;

alter table public.staff_departure_notices enable row level security;
alter table public.staff_departure_notice_documents enable row level security;
alter table public.staff_departure_notice_decisions enable row level security;
create policy departure_notices_scoped_read on public.staff_departure_notices for select to authenticated using (public.can_access_departure_notice(supervisor_staff_id,reported_by));
create policy departure_documents_scoped_read on public.staff_departure_notice_documents for select to authenticated using (exists(select 1 from public.staff_departure_notices n where n.id=notice_id and public.can_access_departure_notice(n.supervisor_staff_id,n.reported_by)));
create policy departure_decisions_scoped_read on public.staff_departure_notice_decisions for select to authenticated using (exists(select 1 from public.staff_departure_notices n where n.id=notice_id and public.can_access_departure_notice(n.supervisor_staff_id,n.reported_by)));
create policy departure_storage_upload on storage.objects for insert to authenticated with check (bucket_id='rrhh-legajos' and (storage.foldername(name))[1]='departures' and exists(select 1 from public.staff_departure_notices n where n.id::text=(storage.foldername(name))[2] and n.reported_by=auth.uid() and n.status in ('PENDIENTE_REVISION','OBSERVADO')));
create policy departure_storage_scoped_read on storage.objects for select to authenticated using (bucket_id='rrhh-legajos' and (storage.foldername(name))[1]='departures' and exists(select 1 from public.staff_departure_notices n where n.id::text=(storage.foldername(name))[2] and public.can_access_departure_notice(n.supervisor_staff_id,n.reported_by)));
