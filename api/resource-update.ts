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
    if (request.body && typeof request.body === 'object' && (request.body as Record<string, unknown>).direct_deactivation === true) {
      if (!['rrhh', 'admin'].includes(viewer?.role || '')) return response.status(403).json({ success: false, message: 'Sólo RRHH o Administración puede ejecutar una baja directa.' });
      const reason = text((request.body as Record<string, unknown>).deactivation_reason);
      const date = text((request.body as Record<string, unknown>).deactivation_date);
      if (!reason || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return response.status(400).json({ success: false, message: 'Indicá motivo y fecha de baja.' });
      await database.query('begin');
      const resource = await database.query<{ responsible_staff_id: string | null; effective_manager_staff_id: string | null }>('select responsible_staff_id,effective_manager_staff_id from public.staff_members where id=$1 and active=true for update', [id]);
      if (!resource.rowCount) throw new Error('El recurso no existe o ya está inactivo.');
      const linkedProfile = await database.query('select 1 from public.profiles where staff_member_id=$1 limit 1', [id]);
      if (linkedProfile.rowCount) throw new Error('Este recurso tiene una cuenta de acceso. Revocá o reasigná su acceso antes de ejecutar la baja.');
      await database.query(`update public.staff_members set active=false,deactivated_at=$2::date,deactivation_type='termination',deactivation_reason=$3,updated_at=now() where id=$1`, [id, date, reason]);
      await database.query(`insert into public.staff_status_events(staff_member_id,event_type,reason,supervisor_staff_id,manager_staff_id,created_by,occurred_at) values($1,'termination',$2,$3,$4,$5,$6::date)`, [id, reason, resource.rows[0].responsible_staff_id, resource.rows[0].effective_manager_staff_id, user, date]);
      await database.query('commit');
      return response.status(200).json({ success: true });
    }
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
    const transferReason = text(request.body?.transfer_reason).slice(0, 2_000) || null;
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
    const linkedProfile = await database.query<{ id: string }>('select id from public.profiles where staff_member_id=$1 limit 1', [id]);
    if (linkedProfile.rowCount && (!active || !role.rows[0].app_role_mapping)) {
      return response.status(400).json({ success: false, message: 'Este recurso tiene una cuenta de acceso. Primero revocá o reasigná su acceso antes de dejarlo inactivo o asignarle un cargo sin permisos.' });
    }
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
    if (role.rows[0].creates_seller_record && active && !responsibleId) throw new Error('Un vendedor activo debe tener un supervisor asignado.');
    if (role.rows[0].creates_seller_record && responsibleId && parent.rows[0]?.app_role_mapping !== 'supervisor') throw new Error('El responsable de un vendedor debe ser un supervisor activo.');
    if (viewer.role === 'gerente' && responsibleId) {
      const destinationInScope = await database.query(`
        with recursive hierarchy as (
          select id from public.staff_members where id=$1
          union
          select child.id from public.staff_members child join hierarchy parent on child.responsible_staff_id=parent.id
        )
        select 1 from public.staff_members where id=$2 and (id in (select id from hierarchy) or effective_manager_staff_id=$1)
      `, [viewer.staff_member_id, responsibleId]);
      if (!destinationInScope.rowCount) {
        await database.query('rollback');
        return response.status(403).json({ success: false, message: 'Sólo podés trasladar vendedores hacia supervisores de tu estructura.' });
      }
    }
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
    const isSellerTransfer = role.rows[0].creates_seller_record && active && existing.rows[0].responsible_staff_id !== responsibleId;
    if (isSellerTransfer) {
      const [previousTeam, destinationTeam] = await Promise.all([
        database.query<{ id: string | null }>('select id from public.teams where supervisor_staff_id=$1 order by created_at,id limit 1', [existing.rows[0].responsible_staff_id]),
        database.query<{ id: string | null }>('select id from public.teams where supervisor_staff_id=$1 and active and is_sales_team order by created_at,id limit 1', [responsibleId]),
      ]);
      await database.query(`
        insert into public.roster_change_log(entity_type,entity_id,action,before_value,after_value,changed_by)
        values('staff_member',$1,'updated',$2::jsonb,$3::jsonb,$4)
      `, [id,
        JSON.stringify({ event: 'seller_transfer', supervisor_staff_id: existing.rows[0].responsible_staff_id, team_id: previousTeam.rows[0]?.id || null }),
        JSON.stringify({ event: 'seller_transfer', supervisor_staff_id: responsibleId, team_id: destinationTeam.rows[0]?.id || null, reason: transferReason }),
        user,
      ]);
    }
    if (isNewDeactivation) {
      await database.query(`insert into public.staff_status_events(staff_member_id,event_type,reason,supervisor_staff_id,manager_staff_id,created_by) values($1,$2,$3,$4::uuid,$5::uuid,$6)`, [id, deactivationType, deactivationReason, existing.rows[0].responsible_staff_id, existing.rows[0].effective_manager_staff_id, user]);
    }
    await database.query('commit');
    const saved = await database.query<{ id: string; effective_manager_staff_id: string | null; effective_manager_name: string | null; effective_manager_source: string; responsible_staff_id: string | null; responsible_name: string | null; team_id: string | null; team_name: string | null }>(
      `select staff.id,staff.effective_manager_staff_id,staff.effective_manager_source,manager.full_name as effective_manager_name,
              staff.responsible_staff_id,responsible.full_name as responsible_name,team.id as team_id,team.name as team_name
       from public.staff_members staff
       left join public.staff_members manager on manager.id=staff.effective_manager_staff_id
       left join public.staff_members responsible on responsible.id=staff.responsible_staff_id
       left join public.teams team on team.supervisor_staff_id=staff.responsible_staff_id and team.active and team.is_sales_team
       where staff.id=$1`, [id],
    );
    return response.status(200).json({ success: true, resource: saved.rows[0] || updated.rows[0] });
  } catch (error) {
    await database.query('rollback');
    return response.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No se pudo guardar el recurso.' });
  } finally { database.release(); }
}
