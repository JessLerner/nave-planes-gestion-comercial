import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const migration = name => readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8');
const input = `set -eu
export PGOPTIONS="-c synchronous_commit=off"
db=naveplan_roles_test_$$
createdb -U supabase_admin -O postgres "$db"
trap 'dropdb -U supabase_admin "$db"' EXIT
pg_dump -U supabase_admin --schema-only --no-publications --no-subscriptions postgres | psql -X -q -1 -U supabase_admin -d "$db" -v ON_ERROR_STOP=1 >/dev/null
psql -X -q -U postgres -d "$db" -v ON_ERROR_STOP=1 <<'SQL'
begin;
insert into public.hr_areas(name) values ('Administración'),('Gerencia / Dirección');
insert into public.hr_roles(area_id,name)
select a.id,j.name from public.hr_areas a join (values ('Administración','Administración'),('Administración','Contable'),('Administración','RRHH'),('Gerencia / Dirección','Director')) j(area,name) on a.name=j.area;
select gen_random_uuid() as subject,gen_random_uuid() as director,gen_random_uuid() as marketing,gen_random_uuid() as contaduria,gen_random_uuid() as legacy \\gset
insert into auth.users(id,email_confirmed_at) values (:'subject',now()),(:'director',now()),(:'marketing',now()),(:'contaduria',now()),(:'legacy',now());
insert into public.profiles(id,full_name,role) values (:'subject','Synthetic owner','admin'),(:'legacy','Synthetic legacy','admin');
${migration('20261119_047_account_roles.sql')}
commit;
begin;
select set_config('naveplan.verified_owner_id',:'subject',true) is not null as configured;
${migration('20261119_048_platform_owner.sql')}
${migration('20261119_049_business_role_policies.sql')}
insert into public.profiles(id,full_name,role) values (:'director','Synthetic director','direccion'),(:'marketing','Synthetic marketing','marketing'),(:'contaduria','Synthetic accounting','contaduria');
set local role authenticated;
select set_config('request.jwt.claim.sub',:'director',true) is not null;
do $$ begin
  if (public.organizational_access_context_self('etl.manage',current_date)->>'authorized')::boolean is distinct from false then raise exception 'Director ETL'; end if;
  if (public.organizational_access_context_self('legajos.read',current_date)->>'authorized')::boolean is distinct from true then raise exception 'Director scope'; end if;
end $$;
select set_config('request.jwt.claim.sub',:'legacy',true) is not null;
do $$ begin
  if (public.organizational_access_context_self('etl.manage',current_date)->>'authorized')::boolean is distinct from false then raise exception 'Historical admin acquired ETL'; end if;
  begin
    update naveplan_private.platform_owner set profile_id=auth.uid();
    raise exception 'Owner registry writable';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claim.sub',:'marketing',true) is not null;
do $$ begin
  if (public.organizational_access_context_self('legajos.read',current_date)->>'authorized')::boolean is distinct from false then raise exception 'Marketing accessed HR'; end if;
  if exists(select 1 from public.hr_roles) then raise exception 'Marketing read role catalog'; end if;
  begin
    perform public.set_resource_manual_manager(null,null);
    raise exception 'Marketing called management RPC';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claim.sub',:'contaduria',true) is not null;
do $$ begin
  if public.can_manage_price_lists() then raise exception 'Accounting managed prices'; end if;
  if (public.organizational_access_context_self('account.invite',current_date)->>'authorized')::boolean is distinct from false then raise exception 'Accounting invited'; end if;
end $$;
select set_config('request.jwt.claim.sub',:'subject',true) is not null;
do $$ begin
  if (public.organizational_access_context_self('etl.manage',current_date)->>'authorized')::boolean is distinct from true then raise exception 'Owner ETL'; end if;
end $$;
reset role;
do $$ begin
  if (select count(distinct app_role_mapping) from public.hr_roles where active and not creates_seller_record and app_role_mapping in ('direccion','administrativo','rrhh','marketing','contaduria'))<>5 then raise exception 'Missing eligible role'; end if;
  begin
    update public.profiles set role='admin' where role='direccion';
    raise exception 'Reserved role assigned';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
SQL
`;
const run = spawnSync('docker',['exec','-i','supabase_db_naveplan_local_bootstrap','sh'],{input,encoding:'utf8',stdio:['pipe','inherit','inherit']});
process.exitCode = run.status ?? 1;
