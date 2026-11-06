-- Sprint 5 follow-up. Applies locally after 034; never run against a remote environment from this workspace.
create or replace function public.can_access_incorporation(supervisor_id uuid, requester_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select requester_id = auth.uid()
    or public.current_app_role() in ('admin','rrhh')
    or (public.current_app_role() = 'gerente' and supervisor_id in (
      with recursive hierarchy as (
        select staff_member_id as id from public.profiles where id=auth.uid()
        union select child.id from public.staff_members child join hierarchy parent on child.responsible_staff_id=parent.id
      ) select id from hierarchy
    ))
$$;

drop policy if exists incorporation_requests_own_read on public.incorporation_requests;
drop policy if exists incorporation_documents_own_read on public.incorporation_request_documents;
drop policy if exists incorporation_decisions_own_read on public.incorporation_request_decisions;
drop policy if exists incorporation_storage_read on storage.objects;

create policy incorporation_requests_scoped_read on public.incorporation_requests for select to authenticated using (public.can_access_incorporation(supervisor_staff_id, requested_by));
create policy incorporation_documents_scoped_read on public.incorporation_request_documents for select to authenticated using (exists(select 1 from public.incorporation_requests r where r.id=request_id and public.can_access_incorporation(r.supervisor_staff_id, r.requested_by)));
create policy incorporation_decisions_scoped_read on public.incorporation_request_decisions for select to authenticated using (exists(select 1 from public.incorporation_requests r where r.id=request_id and public.can_access_incorporation(r.supervisor_staff_id, r.requested_by)));
create policy incorporation_storage_scoped_read on storage.objects for select to authenticated using (bucket_id='rrhh-legajos' and (storage.foldername(name))[1]='incorporations' and exists(select 1 from public.incorporation_requests r where r.id::text=(storage.foldername(name))[2] and public.can_access_incorporation(r.supervisor_staff_id, r.requested_by)));
