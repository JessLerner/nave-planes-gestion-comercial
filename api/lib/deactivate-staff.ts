import type { PoolClient } from 'pg';

export async function deactivateStaff(database: Pick<PoolClient,'query'>, id: string, user: string, date: string, reason: string) {
  const resource = await database.query<{ responsible_staff_id: string | null; effective_manager_staff_id: string | null }>('select responsible_staff_id,effective_manager_staff_id from public.staff_members where id=$1 and active=true for update', [id]);
  if (!resource.rowCount) throw new Error('El recurso no existe o ya está inactivo.');
  const linkedProfile = await database.query('select 1 from public.profiles where staff_member_id=$1 limit 1', [id]);
  if (linkedProfile.rowCount) throw new Error('Este recurso tiene una cuenta de acceso. Revocá o reasigná su acceso antes de ejecutar la baja.');
  await database.query(`update public.staff_members set active=false,deactivated_at=$2::date,deactivation_type='termination',deactivation_reason=$3,updated_at=now() where id=$1`, [id, date, reason]);
  await database.query(`insert into public.staff_status_events(staff_member_id,event_type,reason,supervisor_staff_id,manager_staff_id,created_by,occurred_at) values($1,'termination',$2,$3,$4,$5,$6::date)`, [id, reason, resource.rows[0].responsible_staff_id, resource.rows[0].effective_manager_staff_id, user, date]);
}
