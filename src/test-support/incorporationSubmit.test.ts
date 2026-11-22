import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import requests from '../../api/incorporation-requests';

test('el envio bloquea el borrador propio antes de validar y revierte los rechazos', async (t) => {
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_URL = 'https://auth.invalid';
  process.env.SUPABASE_ANON_KEY = 'synthetic';
  t.after(() => {
    if (oldUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_ANON_KEY;
    else process.env.SUPABASE_ANON_KEY = oldKey;
  });
  t.mock.method(globalThis, 'fetch', async () => Response.json({ id: 'actor' }));
  let inTransaction = false;
  let pending = false;
  let complete = false;
  let commits = 0;
  let rollbacks = 0;
  const client = {
    release() { assert.equal(inTransaction, false); },
    async query(sql: string, args: string[]) {
      if (sql === 'begin') { assert.equal(inTransaction, false); inTransaction = true; }
      else if (sql === 'rollback') { assert.ok(inTransaction); inTransaction = false; rollbacks++; }
      else if (sql === 'commit') { assert.ok(inTransaction); inTransaction = false; commits++; }
      else if (sql.includes('from public.profiles')) return { rows: [{ role: 'supervisor', staff_member_id: 'staff' }] };
      else if (sql.includes('join public.hr_roles')) return { rows: [{ id: 'staff' }] };
      else {
        assert.ok(inTransaction, 'Las validaciones deben compartir el bloqueo de la solicitud');
        if (sql.includes('for update')) {
          assert.match(sql, /requested_by=\$2/);
          assert.deepEqual(args, ['draft', 'actor']);
          return { rows: pending ? [] : [{ surname: 'TEST', given_names: 'UNO', dni: '12345678', birth_date: '2000-01-01', planned_start_date: '2026-11-22', role_id: 'job', area_id: 'area' }] };
        }
        if (sql.includes('from public.hr_roles')) return { rowCount: 1 };
        if (sql.includes('from public.staff_members')) return { rowCount: 0 };
        if (sql.includes('from public.incorporation_request_documents')) {
          return { rows: (complete ? ['dni_front','dni_back','cv','criminal_record','employment_application'] : []).map(document_kind => ({ document_kind })) };
        }
        if (sql.startsWith('update public.incorporation_requests')) pending = true;
        else assert.match(sql, /pg_advisory_xact_lock/);
      }
      return { rows: [] };
    },
  };
  t.mock.method(Pool.prototype, 'connect', async () => client);
  async function submit() {
    let status = 0;
    const res = { status(n: number) { status = n; return this; }, json() { return this; } };
    await requests({ method: 'POST', headers: { authorization: 'Bearer synthetic' }, body: { action: 'submit', id: 'draft' } }, res);
    return status;
  }
  assert.equal(await submit(), 400);
  assert.equal(pending, false);
  complete = true;
  assert.equal(await submit(), 200);
  assert.equal(await submit(), 409);
  assert.deepEqual([commits, rollbacks], [1, 2]);
});
