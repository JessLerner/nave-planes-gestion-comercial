import { Pool } from 'pg';

type Req = { method?: string; headers?: Record<string, string | string[] | undefined>; query?: Record<string, string | string[] | undefined> };
type Res = { status: (code: number) => Res; json: (body: unknown) => Res };
const raw = process.env.POSTGRES_URL || process.env.DATABASE_URL || '';
const pool = new Pool({ connectionString: raw.replace(/([?&])sslmode=[^&]*/i, '$1').replace(/[?&]$/, ''), ssl: { rejectUnauthorized: false } });

async function userId(req: Req) {
  const value = req.headers?.authorization; const authorization = Array.isArray(value) ? value[0] : value;
  if (!authorization?.startsWith('Bearer ') || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return null;
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: authorization, apikey: process.env.SUPABASE_ANON_KEY } });
  return response.ok ? ((await response.json() as { id?: string }).id || null) : null;
}
const text = (value: string | string[] | undefined) => typeof value === 'string' ? value.trim() : '';

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Método no permitido.' });
  const id = await userId(req); if (!id) return res.status(401).json({ success: false, message: 'Sesión no válida.' });
  const profile = await pool.query(`select p.role, p.staff_member_id, area.name as area_name, hr_role.name as resource_role from public.profiles p left join public.staff_members staff on staff.id=p.staff_member_id left join public.hr_areas area on area.id=staff.area_id left join public.hr_roles hr_role on hr_role.id=staff.role_id where p.id=$1`, [id]);
  const viewer = profile.rows[0] as { role?: string; staff_member_id?: string | null; area_name?: string | null; resource_role?: string | null } | undefined;
  const globalAccess = viewer?.role === 'admin' || viewer?.role === 'rrhh' || viewer?.area_name === 'Administración' || viewer?.resource_role === 'Director';
  if (!viewer || (!globalAccess && !['gerente', 'supervisor'].includes(viewer.role || '')) || (!globalAccess && !viewer.staff_member_id)) return res.status(403).json({ success: false, message: 'No tenés acceso a Legajos.' });
  const q = text(req.query?.q); const area = text(req.query?.area); const team = text(req.query?.team); const status = text(req.query?.status) || 'active';
  const page = Math.max(1, Number(text(req.query?.page)) || 1); const size = Math.min(100, Math.max(20, Number(text(req.query?.size)) || 50));
  const where: string[] = []; const values: unknown[] = []; const add = (sql: string, value?: unknown) => { if (value !== undefined) values.push(value); where.push(sql.replace('?', `$${values.length}`)); };
  if (!globalAccess) {
    values.push(viewer!.staff_member_id);
    const hierarchy = `staff.id in (with recursive hierarchy as (select id from public.staff_members where id=$1 union select child.id from public.staff_members child join hierarchy parent on child.responsible_staff_id=parent.id) select id from hierarchy)`;
    where.push(viewer!.role === 'gerente' ? `(${hierarchy} or staff.effective_manager_staff_id=$1)` : hierarchy);
  }
  if (status === 'active') where.push('staff.active=true'); else if (status === 'inactive') where.push('staff.active=false');
  if (q) {
    values.push(q); const index = values.length;
    const normalizedName = `translate(lower(staff.full_name), 'áéíóúüñ', 'aeiouun')`;
    const normalizedQuery = `translate(lower($${index}), 'áéíóúüñ', 'aeiouun')`;
    where.push(`(${normalizedName} like '%' || ${normalizedQuery} || '%' or coalesce(staff.dni::text,'') like '%' || $${index} || '%' or coalesce(staff.legajo,'') like '%' || $${index} || '%')`);
  }
  if (area) add('staff.area_id=?', area);
  if (team) {
    values.push(team); const index = values.length;
    // A team is defined by its supervisor. Its members report directly to
    // that supervisor, so filtering by the supervisor's own team row would
    // otherwise return only the supervisor and omit every subordinate.
    where.push(`(team.id=$${index} or staff.id=(select supervisor_staff_id from public.teams where id=$${index}))`);
  }
  const clause = where.length ? `where ${where.join(' and ')}` : '';
  try {
    const count = await pool.query(`select count(*)::int as total from public.staff_members staff left join public.teams team on team.supervisor_staff_id=staff.responsible_staff_id ${clause}`, values);
    values.push(size, (page - 1) * size);
    const rows = await pool.query(`select staff.id, staff.full_name, staff.dni, staff.legajo, staff.employment_type, staff.role_id, staff.responsible_staff_id, staff.effective_manager_staff_id, staff.effective_manager_source, staff.is_coaching, staff.is_freelance, staff.active, area.name as area_name, role.name as role_name, responsible.full_name as responsible_name, manager.full_name as effective_manager_name, team.id as team_id, team.name as team_name from public.staff_members staff left join public.hr_areas area on area.id=staff.area_id left join public.hr_roles role on role.id=staff.role_id left join public.staff_members responsible on responsible.id=staff.responsible_staff_id left join public.staff_members manager on manager.id=staff.effective_manager_staff_id left join public.teams team on team.supervisor_staff_id=staff.responsible_staff_id ${clause} order by staff.full_name limit $${values.length-1} offset $${values.length}`, values);
    const [areas, teams, roles, responsibles, managers] = await Promise.all([
      pool.query(`select id,name from public.hr_areas where active=true order by sort_order,name`),
      pool.query(`select t.id,t.name from public.teams t join public.staff_members staff on staff.id=t.supervisor_staff_id join public.hr_roles role on role.id=staff.role_id where t.active=true and t.is_sales_team=true and staff.active=true and role.app_role_mapping='supervisor'::public.app_role order by t.name`),
      pool.query(`select id,name,area_id from public.hr_roles where active=true order by sort_order,name`),
      pool.query(`select staff.id,staff.full_name from public.staff_members staff join public.hr_roles role on role.id=staff.role_id where staff.active=true and role.app_role_mapping in ('supervisor'::public.app_role,'gerente'::public.app_role,'admin'::public.app_role) order by staff.full_name`),
      pool.query(`select staff.id,staff.full_name from public.staff_members staff join public.hr_roles role on role.id=staff.role_id where staff.active=true and role.app_role_mapping in ('gerente'::public.app_role,'admin'::public.app_role) order by staff.full_name`),
    ]);
    return res.status(200).json({ success: true, data: { rows: rows.rows, total: count.rows[0]?.total || 0, page, size, areas: areas.rows, teams: teams.rows, roles: roles.rows, responsibles: responsibles.rows, managers: managers.rows } });
  } catch { return res.status(500).json({ success: false, message: 'No se pudo cargar la nómina.' }); }
}
