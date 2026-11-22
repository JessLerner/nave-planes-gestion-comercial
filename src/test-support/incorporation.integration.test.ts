import { canEditIncorporation } from '../components/hr/incorporationEditing';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from 'pg';
import { createClient } from '@supabase/supabase-js';
import requests from '../../api/incorporation-requests';
import documents from '../../api/incorporation-documents';
import decisions from '../../api/incorporation-decisions';

const databaseUrl = process.env.NAVE_TEST_DATABASE_URL; const supabaseUrl = process.env.NAVE_TEST_SUPABASE_URL; const anonKey = process.env.NAVE_TEST_SUPABASE_ANON_KEY; const serviceKey = process.env.NAVE_TEST_SUPABASE_SERVICE_ROLE_KEY;
test('integración Sprint 5: supervisor observa, corrige y Gerencia autoriza Coaching', { skip: !(databaseUrl && supabaseUrl && anonKey && serviceKey && process.env.NAVE_TEST_DATABASE_ACKNOWLEDGE_ISOLATED === '1') }, async () => {
  const pg = new URL(databaseUrl!);
  const api = new URL(supabaseUrl!);
  assert.ok(['127.0.0.1','localhost'].includes(pg.hostname) && pg.port === '54322');
  assert.ok(['127.0.0.1','localhost'].includes(api.hostname) && api.port === '54321');
  assert.equal(process.env.POSTGRES_URL || process.env.DATABASE_URL, databaseUrl);
  assert.equal(process.env.SUPABASE_URL, supabaseUrl);
  let requestId: string | undefined;
  const paths: string[] = [];
  const db = new Client({ connectionString: databaseUrl }); await db.connect(); const admin = createClient(supabaseUrl!, serviceKey!, { auth: { autoRefreshToken: false, persistSession: false } }); const stamp = `S5_${Date.now()}`; const users: string[] = []; const staff: string[] = [];
  const call = async (handler: any, token: string, body?: Record<string, unknown>, query?: Record<string, unknown>) => { let status = 0; let payload: any; const response = { status: (code: number) => { status = code; return response; }, json: (value: unknown) => { payload = value; return response; } }; await handler({ method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${token}` }, body, query }, response); return { status, payload }; };
  try {
    const initialUsers = (await db.query('select count(*)::int as count from auth.users')).rows[0].count;
    const roles = await db.query(`select id,area_id,app_role_mapping from public.hr_roles where active`); const managerRole = roles.rows.find(row => row.app_role_mapping === 'gerente'); const supervisorRole = roles.rows.find(row => row.app_role_mapping === 'supervisor'); assert.ok(managerRole && supervisorRole); let dni = 70_000_000 + Math.floor(Math.random() * 9_000_000); const nextDni = async () => { for (;;) { const value = String(++dni); if (!(await db.query('select 1 from public.staff_members where dni=$1', [value])).rowCount) return value; } }; const candidateDni = await nextDni();
    const addStaff = async (name: string, role: any, parent: string | null = null) => { const fixtureDni = await nextDni(); const created = await db.query(`insert into public.staff_members(full_name,dni,legajo,employment_type,active,area_id,role_id,responsible_staff_id) values($1,$2,$3,'PLANTA',true,$4,$5,$6) returning id`, [name, fixtureDni, `${stamp}_${fixtureDni}`, role.area_id, role.id, parent]); staff.push(created.rows[0].id); return created.rows[0].id; };
    const manager = await addStaff(`${stamp} GERENTE`, managerRole); const supervisor = await addStaff(`${stamp} SUPERVISOR`, supervisorRole, manager);
    const addUser = async (email: string, role: string, member: string) => { const created = await admin.auth.admin.createUser({ email, password: 'NavePlan!S5', email_confirm: true }); assert.ifError(created.error); users.push(created.data.user!.id); await db.query(`insert into public.profiles(id,full_name,role,staff_member_id) values($1,$2,$3::public.app_role,$4)`, [created.data.user!.id, email, role, member]); const client = createClient(supabaseUrl!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } }); const signed = await client.auth.signInWithPassword({ email, password: 'NavePlan!S5' }); assert.ifError(signed.error); return {client, token: signed.data.session!.access_token}; };
    const {token: supervisorToken, client: owner} = await addUser(`${stamp.toLowerCase()}-supervisor@naveplan.local`, 'supervisor', supervisor); const {token: managerToken, client: reviewer} = await addUser(`${stamp.toLowerCase()}-gerente@naveplan.local`, 'gerente', manager); const otherStaff = await addStaff(stamp + ' OTRO', supervisorRole, manager);
    const other = await addUser(stamp.toLowerCase()+'-otro@naveplan.local','supervisor',otherStaff);
    const targetRole = roles.rows.find(row => !row.app_role_mapping);
    assert.ok(targetRole); const partial = await call(requests, supervisorToken, { action: 'save', surname: '  Pérez  ' }); requestId = partial.payload.data?.id; assert.equal(partial.status, 201, 'un borrador parcial se guarda'); assert.equal(partial.payload.data.surname, 'PEREZ'); assert.equal((await call(requests, supervisorToken, { action: 'save', id: partial.payload.data.id, surname: 'Pérez' })).status, 200, 'el borrador parcial conserva el ID');
    assert.ok((await call(requests,supervisorToken)).payload.data.some((r: any) => r.id === requestId));
    assert.ok(!(await call(requests,other.token)).payload.data.some((r: any) => r.id === requestId));
    for (const kind of ['dni_front', 'dni_back', 'cv', 'criminal_record', 'employment_application']) { const path = `incorporations/${requestId}/${kind}.pdf`; paths.push(path); assert.ifError((await owner.storage.from('rrhh-legajos').upload(path, new Blob(['s5'], { type: 'application/pdf' }), { contentType: 'application/pdf' })).error); assert.equal((await call(documents, supervisorToken, { request_id: requestId, document_kind: kind, storage_path: path, original_filename: `${kind}.pdf`, content_type: 'application/pdf', size_bytes: 2 })).status, 200); }
    assert.equal((await call(documents,other.token,undefined,{request_id:requestId})).status,403);
    assert.ifError((await owner.storage.from('rrhh-legajos').download(paths[0])).error);
    assert.ok((await other.client.storage.from('rrhh-legajos').download(paths[0])).error);
    const reopened = await call(documents, supervisorToken, undefined, { request_id: requestId }); assert.equal(reopened.payload.data.length, 5, 'la reapertura recupera los metadatos documentales'); const replacementPath = `incorporations/${requestId}/dni-front-reemplazo.pdf`; paths.push(replacementPath); assert.ifError((await owner.storage.from('rrhh-legajos').upload(replacementPath, new Blob(['nuevo'], { type: 'application/pdf' }), { contentType: 'application/pdf' })).error); assert.equal((await call(documents, supervisorToken, { request_id: requestId, document_kind: 'dni_front', storage_path: replacementPath, original_filename: 'dni-frente-reemplazo.pdf', content_type: 'application/pdf', size_bytes: 5 })).status, 200); assert.equal((await call(documents, supervisorToken, undefined, { request_id: requestId })).payload.data.find((document: any) => document.document_kind === 'dni_front').original_filename, 'dni-frente-reemplazo.pdf', 'el reemplazo conserva el vínculo documental');
    const state = async (status: string, editable: boolean) => {
      const list = await call(requests,supervisorToken);
      assert.equal(list.status,200);
      const row = list.payload.data.find((item: any) => item.id === requestId);
      assert.equal(row.status,status);
      assert.equal(canEditIncorporation(true,row),editable);
      return row;
    };
    await state('borrador',true);
    const save = await call(requests, supervisorToken, { action: 'save', id: requestId, surname: 'PRUEBA', given_names: 'COACHING', dni: candidateDni, birth_date: '1990-01-01', planned_start_date: '2026-11-05', role_id: targetRole.id, area_id: targetRole.area_id }); assert.equal(save.status, 200); assert.equal(save.payload.data.id, requestId);
    assert.equal((await call(requests, supervisorToken, { action: 'save', id: requestId, surname: 'PRUEBA', given_names: 'COACHING CORREGIDO', dni: candidateDni, birth_date: '1990-01-01', planned_start_date: '2026-11-05', role_id: targetRole.id, area_id: targetRole.area_id })).status, 200, 'el borrador conserva el mismo ID');
    assert.equal((await call(requests, supervisorToken, { action: 'submit', id: requestId })).status, 200); await state('pendiente_aprobacion',false); assert.ifError((await reviewer.storage.from('rrhh-legajos').download(paths[1])).error); assert.equal((await call(requests,supervisorToken,{action:'save',id:requestId})).status,409); assert.ok((await call(requests, managerToken)).payload.data.some((row: any) => row.id === requestId), 'Gerencia recibe su estructura'); assert.equal((await call(documents, managerToken, undefined, { request_id: requestId })).status, 200, 'Gerencia revisa documentos de su estructura');
    assert.equal((await call(decisions, managerToken, { request_id: requestId, decision: 'observado', reason: 'Corregir nombre' })).status, 200); assert.equal((await state('observado',true)).review_note,'Corregir nombre'); assert.equal((await call(requests, supervisorToken, { action: 'save', id: requestId, surname: 'PRUEBA', given_names: 'COACHING FINAL', dni: candidateDni, birth_date: '1990-01-01', planned_start_date: '2026-11-05', role_id: targetRole.id, area_id: targetRole.area_id })).status, 200); assert.equal((await call(requests, supervisorToken, { action: 'submit', id: requestId })).status, 200); assert.equal((await call(decisions, managerToken, { request_id: requestId, decision: 'autorizado', reason: 'OK' })).status, 200);
    await state('autorizado',false);
    const history = await db.query('select decision from public.incorporation_request_decisions where request_id=$1 order by decided_at',[requestId]);
    assert.deepEqual(history.rows.map(row => row.decision), ['observado','autorizado']);
    assert.equal((await db.query("select 1 from public.incorporation_request_audit where request_id=$1 and event_type='correction_resubmitted' and actor_id=$2",[requestId,users[0]])).rowCount,1);
    assert.ok((await call(decisions,managerToken,{request_id:requestId,decision:'autorizado'})).status >= 400);
    assert.equal((await db.query('select 1 from public.incorporation_requests r join public.staff_members s on s.id=r.authorized_staff_member_id where r.id=$1 and s.dni=$2',[requestId,candidateDni])).rowCount,1);
    assert.equal((await db.query('select 1 from auth.users')).rowCount,initialUsers+users.length);
    const created = await db.query(`select active,is_coaching,administrative_status from public.staff_members where dni=$1`, [candidateDni]); assert.equal(created.rowCount,1); assert.deepEqual(created.rows[0], { active: true, is_coaching: true, administrative_status: 'coaching' });
  } finally {
    try {
      if (paths.length) assert.ifError((await admin.storage.from('rrhh-legajos').remove(paths)).error);
      if (requestId) {
        const candidate = await db.query('select authorized_staff_member_id from public.incorporation_requests where id=$1',[requestId]);
        if (candidate.rows[0]?.authorized_staff_member_id) staff.push(candidate.rows[0].authorized_staff_member_id);
        await db.query('delete from public.incorporation_request_audit where request_id=$1',[requestId]);
        await db.query('delete from public.incorporation_requests where id=$1',[requestId]);
      }
      for (const user of users) {
        await db.query('delete from public.profiles where id=$1',[user]);
        assert.ifError((await admin.auth.admin.deleteUser(user)).error);
      }
      const teams = await db.query('select id from public.teams where supervisor_staff_id=any($1::uuid[])',[staff]);
      for (const member of staff.reverse()) await db.query('delete from public.staff_members where id=$1',[member]);
      await db.query('delete from public.teams where id=any($1::uuid[])',[teams.rows.map(row=>row.id)]);
      assert.equal((await db.query('select 1 from storage.objects where bucket_id=$1 and name=any($2::text[])',['rrhh-legajos',paths])).rowCount,0);
      assert.equal((await db.query('select 1 from auth.users where id=any($1::uuid[])',[users])).rowCount,0);
      assert.equal((await db.query('select 1 from public.staff_members where id=any($1::uuid[])',[staff])).rowCount,0);
      assert.equal((await db.query('select 1 from public.incorporation_requests where id=$1',[requestId])).rowCount,0);
    } finally {
      await db.end();
    }
  }
});
