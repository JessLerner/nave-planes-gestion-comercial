import { Pool } from 'pg';

type Req = { method?: string; headers?: Record<string, string | string[] | undefined> };
type Res = { status: (code: number) => Res; json: (body: unknown) => Res };
const raw = process.env.POSTGRES_URL || process.env.DATABASE_URL || '';
const pool = new Pool({ connectionString: raw.replace(/([?&])sslmode=[^&]*/i, '$1').replace(/[?&]$/, ''), ssl: { rejectUnauthorized: false } });

async function userId(req: Req) {
  const value = req.headers?.authorization; const authorization = Array.isArray(value) ? value[0] : value;
  if (!authorization?.startsWith('Bearer ') || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return null;
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: authorization, apikey: process.env.SUPABASE_ANON_KEY } });
  return response.ok ? ((await response.json() as { id?: string }).id || null) : null;
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Método no permitido.' });
  const id = await userId(req); if (!id) return res.status(401).json({ success: false, message: 'Sesión no válida.' });
  try {
    const profile = await pool.query<{ role: string; staff_member_id: string | null }>('select role,staff_member_id from public.profiles where id=$1', [id]);
    const viewer = profile.rows[0];
    if (!viewer || !['admin', 'rrhh', 'gerente', 'supervisor'].includes(viewer.role)) return res.status(403).json({ success: false, message: 'No tenés acceso a métricas de rotación.' });
    const scope = viewer.role === 'supervisor' ? 'and supervisor.id=$1' : viewer.role === 'gerente' ? 'and supervisor.effective_manager_staff_id=$1' : '';
    const params = scope ? [viewer.staff_member_id] : [];
    if (scope && !viewer.staff_member_id) return res.status(403).json({ success: false, message: 'Tu cuenta no está vinculada a un recurso.' });
    const result = await pool.query(`
      select supervisor.id as supervisor_id, supervisor.full_name as supervisor_name,
             coalesce(team.name, supervisor.full_name) as team_name,
             coalesce(roster.active,0)::int as active,
             coalesce(exits.terminated,0)::int as terminated
      from public.staff_members supervisor
      join public.hr_roles supervisor_role on supervisor_role.id=supervisor.role_id
      left join public.teams team on team.supervisor_staff_id=supervisor.id and team.is_sales_team=true
      left join lateral (
        select count(*) as active from public.staff_members member
        join public.hr_roles member_role on member_role.id=member.role_id
        where member.responsible_staff_id=supervisor.id and member.active and member_role.creates_seller_record
      ) roster on true
      left join lateral (
        select count(*) as terminated from public.staff_status_events event
        where event.supervisor_staff_id=supervisor.id and event.event_type='termination' and event.occurred_at >= date_trunc('month', current_date)
      ) exits on true
      where supervisor.active=true and supervisor_role.app_role_mapping='supervisor'::public.app_role ${scope}
      order by supervisor.full_name`, params);
    const rows = result.rows.map((row) => {
      const active = Number(row.active || 0); const terminated = Number(row.terminated || 0); const total = active + terminated;
      return { ...row, active, terminated, retentionRate: total ? Math.round((active / total) * 100) : 100 };
    });
    return res.status(200).json({ success: true, data: rows });
  } catch { return res.status(500).json({ success: false, message: 'No se pudieron cargar las métricas de rotación.' }); }
}
