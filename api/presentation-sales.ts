import type { ApiRequest, ApiResponse } from './lib/http';
import { databasePool } from './lib/database';
import { getOperationalRole, verifySupabaseAccessToken } from './session';

const pool = databasePool(process.env.POSTGRES_URL || process.env.DATABASE_URL || '');

// ID Ventas reconciles seller_id once. Ownership follows the seller's current team.
export const eligibleSales = `
  from public.sales_operations sale
  join public.source_sync_runs run on run.id = sale.source_sync_run_id
  join public.sellers seller on seller.id = sale.seller_id and seller.active
  join public.teams team on team.id = seller.team_id and team.active and team.is_sales_team
  join public.profiles supervisor on supervisor.id = $1 and supervisor.role = 'supervisor'
    and supervisor.team_id = team.id and supervisor.staff_member_id = team.supervisor_staff_id
  where sale.team_id is not null and sale.source_updated_at is not null
    and run.source_key = 'app_control_operaciones:id_ventas' and run.source_sheet = 'ID Ventas'
    and run.imported_by = 'sync-app-control-sales' and run.run_status in ('completed', 'completed_with_errors')
    and substr(sale.external_id, 1, 34) = 'app_control_operaciones:id_ventas:'
    and length(trim(substr(sale.external_id, 35))) > 0
    and not exists (select 1 from public.source_sync_errors err
      where err.run_id = run.id and err.source_key = sale.external_id)
`;

export const listSales = `select sale.id, sale.external_id, sale.operation_date, sale.brand
  ${eligibleSales} order by sale.operation_date desc, sale.id`;
export const detailSale = `select sale.id, sale.external_id, sale.operation_date, sale.brand,
  sale.client_name, sale.model, sale.subscription_number
  ${eligibleSales} and sale.id = $2`;

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ success: false });
  const actor = await verifySupabaseAccessToken(req);
  if (!actor) return res.status(401).json({ success: false });
  if (await getOperationalRole(actor.id) !== 'supervisor') return res.status(403).json({ success: false });
  const id = req.query?.id;
  if (id !== undefined && (typeof id !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))) {
    return res.status(400).json({ success: false });
  }
  try {
    const result = id ? await pool.query(detailSale, [actor.id, id]) : await pool.query(listSales, [actor.id]);
    if (id && !result.rows.length) return res.status(404).json({ success: false });
    return res.status(200).json({ success: true, data: id ? result.rows[0] : result.rows });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== '42703' && code !== '42P01') throw error;
    return res.status(503).json({ success: false, message: 'La integración de ID Ventas aún no está disponible.' });
  }
}
