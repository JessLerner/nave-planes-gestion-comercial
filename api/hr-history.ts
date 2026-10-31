import { Pool } from 'pg';

type Req = { method?: string; headers?: Record<string, string | string[] | undefined> };
type Res = { status: (code: number) => Res; json: (body: unknown) => Res };
const raw = process.env.POSTGRES_URL || process.env.DATABASE_URL || '';
const pool = new Pool({ connectionString: raw.replace(/([?&])sslmode=[^&]*/i, '$1').replace(/[?&]$/, ''), ssl: { rejectUnauthorized: false } });
async function userId(req: Req) { const value = req.headers?.authorization; const authorization = Array.isArray(value) ? value[0] : value; if (!authorization?.startsWith('Bearer ') || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return null; const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: authorization, apikey: process.env.SUPABASE_ANON_KEY } }); return response.ok ? ((await response.json() as { id?: string }).id || null) : null; }

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Método no permitido.' });
  const id = await userId(req); if (!id) return res.status(401).json({ success: false, message: 'Sesión no válida.' });
  try {
    const profile = await pool.query<{ role: string; staff_member_id: string | null }>('select role,staff_member_id from public.profiles where id=$1', [id]);
    const viewer = profile.rows[0];
    if (!['admin', 'rrhh', 'gerente', 'supervisor'].includes(viewer?.role || '')) return res.status(403).json({ success: false, message: 'No tenés acceso a Históricos.' });
    if (['gerente', 'supervisor'].includes(viewer.role) && !viewer.staff_member_id) return res.status(403).json({ success: false, message: 'Tu cuenta no está vinculada a un recurso.' });
    const scope = viewer.role === 'supervisor' ? 'and exists (select 1 from public.staff_status_events event where event.staff_member_id=staff.id and event.supervisor_staff_id=$1)' : viewer.role === 'gerente' ? 'and exists (select 1 from public.staff_status_events event where event.staff_member_id=staff.id and event.manager_staff_id=$1)' : '';
    const rows = await pool.query(`select staff.id,staff.full_name,staff.dni,staff.legajo,role.name as role_name,responsible.full_name as supervisor_name,manager.full_name as manager_name,staff.deactivated_at,staff.deactivation_type,staff.deactivation_reason from public.staff_members staff left join public.hr_roles role on role.id=staff.role_id left join public.staff_members responsible on responsible.id=staff.responsible_staff_id left join public.staff_members manager on manager.id=staff.effective_manager_staff_id where staff.active=false ${scope} order by staff.deactivated_at desc nulls last,staff.full_name`, scope ? [viewer.staff_member_id] : []);
    return res.status(200).json({ success: true, data: rows.rows });
  } catch { return res.status(500).json({ success: false, message: 'No se pudieron cargar los históricos.' }); }
}
