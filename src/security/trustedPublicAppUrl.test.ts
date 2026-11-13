import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { trustedInvitationRedirect } from '../../api/lib/trusted-public-app-url';

test('uses only a valid configured public origin for invitation redirects', () => {
  assert.equal(trustedInvitationRedirect('https://gestioncomercial.naveplan.workers.dev'), 'https://gestioncomercial.naveplan.workers.dev/restablecer-contrasena');
  assert.equal(trustedInvitationRedirect('http://127.0.0.1:8787'), 'http://127.0.0.1:8787/restablecer-contrasena');
});

test('rejects missing, non-root, insecure non-local, or malformed configured origins', () => {
  for (const value of [undefined, '', 'http://evil.example', 'https://example.test/otra-ruta', 'https://example.test/?next=evil', 'not a url']) {
    assert.equal(trustedInvitationRedirect(value), null);
  }
});

test('initial invitations, resends, and email corrections share the trusted redirect', () => {
  const handler = readFileSync(new URL('../../api/access-users.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(handler, /req\.headers\?\.origin/);
  assert.equal((handler.match(/redirect_to:redirectTo/g) || []).length, 2);
  assert.match(handler, /trustedInvitationRedirect\(process\.env\.PUBLIC_APP_URL\)/);
});
