import type { PoolClient } from 'pg';
import { confidentNameMatch } from './lib/name-match';
import { databasePool } from './lib/database';

type VercelRequest = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown };
type VercelResponse = { status: (code: number) => VercelResponse; json: (body: unknown) => VercelResponse };
const rawConnectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL || '';
const pool = databasePool(rawConnectionString);

async function userIdFromRequest(req: VercelRequest) {
  const header = req.headers?.authorization;
  const authorization = Array.isArray(header) ? header[0] : header;
  if (!authorization?.startsWith('Bearer ') || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return null;
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: authorization, apikey: process.env.SUPABASE_ANON_KEY } });
  if (!response.ok) return null;
  return (await response.json() as { id?: string }).id || null;
}

async function assertAdmin(db: PoolClient, userId: string) {
  const result = await db.query(`select role from public.profiles where id = $1 limit 1`, [userId]);
  return result.rows[0]?.role === 'admin';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!rawConnectionString) return res.status(503).json({ success: false, message: 'La base operativa no está configurada.' });
  const userId = await userIdFromRequest(req);
  if (!userId) return res.status(401).json({ success: false, message: 'Sesión no válida o vencida.' });
  const db = await pool.connect();
  try {
    if (!(await assertAdmin(db, userId))) return res.status(403).json({ success: false, message: 'Sólo Administración puede asociar usuarios de Fox.' });
    if (req.method === 'GET') {
      const [users, sellers] = await Promise.all([
        db.query(`
          with latest as (select max(snapshot_date) as snapshot_date from public.fox_lead_daily_snapshots)
          select s.fox_user_key, max(s.fox_user_name) as fox_user_name, count(*)::int as lead_count
          from public.fox_lead_daily_snapshots s cross join latest
          where s.snapshot_date = latest.snapshot_date and s.seller_id is null and s.fox_user_key is not null
          group by s.fox_user_key order by lead_count desc, fox_user_name
        `),
        db.query(`select id, full_name, team_id from public.sellers where active = true order by full_name`),
      ]);
      const unmappedUsers = users.rows.map((user) => ({
        ...user,
        suggested_seller_id: confidentNameMatch(user.fox_user_name, sellers.rows)?.id || null,
      }));
      return res.status(200).json({ success: true, unmappedUsers, sellers: sellers.rows });
    }
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Método no permitido.' });
    const mappings = (req.body as { mappings?: unknown })?.mappings;
    if (!Array.isArray(mappings) || mappings.length === 0 || mappings.length > 200) return res.status(400).json({ success: false, message: 'Las asociaciones no tienen un formato válido.' });
    await db.query('begin');
    let updated = 0;
    for (const item of mappings as Array<{ foxUserKey?: unknown; sellerId?: unknown }>) {
      const foxUserKey = typeof item.foxUserKey === 'string' ? item.foxUserKey.trim() : '';
      const sellerId = typeof item.sellerId === 'string' ? item.sellerId.trim() : '';
      if (!foxUserKey || !sellerId) continue;
      const seller = await db.query(`select id, team_id, full_name from public.sellers where id = $1 and active = true`, [sellerId]);
      if (!seller.rows[0]) continue;
      const { id, team_id, full_name } = seller.rows[0];
      await db.query(`
        insert into public.fox_user_mappings (fox_user_key, fox_user_name, seller_id, updated_at)
        values ($1, $2, $3, now())
        on conflict (fox_user_key) do update set fox_user_name = excluded.fox_user_name, seller_id = excluded.seller_id, updated_at = now()
      `, [foxUserKey, full_name, id]);
      const snapshotResult = await db.query(`update public.fox_lead_daily_snapshots set seller_id = $2, team_id = $3 where fox_user_key = $1`, [foxUserKey, id, team_id]);
      await db.query(`update public.fox_leads set seller_id = $2, team_id = $3, updated_at = now() where fox_user_key = $1`, [foxUserKey, id, team_id]);
      updated += snapshotResult.rowCount || 0;
    }
    await db.query('commit');
    return res.status(200).json({ success: true, updated });
  } catch (error) {
    await db.query('rollback');
    console.error('Fox mapping update failed', error);
    return res.status(500).json({ success: false, message: 'No se pudieron guardar las asociaciones.' });
  } finally {
    db.release();
  }
}
