import type { PoolClient } from 'pg';
import { databasePool } from './lib/database';

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: Record<string, unknown> };
type Response = { status: (code: number) => Response; json: (body: unknown) => Response };
type Profile = { role: 'admin' | 'gerente' | 'supervisor' | 'rrhh'; team_id: string | null; staff_member_id: string | null };

const rawConnectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL || '';
const pool = databasePool(rawConnectionString);
const text = (value: unknown, max = 1_000) => typeof value === 'string' && value.trim().length <= max ? value.trim() : '';

async function identity(request: Request) {
  const value = request.headers?.authorization;
  const authorization = Array.isArray(value) ? value[0] : value;
  if (!authorization?.startsWith('Bearer ') || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return null;
  const auth = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: authorization, apikey: process.env.SUPABASE_ANON_KEY } });
  return auth.ok ? ((await auth.json() as { id?: string }).id || null) : null;
}

async function profileFor(database: PoolClient, id: string) {
  const result = await database.query<Profile>('select role, team_id, staff_member_id from public.profiles where id=$1', [id]);
  return result.rows[0] || null;
}

async function canManageSeller(database: PoolClient, profile: Profile, sellerId: string) {
  if (profile.role === 'admin' || profile.role === 'rrhh') return true;
  if (profile.role === 'supervisor') {
    const result = await database.query('select 1 from public.sellers where id=$1 and team_id=$2', [sellerId, profile.team_id]);
    return Boolean(result.rowCount);
  }
  if (!profile.staff_member_id) return false;
  const result = await database.query(`select 1 from public.sellers seller join public.teams team on team.id=seller.team_id where seller.id=$1 and team.manager_staff_id=$2`, [sellerId, profile.staff_member_id]);
  return Boolean(result.rowCount);
}

export default async function handler(request: Request, response: Response) {
  if (request.method !== 'POST' || !rawConnectionString) return response.status(rawConnectionString ? 405 : 503).json({ success: false, message: rawConnectionString ? 'Método no permitido.' : 'La base operativa no está configurada.' });
  const userId = await identity(request); if (!userId) return response.status(401).json({ success: false, message: 'Sesión no válida.' });
  const database = await pool.connect();
  try {
    const profile = await profileFor(database, userId); if (!profile) return response.status(403).json({ success: false, message: 'No existe un perfil operativo para esta cuenta.' });
    const action = text(request.body?.action, 20);
    if (action === 'request') {
      if (profile.role !== 'supervisor') return response.status(403).json({ success: false, message: 'La solicitud debe iniciarla el supervisor responsable.' });
      const sellerId = text(request.body?.seller_id, 64); const amount = request.body?.amount;
      if (!sellerId || typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || !(await canManageSeller(database, profile, sellerId))) return response.status(400).json({ success: false, message: 'La solicitud no es válida para tu equipo.' });
      const config = await database.query<{ id: string; min_sales_for_advance: number; max_advance_amount: number; advance_deadline: string }>(`select id,min_sales_for_advance,max_advance_amount,advance_deadline from public.monthly_config where current_date between start_date and end_date order by start_date desc limit 1`);
      const current = config.rows[0]; if (!current) return response.status(409).json({ success: false, message: 'No existe una configuración mensual vigente.' });
      const sales = await database.query<{ total: number }>(`select count(*)::int as total from public.sales_operations where seller_id=$1 and operation_date between (select start_date from public.monthly_config where id=$2) and (select end_date from public.monthly_config where id=$2) and status <> 'caido'`, [sellerId, current.id]);
      const deadline = new Date(`${current.advance_deadline}T12:00:00`).getDate();
      if (new Date().getDate() > deadline || amount > Number(current.max_advance_amount) || (sales.rows[0]?.total || 0) < current.min_sales_for_advance) return response.status(400).json({ success: false, message: 'La solicitud no cumple las reglas vigentes de elegibilidad.' });
      const created = await database.query(`insert into public.wage_advances (seller_id,monthly_config_id,amount,seller_sales_count_at_date,reason,requested_by) values($1,$2,$3,$4,$5,$6) returning id,seller_id,request_date,amount,status,seller_sales_count_at_date,reason,reviewed_at,reviewed_by`, [sellerId, current.id, amount, sales.rows[0]?.total || 0, text(request.body?.reason, 2_000) || null, userId]);
      return response.status(201).json({ success: true, advance: created.rows[0], minSalesRequired: current.min_sales_for_advance });
    }
    if (action === 'review') {
      if (!['gerente', 'admin'].includes(profile.role)) return response.status(403).json({ success: false, message: 'Sólo Gerencia o Administración puede resolver adelantos.' });
      const id = text(request.body?.id, 64); const status = text(request.body?.status, 20);
      if (!id || !['approved', 'rejected'].includes(status)) return response.status(400).json({ success: false, message: 'La decisión no es válida.' });
      const advance = await database.query<{ seller_id: string }>('select seller_id from public.wage_advances where id=$1 and status=\'pending\'', [id]);
      if (!advance.rowCount || !(await canManageSeller(database, profile, advance.rows[0].seller_id))) return response.status(403).json({ success: false, message: 'No podés resolver este adelanto.' });
      const updated = await database.query(`update public.wage_advances set status=$2::public.advance_status, reviewed_by=$3, reviewed_at=now(), review_notes=$4 where id=$1 returning id,seller_id,request_date,amount,status,seller_sales_count_at_date,reason,review_notes as rejection_reason,reviewed_at,reviewed_by`, [id, status, userId, text(request.body?.notes, 2_000) || null]);
      return response.status(200).json({ success: true, advance: updated.rows[0] });
    }
    return response.status(400).json({ success: false, message: 'Acción no reconocida.' });
  } catch (error) {
    console.error('Wage advance mutation failed', error);
    return response.status(500).json({ success: false, message: 'No se pudo guardar el adelanto.' });
  } finally { database.release(); }
}
