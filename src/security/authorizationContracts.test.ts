import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const readProjectFile = (relativePath: string) =>
  readFile(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), 'utf8');

const workerProtectedRoutes = [
  '/api/fox-leads-import',
  '/api/fox-leads-metrics',
  '/api/fox-user-mappings',
  '/api/hr-import',
  '/api/operational-data',
  '/api/operations',
  '/api/price-lists',
  '/api/resource-update',
  '/api/resources-directory',
  '/api/session',
  '/api/wage-advances',
] as const;

const handlerFiles: Record<(typeof workerProtectedRoutes)[number], string> = {
  '/api/fox-leads-import': 'api/fox-leads-import.ts',
  '/api/fox-leads-metrics': 'api/fox-leads-metrics.ts',
  '/api/fox-user-mappings': 'api/fox-user-mappings.ts',
  '/api/hr-import': 'api/hr-import.ts',
  '/api/operational-data': 'api/operational-data.ts',
  '/api/operations': 'api/operations.ts',
  '/api/price-lists': 'api/price-lists.ts',
  '/api/resource-update': 'api/resource-update.ts',
  '/api/resources-directory': 'api/resources-directory.ts',
  '/api/session': 'api/session.ts',
  '/api/wage-advances': 'api/wage-advances.ts',
};

test('each sensitive Worker route keeps an authentication rejection before its data access', async () => {
  const worker = await readProjectFile('cloudflare/worker.ts');

  for (const route of workerProtectedRoutes) {
    const handler = await readProjectFile(handlerFiles[route]);
    assert.match(worker, new RegExp(`['\"]${route}['\"]`), `${route} must remain routed by the Worker`);
    assert.match(handler, /status\(401\)/, `${route} must reject a request without a valid session`);
    assert.match(
      handler,
      /authenticatedUserId|verifySupabaseAccessToken|async function identity|async function userId/,
      `${route} must validate the bearer identity on the server`,
    );
  }
});

test('the only unauthenticated Worker configuration route is explicitly limited to public Supabase configuration', async () => {
  const worker = await readProjectFile('cloudflare/worker.ts');
  const publicConfig = await readProjectFile('api/public-config.ts');

  assert.match(worker, /path !== '\/api\/public-config'/);
  assert.match(publicConfig, /return res\.status\(200\)\.json\(\{ url, key \}\)/);
  assert.doesNotMatch(publicConfig, /SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|POSTGRES_PASSWORD/);
});

test('operational authorization retains server-side scope checks for the five approved role scenarios', async () => {
  const [operations, operationalData, advances, resources] = await Promise.all([
    readProjectFile('api/operations.ts'),
    readProjectFile('api/operational-data.ts'),
    readProjectFile('api/wage-advances.ts'),
    readProjectFile('api/resources-directory.ts'),
  ]);

  // Supervisión: only its own team; Gerencia: subordinate-team filter.
  assert.match(operations, /profile\.role === 'supervisor'.*profile\.team_id === teamId/s);
  assert.match(operationalData, /profile\.role === 'supervisor'\s*\? \{ sql: 't\.id = \$1'/s);
  assert.match(operationalData, /t\.manager_staff_id = \$1/);

  // Dirección/Administración and RRHH: backend-recognized global scope where defined.
  assert.match(operationalData, /profile\.role === 'admin' \|\| profile\.role === 'rrhh'/);
  assert.match(resources, /viewer\?\.role === 'admin' \|\| viewer\?\.role === 'rrhh'/);

  // Adelantos: request and review restrictions are enforced by the API, not the UI.
  assert.match(advances, /profile\.role !== 'supervisor'/);
  assert.match(advances, /\['gerente', 'admin'\]\.includes\(profile\.role\)/);
});

test('browser authentication code does not embed server credentials', async () => {
  const browserSources = await Promise.all([
    readProjectFile('src/auth/supabase.ts'),
    readProjectFile('src/auth/AuthProvider.tsx'),
    readProjectFile('src/context/AppContext.tsx'),
  ]);
  const source = browserSources.join('\n');

  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|POSTGRES_PASSWORD|INGEST_SHARED_SECRET/);
  assert.match(source, /fetch\('\/api\/public-config'\)/);
  assert.match(source, /fetch\('\/api\/session'/);
});
