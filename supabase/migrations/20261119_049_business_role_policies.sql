-- The following business policies retain their original row predicates and
-- commands. Only their explicit nontechnical admin check also admits Dirección.
do $$
declare
  pol record;
  clause text;
  predicate text;
  role_expr constant text := '(case when public.current_app_role()=''direccion''::public.app_role then ''admin''::public.app_role else public.current_app_role() end)';
begin
  for pol in select * from pg_policies where
    (schemaname='public' and tablename in ('access_account_audit','commercial_documents','incorporation_request_audit',
      'incorporation_requests','incorporation_request_documents','staff_departure_notices','staff_departure_notice_documents',
      'price_lists','profile_access_permissions','staff_members','wage_advances','recruitment_candidates','candidate_documents'))
    or (schemaname='storage' and (policyname like 'incorporation_storage_%' or policyname like 'rrhh_legajos_%' or policyname='commercial_documents_storage_read'))
  loop
    clause := '';
    if pol.qual like '%current_app_role()%admin%' then
      predicate := replace(replace(pol.qual,'public.current_app_role()', 'current_app_role()'),'current_app_role()',role_expr);
      clause := format(' using (%s)',predicate);
    end if;
    if pol.with_check like '%current_app_role()%admin%' then
      predicate := replace(replace(pol.with_check,'public.current_app_role()', 'current_app_role()'),'current_app_role()',role_expr);
      clause := clause || format(' with check (%s)',predicate);
    end if;
    if clause<>'' then execute format('alter policy %I on %I.%I%s',pol.policyname,pol.schemaname,pol.tablename,clause); end if;
  end loop;
end $$;

do $$
declare
  fn regprocedure;
  definition text;
begin
  foreach fn in array array[
    'public.can_access_incorporation(uuid,uuid,public.incorporation_request_status)'::regprocedure,
    'public.can_access_departure_notice(uuid,uuid)'::regprocedure,
    'public.can_manage_recruitment_team(uuid)'::regprocedure
  ] loop
    definition := pg_get_functiondef(fn);
    definition := replace(definition, 'public.current_app_role() in (''admin'',','public.current_app_role() in (''direccion'',''admin'',');
    definition := replace(definition, 'public.current_app_role() = ''admin''','public.current_app_role() in (''admin'',''direccion'')');
    execute definition;
  end loop;
end $$;

create or replace function public.can_manage_price_lists() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid()
    and (p.role='direccion' or (p.role not in ('marketing','contaduria') and p.can_manage_price_lists)))
$$;

-- These two roles use only the session API. Storage observes table RLS
-- independently of PostgREST. Server-side session lookup uses its database role.
do $$
declare
  target record;
begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p','v','m') and not c.relrowsecurity
      and has_table_privilege('authenticated',c.oid,'SELECT, INSERT, UPDATE, DELETE')) then
    raise exception 'Review direct authenticated access outside RLS before enabling identity-only roles';
  end if;
  for target in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where c.relrowsecurity and c.relkind in ('r','p') and (n.nspname='public' or (n.nspname='storage' and c.relname='objects'))
  loop
    execute format('create policy identity_only_roles on %I.%I as restrictive for all to authenticated
      using ((select public.current_app_role()) not in (''marketing'',''contaduria''))
      with check ((select public.current_app_role()) not in (''marketing'',''contaduria''))',target.nspname,target.relname);
  end loop;
end $$;
-- These SECURITY DEFINER procedures may be called directly via PostgREST.
-- The Worker still uses its private connection for authorized Legajos changes.
-- Match the outer BEGIN in prosrc and the known first validation for each
-- manager procedure. Leave the deparsed header and the remaining body intact.
do $manager_guards$
declare
  target record;
  body text;
  definition text;
  opening text;
  body_at integer;
  guard_sql constant text := $guard$
  if public.current_app_role() in ('marketing','contaduria','administrativo') then
    raise exception 'Role is not authorized for this procedure' using errcode='42501';
  end if;
$guard$;
begin
  for target in select * from (values
    ('public.set_supervisor_effective_manager(uuid,uuid)'::regprocedure,
     'if[[:space:]]+p_supervisor[[:space:]]+is[[:space:]]+null[[:space:]]+then'),
    ('public.set_resource_manual_manager(uuid,uuid)'::regprocedure,
     'if[[:space:]]+p_resource[[:space:]]*=[[:space:]]*p_manager[[:space:]]+then')
  ) as procedures(fn, first_statement)
  loop
    select p.prosrc, pg_get_functiondef(p.oid) into strict body, definition
      from pg_proc p where p.oid=target.fn;
    opening := (regexp_match(body, '^([[:space:]]*begin)[[:space:]]+' || target.first_statement || '\M', 'i'))[1];
    body_at := strpos(definition, body);
    if opening is null or body_at=0 or strpos(substr(definition,body_at+length(body)),body)>0 then
      raise exception 'Unexpected body in %', target.fn;
    end if;
    execute overlay(definition placing guard_sql from body_at+length(opening) for 0);
  end loop;
end
$manager_guards$;

do $$
declare
  fn regprocedure;
  definition text;
  guarded text;
begin
  foreach fn in array array[
    'public.rebuild_roster_projections_from_legajos()'::regprocedure,
    'public.publish_price_list_to_managers(uuid)'::regprocedure,
    'public.confirm_price_list_for_my_structure(uuid)'::regprocedure
  ] loop
    definition := pg_get_functiondef(fn);
    guarded := regexp_replace(definition, E'\nbegin\r?\n', E'\nbegin\n  if public.current_app_role() in (''marketing'',''contaduria'',''administrativo'') then raise exception ''Role is not authorized for this procedure'' using errcode=''42501''; end if;\n','i');
    if guarded=definition then raise exception 'Unexpected body in %',fn; end if;
    execute guarded;
  end loop;
  definition := pg_get_functiondef('public.import_fox_leads(date,date,date,text,text,jsonb)'::regprocedure);
  guarded := replace(definition,'and role = ''admin''','and role in (''admin'',''direccion'')');
  if guarded=definition then raise exception 'Unexpected Fox import contract'; end if;
  execute guarded;
end $$;
