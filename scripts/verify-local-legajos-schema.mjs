import pg from 'pg';

const databaseUrl = process.env.NAVE_TEST_DATABASE_URL?.replace(/^"|"$/g, '');
if (!databaseUrl) throw new Error('Definí NAVE_TEST_DATABASE_URL sólo para la sesión local de verificación.');
const target = new URL(databaseUrl);
if (!['127.0.0.1', 'localhost'].includes(target.hostname) || target.port !== '54322') {
  throw new Error('El verificador acepta únicamente PostgreSQL local en 127.0.0.1:54322 o localhost:54322.');
}
const client = new pg.Client({ connectionString: databaseUrl });
const expectedTables = ['staff_members', 'teams', 'sellers', 'profiles', 'hr_roles', 'staff_status_events'];

await client.connect();
try {
  const tables = await client.query(`select table_name from information_schema.tables where table_schema='public' and table_name=any($1::text[])`, [expectedTables]);
  const functions = await client.query(`select proname from pg_proc join pg_namespace on pg_namespace.oid=pg_proc.pronamespace where nspname='public' and proname=any($1::text[])`, [['rebuild_roster_projections_from_legajos', 'sync_roster_projections_after_legajo_change']]);
  const trigger = await client.query(`select trigger.tgname,trigger.tgenabled from pg_trigger trigger join pg_class relation on relation.oid=trigger.tgrelid join pg_namespace schema on schema.oid=relation.relnamespace where schema.nspname='public' and relation.relname='staff_members' and trigger.tgname='staff_members_sync_roster_projections' and not trigger.tgisinternal`);
  const roles = await client.query(`select name,app_role_mapping::text,creates_seller_record from public.hr_roles where active=true order by name`);
  const migration = await client.query(`select version::text from supabase_migrations.schema_migrations where version='20261031000032'`);
  const foundTables = new Set(tables.rows.map(row => row.table_name));
  const foundFunctions = new Set(functions.rows.map(row => row.proname));
  const requiredRoles = {
    gerente: roles.rows.some(role => role.app_role_mapping === 'gerente'),
    supervisor: roles.rows.some(role => role.app_role_mapping === 'supervisor'),
    vendedor: roles.rows.some(role => role.creates_seller_record),
  };
  const report = {
    localOnly: true,
    migration032Applied: migration.rowCount === 1,
    missingTables: expectedTables.filter(name => !foundTables.has(name)),
    functions: {
      rebuildRoster: foundFunctions.has('rebuild_roster_projections_from_legajos'),
      triggerFunction: foundFunctions.has('sync_roster_projections_after_legajo_change'),
    },
    trigger: trigger.rows[0] ? { exists: true, enabled: trigger.rows[0].tgenabled === 'O' } : { exists: false, enabled: false },
    requiredRoles,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.migration032Applied || report.missingTables.length || !report.functions.rebuildRoster || !report.functions.triggerFunction || !report.trigger.exists || !report.trigger.enabled || !Object.values(requiredRoles).every(Boolean)) process.exitCode = 1;
} finally {
  await client.end();
}
