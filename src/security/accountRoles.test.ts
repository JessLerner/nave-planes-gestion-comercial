import assert from 'node:assert/strict';
import test from 'node:test';
import { canInviteRole, canUseOperationalEndpoint } from './accountRoles';

test('la invitación valida actor y rol para altas y reenvíos', () => {
  for (const actor of ['admin', 'direccion']) {
    for (const target of ['direccion','administrativo','rrhh','marketing','contaduria','gerente','supervisor']) {
      assert.equal(canInviteRole(actor, target), true);
    }
    for (const target of ['admin','vendedor','constructor',null]) assert.equal(canInviteRole(actor,target),false);
  }
  assert.equal(canInviteRole('rrhh','direccion'),false);
  assert.equal(canInviteRole('gerente','supervisor'),true);
  assert.equal(canInviteRole('gerente','gerente'),false);
  assert.equal(canInviteRole('supervisor','supervisor'),false);
});

test('el Worker restringe endpoints para cuentas sin funciones y administración granular', () => {
  for (const actor of ['marketing','contaduria','vendedor',undefined]) {
    assert.equal(canUseOperationalEndpoint(actor,'/api/operational-data'),false);
    assert.equal(canUseOperationalEndpoint(actor,'/api/resource-update'),false);
  }
  assert.equal(canUseOperationalEndpoint('administrativo','/api/access-users'),false);
  assert.equal(canUseOperationalEndpoint('administrativo','/api/resources-directory'),true);
});
