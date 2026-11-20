-- Apply transactionally. The operator must first verify the existing Auth subject
-- independently and supply naveplan.verified_owner_id on this migration connection.
do $$
declare
  subject uuid := nullif(current_setting('naveplan.verified_owner_id', true), '')::uuid;
begin
  if subject is null or not exists (
    select 1 from auth.users u join public.profiles p on p.id=u.id
    where p.id=subject and p.role='admin' and u.email_confirmed_at is not null
  ) then
    raise exception 'Verified existing platform owner required';
  end if;
end $$;

create schema if not exists naveplan_private;
create table naveplan_private.platform_owner (
  singleton boolean primary key default true check (singleton),
  profile_id uuid not null unique references public.profiles(id) on delete restrict
);
revoke all on naveplan_private.platform_owner from public, anon, authenticated, service_role;
insert into naveplan_private.platform_owner(profile_id)
values (current_setting('naveplan.verified_owner_id')::uuid);

grant usage on schema naveplan_private to naveplan_org_access_owner;
grant select on naveplan_private.platform_owner to naveplan_org_access_owner;

do $migration$
declare
  definition text := pg_get_functiondef('public.organizational_access_context_self(text,date)'::regprocedure);
  original constant text := $rule$when 'etl.manage' then v_actor.role = 'admin'$rule$;
begin
  if position(original in definition)=0 then
    raise exception 'Unexpected organizational ETL authorization contract';
  end if;
  definition := replace(definition, 'v_actor.role in (''admin'',', 'v_actor.role in (''admin'', ''direccion'',');
  definition := replace(definition, original, original ||
    ' and exists(select 1 from naveplan_private.platform_owner o where o.profile_id=v_user_id)');
  definition := replace(definition, 'coalesce(role.grants_global_admin, false) as grants_global_admin',
    'coalesce(role.active and not role.creates_seller_record, false) as invite_job');
  definition := replace(definition, 'role_mapping = ''admin'' and not grants_global_admin',
    '(not invite_job or role_mapping = ''admin'' or (v_actor.role = ''gerente'' and role_mapping <> ''supervisor'') or (v_actor.role = ''rrhh'' and role_mapping = ''direccion''))');
  execute definition;
end
$migration$;
-- Map only the canonical non-selling functions. Abort on conflicting live catalog
-- configuration instead of changing a linked profile at the next projection.
do $$
declare
  entry record;
  existing public.hr_roles%rowtype;
begin
  for entry in select * from (values
    ('Administración','Administración','administrativo'::public.app_role),
    ('Administración','Contable','contaduria'::public.app_role),
    ('Administración','Marketing','marketing'::public.app_role),
    ('Administración','RRHH','rrhh'::public.app_role),
    ('Gerencia / Dirección','Director','direccion'::public.app_role)
  ) as assignments(area_name,job_name,app_role)
  loop
    select r.* into existing from public.hr_roles r join public.hr_areas a on a.id=r.area_id
      where a.name=entry.area_name and r.name=entry.job_name for update of r;
    if not found then
      if entry.job_name <> 'Marketing' then raise exception 'Required job missing: %', entry.job_name; end if;
      insert into public.hr_roles(area_id,name,app_role_mapping)
        values ((select id from public.hr_areas where name=entry.area_name),entry.job_name,entry.app_role);
    else
      if existing.creates_seller_record or not existing.active
         or (existing.app_role_mapping is not null and existing.app_role_mapping<>entry.app_role)
         or exists(select 1 from public.staff_members s join public.profiles p on p.staff_member_id=s.id
                     where s.role_id=existing.id and p.role<>entry.app_role) then
        raise exception 'Job mapping requires individual review: %', entry.job_name;
      end if;
      update public.hr_roles set app_role_mapping=entry.app_role where id=existing.id and app_role_mapping is null;
    end if;
  end loop;
end $$;

-- Preserve the verified owner when Legajos rebuilds projections. A historical
-- admin can retain its stored role, but a new profile cannot acquire that role.
create function naveplan_private.guard_owner_profile() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from naveplan_private.platform_owner where profile_id=new.id) then
    new.role := 'admin'::public.app_role;
  elsif new.role='admin' and (tg_op='INSERT' or old.role is distinct from new.role) then
    raise exception 'Reserved profile role' using errcode='42501';
  end if;
  if tg_op='UPDATE' and old.role is distinct from new.role and
     (new.role in ('direccion','rrhh','contaduria','marketing','administrativo') or old.role in ('admin','direccion','contaduria','marketing','administrativo')) then
    raise exception 'Account role change requires explicit account provisioning' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function naveplan_private.guard_owner_profile() from public;
create trigger guard_owner_profile before insert or update of role,id on public.profiles
for each row execute function naveplan_private.guard_owner_profile();
