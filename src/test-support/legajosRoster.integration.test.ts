import assert from 'node:assert/strict';
import test from 'node:test';

const databaseUrl = process.env.NAVE_TEST_DATABASE_URL;
const integrationEnabled = Boolean(databaseUrl) && process.env.NAVE_TEST_DATABASE_ACKNOWLEDGE_ISOLATED === '1';

test('integración aislada: trigger de Legajos reconstruye equipos y vendedores sin perder historial', {
  skip: integrationEnabled ? undefined : 'Requiere NAVE_TEST_DATABASE_URL y NAVE_TEST_DATABASE_ACKNOWLEDGE_ISOLATED=1 para una base aislada.',
}, async () => {
  const { Client } = await import('pg');
  const client = new Client({ connectionString: databaseUrl });
  const marker = `BLK03_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
  await client.connect();
  try {
    await client.query('begin');
    const roles = await client.query<{ id: string; area_id: string; app_role_mapping: string | null; creates_seller_record: boolean }>(`
      select id, area_id, app_role_mapping, creates_seller_record
      from public.hr_roles where active=true
    `);
    const managerRole = roles.rows.find(role => role.app_role_mapping === 'gerente');
    const supervisorRole = roles.rows.find(role => role.app_role_mapping === 'supervisor');
    const sellerRole = roles.rows.find(role => role.creates_seller_record);
    assert.ok(managerRole && supervisorRole && sellerRole, 'La base aislada debe contener los roles Gerente, Supervisor y Vendedor.');

    const createStaff = async (suffix: string, role: { id: string; area_id: string }, responsibleId: string | null, dni: string) => {
      const result = await client.query<{ id: string }>(`
        insert into public.staff_members(full_name,dni,legajo,employment_type,active,area_id,role_id,responsible_staff_id)
        values($1,$2,$3,'PLANTA',true,$4,$5,$6)
        returning id
      `, [`${marker}_${suffix}`, dni, `${marker}_${suffix}`, role.area_id, role.id, responsibleId]);
      return result.rows[0].id;
    };

    const managerOne = await createStaff('G1', managerRole, null, '90100001');
    const managerTwo = await createStaff('G2', managerRole, null, '90100002');
    const supervisorOne = await createStaff('S1', supervisorRole, managerOne, '90100003');
    const supervisorTwo = await createStaff('S2', supervisorRole, managerTwo, '90100004');
    const sellerStaff = await createStaff('V1', sellerRole, supervisorOne, '90100005');

    const firstSeller = await client.query<{ id: string; team_id: string | null; active: boolean }>('select id,team_id,active from public.sellers where staff_member_id=$1', [sellerStaff]);
    assert.equal(firstSeller.rowCount, 1, 'El alta del vendedor debe crear una sola proyección.');
    const sellerId = firstSeller.rows[0].id;
    const firstTeam = await client.query<{ id: string; manager_staff_id: string | null }>('select id,manager_staff_id from public.teams where supervisor_staff_id=$1 and active=true and is_sales_team=true', [supervisorOne]);
    assert.equal(firstTeam.rowCount, 1, 'El alta del supervisor debe crear un solo equipo.');
    assert.equal(firstSeller.rows[0].team_id, firstTeam.rows[0].id);

    const authUser = await client.query<{ id: string }>(`
      insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values(gen_random_uuid(),'authenticated','authenticated',$1,'{}'::jsonb,'{}'::jsonb,now(),now())
      returning id
    `, [`${marker.toLowerCase()}@local.test`]);
    await client.query(`
      insert into public.profiles(id,full_name,role,staff_member_id)
      values($1,$2,'supervisor'::public.app_role,$3)
    `, [authUser.rows[0].id, `${marker}_S1`, supervisorOne]);
    // The profile is created after the staff row, so this harmless staff
    // update proves that migration 032 refreshes a linked profile's scope.
    await client.query('update public.staff_members set updated_at=now() where id=$1', [supervisorOne]);
    const linkedProfile = await client.query<{ role: string; team_id: string | null }>('select role,team_id from public.profiles where id=$1', [authUser.rows[0].id]);
    assert.equal(linkedProfile.rows[0].role, 'supervisor');
    assert.equal(linkedProfile.rows[0].team_id, firstTeam.rows[0].id, 'El perfil vinculado debe recibir el equipo derivado.');

    await client.query('update public.staff_members set responsible_staff_id=$2 where id=$1', [sellerStaff, supervisorTwo]);
    const movedSeller = await client.query<{ id: string; team_id: string | null }>('select id,team_id from public.sellers where staff_member_id=$1', [sellerStaff]);
    const secondTeam = await client.query<{ id: string }>('select id from public.teams where supervisor_staff_id=$1 and active=true and is_sales_team=true', [supervisorTwo]);
    assert.equal(movedSeller.rows[0].id, sellerId, 'El traslado no puede crear un segundo vendedor.');
    assert.equal(movedSeller.rows[0].team_id, secondTeam.rows[0].id);

    const sellerUnderFirstSupervisor = await createStaff('V2', sellerRole, supervisorOne, '90100006');
    const sellerUnderFirstProjection = await client.query<{ id: string; active: boolean; team_id: string | null }>('select id,active,team_id from public.sellers where staff_member_id=$1', [sellerUnderFirstSupervisor]);
    assert.equal(sellerUnderFirstProjection.rowCount, 1);

    await client.query('update public.staff_members set responsible_staff_id=$2 where id=$1', [supervisorOne, managerTwo]);
    const managerChangedTeam = await client.query<{ manager_staff_id: string | null }>('select manager_staff_id from public.teams where id=$1', [firstTeam.rows[0].id]);
    assert.equal(managerChangedTeam.rows[0].manager_staff_id, managerTwo, 'El equipo debe reflejar el cambio de gerencia.');

    await client.query('select public.rebuild_roster_projections_from_legajos()');
    await client.query('select public.rebuild_roster_projections_from_legajos()');
    const duplicates = await client.query<{ total: number }>('select count(*)::int as total from public.sellers where staff_member_id=$1', [sellerStaff]);
    assert.equal(duplicates.rows[0].total, 1, 'La reconstrucción repetida debe ser idempotente para vendedores.');
    const teamDuplicates = await client.query<{ total: number }>('select count(*)::int as total from public.teams where supervisor_staff_id=$1', [supervisorOne]);
    assert.equal(teamDuplicates.rows[0].total, 1, 'La reconstrucción repetida debe conservar una sola proyección de equipo.');

    await client.query('update public.staff_members set active=false where id=$1', [supervisorOne]);
    const deactivatedTeam = await client.query<{ active: boolean }>('select active from public.teams where id=$1', [firstTeam.rows[0].id]);
    const unassignedSeller = await client.query<{ id: string; active: boolean; team_id: string | null }>('select id,active,team_id from public.sellers where staff_member_id=$1', [sellerUnderFirstSupervisor]);
    assert.equal(deactivatedTeam.rows[0].active, false, 'La baja del supervisor debe inactivar su equipo.');
    assert.equal(unassignedSeller.rows[0].id, sellerUnderFirstProjection.rows[0].id, 'La baja del supervisor debe conservar el vendedor histórico.');
    assert.equal(unassignedSeller.rows[0].active, true, 'La baja del supervisor no debe convertir al vendedor activo en baja.');
    assert.equal(unassignedSeller.rows[0].team_id, null, 'El vendedor queda temporalmente sin equipo.');
    const profileAfterSupervisorDeactivation = await client.query<{ team_id: string | null }>('select team_id from public.profiles where id=$1', [authUser.rows[0].id]);
    assert.equal(profileAfterSupervisorDeactivation.rows[0].team_id, firstTeam.rows[0].id, 'El trigger conserva el último alcance del perfil inactivo; resource-update impide esta baja mientras exista una cuenta vinculada.');

    await client.query('update public.staff_members set active=false where id=$1', [sellerStaff]);
    const historicalSeller = await client.query<{ id: string; active: boolean }>('select id,active from public.sellers where staff_member_id=$1', [sellerStaff]);
    assert.equal(historicalSeller.rows[0].id, sellerId, 'La baja no puede borrar la proyección histórica.');
    assert.equal(historicalSeller.rows[0].active, false);
  } finally {
    await client.query('rollback').catch(() => undefined);
    await client.end();
  }
});
