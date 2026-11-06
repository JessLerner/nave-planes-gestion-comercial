-- Sprint 5: private drafts, auditable HR direct registrations and safe draft cleanup.
create type public.incorporation_entry_mode as enum ('supervisor_request','rrhh_direct');

alter table public.incorporation_requests
  add column entry_mode public.incorporation_entry_mode not null default 'supervisor_request',
  add column direct_registered_by uuid references public.profiles(id) on delete set null,
  add column direct_registered_at timestamptz;

alter table public.incorporation_requests add constraint incorporation_direct_registration_audit check (
  entry_mode <> 'rrhh_direct' or (direct_registered_by is not null and direct_registered_at is not null)
);

create table public.incorporation_request_audit (
  id uuid primary key default gen_random_uuid(),
  request_id uuid,
  event_type text not null check(event_type in ('draft_deleted','rrhh_direct_authorized')),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
alter table public.incorporation_request_audit enable row level security;
create policy incorporation_audit_owner_read on public.incorporation_request_audit for select to authenticated using (actor_id=auth.uid() or public.current_app_role() in ('admin','rrhh'));

-- Drafts have no reviewer visibility. Submitted requests retain the existing scoped access.
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
drop policy if exists incorporation_requests_scoped_read on public.incorporation_requests;
drop policy if exists incorporation_documents_scoped_read on public.incorporation_request_documents;
drop policy if exists incorporation_decisions_scoped_read on public.incorporation_request_decisions;
drop policy if exists incorporation_storage_scoped_read on storage.objects;
create policy incorporation_requests_private_drafts_read on public.incorporation_requests for select to authenticated using (public.can_access_incorporation(supervisor_staff_id,requested_by,status));
create policy incorporation_documents_private_drafts_read on public.incorporation_request_documents for select to authenticated using (exists(select 1 from public.incorporation_requests r where r.id=request_id and public.can_access_incorporation(r.supervisor_staff_id,r.requested_by,r.status)));
create policy incorporation_decisions_private_drafts_read on public.incorporation_request_decisions for select to authenticated using (exists(select 1 from public.incorporation_requests r where r.id=request_id and public.can_access_incorporation(r.supervisor_staff_id,r.requested_by,r.status)));
create policy incorporation_storage_private_drafts_read on storage.objects for select to authenticated using (bucket_id='rrhh-legajos' and (storage.foldername(name))[1]='incorporations' and exists(select 1 from public.incorporation_requests r where r.id::text=(storage.foldername(name))[2] and public.can_access_incorporation(r.supervisor_staff_id,r.requested_by,r.status)));
create policy incorporation_storage_owner_draft_delete on storage.objects for delete to authenticated using (bucket_id='rrhh-legajos' and (storage.foldername(name))[1]='incorporations' and exists(select 1 from public.incorporation_requests r where r.id::text=(storage.foldername(name))[2] and r.requested_by=auth.uid() and r.status='borrador'));
