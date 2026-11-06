-- Local-first incorporation workflow. Legajos remains the only operational authority.
create type public.administrative_status as enum ('coaching','alta_definitiva');
create type public.incorporation_request_status as enum ('borrador','pendiente_aprobacion','observado','rechazado','autorizado');
create type public.incorporation_document_kind as enum ('dni_front','dni_back','cv','criminal_record','employment_application');
create type public.incorporation_decision as enum ('observado','rechazado','autorizado');

alter table public.staff_members add column administrative_status public.administrative_status;
alter table public.staff_members add column incorporation_authorized_at timestamptz;
alter table public.staff_members add column incorporation_authorized_by uuid references public.profiles(id) on delete set null;
update public.staff_members set administrative_status='coaching' where is_coaching or upper(coalesce(employment_type,'')) like '%COACHING%';

create table public.incorporation_requests (
 id uuid primary key default gen_random_uuid(), status public.incorporation_request_status not null default 'borrador',
 surname text not null, given_names text not null, dni text not null, birth_date date,
 role_id uuid not null references public.hr_roles(id) on delete restrict, area_id uuid not null references public.hr_areas(id) on delete restrict,
 supervisor_staff_id uuid not null references public.staff_members(id) on delete restrict,
 derived_manager_staff_id uuid references public.staff_members(id) on delete set null,
 planned_start_date date, observations text, requested_by uuid not null references public.profiles(id) on delete restrict,
 submitted_at timestamptz, reviewed_by uuid references public.profiles(id) on delete set null, reviewed_at timestamptz, review_note text,
 authorized_staff_member_id uuid unique references public.staff_members(id) on delete restrict,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check (length(regexp_replace(dni,'\\D','','g')) between 7 and 8)
);
create unique index incorporation_active_dni_unique on public.incorporation_requests ((regexp_replace(dni,'\\D','','g'))) where status in ('borrador','pendiente_aprobacion','observado');
create index incorporation_scope_idx on public.incorporation_requests(supervisor_staff_id,status,created_at desc);

create table public.incorporation_request_documents (
 id uuid primary key default gen_random_uuid(), request_id uuid not null references public.incorporation_requests(id) on delete cascade,
 document_kind public.incorporation_document_kind not null, storage_path text not null unique, original_filename text not null,
 content_type text not null, size_bytes bigint not null check(size_bytes > 0 and size_bytes <= 10485760), uploaded_by uuid not null references public.profiles(id) on delete restrict,
 uploaded_at timestamptz not null default now(), verified_by uuid references public.profiles(id) on delete set null, verified_at timestamptz,
 unique(request_id,document_kind)
);
create table public.incorporation_request_decisions (
 id uuid primary key default gen_random_uuid(), request_id uuid not null references public.incorporation_requests(id) on delete cascade,
 decision public.incorporation_decision not null, reason text, decided_by uuid not null references public.profiles(id) on delete restrict, decided_at timestamptz not null default now()
);

alter table public.incorporation_requests enable row level security;
alter table public.incorporation_request_documents enable row level security;
alter table public.incorporation_request_decisions enable row level security;
-- API endpoints enforce scope; these policies protect direct Data API access.
create policy incorporation_requests_own_read on public.incorporation_requests for select to authenticated using (requested_by=auth.uid() or public.current_app_role() in ('admin','rrhh'));
create policy incorporation_documents_own_read on public.incorporation_request_documents for select to authenticated using (exists(select 1 from public.incorporation_requests r where r.id=request_id and (r.requested_by=auth.uid() or public.current_app_role() in ('admin','rrhh'))));
create policy incorporation_decisions_own_read on public.incorporation_request_decisions for select to authenticated using (exists(select 1 from public.incorporation_requests r where r.id=request_id and (r.requested_by=auth.uid() or public.current_app_role() in ('admin','rrhh'))));

create policy incorporation_storage_upload on storage.objects for insert to authenticated with check (
 bucket_id='rrhh-legajos' and (storage.foldername(name))[1]='incorporations' and exists(select 1 from public.incorporation_requests r where r.id::text=(storage.foldername(name))[2] and r.requested_by=auth.uid())
);
create policy incorporation_storage_read on storage.objects for select to authenticated using (
 bucket_id='rrhh-legajos' and (storage.foldername(name))[1]='incorporations' and exists(select 1 from public.incorporation_requests r where r.id::text=(storage.foldername(name))[2] and (r.requested_by=auth.uid() or public.current_app_role() in ('admin','rrhh')))
);
