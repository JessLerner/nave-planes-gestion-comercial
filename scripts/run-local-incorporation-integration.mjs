import { execSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const output = execSync(`npx --yes supabase@latest --workdir "${resolve(root, '.local-supabase')}" status --output env`, { cwd: root, encoding: 'utf8', windowsHide: true });
const env = Object.fromEntries(output.split(/\r?\n/).flatMap(line => { const found = line.match(/^([A-Z0-9_]+)=(.*)$/); return found ? [[found[1], found[2].replace(/^"|"$/g, '')]] : []; }));
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', '--test-force-exit', 'src/test-support/incorporation.integration.test.ts'], { cwd: root, encoding: 'utf8', env: { ...process.env, NAVE_TEST_DATABASE_URL: env.DB_URL, NAVE_TEST_SUPABASE_URL: env.API_URL, NAVE_TEST_SUPABASE_ANON_KEY: env.ANON_KEY, NAVE_TEST_SUPABASE_SERVICE_ROLE_KEY: env.SERVICE_ROLE_KEY, NAVE_TEST_DATABASE_ACKNOWLEDGE_ISOLATED: '1', DATABASE_URL: env.DB_URL, SUPABASE_URL: env.API_URL, SUPABASE_ANON_KEY: env.ANON_KEY } });
process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || ''); process.exit(result.status || 0);
