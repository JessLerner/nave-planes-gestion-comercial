import assert from 'node:assert/strict';
import test from 'node:test';
import { canEditRoster, projectRoster, type RosterState, type Staff } from './legajosRosterModel';

const baseState = (): RosterState => ({
  staff: [
    { id: 'g1', role: 'gerente', active: true, responsibleId: null, managerId: null, managerSource: 'inherited' },
    { id: 'g2', role: 'gerente', active: true, responsibleId: null, managerId: null, managerSource: 'inherited' },
    { id: 's1', role: 'supervisor', active: true, responsibleId: 'g1', managerId: null, managerSource: 'inherited' },
    { id: 's2', role: 'supervisor', active: true, responsibleId: 'g2', managerId: null, managerSource: 'inherited' },
    { id: 'v1', role: 'vendedor', active: true, responsibleId: 's1', managerId: null, managerSource: 'inherited' },
  ],
  teams: [],
  sellers: [],
  profiles: [
    { staffId: 'g1', role: 'gerente', teamId: null },
    { staffId: 's1', role: 'supervisor', teamId: null },
  ],
});

const member = (state: RosterState, id: string) => state.staff.find(item => item.id === id)!;

test('alta de vendedor crea una única proyección en el equipo de su supervisor', () => {
  const projected = projectRoster(baseState());
  assert.deepEqual(projected.teams.filter(team => team.active).map(team => team.supervisorId).sort(), ['s1', 's2']);
  assert.deepEqual(projected.sellers, [{ id: 'seller:v1', staffId: 'v1', teamId: 'team:s1', active: true, terminationDate: null }]);
  assert.equal(projected.profiles.find(profile => profile.staffId === 's1')?.teamId, 'team:s1');
});

test('cambio de supervisor traslada al vendedor sin crear una segunda proyección', () => {
  const first = projectRoster(baseState());
  member(first, 'v1').responsibleId = 's2';
  const moved = projectRoster(first);
  assert.equal(moved.sellers.length, 1);
  assert.equal(moved.sellers[0].id, 'seller:v1');
  assert.equal(moved.sellers[0].teamId, 'team:s2');
  assert.equal(member(moved, 'v1').managerId, 'g2');
});

test('cambio de gerencia actualiza equipo, vendedor y alcance derivado', () => {
  const first = projectRoster(baseState());
  member(first, 's1').responsibleId = 'g2';
  const changed = projectRoster(first);
  assert.equal(changed.teams.find(team => team.supervisorId === 's1')?.managerId, 'g2');
  assert.equal(member(changed, 'v1').managerId, 'g2');
  assert.equal(changed.profiles.find(profile => profile.staffId === 's1')?.teamId, 'team:s1');
});

test('baja real conserva el vendedor histórico inactivo y permite contar sólo la terminación', () => {
  const first = projectRoster(baseState());
  member(first, 'v1').active = false;
  const ended = projectRoster(first, '2030-02-01');
  assert.deepEqual(ended.sellers, [{ id: 'seller:v1', staffId: 'v1', teamId: 'team:s1', active: false, terminationDate: '2030-02-01' }]);
  const events = [{ staffId: 'v1', type: 'termination' as const }];
  assert.equal(events.filter(event => event.type === 'termination').length, 1);
});

test('corrección administrativa conserva el histórico pero no se contabiliza como rotación', () => {
  const first = projectRoster(baseState());
  member(first, 'v1').active = false;
  const corrected = projectRoster(first, '2030-02-01');
  const events: Array<{ staffId: string; type: 'termination' | 'administrative_correction' }> = [{ staffId: 'v1', type: 'administrative_correction' }];
  assert.equal(corrected.sellers[0].id, 'seller:v1');
  assert.equal(corrected.sellers[0].active, false);
  assert.equal(events.filter(event => event.type === 'termination').length, 0);
});

test('las proyecciones son idempotentes y no duplican equipos ni vendedores', () => {
  const first = projectRoster(baseState());
  const second = projectRoster(first);
  assert.equal(second.teams.filter(team => team.active && team.supervisorId === 's1').length, 1);
  assert.equal(second.sellers.filter(seller => seller.staffId === 'v1').length, 1);
  assert.deepEqual(second, first);
});

test('un supervisor inactivo desactiva su equipo sin convertir a sus vendedores en bajas', () => {
  const first = projectRoster(baseState());
  member(first, 's1').active = false;
  const changed = projectRoster(first);
  assert.equal(changed.teams.find(team => team.supervisorId === 's1')?.active, false);
  assert.equal(changed.sellers.find(seller => seller.staffId === 'v1')?.active, true);
  assert.equal(changed.sellers.find(seller => seller.staffId === 'v1')?.teamId, null);
  assert.equal(changed.sellers.find(seller => seller.staffId === 'v1')?.id, 'seller:v1');
});

test('el alcance de modificación rechaza cambios fuera de la estructura autorizada', () => {
  const state = projectRoster(baseState());
  const manager = member(state, 'g1');
  const ownSeller = member(state, 'v1');
  const otherSeller: Staff = { id: 'v2', role: 'vendedor', active: true, responsibleId: 's2', managerId: 'g2', managerSource: 'inherited' };
  assert.equal(canEditRoster(manager, ownSeller, [...state.staff, otherSeller]), true);
  assert.equal(canEditRoster(manager, otherSeller, [...state.staff, otherSeller]), false);
  assert.equal(canEditRoster({ id: 's1', role: 'supervisor' }, ownSeller, state.staff), false);
  assert.equal(canEditRoster({ id: 'rr', role: 'rrhh' }, otherSeller, [...state.staff, otherSeller]), true);
});
