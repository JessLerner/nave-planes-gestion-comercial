import { execSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const localWorkdir = resolve(root, '.local-supabase');
const status = execSync(`npx --yes supabase@latest --workdir "${localWorkdir}" status --output env`, { cwd: root, encoding: 'utf8', windowsHide: true });
const environment = Object.fromEntries(status.split(/\r?\n/).flatMap((line) => {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  return match ? [[match[1], match[2].replace(/^"|"$/g, '')]] : [];
}));
const databaseUrl = environment.DB_URL;
const supabaseUrl = environment.API_URL;
if (!databaseUrl || !supabaseUrl) throw new Error('Supabase local no informó DB_URL y API_URL. Ejecutá primero `supabase start` en .local-supabase.');
const databaseTarget = new URL(databaseUrl); const supabaseTarget = new URL(supabaseUrl);
if (!['127.0.0.1', 'localhost'].includes(databaseTarget.hostname) || databaseTarget.port !== '54322'
  || !['127.0.0.1', 'localhost'].includes(supabaseTarget.hostname) || supabaseTarget.port !== '54321') {
  throw new Error('El lanzador acepta únicamente la instancia local de Supabase en 127.0.0.1/localhost.');
}
process.stdout.write('Ejecutando integración autenticada contra Supabase local aislado.\n');
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', '--test-force-exit', 'src/test-support/resourceUpdate.integration.test.ts'], {
  cwd: root, encoding: 'utf8',
  env: { ...process.env,
    DATABASE_URL: databaseUrl,
    SUPABASE_URL: supabaseUrl,
    SUPABASE_ANON_KEY: environment.ANON_KEY,
    NAVE_TEST_DATABASE_URL: databaseUrl,
    NAVE_TEST_SUPABASE_URL: supabaseUrl,
    NAVE_TEST_SUPABASE_ANON_KEY: environment.ANON_KEY,
    NAVE_TEST_SUPABASE_SERVICE_ROLE_KEY: environment.SERVICE_ROLE_KEY,
    NAVE_TEST_DATABASE_ACKNOWLEDGE_ISOLATED: '1',
  },
});
process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || ''); process.exit(result.status || 0);
