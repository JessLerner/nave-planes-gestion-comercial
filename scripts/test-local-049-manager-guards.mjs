import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const read = name => readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const block = read('20261119_049_business_role_policies.sql').match(/do \$manager_guards\$[\s\S]*?\$manager_guards\$;/)?.[0];
if (!block) throw new Error('Missing manager transformation');
const source = read('20261030_015_effective_manager_hierarchy.sql');
const functions = source.slice(source.indexOf('create or replace function public.set_supervisor'));
const compact = functions.replace(/\bbegin\s+if\b/gi, 'begin if').replace('p_resource = p_manager','p_resource=p_manager');
const both = "proname in ('set_supervisor_effective_manager','set_resource_manual_manager')";

function verify(definitions) {
  return `
${definitions}
create temp table baseline as select oid,prosrc,proacl,proowner,proconfig from pg_proc where ${both};
${block}
do $test$
declare r record;
begin
  for r in select b.*,p.prosrc as updated from baseline b join pg_proc p using(oid)
    where p.proowner=b.proowner and p.proacl is not distinct from b.proacl and p.proconfig=b.proconfig and p.prosecdef
  loop
    if replace(r.updated, $guard$
  if public.current_app_role() in ('marketing','contaduria','administrativo') then
    raise exception 'Role is not authorized for this procedure' using errcode='42501';
  end if;
$guard$, '') <> r.prosrc or r.updated=r.prosrc then raise exception 'Body mismatch'; end if;
  end loop;
  if (select count(*) from baseline b join pg_proc p using(oid) where p.proowner=b.proowner and p.proacl is not distinct from b.proacl and p.proconfig=b.proconfig and p.prosecdef)<>2 then raise exception 'Metadata mismatch'; end if;
  perform set_config('test.role','marketing',true);
  begin perform public.set_supervisor_effective_manager(null,null); raise exception 'Missing guard'; exception when insufficient_privilege then null; end;
  begin perform public.set_resource_manual_manager(null,null); raise exception 'Missing guard'; exception when insufficient_privilege then null; end;
  perform set_config('test.role','direccion',true);
  begin perform public.set_supervisor_effective_manager(null,null); exception when raise_exception then if sqlerrm<>'Supervisor requerido' then raise; end if; end;
  perform public.set_resource_manual_manager(null,null);
end
$test$;
drop table baseline;`;
}

const sql = `begin;
create table public.staff_members(id uuid, effective_manager_staff_id uuid, effective_manager_source text, updated_at timestamptz);
create function public.current_app_role() returns text language sql as $$select current_setting('test.role',true)$$;
${verify(functions)}
${verify(compact)}
${compact.replace('begin if p_resource=p_manager', "begin perform 'begin if p_resource=p_manager then'; if p_resource=p_manager")}
create temp table before_failure as select oid,prosrc from pg_proc where ${both};
do $test$
begin
  begin
    execute $statement$${block}$statement$;
    raise exception 'Unexpected success';
  exception when raise_exception then
    if sqlerrm not like 'Unexpected body in %set_resource_manual_manager%' then raise; end if;
  end;
  if exists(select 1 from before_failure b join pg_proc p using(oid) where b.prosrc<>p.prosrc) then raise exception 'Partial modification'; end if;
end
$test$;
rollback;`;
if (process.argv[2]) {
  // Optional module path to a temporary PGlite installation. No project dependency.
  const { PGlite } = await import(process.argv[2]);
  const db = new PGlite();
  try { await db.exec(sql); } finally { await db.close(); }
} else {
  const input = `set -eu
db=naveplan_049_test_$$
createdb -U postgres "$db"
trap 'dropdb -U postgres "$db"' EXIT
psql -Xq -U postgres -d "$db" -v ON_ERROR_STOP=1 <<'SQL'
${sql}
SQL
`;
  const result = spawnSync('docker', ['exec','-i','supabase_db_naveplan_local_bootstrap','sh'], {input,stdio:['pipe','inherit','inherit']});
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
if (!process.exitCode) console.log('OK: multiline, compact, unexpected body with atomic rollback');
