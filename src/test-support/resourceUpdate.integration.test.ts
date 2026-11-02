import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';

const databaseUrl = process.env.NAVE_TEST_DATABASE_URL;
const supabaseUrl = process.env.NAVE_TEST_SUPABASE_URL;
const anonKey = process.env.NAVE_TEST_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.NAVE_TEST_SUPABASE_SERVICE_ROLE_KEY;
const integrationEnabled = Boolean(databaseUrl && supabaseUrl && anonKey && serviceRoleKey)
  && process.env.NAVE_TEST_DATABASE_ACKNOWLEDGE_ISOLATED === '1';

type ApiResult = { status: number; body: { success?: boolean; message?: string; resource?: Record<string, unknown> } };

test('integración aislada: resource-update autoriza el traslado y conserva las proyecciones de Legajos', {
  skip: integrationEnabled ? undefined : 'Requiere credenciales de Supabase local y NAVE_TEST_DATABASE_ACKNOWLEDGE_ISOLATED=1.',
}, async () => {
  const databaseTarget = new URL(databaseUrl!);
  const supabaseTarget = new URL(supabaseUrl!);
  assert.ok(['127.0.0.1', 'localhost'].includes(databaseTarget.hostname) && databaseTarget.port === '54322');
  assert.ok(['127.0.0.1', 'localhost'].includes(supabaseTarget.hostname) && supabaseTarget.port === '54321');

  const { Client } = await import('pg');
  const database = new Client({ connectionString: databaseUrl });
  const admin = createClient(supabaseUrl!, serviceRoleKey!, { auth: { autoRefreshToken: false, persistSession: false } });
  const marker = `BLK04_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
  const authUserIds: string[] = [];
  await database.connect();

  const createIdentity = async (name: string, role: 'rrhh' | 'gerente' | 'supervisor', staffMemberId: string | null) => {
    const email = `${marker.toLowerCase()}_${name.toLowerCase()}@local.test`;
    const password = `Local-${marker}-Only!`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(created.error);
    assert.ok(created.data.user?.id);
    const id = created.data.user.id;
    authUserIds.push(id);
    await database.query('insert into public.profiles(id,full_name,role,staff_member_id) values($1,$2,$3::public.app_role,$4)', [id, `${marker}_${name}`, role, staffMemberId]);
    const signedIn = await createClient(supabaseUrl!, anonKey!, { auth: { autoRefreshToken: false, persistSession: false } }).auth.signInWithPassword({ email, password });
    assert.ifError(signedIn.error);
    assert.ok(signedIn.data.session?.access_token);
    return signedIn.data.session.access_token;
  };

  try {
    const roles = await database.query<{ id: string; area_id: string; app_role_mapping: string | null; creates_seller_record: boolean }>(
      'select id,area_id,app_role_mapping,creates_seller_record from public.hr_roles where active=true',
    );
    const managerRole = roles.rows.find((role) => role.app_role_mapping === 'gerente');
    const supervisorRole = roles.rows.find((role) => role.app_role_mapping === 'supervisor');
    const rrhhRole = roles.rows.find((role) => role.app_role_mapping === 'rrhh');
    const sellerRole = roles.rows.find((role) => role.creates_seller_record);
    assert.ok(managerRole && supervisorRole && rrhhRole && sellerRole, 'Faltan cargos requeridos en la base local.');

    let dni = 10_000_000 + Math.floor(Math.random() * 70_000_000);
    let sellerDni = '';
    const createStaff = async (suffix: string, role: { id: string; area_id: string }, responsibleId: string | null) => {
      dni += 1;
      const result = await database.query<{ id: string }>(
        `insert into public.staff_members(full_name,dni,legajo,employment_type,active,area_id,role_id,responsible_staff_id)
         values($1,$2,$3,'PLANTA',true,$4,$5,$6) returning id`,
        [`${marker}_${suffix}`, String(dni), `${marker}_${suffix}`, role.area_id, role.id, responsibleId],
      );
      if (suffix === 'V1') sellerDni = String(dni);
      return result.rows[0].id;
    };

    const managerOne = await createStaff('G1', managerRole!, null);
    const managerTwo = await createStaff('G2', managerRole!, null);
    const supervisorOne = await createStaff('S1', supervisorRole!, managerOne);
    const supervisorOneB = await createStaff('S1B', supervisorRole!, managerOne);
    const supervisorTwo = await createStaff('S2', supervisorRole!, managerTwo);
    const seller = await createStaff('V1', sellerRole!, supervisorOne);
    const rrhhStaff = await createStaff('RRHH', rrhhRole!, null);

    const rrhhToken = await createIdentity('RRHH', 'rrhh', rrhhStaff);
    const managerToken = await createIdentity('GERENTE', 'gerente', managerOne);
    const supervisorToken = await createIdentity('SUPERVISOR', 'supervisor', supervisorOne);
    const { default: handler } = await import('../../api/resource-update.ts');
    const { default: directoryHandler } = await import('../../api/resources-directory.ts');
    const sellerRequest = (responsible_staff_id: string) => ({
      id: seller, full_name: `${marker}_V1`, dni: sellerDni, legajo: `${marker}_V1`, employment_type: 'PLANTA',
      role_id: sellerRole!.id, responsible_staff_id, manager_staff_id: '', active: true,
      deactivation_type: 'administrative_correction', deactivation_reason: '', transfer_reason: 'prueba de traslado aislada',
    });
    const call = async (token: string | null, body: Record<string, unknown>): Promise<ApiResult> => {
      let status = 0; let result: ApiResult['body'] = {};
      const response = {
        status: (code: number) => { status = code; return response; },
        json: (payload: unknown) => { result = payload as ApiResult['body']; return response; },
      };
      await handler({ method: 'PATCH', headers: token ? { authorization: `Bearer ${token}` } : {}, body }, response);
      return { status, body: result };
    };
    const destinationsFor = async (token: string) => {
      let status = 0; let result: { success?: boolean; data?: { responsibles?: { id: string }[] } } = {};
      const response = { status: (code: number) => { status = code; return response; }, json: (payload: unknown) => { result = payload as typeof result; return response; } };
      await directoryHandler({ method: 'GET', headers: { authorization: `Bearer ${token}` }, query: { status: 'active', page: '1', size: '50' } }, response);
      assert.equal(status, 200);
      return result.data?.responsibles || [];
    };

    const managerDestinations = await destinationsFor(managerToken);
    assert.ok(managerDestinations.some((item) => item.id === supervisorOneB), 'Gerencia debe recibir supervisores de su estructura.');
    assert.ok(!managerDestinations.some((item) => item.id === supervisorTwo), 'Gerencia no debe recibir supervisores de otra gerencia.');
    const rrhhDestinations = await destinationsFor(rrhhToken);
    assert.ok(rrhhDestinations.some((item) => item.id === supervisorTwo), 'RRHH conserva el alcance global ya autorizado.');

    assert.equal((await call(null, sellerRequest(supervisorTwo))).status, 401, 'Sin sesión se rechaza antes de modificar Legajos.');
    assert.equal((await call(supervisorToken, sellerRequest(supervisorTwo))).status, 403, 'Supervisión no puede trasladar su estructura.');
    assert.equal((await call(managerToken, sellerRequest(supervisorTwo))).status, 403, 'Gerencia no puede trasladar hacia otra gerencia.');
    const managerTransfer = await call(managerToken, sellerRequest(supervisorOneB));
    assert.equal(managerTransfer.status, 200, managerTransfer.body.message);
    const afterManagerTransfer = await database.query<{ responsible_staff_id: string; seller_id: string; team_id: string; destination_team_id: string }>(`
      select staff.responsible_staff_id,seller.id as seller_id,seller.team_id,destination.id as destination_team_id
      from public.staff_members staff join public.sellers seller on seller.staff_member_id=staff.id
      join public.teams destination on destination.supervisor_staff_id=$2 and destination.active and destination.is_sales_team
      where staff.id=$1`, [seller, supervisorOneB]);
    assert.equal(afterManagerTransfer.rows[0].responsible_staff_id, supervisorOneB);
    assert.equal(afterManagerTransfer.rows[0].team_id, afterManagerTransfer.rows[0].destination_team_id, 'La proyección debe pasar al equipo de destino.');
    const sellerId = afterManagerTransfer.rows[0].seller_id;
    const rrhhTransfer = await call(rrhhToken, sellerRequest(supervisorTwo));
    assert.equal(rrhhTransfer.status, 200, rrhhTransfer.body.message);
    const afterRrhhTransfer = await database.query<{ id: string; responsible_staff_id: string; team_id: string; destination_team_id: string }>(`
      select seller.id,staff.responsible_staff_id,seller.team_id,destination.id as destination_team_id
      from public.staff_members staff join public.sellers seller on seller.staff_member_id=staff.id
      join public.teams destination on destination.supervisor_staff_id=$2 and destination.active and destination.is_sales_team
      where staff.id=$1`, [seller, supervisorTwo]);
    assert.equal(afterRrhhTransfer.rows[0].id, sellerId, 'El traslado conserva la identidad proyectada del vendedor.');
    assert.equal(afterRrhhTransfer.rows[0].responsible_staff_id, supervisorTwo);
    assert.equal(afterRrhhTransfer.rows[0].team_id, afterRrhhTransfer.rows[0].destination_team_id);
    const audit = await database.query<{ changed_by: string; before_value: { supervisor_staff_id?: string }; after_value: { supervisor_staff_id?: string; reason?: string } }>(
      `select changed_by,before_value,after_value from public.roster_change_log
       where entity_type='staff_member' and entity_id=$1 and before_value->>'event'='seller_transfer' order by created_at desc limit 1`, [seller],
    );
    assert.equal(audit.rowCount, 1, 'El traslado debe dejar trazabilidad persistente.');
    assert.equal(audit.rows[0].before_value.supervisor_staff_id, supervisorOneB);
    assert.equal(audit.rows[0].after_value.supervisor_staff_id, supervisorTwo);
    assert.equal(audit.rows[0].after_value.reason, 'prueba de traslado aislada');
    assert.ok(audit.rows[0].changed_by, 'El actor autenticado debe quedar registrado.');
  } finally {
    for (const userId of authUserIds) await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    await database.end();
  }
});
