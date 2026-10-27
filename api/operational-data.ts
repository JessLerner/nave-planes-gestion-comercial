import { Pool } from 'pg';

type VercelRequest = { method?: string };
type VercelResponse = {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => VercelResponse;
};

// This endpoint runs only on Vercel. It keeps the database connection string
// on the server and deliberately omits DNI, legajo and other HR-only fields.
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

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

  try {
    const [teamsResult, sellersResult, operationsResult] = await Promise.all([
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
        order by t.name
      `),
      pool.query(`
        select id, full_name, team_id, staff_member_id, active, hire_date,
               termination_date, individual_target, employment_type
        from public.sellers
        where active = true
        order by full_name
      `),
      pool.query(`
        select id, operation_date, subscription_number, brand, model, plan_type,
               cuota_1_value, total_collected, factory_account, used_car_flag,
               seller_id, team_id, lead_source, status, scoring_status, scoring_notes,
               audited_at
        from public.sales_operations
        order by operation_date desc
      `),
    ]);

    return res.status(200).json({
      success: true,
      source: 'supabase',
      data: {
        teams: teamsResult.rows,
        sellers: sellersResult.rows,
        operations: operationsResult.rows,
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
