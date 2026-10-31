import { databasePool } from './lib/database';

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: Record<string, unknown> };
type Response = { status: (code: number) => Response; json: (body: unknown) => Response };
const rawConnectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL || '';
const pool = databasePool(rawConnectionString);

async function userId(request: Request) {
  const value = request.headers?.authorization; const authorization = Array.isArray(value) ? value[0] : value;
  if (!authorization?.startsWith('Bearer ') || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return null;
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: authorization, apikey: process.env.SUPABASE_ANON_KEY } });
  return response.ok ? ((await response.json() as { id?: string }).id || null) : null;
}
const text = (value: unknown) => String(value ?? '').trim();

export default async function handler(request: Request, response: Response) {
  if (request.method !== 'PATCH') return response.status(405).json({ success: false, message: 'Método no permitido.' });
  const user = await userId(request); if (!user) return response.status(401).json({ success: false, message: 'Sesión no válida.' });
  const id = text(request.body?.id); if (!id) return response.status(400).json({ success: false, message: 'Recurso inválido.' });
  const database = await pool.connect();
  try {
    const profile = await database.query<{ role: string; staff_member_id: string | null }>('select role, staff_member_id from public.profiles where id=$1', [user]);
    const viewer = profile.rows[0];
    if (!['admin', 'gerente', 'rrhh'].includes(viewer?.role || '')) return response.status(403).json({ success: false, message: 'No tenés permiso para editar la nómina.' });
    if (viewer.role === 'gerente') {
      if (!viewer.staff_member_id) return response.status(403).json({ success: false, message: 'Tu cuenta de gerente no está vinculada a un recurso.' });
      const inScope = await database.query(`
        with recursive hierarchy as (
          select id from public.staff_members where id = $1
          union
          select child.id from public.staff_members child join hierarchy parent on child.responsible_staff_id = parent.id
        )
        select 1 from public.staff_members where id = $2 and (id in (select id from hierarchy) or effective_manager_staff_id = $1)
      `, [viewer.staff_member_id, id]);
      if (!inScope.rowCount) return response.status(403).json({ success: false, message: 'Sólo podés editar recursos de tu estructura.' });
    }
    const roleId = text(request.body?.role_id); const responsibleId = text(request.body?.responsible_staff_id) || null;
    const managerId = text(request.body?.manager_staff_id) || null;
    const active = Boolean(request.body?.active);
    const deactivationType = text(request.body?.deactivation_type) || null;
    const deactivationReason = text(request.body?.deactivation_reason) || null;
    const dni = text(request.body?.dni).replace(/\D/g, '');
    const legajo = text(request.body?.legajo);
    const employmentType = text(request.body?.employment_type);
    const specialWithoutLegajo = /COACHING|FREE\s*LANCE|FREELANCE/i.test(employmentType);
    if (dni.length < 7 || dni.length > 8) return response.status(400).json({ success: false, message: 'El DNI es obligatorio y debe contener entre 7 y 8 dígitos.' });
    if (!legajo && !specialWithoutLegajo) return response.status(400).json({ success: false, message: 'El legajo es obligatorio salvo para Coaching o Freelance.' });
    const existing = await database.query<{ active: boolean; responsible_staff_id: string | null; effective_manager_staff_id: string | null }>('select active,responsible_staff_id,effective_manager_staff_id from public.staff_members where id=$1', [id]);
    if (!existing.rows[0]) return response.status(404).json({ success: false, message: 'No existe el recurso.' });
    const isNewDeactivation = existing.rows[0].active && !active;
    if (isNewDeactivation && !['termination', 'administrative_correction'].includes(deactivationType || '')) return response.status(400).json({ success: false, message: 'Indicá si la baja es real o una corrección administrativa.' });
    const role = await database.query<{ area_id: string; creates_seller_record: boolean; app_role_mapping: 'admin' | 'gerente' | 'supervisor' | 'rrhh' | null }>('select area_id,creates_seller_record,app_role_mapping from public.hr_roles where id=$1 and active=true', [roleId]);
    if (!role.rows[0]) return response.status(400).json({ success: false, message: 'Cargo inválido.' });
    if (responsibleId === id) return response.status(400).json({ success: false, message: 'Una persona no puede ser su propio responsable.' });
    if (managerId === id) return response.status(400).json({ success: false, message: 'Una persona no puede ser su propio gerente.' });
    await database.query('begin');
    const descendant = responsibleId ? await database.query(`
      with recursive hierarchy as (
        select id from public.staff_members where id = $1
        union
        select child.id from public.staff_members child join hierarchy parent on child.responsible_staff_id = parent.id
      ) select 1 from hierarchy where id = $2
    `, [id, responsibleId]) : { rowCount: 0 };
    if (descendant.rowCount) throw new Error('No se puede asignar como responsable a una persona de su propia estructura.');
    const parent = responsibleId ? await database.query<{ id: string; app_role_mapping: 'admin' | 'gerente' | 'supervisor' | null; effective_manager_staff_id: string | null }>(`select staff.id, hr_role.app_role_mapping, staff.effective_manager_staff_id from public.staff_members staff join public.hr_roles hr_role on hr_role.id=staff.role_id where staff.id=$1 and staff.active=true and hr_role.app_role_mapping in ('supervisor'::public.app_role,'gerente'::public.app_role,'admin'::public.app_role)`, [responsibleId]) : { rows: [] };
    if (responsibleId && !parent.rows[0]) throw new Error('El responsable seleccionado no está activo.');
    const inheritedManager = parent.rows[0]
      ? (parent.rows[0].effective_manager_staff_id || (['gerente', 'admin'].includes(parent.rows[0].app_role_mapping || '') ? parent.rows[0].id : null))
      : null;
    const canChooseManager = !role.rows[0].creates_seller_record;
    const selectedManager = managerId && canChooseManager ? await database.query<{ id: string }>(`select staff.id from public.staff_members staff join public.hr_roles role on role.id=staff.role_id where staff.id=$1 and staff.active=true and role.app_role_mapping in ('gerente'::public.app_role,'admin'::public.app_role)`, [managerId]) : { rows: [] };
    if (managerId && canChooseManager && !selectedManager.rows[0]) throw new Error('El gerente seleccionado no está activo o no tiene un cargo de gerencia habilitado.');
    const effectiveManager = canChooseManager && managerId ? managerId : inheritedManager;
    const managerSource = canChooseManager && managerId ? 'manual' : 'inherited';
    if (managerSource === 'inherited') await database.query(`select set_config('nave.allow_manual_manager_reset', 'true', true)`);
    const updated = await database.query(
      `update public.staff_members set full_name=$2,dni=$3,legajo=$4,employment_type=$5,
       role_id=$6,area_id=$7,responsible_staff_id=$8,active=$9,
       effective_manager_staff_id=$10::uuid,
       effective_manager_source=$11::public.manager_assignment_source,
       deactivated_at=case when $9=false then coalesce(deactivated_at,now()) else deactivated_at end,
       deactivation_type=case when $9=false then coalesce($12,deactivation_type) else deactivation_type end,
       deactivation_reason=case when $9=false then coalesce($13,deactivation_reason) else deactivation_reason end,
       updated_at=now() where id=$1
       returning id,full_name`,
      [id, text(request.body?.full_name).toUpperCase(), dni, legajo || null,
        employmentType || null, roleId, role.rows[0].area_id, responsibleId,
        active, effectiveManager, managerSource, deactivationType, deactivationReason],
    );
    if (!updated.rows[0]) throw new Error('No existe el recurso.');
    if (isNewDeactivation) {
      await database.query(`insert into public.staff_status_events(staff_member_id,event_type,reason,supervisor_staff_id,manager_staff_id,created_by) values($1,$2,$3,$4::uuid,$5::uuid,$6)`, [id, deactivationType, deactivationReason, existing.rows[0].responsible_staff_id, existing.rows[0].effective_manager_staff_id, user]);
      await database.query(`update public.sellers set active=false,termination_date=current_date where staff_member_id=$1 and active=true`, [id]);
    }
    if (role.rows[0].app_role_mapping === 'supervisor' && active) {
      const currentTeam = await database.query<{ id: string }>(`update public.teams set name=$2,manager_staff_id=$3::uuid,active=true,is_sales_team=true where supervisor_staff_id=$1 returning id`, [id, updated.rows[0].full_name, effectiveManager]);
      if (!currentTeam.rows[0]) {
        await database.query(`insert into public.teams(name,supervisor_staff_id,manager_staff_id,active,is_sales_team) values($1,$2,$3::uuid,true,true)`, [updated.rows[0].full_name, id, effectiveManager]);
      }
    } else {
      await database.query(`update public.teams set active=false,is_sales_team=false where supervisor_staff_id=$1`, [id]);
    }
    if (role.rows[0].creates_seller_record && active) {
      const sellerTeam = responsibleId
        ? await database.query<{ id: string }>(`select id from public.teams where supervisor_staff_id=$1 and active=true and is_sales_team=true limit 1`, [responsibleId])
        : { rows: [] };
      await database.query(
        `insert into public.sellers(full_name,team_id,active,hire_date,dni,staff_member_id,legajo,employment_type)
         values($1,$2,true,null,$3,$4,$5,$6)
         on conflict (staff_member_id) where staff_member_id is not null
         do update set full_name=excluded.full_name,team_id=excluded.team_id,active=true,dni=excluded.dni,legajo=excluded.legajo,employment_type=excluded.employment_type`,
        [updated.rows[0].full_name, sellerTeam.rows[0]?.id || null, dni, id, legajo || null, employmentType || null],
      );
    } else if (!active) {
      await database.query(`update public.sellers set active=false where staff_member_id=$1 and active=true`, [id]);
    }
    await database.query(`
      with recursive descendants as (
        select id from public.staff_members where id = $1
        union
        select child.id from public.staff_members child join descendants parent on child.responsible_staff_id = parent.id
      )
      update public.staff_members
         set effective_manager_staff_id = $2::uuid,
             updated_at = now()
       where id in (select id from descendants where id <> $1)
         and effective_manager_source = 'inherited'
    `, [id, effectiveManager]);
    await database.query('commit');
    const saved = await database.query<{ id: string; effective_manager_staff_id: string | null; effective_manager_name: string | null; effective_manager_source: string }>(
      `select staff.id,staff.effective_manager_staff_id,staff.effective_manager_source,manager.full_name as effective_manager_name
       from public.staff_members staff left join public.staff_members manager on manager.id=staff.effective_manager_staff_id where staff.id=$1`, [id],
    );
    console.info('Resource manager assignment saved', {
      staffId: id,
      requestedManagerId: managerId || null,
      persistedManagerId: saved.rows[0]?.effective_manager_staff_id || null,
      persistedSource: saved.rows[0]?.effective_manager_source || null,
    });
    return response.status(200).json({ success: true, resource: saved.rows[0] || updated.rows[0] });
  } catch (error) {
    await database.query('rollback');
    return response.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No se pudo guardar el recurso.' });
  } finally { database.release(); }
}
