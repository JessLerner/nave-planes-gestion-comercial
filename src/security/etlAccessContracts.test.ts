import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import worker from '../../cloudflare/worker';
import { authorizeLocalEtlAdmin } from '../../api/lib/local-etl-access';

const readProjectFile = (relativePath: string) =>
  readFile(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), 'utf8');

test('la administración ETL local exige sesión y titularidad verificada, incluso ante una petición directa', async () => {
  const resolveUser = async (token: string) => token === 'valid' ? 'user-1' : null;

  const withoutSession = await authorizeLocalEtlAdmin(undefined, resolveUser, async () => true);
  assert.equal(withoutSession.status, 401);

  const supervisor = await authorizeLocalEtlAdmin('Bearer valid', resolveUser, async () => false);
  assert.equal(supervisor.status, 403);

  const administrator = await authorizeLocalEtlAdmin('Bearer valid', resolveUser, async () => true);
  assert.equal(administrator.status, 200);
  assert.equal(administrator.userId, 'user-1');
});

test('las superficies ETL se restringen en navegación, componente, servidor local y Worker', async () => {
  const [sidebar, app, databaseModule, server, worker] = await Promise.all([
    readProjectFile('src/components/layout/Sidebar.tsx'),
    readProjectFile('src/App.tsx'),
    readProjectFile('src/components/database/DatabaseConnectorsModule.tsx'),
    readProjectFile('server.ts'),
    readProjectFile('cloudflare/worker.ts'),
  ]);

  assert.match(sidebar, /\.\.\.\(currentUser\.isPlatformOwner === true[\s\S]*id: 'database'/);
  assert.match(app, /activeTab === 'database' \|\| activeTab === 'extractor'/);
  assert.match(app, /canManageEtl && visitedTabs\.has\('database'\)/);
  assert.match(databaseModule, /currentUser\.isPlatformOwner !== true/);
  assert.match(databaseModule, /const \[showSqlSchema, setShowSqlSchema\] = useState\(false\);[\s\S]*?if \(currentUser\.isPlatformOwner !== true\)/);
  assert.match(server, /app\.use\(LOCAL_ETL_ADMIN_PATHS, requireLocalEtlAdmin\)/);
  assert.match(worker, /isLegacyLocalEtlPath\(path\)/);
});

test('el Worker rechaza conexiones y extractor antes de ejecutar handlers o servir la SPA', async () => {
  const environment = { ASSETS: { fetch: async () => { throw new Error('unexpected asset access'); } } };
  for (const path of ['/api/connectors/test', '/api/connectors/sync', '/api/config', '/api/ingest', '/api/export']) {
    const response = await worker.fetch(new Request('https://example.invalid' + path, { method: 'POST' }), environment);
    assert.equal(response.status, 404);
  }
});
