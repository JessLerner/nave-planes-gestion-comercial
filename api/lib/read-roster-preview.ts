import type { PoolClient } from 'pg';
import { compareRoster, type SheetRow } from './roster-preview';

export async function readRosterPreview(db: Pick<PoolClient, 'query'>, userId: string, rows: SheetRow[]) {
  await db.query('begin transaction isolation level repeatable read read only');
  try {
    const viewer = await db.query('select role from public.profiles where id=$1', [userId]);
    if (!['admin','direccion'].includes(viewer.rows[0]?.role)) return null;
    const members = await db.query(`select id, full_name as name, dni::text, legajo, employment_type as nomina, active,
      role_id as role, responsible_staff_id as supervisor, effective_manager_staff_id as manager,
      effective_manager_source='manual' as manual from public.staff_members order by full_name,id`);
    const roles = await db.query(`select r.id,r.name,l.source_label as alias,r.app_role_mapping as mapping,
      r.creates_seller_record as seller from public.hr_roles r left join public.hr_role_source_labels l on l.role_id=r.id
      where r.active`);
    const teams = await db.query('select id,name,supervisor_staff_id as supervisor from public.teams where active and is_sales_team');
    return compareRoster(rows, members.rows, roles.rows, teams.rows);
  } finally { await db.query('rollback'); }
}
