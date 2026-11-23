import type { PoolClient } from 'pg';
import { compareRoster, type SheetRow, type Selection } from './roster-preview';
export class InvalidRosterTeam extends Error {}

export async function readRosterPreview(db: Pick<PoolClient, 'query'>, userId: string, rows: SheetRow[], selection?: Selection) {
  await db.query('begin transaction isolation level repeatable read read only');
  try {
    const viewer = await db.query('select role from public.profiles where id=$1', [userId]);
    if (!['admin','direccion','rrhh'].includes(viewer.rows[0]?.role)) return null;
    const members = await db.query(`select id, full_name as name, dni::text, legajo, employment_type as nomina, active,
      role_id as role, responsible_staff_id as supervisor, effective_manager_staff_id as manager,
      effective_manager_source='manual' as manual, (select name from public.hr_areas where id=staff.area_id) as area
      from public.staff_members staff order by full_name,id`);
    const roles = await db.query(`select r.id,r.name,l.source_label as alias,r.app_role_mapping as mapping,
      r.creates_seller_record as seller from public.hr_roles r left join public.hr_role_source_labels l on l.role_id=r.id
      where r.active`);
    const teams = await db.query(`select t.id,t.name,t.supervisor_staff_id as supervisor from public.teams t
      join public.staff_members s on s.id=t.supervisor_staff_id and s.active
      join public.hr_roles r on r.id=s.role_id and r.app_role_mapping='supervisor'
      where t.active and t.is_sales_team`);
    if (selection?.scope === 'team' && !teams.rows.some(team => team.id === selection.teamId)) throw new InvalidRosterTeam();
    return compareRoster(rows, members.rows, roles.rows, teams.rows, selection);
  } finally { await db.query('rollback'); }
}
