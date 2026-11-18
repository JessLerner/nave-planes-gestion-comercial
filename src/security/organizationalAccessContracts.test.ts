import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  organizationalAccessContextSelf,
  parseOrganizationalAccessContext,
  type AuthenticatedRpc,
} from '../../api/lib/organizational-access';

type ScopeFixture = {
  id: string;
  active: boolean;
  responsibleStaffId: string | null;
  effectiveManagerStaffId: string | null;
  teamId?: string | null;
  sellerId?: string | null;
};

function managerScope(actorId: string, activeManagerIds: ReadonlySet<string>, staff: readonly ScopeFixture[]) {
  if (!activeManagerIds.has(actorId)) return [];
  return staff
    .filter((resource) => resource.active && resource.effectiveManagerStaffId === actorId)
    .map((resource) => resource.id)
    .sort();
}

function supervisorScope(actorId: string, staff: readonly ScopeFixture[]) {
  const scoped = new Set([actorId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const resource of staff) {
      if (!scoped.has(resource.id) && resource.responsibleStaffId && scoped.has(resource.responsibleStaffId)) {
        scoped.add(resource.id);
        changed = true;
      }
    }
  }
  return [...scoped].sort();
}

const fixture = {
  actor: { user_id: 'actor-1', profile_id: 'actor-1', staff_member_id: 'staff-1', role: 'supervisor', capabilities: [], global: false },
  authorized: true,
  effective_at: '2026-11-10',
  scope: { staff_ids: ['staff-1', 'staff-2'], supervisor_ids: ['staff-1'], team_ids: ['team-1'], includes_all_active_staff: false },
  resources: [{ staff_id: 'staff-2', active: true, role_mapping: 'vendedor', responsible_staff_id: 'staff-1', effective_manager_staff_id: 'manager-1', team_id: 'team-1', seller_id: 'seller-1', organizational_eligible: true, organizational_exclusion_reasons: [] }],
  period: { id: 'period-1', start_date: '2026-11-01', end_date: '2026-11-30', status: 'unknown' },
  integrity: { hierarchy_cycle_detected: false, inconsistent_reference_detected: false },
};

test('adaptador organizativo conserva sólo la proyección mínima y período desconocido', async () => {
  const rpc: AuthenticatedRpc = async (name, params) => {
    assert.equal(name, 'organizational_access_context_self');
    assert.deepEqual(params, { p_operation: 'advance.request', p_as_of: '2026-11-10' });
    return { data: fixture, error: null };
  };
  const result = await organizationalAccessContextSelf(rpc, { operation: 'advance.request', asOf: '2026-11-10' });
  assert.equal(result.actor?.userId, 'actor-1');
  assert.deepEqual(result.resources.map((resource) => resource.staffId), ['staff-2']);
  assert.equal(result.period.status, 'unknown');
});

test('adaptador rechaza resultados incompletos y no acepta recursos fuera del contrato', () => {
  assert.throws(() => parseOrganizationalAccessContext({ authorized: true }));
  assert.throws(() => parseOrganizationalAccessContext({ ...fixture, resources: [{ active: true }] }));
});

test('migración limita la RPC a auth.uid y revoca ejecución privilegiada', async () => {
  const path = fileURLToPath(new URL('../../supabase/migrations/20261110_042_organizational_access_context_self.sql', import.meta.url));
  const sql = await readFile(path, 'utf8');
  assert.match(sql, /v_user_id uuid := auth\.uid\(\)/);
  assert.doesNotMatch(sql, /organizational_access_context_for/);
  assert.match(sql, /revoke all on function public\.organizational_access_context_self\(text, date\) from (public|anon|service_role)/);
  assert.match(sql, /grant execute on function public\.organizational_access_context_self\(text, date\) to authenticated/);
  assert.match(sql, /'status', 'unknown'/);
});

test('043 hace exclusivo el alcance de Gerencia por gerente efectivo', async () => {
  const path = fileURLToPath(new URL('../../supabase/migrations/20261110_043_organizational_access_context_manager_scope.sql', import.meta.url));
  const sql = await readFile(path, 'utf8');
  const managerScope = sql.match(/and v_actor\.role = 'gerente'([\s\S]*?)union\s+select id from supervisor_hierarchy/gi);

  assert.equal(managerScope?.length, 2, 'la misma regla debe alimentar scope y resources');
  for (const branch of managerScope ?? []) {
    assert.match(branch, /staff\.active/);
    assert.match(branch, /staff\.effective_manager_staff_id = v_actor\.staff_member_id/);
    assert.match(branch, /manager\.active/);
    assert.match(branch, /manager_role\.app_role_mapping = 'gerente'::public\.app_role/);
    assert.doesNotMatch(branch, /responsible_staff_id/);
    assert.doesNotMatch(branch, /join public\.(teams|sellers)/);
  }
});

test('042 y 043 preservan lectura de Legajos para Gerencia y Supervisión, y edición sólo para Gerencia en alcance', async () => {
  const files = await Promise.all([
    readFile(fileURLToPath(new URL('../../supabase/migrations/20261110_042_organizational_access_context_self.sql', import.meta.url)), 'utf8'),
    readFile(fileURLToPath(new URL('../../supabase/migrations/20261110_043_organizational_access_context_manager_scope.sql', import.meta.url)), 'utf8'),
  ]);
  for (const sql of files) {
    assert.match(sql, /when 'legajos\.read' then v_global or \(v_actor\.role in \('gerente', 'supervisor'\) and v_actor\.staff_member_id is not null\)/);
    assert.match(sql, /when 'legajos\.manage' then v_actor\.role in \('admin', 'rrhh'\) or \(v_actor\.role = 'gerente' and v_actor\.staff_member_id is not null\)/);
  }
});

test('043 conserva Supervisión por responsable y no concede autogestión a Gerencia', async () => {
  const path = fileURLToPath(new URL('../../supabase/migrations/20261110_043_organizational_access_context_manager_scope.sql', import.meta.url));
  const sql = await readFile(path, 'utf8');

  assert.match(sql, /v_actor\.role = 'supervisor'[\s\S]*?child\.responsible_staff_id = supervisor_hierarchy\.id/);
  assert.match(sql, /does not add the manager's own staff record automatically/);
  assert.match(sql, /v_global := v_actor\.role in \('admin', 'rrhh'\)/);
  assert.match(sql, /when 'legajos\.manage' then v_actor\.role in \('admin', 'rrhh'\)/);
});

test('migraciones de Legajos contienen el mecanismo de cascada y preservan excepciones manuales', async () => {
  const root = new URL('../../supabase/migrations/', import.meta.url);
  const [rebuild, manual, sellerInheritance] = await Promise.all([
    readFile(fileURLToPath(new URL('20261031_032_legajos_atomic_roster_sync.sql', root)), 'utf8'),
    readFile(fileURLToPath(new URL('20261031_025_preserve_manual_manager_override.sql', root)), 'utf8'),
    readFile(fileURLToPath(new URL('20261031_026_vendor_manager_inheritance.sql', root)), 'utf8'),
  ]);

  assert.match(rebuild, /create trigger staff_members_sync_roster_projections[\s\S]*after insert or delete or update on public\.staff_members[\s\S]*rebuild_roster_projections_from_legajos/);
  assert.match(rebuild, /resource\.effective_manager_source = 'inherited'/);
  assert.match(rebuild, /set name = supervisor\.full_name,[\s\S]*?manager_staff_id = supervisor\.effective_manager_staff_id/);
  assert.match(rebuild, /supervisor_staff_id = staff\.responsible_staff_id/);
  assert.match(manual, /old\.effective_manager_source = 'manual'/);
  assert.match(sellerInheritance, /supervisor\.effective_manager_staff_id/);
});

test('contrato S16: traslado, exclusión y cascada se resuelven por gerente efectivo', () => {
  const staff: ScopeFixture[] = [
    { id: 'supervisor-1', active: true, responsibleStaffId: 'manager-old', effectiveManagerStaffId: 'manager-new' },
    { id: 'seller-1', active: true, responsibleStaffId: 'supervisor-1', effectiveManagerStaffId: 'manager-new' },
    { id: 'seller-2', active: true, responsibleStaffId: 'supervisor-1', effectiveManagerStaffId: 'manager-new' },
  ];

  assert.deepEqual(managerScope('manager-new', new Set(['manager-old', 'manager-new']), staff), ['seller-1', 'seller-2', 'supervisor-1']);
  assert.deepEqual(managerScope('manager-old', new Set(['manager-old', 'manager-new']), staff), []);
});

test('contrato: nuevo supervisor, excepción manual y referencias inválidas no amplían Gerencia', () => {
  const staff: ScopeFixture[] = [
    // Vendedor trasladado al supervisor de la nueva Gerencia.
    { id: 'seller-transferred', active: true, responsibleStaffId: 'supervisor-new', effectiveManagerStaffId: 'manager-new' },
    // Excepción manual válida de un supervisor y de sus descendientes heredados.
    { id: 'supervisor-manual', active: true, responsibleStaffId: 'manager-old', effectiveManagerStaffId: 'manager-new' },
    { id: 'seller-inherited', active: true, responsibleStaffId: 'supervisor-manual', effectiveManagerStaffId: 'manager-new' },
    // Sin gerente, gerente inexistente y gerente inactivo: no se asignan al actor activo.
    { id: 'without-manager', active: true, responsibleStaffId: 'supervisor-new', effectiveManagerStaffId: null },
    { id: 'invalid-manager', active: true, responsibleStaffId: 'supervisor-new', effectiveManagerStaffId: 'manager-missing' },
    { id: 'inactive-manager', active: true, responsibleStaffId: 'supervisor-new', effectiveManagerStaffId: 'manager-inactive' },
    // Las proyecciones atrasadas no son una entrada del cálculo de Gerencia.
    { id: 'stale-projection', active: true, responsibleStaffId: 'supervisor-new', effectiveManagerStaffId: 'manager-new', teamId: 'old-team', sellerId: 'old-seller' },
  ];

  assert.deepEqual(managerScope('manager-new', new Set(['manager-old', 'manager-new']), staff), [
    'seller-inherited', 'seller-transferred', 'stale-projection', 'supervisor-manual',
  ]);
  assert.deepEqual(managerScope('manager-old', new Set(['manager-old', 'manager-new']), staff), []);
  assert.deepEqual(managerScope('manager-inactive', new Set(['manager-old', 'manager-new']), staff), []);
});

test('contrato: Supervisión, Admin y RR. HH. mantienen sus alcances independientes', () => {
  const staff: ScopeFixture[] = [
    { id: 'supervisor-1', active: true, responsibleStaffId: null, effectiveManagerStaffId: 'manager-1' },
    { id: 'seller-1', active: true, responsibleStaffId: 'supervisor-1', effectiveManagerStaffId: 'manager-1' },
    { id: 'seller-2', active: true, responsibleStaffId: 'supervisor-1', effectiveManagerStaffId: 'manager-2' },
  ];

  assert.deepEqual(supervisorScope('supervisor-1', staff), ['seller-1', 'seller-2', 'supervisor-1']);
  assert.deepEqual(managerScope('manager-1', new Set(['manager-1', 'manager-2']), staff), ['seller-1', 'supervisor-1']);
  assert.deepEqual(managerScope('manager-2', new Set(['manager-1', 'manager-2']), staff), ['seller-2']);
});
