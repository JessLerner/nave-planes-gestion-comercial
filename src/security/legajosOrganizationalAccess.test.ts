import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  canManageActiveLegajo,
  canReadLegajosHistory,
  parseLegajosOrganizationalAccess,
} from '../../api/lib/legajos-organizational-access';

const context = (role: string, staffIds: string[], capabilities: string[] = [], all = false, authorized = true) => parseLegajosOrganizationalAccess({
  actor: { user_id: 'user-1', role, capabilities, global: all }, authorized,
  scope: { staff_ids: staffIds, includes_all_active_staff: all }, resources: [], period: {}, integrity: {}, effective_at: '2026-11-12',
}, 'user-1');

test('Legajos: Gerencia sólo gestiona recursos activos de su alcance efectivo', () => {
  const managerAfterTransfer = context('gerente', ['supervisor-new', 'seller-new']);
  const managerBeforeTransfer = context('gerente', []);
  assert.equal(canManageActiveLegajo(managerAfterTransfer, 'seller-new'), true);
  assert.equal(canManageActiveLegajo(managerBeforeTransfer, 'seller-new'), false);
  assert.equal(canManageActiveLegajo(managerAfterTransfer, 'seller-old'), false);
});

test('Legajos: Supervisión conserva lectura de su equipo sin gestión', () => {
  const supervisor = context('supervisor', ['supervisor-1', 'seller-1'], [], false, false);
  assert.equal(canManageActiveLegajo(supervisor, 'seller-1'), false);
  assert.equal(canReadLegajosHistory(supervisor), false);
});

test('Legajos: históricos e inactivos se limitan a roles globales o capacidades administrativas', () => {
  assert.equal(canReadLegajosHistory(context('gerente', ['seller-1'])), false);
  assert.equal(canReadLegajosHistory(context('supervisor', ['seller-1'])), false);
  assert.equal(canReadLegajosHistory(context('administrativo', [], ['view_legajos'], true)), true);
  assert.equal(canReadLegajosHistory(context('rrhh', [], [], true)), true);
});

test('Legajos: rechaza un contexto RPC de otra identidad', () => {
  assert.throws(() => parseLegajosOrganizationalAccess({ actor: { user_id: 'other' }, authorized: true, scope: { staff_ids: [], includes_all_active_staff: false } }, 'user-1'));
});

test('044 conserva otros módulos y aplica Legajos activo por gerente efectivo', async () => {
  const path = fileURLToPath(new URL('../../supabase/migrations/20261112_044_legajos_organizational_access_permissions.sql', import.meta.url));
  const sql = await readFile(path, 'utf8');
  assert.match(sql, /when 'legajos\.read' then v_legajos_all_staff or \(v_actor\.role in \('gerente', 'supervisor'\)/);
  assert.match(sql, /when 'legajos\.manage' then v_legajos_all_staff or \(v_actor\.role = 'gerente'/);
  assert.match(sql, /staff\.effective_manager_staff_id = v_actor\.staff_member_id/);
  assert.match(sql, /p_operation not in \('legajos\.read', 'legajos\.manage'\) or scoped_staff\.active/);
  assert.match(sql, /when 'advance\.request' then v_actor\.role = 'supervisor'/);
});
