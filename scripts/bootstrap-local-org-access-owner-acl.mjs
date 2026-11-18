import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const LOCAL_PROJECT_ID = 'naveplan_local_bootstrap';
export const LOCAL_DB_CONTAINER = 'supabase_db_naveplan_local_bootstrap';
export const LOCAL_DB_VOLUME = 'supabase_db_naveplan_local_bootstrap';
export const LOCAL_DB_PORT = '54322';
export const EXPECTED_LEDGER_COUNT = 46;
export const EXPECTED_LATEST_MIGRATION = '20261110000046';
export const OWNER_ROLE = 'naveplan_org_access_owner';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

export function assertInvocationArguments(args) {
  if (args.includes('--linked') || args.some((arg) => arg.startsWith('--linked='))) {
    throw new Error('El script local no admite --linked.');
  }
  if (args.length !== 1 || !['--check', '--execute'].includes(args[0])) {
    throw new Error('Uso permitido: node scripts/bootstrap-local-org-access-owner-acl.mjs --check | --execute');
  }
  return args[0];
}

export function assertNoRemoteEnvironment(env) {
  for (const key of ['NAVE_TEST_DATABASE_URL', 'DATABASE_URL', 'SUPABASE_DB_URL']) {
    const value = env[key];
    if (!value) continue;
    let target;
    try {
      target = new URL(value);
    } catch {
      throw new Error(`${key} no es una URL PostgreSQL local válida.`);
    }
    if (!['postgres:', 'postgresql:'].includes(target.protocol)
      || !LOCAL_HOSTS.has(target.hostname)
      || target.port !== LOCAL_DB_PORT) {
      throw new Error(`${key} no apunta exclusivamente a ${LOCAL_HOSTS.values().next().value}:${LOCAL_DB_PORT}.`);
    }
  }
}

export function validateReadOnlyPreflight(snapshot) {
  if (snapshot.projectId !== LOCAL_PROJECT_ID) throw new Error('Proyecto local no reconocido.');
  if (snapshot.containerName !== LOCAL_DB_CONTAINER) throw new Error('Contenedor PostgreSQL no reconocido.');
  if (snapshot.database !== 'postgres') throw new Error('La base objetivo debe ser postgres.');
  if (!snapshot.isHealthy) throw new Error('PostgreSQL local no está saludable.');
  if (!Array.isArray(snapshot.dbBindings) || snapshot.dbBindings.length !== 1
    || snapshot.dbBindings[0].HostIp !== '127.0.0.1' || snapshot.dbBindings[0].HostPort !== LOCAL_DB_PORT) {
    throw new Error('PostgreSQL debe publicarse exclusivamente en 127.0.0.1:54322.');
  }
  if (!snapshot.hasExpectedVolume) throw new Error('No se encontró el volumen PostgreSQL local esperado.');
  if (snapshot.ledgerCount !== EXPECTED_LEDGER_COUNT || snapshot.latestMigration !== EXPECTED_LATEST_MIGRATION) {
    throw new Error('Ledger local inesperado; el script no continuará.');
  }
  if (!snapshot.owner.exists) throw new Error(`No existe el owner ${OWNER_ROLE}.`);
  if (snapshot.owner.canLogin || snapshot.owner.isAdmin) {
    throw new Error(`El owner ${OWNER_ROLE} debe ser NOLOGIN y sin privilegios administrativos.`);
  }
}

export function validateGrantAuthority(snapshot) {
  if (!snapshot.authSchemaOwner || !snapshot.executor.authorized) {
    throw new Error('El ejecutor efectivo no está autorizado para conceder USAGE sobre auth.');
  }
}

export async function bootstrapAcl({ mode, inspect, grantUsage, verifyUsage }) {
  const snapshot = await inspect();
  validateReadOnlyPreflight(snapshot);
  if (mode === '--check') return { mode: 'check', usagePresent: snapshot.owner.hasUsage };
  if (snapshot.owner.hasUsage) return { mode: 'execute', changed: false, reason: 'usage-already-present' };

  validateGrantAuthority(snapshot);
  await grantUsage();
  if (!await verifyUsage()) throw new Error('El GRANT autorizado no pudo verificarse.');
  return { mode: 'execute', changed: true, reason: 'usage-granted' };
}

async function runDocker(args) {
  const { stdout } = await execFileAsync('docker', args, { windowsHide: true });
  return stdout;
}

async function queryLocalPostgres(sql) {
  return runDocker([
    'exec', LOCAL_DB_CONTAINER, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-At', '-c', sql,
  ]);
}

async function inspectLocalStack() {
  const [config, containerRaw, volumeRaw] = await Promise.all([
    readFile('.local-supabase/supabase/config.toml', 'utf8'),
    runDocker(['inspect', LOCAL_DB_CONTAINER]),
    runDocker(['volume', 'inspect', LOCAL_DB_VOLUME]),
  ]);
  const projectId = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
  const [container] = JSON.parse(containerRaw);
  const [volume] = JSON.parse(volumeRaw);
  const dbBindings = container.NetworkSettings?.Ports?.['5432/tcp'];
  const labels = container.Config?.Labels ?? {};
  const expectedVolume = container.Mounts?.some((mount) => (
    mount.Name === LOCAL_DB_VOLUME && mount.Destination === '/var/lib/postgresql/data'
  ));
  if (labels['com.supabase.cli.project'] !== LOCAL_PROJECT_ID || volume.Labels?.['com.supabase.cli.project'] !== LOCAL_PROJECT_ID) {
    throw new Error('Las etiquetas Docker no corresponden al proyecto local autorizado.');
  }
  return {
    projectId,
    containerName: container.Name?.replace(/^\//, ''),
    dbBindings,
    isHealthy: container.State?.Status === 'running' && container.State?.Health?.Status === 'healthy',
    hasExpectedVolume: expectedVolume,
  };
}

async function inspectDatabase() {
  const sql = `
    with ledger as (
      select count(*)::int as count, max(version) as latest from supabase_migrations.schema_migrations
    ), owner_role as (
      select rolname, rolcanlogin, rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls
      from pg_roles where rolname = '${OWNER_ROLE}'
    )
    select json_build_object(
      'database', current_database(),
      'ledgerCount', (select count from ledger),
      'latestMigration', (select latest from ledger),
      'owner', json_build_object(
        'exists', exists(select 1 from owner_role),
        'canLogin', coalesce((select rolcanlogin from owner_role), false),
        'isAdmin', coalesce((select rolsuper or rolcreaterole or rolcreatedb or rolreplication or rolbypassrls from owner_role), false),
        'hasUsage', case when exists(select 1 from owner_role)
          then has_schema_privilege('${OWNER_ROLE}', 'auth', 'USAGE') else false end
      ),
      'authSchemaOwner', (select role.rolname from pg_namespace schema join pg_roles role on role.oid = schema.nspowner where schema.nspname = 'auth'),
      'executor', json_build_object(
        'role', current_user,
        'isSuperuser', (select rolsuper from pg_roles where rolname = current_user),
        'isAuthSchemaOwner', current_user = (select role.rolname from pg_namespace schema join pg_roles role on role.oid = schema.nspowner where schema.nspname = 'auth'),
        'hasUsageGrantOption', has_schema_privilege(current_user, 'auth', 'USAGE WITH GRANT OPTION'),
        'authorized', coalesce((select rolsuper from pg_roles where rolname = current_user), false)
          or current_user = (select role.rolname from pg_namespace schema join pg_roles role on role.oid = schema.nspowner where schema.nspname = 'auth')
          or has_schema_privilege(current_user, 'auth', 'USAGE WITH GRANT OPTION')
      )
    )::text;
  `;
  return JSON.parse((await queryLocalPostgres(sql)).trim());
}

async function inspect() {
  const [stack, database] = await Promise.all([inspectLocalStack(), inspectDatabase()]);
  return { ...stack, ...database };
}

async function grantUsage() {
  await queryLocalPostgres(`GRANT USAGE ON SCHEMA auth TO ${OWNER_ROLE};`);
}

async function verifyUsage() {
  return (await queryLocalPostgres(`SELECT has_schema_privilege('${OWNER_ROLE}', 'auth', 'USAGE');`)).trim() === 't';
}

async function main() {
  const mode = assertInvocationArguments(process.argv.slice(2));
  assertNoRemoteEnvironment(process.env);
  const result = await bootstrapAcl({ mode, inspect, grantUsage, verifyUsage });
  if (result.mode === 'check') {
    console.log(result.usagePresent ? 'Comprobación local completada: USAGE sobre auth está presente; no se realizaron cambios.' : 'Comprobación local completada: USAGE sobre auth no está presente; no se realizaron cambios.');
    return;
  }
  console.log(result.changed ? 'USAGE sobre auth concedido y verificado.' : 'USAGE sobre auth ya existía; no se realizaron cambios.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Falló el bootstrap ACL local.');
    process.exitCode = 1;
  });
}
