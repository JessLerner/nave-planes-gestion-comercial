import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const databaseUrl = process.env.NAVE_TEST_DATABASE_URL?.replace(/^"|"$/g, '');
if (!databaseUrl) throw new Error('Definí NAVE_TEST_DATABASE_URL sólo para la sesión local de prueba.');
const target = new URL(databaseUrl);
if (!['127.0.0.1', 'localhost'].includes(target.hostname) || target.port !== '54322') {
  throw new Error('El lanzador acepta únicamente PostgreSQL local en 127.0.0.1:54322 o localhost:54322.');
}

const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['test'], {
  cwd: root,
  encoding: 'utf8',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    NAVE_TEST_DATABASE_URL: databaseUrl,
    NAVE_TEST_DATABASE_ACKNOWLEDGE_ISOLATED: '1',
  },
});
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
process.exit(result.status || 0);
