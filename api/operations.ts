import type { PoolClient } from 'pg';
import { databasePool } from './lib/database';

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: Record<string, unknown> };
type Response = { status: (code: number) => Response; json: (body: unknown) => Response };

const rawConnectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL || '';
const pool = databasePool(rawConnectionString);

type Profile = { id: string; role: 'admin' | 'gerente' | 'supervisor' | 'rrhh'; team_id: string | null; staff_member_id: string | null };

const stringValue = (value: unknown, maximum = 240) => typeof value === 'string' && value.trim().length <= maximum ? value.trim() : '';
const numericValue = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const objectValue = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? value : null;

async function authenticatedUserId(request: Request) {
  const raw = request.headers?.authorization;
  const authorization = Array.isArray(raw) ? raw[0] : raw;
  if (!authorization?.startsWith('Bearer ') || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return null;
  const result = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: process.env.SUPABASE_ANON_KEY },
  });
  return result.ok ? ((await result.json() as { id?: string }).id || null) : null;
}

async function profileFor(database: PoolClient, userId: string): Promise<Profile | null> {
  const result = await database.query<Profile>('select id, role, team_id, staff_member_id from public.profiles where id = $1 limit 1', [userId]);
  return result.rows[0] || null;
}

async function canAccessTeam(database: PoolClient, profile: Profile, teamId: string) {
  if (profile.role === 'admin' || profile.role === 'rrhh') return true;
  if (profile.role === 'supervisor') return profile.team_id === teamId;
  if (!profile.staff_member_id) return false;
  const team = await database.query('select 1 from public.teams where id = $1 and manager_staff_id = $2 limit 1', [teamId, profile.staff_member_id]);
  return Boolean(team.rowCount);
}

export default async function handler(request: Request, response: Response) {
  if (request.method !== 'POST' || !rawConnectionString) {
    return response.status(rawConnectionString ? 405 : 503).json({ success: false, message: rawConnectionString ? 'Método no permitido.' : 'La base operativa no está configurada.' });
  }
  const userId = await authenticatedUserId(request);
  if (!userId) return response.status(401).json({ success: false, message: 'Sesión no válida.' });

  const database = await pool.connect();
  try {
    const profile = await profileFor(database, userId);
    if (!profile) return response.status(403).json({ success: false, message: 'Tu cuenta no tiene perfil operativo asignado.' });
    const action = stringValue(request.body?.action, 20);

    if (action === 'create') {
      const sellerId = stringValue(request.body?.seller_id, 64);
      const teamId = stringValue(request.body?.team_id, 64);
      const subscription = stringValue(request.body?.subscription_number, 160);
      const brand = stringValue(request.body?.brand, 80);
      const operationDate = stringValue(request.body?.operation_date, 10);
      const clientName = stringValue(request.body?.client_name, 240);
      if (!sellerId || !teamId || !subscription || !brand || !clientName || !/^\d{4}-\d{2}-\d{2}$/.test(operationDate)) {
        return response.status(400).json({ success: false, message: 'La operación no contiene los datos obligatorios válidos.' });
      }
      if (!(await canAccessTeam(database, profile, teamId))) return response.status(403).json({ success: false, message: 'No tenés permiso para registrar operaciones en este equipo.' });
      const seller = await database.query('select 1 from public.sellers where id = $1 and team_id = $2 and active = true', [sellerId, teamId]);
      if (!seller.rowCount) return response.status(400).json({ success: false, message: 'El vendedor no pertenece a ese equipo o no está activo.' });
      const created = await database.query(`
        insert into public.sales_operations (
          operation_date, client_name, client_dni, client_phone, subscription_number, brand, model, plan_type,
          cuota_1_value, total_collected, factory_account, used_car_flag, used_car_details, seller_id, team_id, lead_source
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16)
        returning id, operation_date, subscription_number, brand, model, plan_type, cuota_1_value, total_collected,
          factory_account, used_car_flag, used_car_details, seller_id, team_id, lead_source, status, scoring_status, scoring_notes, audited_at
      `, [
        operationDate, clientName, stringValue(request.body?.client_dni, 40) || null, stringValue(request.body?.client_phone, 80) || null,
        subscription, brand, stringValue(request.body?.model) || null, stringValue(request.body?.plan_type, 40) || null,
        numericValue(request.body?.cuota_1_value), numericValue(request.body?.total_collected), stringValue(request.body?.factory_account) || null,
        request.body?.used_car_flag === true, JSON.stringify(objectValue(request.body?.used_car_details)), sellerId, teamId, stringValue(request.body?.lead_source, 120) || null,
      ]);
      return response.status(201).json({ success: true, operation: created.rows[0] });
    }

    if (action === 'audit') {
      if (!['admin', 'rrhh'].includes(profile.role)) return response.status(403).json({ success: false, message: 'Sólo Administración o RRHH puede auditar scoring.' });
      const operationId = stringValue(request.body?.operation_id, 64);
      const status = stringValue(request.body?.status, 20);
      const notes = stringValue(request.body?.notes, 4_000) || null;
      const reasons = Array.isArray(request.body?.reasons) ? request.body!.reasons.filter((item): item is string => typeof item === 'string' && item.length <= 300).slice(0, 20) : [];
      if (!operationId || !['pending', 'approved', 'rejected'].includes(status) || (status === 'rejected' && reasons.length === 0)) {
        return response.status(400).json({ success: false, message: 'La auditoría no tiene un formato válido.' });
      }
      await database.query('begin');
      const updated = await database.query(`
        update public.sales_operations
           set scoring_status = $2::public.scoring_status,
               scoring_notes = $3,
               audited_at = now(),
               status = case when $2 = 'approved' then 'apto_fabrica'::public.operation_status else 'pending_scoring'::public.operation_status end
         where id = $1
         returning id, operation_date, subscription_number, brand, model, plan_type, cuota_1_value, total_collected,
           factory_account, used_car_flag, used_car_details, seller_id, team_id, lead_source, status, scoring_status, scoring_notes, audited_at
      `, [operationId, status, notes]);
      if (!updated.rowCount) throw new Error('No existe la operación indicada.');
      await database.query(`insert into public.scoring_records (operation_id, subscription_number, status, call_notes, rejection_reasons, audited_at, source_row)
        select id, subscription_number, $2::public.scoring_status, $3, $4::jsonb, now(), jsonb_build_object('source', 'nave-planes-web', 'audited_by', $5)
        from public.sales_operations where id = $1`, [operationId, status, notes, JSON.stringify(reasons), userId]);
      await database.query('commit');
      return response.status(200).json({ success: true, operation: updated.rows[0] });
    }

    return response.status(400).json({ success: false, message: 'Acción operativa no reconocida.' });
  } catch (error) {
    await database.query('rollback').catch(() => undefined);
    console.error('Operations mutation failed', error);
    return response.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No se pudo guardar la operación.' });
  } finally {
    database.release();
  }
}
