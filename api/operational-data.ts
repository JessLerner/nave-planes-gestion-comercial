import { Pool } from 'pg';

type VercelRequest = { method?: string; headers?: Record<string, string | string[] | undefined> };
type VercelResponse = {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => VercelResponse;
};

// This endpoint runs only on Vercel. It keeps the database connection string
// on the server and deliberately omits DNI, legajo and other HR-only fields.
const rawConnectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL || '';
// The managed URL includes sslmode=require. With recent pg versions that URL
// setting supersedes the ssl object, so remove it and keep verification policy
// explicit here for the managed Supabase certificate chain.
const connectionString = rawConnectionString
  .replace(/([?&])sslmode=[^&]*/i, '$1')
  .replace(/[?&]$/, '');

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

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
  return user.id ? { id: user.id } : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Método no permitido.' });
  }

  if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
    return res.status(503).json({
      success: false,
      message: 'La conexión segura a la base todavía no está configurada.',
    });
  }

  const identity = await verifySupabaseAccessToken(req);
  if (!identity) return res.status(401).json({ success: false, message: 'Sesión no válida o vencida.' });

  try {
    const profileResult = await pool.query(
      `select id, role, team_id, staff_member_id from public.profiles where id = $1 limit 1`,
      [identity.id],
    );
    const profile = profileResult.rows[0] as { role: string; team_id: string | null; staff_member_id: string | null } | undefined;
    if (!profile) return res.status(403).json({ success: false, message: 'Tu cuenta no tiene perfil operativo asignado.' });

    const scopedTeamFilter = profile.role === 'admin' || profile.role === 'rrhh'
      ? { sql: 'true', params: [] as unknown[] }
      : profile.role === 'supervisor'
        ? { sql: 't.id = $1', params: [profile.team_id] }
        : { sql: 't.manager_staff_id = $1', params: [profile.staff_member_id] };

    const [teamsResult, sellersResult, operationsResult, scoringRowsResult, leadsResult] = await Promise.all([
      pool.query(`
        select
          t.id,
          t.name,
          t.branch,
          t.target_override,
          t.commercial_structure,
          t.supervisor_staff_id,
          t.manager_staff_id,
          supervisor.full_name as supervisor_name,
          manager.full_name as manager_name
        from public.teams t
        left join public.staff_members supervisor on supervisor.id = t.supervisor_staff_id
        left join public.staff_members manager on manager.id = t.manager_staff_id
        where ${scopedTeamFilter.sql}
        order by t.name
      `, scopedTeamFilter.params),
      pool.query(`
        select id, full_name, team_id, staff_member_id, active, hire_date,
               termination_date, individual_target, employment_type
        from public.sellers s
        where active = true and s.team_id in (select t.id from public.teams t where ${scopedTeamFilter.sql})
        order by full_name
      `, scopedTeamFilter.params),
      pool.query(`
        select id, operation_date, subscription_number, brand, model, plan_type,
               cuota_1_value, total_collected, factory_account, used_car_flag,
               seller_id, team_id, lead_source, status, scoring_status, scoring_notes,
               audited_at
        from public.sales_operations o
        where o.team_id in (select t.id from public.teams t where ${scopedTeamFilter.sql})
        order by operation_date desc
      `, scopedTeamFilter.params),
      pool.query(`
        select id, brand, subscription_number, scoring_date, seller_name,
               supervisor_name, observed_category, rejection_reason_1,
               rejection_reason_2, approval_reason, cancellation_reason,
               last_seen_at
        from public.scoring_source_rows sr
        where ${profile.role === 'admin' || profile.role === 'rrhh'
          ? 'true'
          : `exists (
              select 1 from public.teams t
              left join public.staff_members supervisor on supervisor.id = t.supervisor_staff_id
              where ${scopedTeamFilter.sql}
                and lower(trim(supervisor.full_name)) = lower(trim(sr.supervisor_name))
            )`}
        order by scoring_date desc nulls last, last_seen_at desc
        limit 500
      `, scopedTeamFilter.params),
      pool.query(`
        select id, entry_date, seller_id, team_id, assigned_leads, contacted_leads,
               closed_leads, lost_leads, lead_source, loss_reasons
        from public.leads_distribution ld
        where ld.team_id in (select t.id from public.teams t where ${scopedTeamFilter.sql})
        order by entry_date desc
      `, scopedTeamFilter.params),
    ]);

    return res.status(200).json({
      success: true,
      source: 'supabase',
      data: {
        teams: teamsResult.rows,
        sellers: sellersResult.rows,
        operations: operationsResult.rows,
        scoring_rows: scoringRowsResult.rows,
        lead_distributions: leadsResult.rows,
      },
    });
  } catch (error) {
    console.error('Unable to read operational data', error);
    return res.status(500).json({
      success: false,
      message: 'No se pudo consultar la base operativa.',
    });
  }
}
