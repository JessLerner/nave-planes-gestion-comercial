-- Production-safe Sprint 5 reconciliation.
-- This migration is deliberately independent of the incomplete remote migration ledger.
-- It does not rebuild Legajos, teams, sellers, historical data or unrelated policies.

do $$
begin
  if to_regclass('public.staff_members') is null
    or to_regclass('public.profiles') is null
    or to_regclass('public.hr_areas') is null
    or to_regclass('public.hr_roles') is null
    or to_regclass('storage.objects') is null
    or to_regprocedure('public.current_app_role()') is null then
    raise exception 'Sprint 5 reconciliation aborted: the required Legajos, profile, role, storage or scope foundation is missing.';
  end if;

  if exists (
    select 1
    from (values
      ('staff_members', 'id'), ('staff_members', 'active'), ('staff_members', 'is_coaching'),
      ('staff_members', 'employment_type'), ('staff_members', 'role_id'),
      ('staff_members', 'responsible_staff_id'), ('staff_members', 'effective_manager_staff_id'),
      ('profiles', 'id'), ('profiles', 'role'), ('profiles', 'staff_member_id'),
      ('hr_roles', 'id'), ('hr_roles', 'area_id'), ('hr_roles', 'active')
    ) required(table_name, column_name)
    where not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = required.table_name
        and c.column_name = required.column_name
    )
  ) then
    raise exception 'Sprint 5 reconciliation aborted: the observed Legajos schema is incompatible.';
  end if;
end $$;

do $$ begin create type public.administrative_status as enum ('coaching','alta_definitiva'); exception when duplicate_object then null; end $$;
do $$ begin create type public.incorporation_request_status as enum ('borrador','pendiente_aprobacion','observado','rechazado','autorizado'); exception when duplicate_object then null; end $$;
do $$ begin create type public.incorporation_document_kind as enum ('dni_front','dni_back','cv','criminal_record','employment_application'); exception when duplicate_object then null; end $$;
do $$ begin create type public.incorporation_decision as enum ('observado','rechazado','autorizado'); exception when duplicate_object then null; end $$;
do $$ begin create type public.incorporation_entry_mode as enum ('supervisor_request','rrhh_direct'); exception when duplicate_object then null; end $$;
do $$ begin create type public.staff_departure_notice_status as enum ('PENDIENTE_REVISION','OBSERVADO','CONFIRMADO','CANCELADO'); exception when duplicate_object then null; end $$;
do $$ begin create type public.staff_departure_notice_reason as enum ('RENUNCIA','DESVINCULACION_EMPRESA','ABANDONO_INFORMADO','FINALIZACION_CONTRATO','OTRO'); exception when duplicate_object then null; end $$;
do $$ begin create type public.staff_departure_notice_decision as enum ('OBSERVADO','CONFIRMADO','CANCELADO'); exception when duplicate_object then null; end $$;

alter table public.staff_members add column if not exists administrative_status public.administrative_status;
alter table public.staff_members add column if not exists incorporation_authorized_at timestamptz;
alter table public.staff_members add column if not exists incorporation_authorized_by uuid references public.profiles(id) on delete set null;
update public.staff_members
set administrative_status = 'coaching'
where administrative_status is null and (is_coaching or upper(coalesce(employment_type,'')) like '%COACHING%');

create table if not exists public.incorporation_requests (
  id uuid primary key default gen_random_uuid(),
  status public.incorporation_request_status not null default 'borrador',
  surname text, given_names text, dni text, birth_date date,
  role_id uuid references public.hr_roles(id) on delete restrict,
  area_id uuid references public.hr_areas(id) on delete restrict,
  supervisor_staff_id uuid not null references public.staff_members(id) on delete restrict,
  derived_manager_staff_id uuid references public.staff_members(id) on delete set null,
  planned_start_date date, observations text, requested_by uuid not null references public.profiles(id) on delete restrict,
  submitted_at timestamptz, reviewed_by uuid references public.profiles(id) on delete set null, reviewed_at timestamptz, review_note text,
  authorized_staff_member_id uuid unique references public.staff_members(id) on delete restrict,
  entry_mode public.incorporation_entry_mode not null default 'supervisor_request',
  direct_registered_by uuid references public.profiles(id) on delete set null,
  direct_registered_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.incorporation_requests add column if not exists entry_mode public.incorporation_entry_mode not null default 'supervisor_request';
alter table public.incorporation_requests add column if not exists direct_registered_by uuid references public.profiles(id) on delete set null;
alter table public.incorporation_requests add column if not exists direct_registered_at timestamptz;
alter table public.incorporation_requests drop constraint if exists incorporation_requests_dni_check;
alter table public.incorporation_requests drop constraint if exists incorporation_requests_complete_when_submitted;
alter table public.incorporation_requests add constraint incorporation_requests_complete_when_submitted check (
  status in ('borrador','observado') or (
    nullif(btrim(surname),'') is not null and nullif(btrim(given_names),'') is not null
    and length(regexp_replace(coalesce(dni,''),'\D','','g')) between 7 and 8
    and birth_date is not null and role_id is not null and area_id is not null and planned_start_date is not null
  )
);
alter table public.incorporation_requests drop constraint if exists incorporation_direct_registration_audit;
alter table public.incorporation_requests add constraint incorporation_direct_registration_audit check (
  entry_mode <> 'rrhh_direct' or (direct_registered_by is not null and direct_registered_at is not null)
);
drop index if exists public.incorporation_active_dni_unique;
create unique index incorporation_active_dni_unique on public.incorporation_requests ((regexp_replace(dni,'\D','','g')))
  where status in ('pendiente_aprobacion','observado') and nullif(regexp_replace(coalesce(dni,''),'\D','','g'),'') is not null;
create index if not exists incorporation_scope_idx on public.incorporation_requests(supervisor_staff_id,status,created_at desc);

create table if not exists public.incorporation_request_documents (
  id uuid primary key default gen_random_uuid(), request_id uuid not null references public.incorporation_requests(id) on delete cascade,
  document_kind public.incorporation_document_kind not null, storage_path text not null unique, original_filename text not null,
  content_type text not null, size_bytes bigint not null check(size_bytes > 0 and size_bytes <= 10485760), uploaded_by uuid not null references public.profiles(id) on delete restrict,
  uploaded_at timestamptz not null default now(), verified_by uuid references public.profiles(id) on delete set null, verified_at timestamptz,
  unique(request_id,document_kind)
);
create table if not exists public.incorporation_request_decisions (
  id uuid primary key default gen_random_uuid(), request_id uuid not null references public.incorporation_requests(id) on delete cascade,
  decision public.incorporation_decision not null, reason text, decided_by uuid not null references public.profiles(id) on delete restrict, decided_at timestamptz not null default now()
);
create table if not exists public.incorporation_request_audit (
  id uuid primary key default gen_random_uuid(), request_id uuid,
  event_type text not null check(event_type in ('draft_deleted','rrhh_direct_authorized')),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  occurred_at timestamptz not null default now(), metadata jsonb not null default '{}'::jsonb
);

alter table public.incorporation_requests enable row level security;
alter table public.incorporation_request_documents enable row level security;
alter table public.incorporation_request_decisions enable row level security;
alter table public.incorporation_request_audit enable row level security;

create or replace function public.can_access_incorporation(supervisor_id uuid, requester_id uuid, request_status public.incorporation_request_status)
returns boolean language sql stable security definer set search_path = public as $$
  select requester_id = auth.uid() or (
    request_status <> 'borrador' and (
      public.current_app_role() in ('admin','rrhh') or
      (public.current_app_role()='gerente' and supervisor_id in (
        with recursive hierarchy as (
          select staff_member_id as id from public.profiles where id=auth.uid()
          union select child.id from public.staff_members child join hierarchy parent on child.responsible_staff_id=parent.id
        ) select id from hierarchy
      ))
    )
  )
$$;

drop policy if exists incorporation_requests_own_read on public.incorporation_requests;
drop policy if exists incorporation_requests_scoped_read on public.incorporation_requests;
drop policy if exists incorporation_requests_private_drafts_read on public.incorporation_requests;
drop policy if exists incorporation_documents_own_read on public.incorporation_request_documents;
drop policy if exists incorporation_documents_scoped_read on public.incorporation_request_documents;
drop policy if exists incorporation_documents_private_drafts_read on public.incorporation_request_documents;
drop policy if exists incorporation_decisions_own_read on public.incorporation_request_decisions;
drop policy if exists incorporation_decisions_scoped_read on public.incorporation_request_decisions;
drop policy if exists incorporation_decisions_private_drafts_read on public.incorporation_request_decisions;
drop policy if exists incorporation_storage_upload on storage.objects;
drop policy if exists incorporation_storage_read on storage.objects;
drop policy if exists incorporation_storage_scoped_read on storage.objects;
drop policy if exists incorporation_storage_private_drafts_read on storage.objects;
drop policy if exists incorporation_storage_owner_draft_delete on storage.objects;
drop policy if exists incorporation_audit_owner_read on public.incorporation_request_audit;
create policy incorporation_requests_private_drafts_read on public.incorporation_requests for select to authenticated using (public.can_access_incorporation(supervisor_staff_id,requested_by,status));
create policy incorporation_documents_private_drafts_read on public.incorporation_request_documents for select to authenticated using (exists(select 1 from public.incorporation_requests r where r.id=request_id and public.can_access_incorporation(r.supervisor_staff_id,r.requested_by,r.status)));
create policy incorporation_decisions_private_drafts_read on public.incorporation_request_decisions for select to authenticated using (exists(select 1 from public.incorporation_requests r where r.id=request_id and public.can_access_incorporation(r.supervisor_staff_id,r.requested_by,r.status)));
create policy incorporation_storage_upload on storage.objects for insert to authenticated with check (bucket_id='rrhh-legajos' and (storage.foldername(name))[1]='incorporations' and exists(select 1 from public.incorporation_requests r where r.id::text=(storage.foldername(name))[2] and r.requested_by=auth.uid()));
create policy incorporation_storage_private_drafts_read on storage.objects for select to authenticated using (bucket_id='rrhh-legajos' and (storage.foldername(name))[1]='incorporations' and exists(select 1 from public.incorporation_requests r where r.id::text=(storage.foldername(name))[2] and public.can_access_incorporation(r.supervisor_staff_id,r.requested_by,r.status)));
create policy incorporation_storage_owner_draft_delete on storage.objects for delete to authenticated using (bucket_id='rrhh-legajos' and (storage.foldername(name))[1]='incorporations' and exists(select 1 from public.incorporation_requests r where r.id::text=(storage.foldername(name))[2] and r.requested_by=auth.uid() and r.status='borrador'));
create policy incorporation_audit_owner_read on public.incorporation_request_audit for select to authenticated using (actor_id=auth.uid() or public.current_app_role() in ('admin','rrhh'));

create table if not exists public.staff_departure_notices (
  id uuid primary key default gen_random_uuid(), staff_member_id uuid not null references public.staff_members(id) on delete restrict,
  supervisor_staff_id uuid not null references public.staff_members(id) on delete restrict, manager_staff_id uuid references public.staff_members(id) on delete set null,
  status public.staff_departure_notice_status not null default 'PENDIENTE_REVISION', reason public.staff_departure_notice_reason not null,
  reported_departure_date date not null, received_at timestamptz not null default now(), observations text,
  episode_number integer not null default 1 check (episode_number > 0), administrative_justification text,
  reported_by uuid not null references public.profiles(id) on delete restrict, reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz, review_note text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (episode_number = 1 or nullif(btrim(administrative_justification),'') is not null), unique (staff_member_id, episode_number)
);
create index if not exists staff_departure_notices_inbox_idx on public.staff_departure_notices(status,created_at desc);
create index if not exists staff_departure_notices_scope_idx on public.staff_departure_notices(supervisor_staff_id,manager_staff_id,created_at desc);
create table if not exists public.staff_departure_notice_documents (
  id uuid primary key default gen_random_uuid(), notice_id uuid not null references public.staff_departure_notices(id) on delete cascade,
  storage_path text not null unique, original_filename text not null, content_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760), uploaded_by uuid not null references public.profiles(id) on delete restrict,
  uploaded_at timestamptz not null default now(), unique(notice_id)
);
create table if not exists public.staff_departure_notice_decisions (
  id uuid primary key default gen_random_uuid(), notice_id uuid not null references public.staff_departure_notices(id) on delete cascade,
  decision public.staff_departure_notice_decision not null, reason text not null, decided_by uuid not null references public.profiles(id) on delete restrict,
  decided_at timestamptz not null default now()
);
alter table public.staff_departure_notices enable row level security;
alter table public.staff_departure_notice_documents enable row level security;
alter table public.staff_departure_notice_decisions enable row level security;
create or replace function public.can_access_departure_notice(supervisor_id uuid, reporter_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select reporter_id=auth.uid() or public.current_app_role() in ('admin','rrhh') or (public.current_app_role()='gerente' and supervisor_id in (
    with recursive hierarchy as (select staff_member_id as id from public.profiles where id=auth.uid() union select child.id from public.staff_members child join hierarchy parent on child.responsible_staff_id=parent.id) select id from hierarchy
  ))
$$;
drop policy if exists departure_notices_scoped_read on public.staff_departure_notices;
drop policy if exists departure_documents_scoped_read on public.staff_departure_notice_documents;
drop policy if exists departure_decisions_scoped_read on public.staff_departure_notice_decisions;
drop policy if exists departure_storage_upload on storage.objects;
drop policy if exists departure_storage_scoped_read on storage.objects;
create policy departure_notices_scoped_read on public.staff_departure_notices for select to authenticated using (public.can_access_departure_notice(supervisor_staff_id,reported_by));
create policy departure_documents_scoped_read on public.staff_departure_notice_documents for select to authenticated using (exists(select 1 from public.staff_departure_notices n where n.id=notice_id and public.can_access_departure_notice(n.supervisor_staff_id,n.reported_by)));
create policy departure_decisions_scoped_read on public.staff_departure_notice_decisions for select to authenticated using (exists(select 1 from public.staff_departure_notices n where n.id=notice_id and public.can_access_departure_notice(n.supervisor_staff_id,n.reported_by)));
create policy departure_storage_upload on storage.objects for insert to authenticated with check (bucket_id='rrhh-legajos' and (storage.foldername(name))[1]='departures' and exists(select 1 from public.staff_departure_notices n where n.id::text=(storage.foldername(name))[2] and n.reported_by=auth.uid() and n.status in ('PENDIENTE_REVISION','OBSERVADO')));
create policy departure_storage_scoped_read on storage.objects for select to authenticated using (bucket_id='rrhh-legajos' and (storage.foldername(name))[1]='departures' and exists(select 1 from public.staff_departure_notices n where n.id::text=(storage.foldername(name))[2] and public.can_access_departure_notice(n.supervisor_staff_id,n.reported_by)));
