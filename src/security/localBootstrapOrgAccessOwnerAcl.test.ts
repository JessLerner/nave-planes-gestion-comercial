import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LOCAL_DB_CONTAINER,
  LOCAL_PROJECT_ID,
  assertInvocationArguments,
  assertNoRemoteEnvironment,
  bootstrapAcl,
} from '../../scripts/bootstrap-local-org-access-owner-acl.mjs';

const validSnapshot = () => ({
  projectId: LOCAL_PROJECT_ID,
  containerName: LOCAL_DB_CONTAINER,
  database: 'postgres',
  dbBindings: [{ HostIp: '127.0.0.1', HostPort: '54322' }],
  isHealthy: true,
  hasExpectedVolume: true,
  ledgerCount: 46,
  latestMigration: '20261110000046',
  owner: { exists: true, canLogin: false, isAdmin: false, hasUsage: true },
  authSchemaOwner: 'supabase_admin',
  executor: { authorized: false },
});

const readOnlyDependencies = (snapshot: ReturnType<typeof validSnapshot>) => {
  let grants = 0;
  let verifications = 0;
  return {
    inspect: async () => snapshot,
    grantUsage: async () => { grants += 1; },
    verifyUsage: async () => { verifications += 1; return true; },
    writes: () => ({ grants, verifications }),
  };
};

test('acepta exclusivamente --check o --execute y rechaza --linked', () => {
  assert.equal(assertInvocationArguments(['--check']), '--check');
  assert.equal(assertInvocationArguments(['--execute']), '--execute');
  assert.throws(() => assertInvocationArguments([]), /Uso permitido/);
  assert.throws(() => assertInvocationArguments(['--check', '--execute']), /Uso permitido/);
  assert.throws(() => assertInvocationArguments(['--linked']), /--linked/);
  assert.throws(() => assertInvocationArguments(['--linked=local']), /--linked/);
});

test('rechaza destinos remotos antes de inspeccionar el entorno', () => {
  assert.throws(() => assertNoRemoteEnvironment({ NAVE_TEST_DATABASE_URL: 'postgresql://x@db.example.com:5432/postgres' }), /NAVE_TEST_DATABASE_URL/);
  assert.throws(() => assertNoRemoteEnvironment({ DATABASE_URL: 'postgresql://x@127.0.0.1:54323/postgres' }), /DATABASE_URL/);
});

test('--check informa USAGE presente sin requerir GRANT OPTION ni emitir escrituras', async () => {
  const dependencies = readOnlyDependencies(validSnapshot());
  const result = await bootstrapAcl({ mode: '--check', ...dependencies });
  assert.deepEqual(result, { mode: 'check', usagePresent: true });
  assert.deepEqual(dependencies.writes(), { grants: 0, verifications: 0 });
});

test('--check informa USAGE ausente sin emitir escrituras', async () => {
  const snapshot = validSnapshot();
  snapshot.owner.hasUsage = false;
  const dependencies = readOnlyDependencies(snapshot);
  const result = await bootstrapAcl({ mode: '--check', ...dependencies });
  assert.deepEqual(result, { mode: 'check', usagePresent: false });
  assert.deepEqual(dependencies.writes(), { grants: 0, verifications: 0 });
});

test('--check rechaza identidad, binding, owner y ledger inválidos antes de toda escritura', async () => {
  const cases: Array<[(snapshot: ReturnType<typeof validSnapshot>) => void, RegExp]> = [
    [(snapshot) => { snapshot.projectId = 'otro'; }, /Proyecto/],
    [(snapshot) => { snapshot.dbBindings = [{ HostIp: '0.0.0.0', HostPort: '54322' }]; }, /127\.0\.0\.1/],
    [(snapshot) => { snapshot.owner.canLogin = true; }, /NOLOGIN/],
    [(snapshot) => { snapshot.owner.exists = false; }, /No existe/],
    [(snapshot) => { snapshot.ledgerCount = 45; }, /Ledger/],
    [(snapshot) => { snapshot.hasExpectedVolume = false; }, /volumen/],
  ];
  for (const [mutate, expected] of cases) {
    const snapshot = validSnapshot();
    mutate(snapshot);
    const dependencies = readOnlyDependencies(snapshot);
    await assert.rejects(() => bootstrapAcl({ mode: '--check', ...dependencies }), expected);
    assert.deepEqual(dependencies.writes(), { grants: 0, verifications: 0 });
  }
});

test('--execute termina idempotente cuando USAGE existe aunque el ejecutor no pueda otorgarlo', async () => {
  const dependencies = readOnlyDependencies(validSnapshot());
  const result = await bootstrapAcl({ mode: '--execute', ...dependencies });
  assert.deepEqual(result, { mode: 'execute', changed: false, reason: 'usage-already-present' });
  assert.deepEqual(dependencies.writes(), { grants: 0, verifications: 0 });
});

test('--execute bloquea USAGE ausente cuando el ejecutor no tiene autoridad', async () => {
  const snapshot = validSnapshot();
  snapshot.owner.hasUsage = false;
  const dependencies = readOnlyDependencies(snapshot);
  await assert.rejects(() => bootstrapAcl({ mode: '--execute', ...dependencies }), /ejecutor/);
  assert.deepEqual(dependencies.writes(), { grants: 0, verifications: 0 });
});

test('--execute con USAGE ausente y autoridad demostrada sólo emite el GRANT permitido', async () => {
  const snapshot = validSnapshot();
  snapshot.owner.hasUsage = false;
  snapshot.executor.authorized = true;
  const dependencies = readOnlyDependencies(snapshot);
  const result = await bootstrapAcl({ mode: '--execute', ...dependencies });
  assert.deepEqual(result, { mode: 'execute', changed: true, reason: 'usage-granted' });
  assert.deepEqual(dependencies.writes(), { grants: 1, verifications: 1 });
});
