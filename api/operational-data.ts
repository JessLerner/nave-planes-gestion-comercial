import { databasePool } from './lib/database';

type VercelRequest = { method?: string; headers?: Record<string, string | string[] | undefined> };
type VercelResponse = {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => VercelResponse;
};

// This endpoint runs only on Vercel. It keeps the database connection string
// on the server and deliberately omits DNI, legajo and other HR-only fields.
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

    const [teamsResult, sellersResult, operationsResult, scoringRowsResult, leadsResult, monthlyConfigResult, priceListsResult, advancesResult] = await Promise.all([
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
        join public.staff_members supervisor on supervisor.id = t.supervisor_staff_id
        join public.hr_roles supervisor_role on supervisor_role.id = supervisor.role_id
        left join public.staff_members manager on manager.id = t.manager_staff_id
        where ${scopedTeamFilter.sql}
          and t.is_sales_team = true
          and supervisor.active = true
          and supervisor_role.app_role_mapping = 'supervisor'::public.app_role
          and exists (select 1 from public.sellers active_seller where active_seller.team_id = t.id and active_seller.active = true)
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
               cuota_1_value, total_collected, factory_account, used_car_flag, used_car_details,
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
      pool.query(`
        select id, start_date, end_date, min_sales_for_advance, max_advance_amount, advance_deadline,
               default_team_target_per_seller
        from public.monthly_config
        where current_date between start_date and end_date
        order by start_date desc limit 1
      `),
      pool.query(`
        select id, brand, model, coalesce(version, '') as version, coalesce(plan_type, '') as plan_type,
               cuota_1_value, factory_quota_value, car_value, bonus_discount, effective_date as updated_at
        from public.price_lists order by effective_date desc, brand, model
      `),
      pool.query(`
        select advance.id, advance.seller_id, advance.request_date, advance.amount, advance.status,
               advance.seller_sales_count_at_date, config.min_sales_for_advance, advance.reason,
               advance.review_notes as rejection_reason, advance.reviewed_at, advance.reviewed_by
        from public.wage_advances advance
        join public.monthly_config config on config.id = advance.monthly_config_id
        join public.sellers seller on seller.id = advance.seller_id
        where seller.team_id in (select t.id from public.teams t where ${scopedTeamFilter.sql})
        order by advance.request_date desc, advance.created_at desc
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
        monthly_config: monthlyConfigResult.rows[0] || null,
        price_lists: priceListsResult.rows,
        wage_advances: advancesResult.rows,
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
