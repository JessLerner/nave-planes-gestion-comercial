import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { authorizeLocalEtlAdmin } from '../../api/lib/local-etl-access';

const readProjectFile = (relativePath: string) =>
  readFile(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), 'utf8');

test('la administración ETL local exige sesión y rol admin, incluso ante una petición directa', async () => {
  const resolveUser = async (token: string) => token === 'valid' ? 'user-1' : null;

  const withoutSession = await authorizeLocalEtlAdmin(undefined, resolveUser, async () => 'admin');
  assert.equal(withoutSession.status, 401);

  const supervisor = await authorizeLocalEtlAdmin('Bearer valid', resolveUser, async () => 'supervisor');
  assert.equal(supervisor.status, 403);

  const administrator = await authorizeLocalEtlAdmin('Bearer valid', resolveUser, async () => 'admin');
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

  assert.match(sidebar, /\.\.\.\(currentUser\.role === 'admin'[\s\S]*id: 'database'/);
  assert.match(app, /activeTab === 'database' \|\| activeTab === 'extractor'/);
  assert.match(app, /canManageEtl && visitedTabs\.has\('database'\)/);
  assert.match(databaseModule, /currentUser\.role !== 'admin'/);
  assert.match(server, /app\.use\(LOCAL_ETL_ADMIN_PATHS, requireLocalEtlAdmin\)/);
  assert.match(worker, /isLegacyLocalEtlPath\(path\)/);
});
