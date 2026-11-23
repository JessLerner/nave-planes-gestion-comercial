import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { compareRoster, type SheetRow, type Selection } from './roster-preview';
export class InvalidRosterTeam extends Error {}

export async function readRosterPreview(db: Pick<PoolClient, 'query'>, userId: string, rows: SheetRow[], selection?: Selection) {
  await db.query('begin transaction isolation level repeatable read read only');
  try {
    const viewer = await db.query('select role from public.profiles where id=$1', [userId]);
    if (!['admin','direccion','rrhh'].includes(viewer.rows[0]?.role)) return null;
    return await currentPreview(db, rows, selection);
  } finally { await db.query('rollback'); }
}

export async function currentPreview(db: Pick<PoolClient,'query'>, rows: SheetRow[], selection?: Selection) {
    const members = await db.query(`select updated_at::text as revision,id, full_name as name, dni::text, legajo, employment_type as nomina, active,
      role_id as role, responsible_staff_id as supervisor, effective_manager_staff_id as manager,
      effective_manager_source='manual' as manual, (select name from public.hr_areas where id=staff.area_id) as area
      from public.staff_members staff order by full_name,id`);
    const roles = await db.query(`select r.area_id as "areaId",(select name from public.hr_areas where id=r.area_id) as area,r.id,r.name,l.source_label as alias,r.app_role_mapping as mapping,
      r.creates_seller_record as seller from public.hr_roles r left join public.hr_role_source_labels l on l.role_id=r.id
      where r.active`);
    const teams = await db.query(`select t.id,t.name,t.supervisor_staff_id as supervisor from public.teams t
      join public.staff_members s on s.id=t.supervisor_staff_id and s.active
      join public.hr_roles r on r.id=s.role_id and r.app_role_mapping='supervisor'
      where t.active and t.is_sales_team`);
    if (selection?.scope === 'team' && !teams.rows.some(team => team.id === selection.teamId)) throw new InvalidRosterTeam();
    const preview = compareRoster(rows,members.rows,roles.rows,teams.rows,selection);
    const source = digest([selection?.scope,selection?.teamId,selection?.coverage,selection?.fileHash,rows]);
    const membersById = new Map(members.rows.map(m => [m.id,m]));
    for (const group of ['Actualizaciones propuestas','Altas propuestas','Ausencias para revisión'] as const) {
      for (const item of preview.items[group]) {
        if (group !== 'Ausencias para revisión' && !item.proposal) continue;
        item.token = digest([source,group,item,membersById.get(item.id),item.proposal?.supervisor && membersById.get(item.proposal.supervisor)?.role]);
      }
    }
    return preview;
}
export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
