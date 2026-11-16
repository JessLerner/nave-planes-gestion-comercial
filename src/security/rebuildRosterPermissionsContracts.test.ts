import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const migrationUrl = new URL('../../supabase/migrations/20261115_046_revoke_public_roster_rebuild_execute.sql', import.meta.url);
const rosterMigrationUrl = new URL('../../supabase/migrations/20261031_032_legajos_atomic_roster_sync.sql', import.meta.url);

test('046 revoca sólo la ejecución pública de la reconstrucción de Legajos', async () => {
  const sql = await readFile(fileURLToPath(migrationUrl), 'utf8');

  assert.match(sql, /revoke\s+execute\s+on\s+function\s+public\.rebuild_roster_projections_from_legajos\(\)\s+from\s+public,\s*anon,\s*authenticated,\s*service_role\s*;/i);
  assert.doesNotMatch(sql, /\b(grant|alter\s+function|create\s+or\s+replace\s+function|create\s+policy|alter\s+table|insert\s+into|update\s+|delete\s+from)\b/i);
});

test('046 conserva firma, trigger interno y proyecciones fuera de su alcance', async () => {
  const [securitySql, rosterSql] = await Promise.all([
    readFile(fileURLToPath(migrationUrl), 'utf8'),
    readFile(fileURLToPath(rosterMigrationUrl), 'utf8'),
  ]);

  assert.match(rosterSql, /create or replace function public\.rebuild_roster_projections_from_legajos\(\)\s+returns void/i);
  assert.match(rosterSql, /create or replace function public\.sync_roster_projections_after_legajo_change\(\)[\s\S]*?perform public\.rebuild_roster_projections_from_legajos\(\)/i);
  assert.match(rosterSql, /create trigger staff_members_sync_roster_projections[\s\S]*?on public\.staff_members/i);
  assert.doesNotMatch(securitySql, /\b(staff_members|teams|sellers|profiles)\b/i);
});

test('046 no cambia RLS, ledger ni crea un wrapper público alternativo', async () => {
  const sql = await readFile(fileURLToPath(migrationUrl), 'utf8');

  assert.doesNotMatch(sql, /\b(policy|row level security|schema_migrations|create\s+view)\b/i);
  assert.doesNotMatch(sql, /\bcreate\s+(or\s+replace\s+)?function\b/i);
});
