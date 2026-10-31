import { databasePool } from './lib/database';

type VercelRequest = { method?: string; headers?: Record<string, string | string[] | undefined> };
type VercelResponse = { status: (code: number) => VercelResponse; json: (body: unknown) => VercelResponse };

const rawConnectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL || '';
const pool = databasePool(rawConnectionString);

async function verifySupabaseAccessToken(req: VercelRequest) {
  const header = req.headers?.authorization;
  const authorization = Array.isArray(header) ? header[0] : header;
  if (!authorization?.startsWith('Bearer ')) return null;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const response = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: authorization, apikey: key } });
  if (!response.ok) return null;
  const user = await response.json() as { id?: string };
  return user.id ?? null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Método no permitido.' });
  if (!rawConnectionString) return res.status(503).json({ success: false, message: 'La base operativa no está configurada.' });
  const userId = await verifySupabaseAccessToken(req);
  if (!userId) return res.status(401).json({ success: false, message: 'Sesión no válida o vencida.' });

  try {
    const profileResult = await pool.query(`select role, team_id, staff_member_id from public.profiles where id = $1 limit 1`, [userId]);
    const profile = profileResult.rows[0] as { role: string; team_id: string | null; staff_member_id: string | null } | undefined;
    if (!profile) return res.status(403).json({ success: false, message: 'Tu cuenta no tiene perfil operativo asignado.' });
    const exists = await pool.query(`select to_regclass('public.fox_lead_daily_snapshots') as table_name`);
    if (!exists.rows[0]?.table_name) return res.status(200).json({ success: true, ready: false, message: 'La estructura de Fox todavía no fue aplicada.' });

    const scope = profile.role === 'admin' || profile.role === 'rrhh'
      ? { sql: 'true', params: [] as unknown[] }
      : profile.role === 'supervisor'
        ? { sql: 's.team_id = $1', params: [profile.team_id] }
        : { sql: 'exists (select 1 from public.teams t where t.id = s.team_id and t.manager_staff_id = $1)', params: [profile.staff_member_id] };
    const normalizedStatus = "lower(translate(trim(coalesce(s.lead_status, '')), 'áéíóúü', 'aeiouu'))";
    const latest = `select max(snapshot_date) as snapshot_date from public.fox_lead_daily_snapshots`;
    const base = `from public.fox_lead_daily_snapshots s cross join (${latest}) latest where s.snapshot_date = latest.snapshot_date and ${scope.sql}`;
    const sellerBase = `from public.fox_lead_daily_snapshots s left join public.sellers v on v.id = s.seller_id cross join (${latest}) latest where s.snapshot_date = latest.snapshot_date and ${scope.sql}`;

    const [summaryResult, sellerResult, reasonResult] = await Promise.all([
      pool.query(`
        select max(s.snapshot_date) as snapshot_date,
          count(*)::int as total_leads,
          count(*) filter (where ${normalizedStatus} = 'sin gestion')::int as sin_gestion,
          count(*) filter (where ${normalizedStatus} <> 'sin gestion')::int as con_gestion,
          count(*) filter (where ${normalizedStatus} = 'cerrado')::int as cerrados,
          count(*) filter (where ${normalizedStatus} <> 'cerrado')::int as abiertos,
          count(*) filter (where s.sold is true)::int as vendidos
        ${base}
      `, scope.params),
      pool.query(`
        select s.seller_id, s.team_id, coalesce(v.full_name, s.fox_user_name, 'Sin asignar') as seller_name,
          count(*)::int as total_leads,
          count(*) filter (where ${normalizedStatus} = 'sin gestion')::int as sin_gestion,
          count(*) filter (where ${normalizedStatus} <> 'sin gestion')::int as con_gestion,
          count(*) filter (where ${normalizedStatus} = 'cerrado')::int as cerrados,
          count(*) filter (where ${normalizedStatus} <> 'cerrado')::int as abiertos,
          count(*) filter (where s.sold is true)::int as vendidos
        ${sellerBase}
        group by s.seller_id, s.team_id, v.full_name, s.fox_user_name
        order by total_leads desc, seller_name
      `, scope.params),
      pool.query(`
        select s.close_reason as reason, count(*)::int as total
        ${base} and ${normalizedStatus} = 'cerrado' and s.close_reason is not null
        group by s.close_reason order by total desc, reason asc limit 12
      `, scope.params),
    ]);

    return res.status(200).json({
      success: true,
      ready: Boolean(summaryResult.rows[0]?.snapshot_date),
      summary: summaryResult.rows[0] || null,
      bySeller: sellerResult.rows,
      closeReasons: reasonResult.rows,
    });
  } catch (error) {
    console.error('Fox lead metrics failed', error);
    return res.status(500).json({ success: false, message: 'No se pudieron consultar las métricas de Fox.' });
  }
}
