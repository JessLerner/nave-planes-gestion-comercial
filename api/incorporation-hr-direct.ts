import { authorizeDirectHire } from './lib/authorize-direct-hire';
import { databasePool } from './lib/database';

type Req = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: Record<string, unknown> };
type Res = { status: (n: number) => Res; json: (x: unknown) => Res };
const pool = databasePool(process.env.POSTGRES_URL || process.env.DATABASE_URL || '');
const text = (value: unknown) => String(value ?? '').trim();
const normalizeName = (value: unknown) => text(value).toUpperCase().replace(/Ñ/g, '__ENYE__').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/__ENYE__/g, 'Ñ').replace(/\s+/g, ' ');

async function identity(req: Req) {
  const value = req.headers?.authorization; const token = Array.isArray(value) ? value[0] : value;
  if (!token?.startsWith('Bearer ') || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return null;
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: token, apikey: process.env.SUPABASE_ANON_KEY } });
  return response.ok ? ((await response.json() as { id?: string }).id || null) : null;
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Método no permitido.' });
  const userId = await identity(req); if (!userId) return res.status(401).json({ success: false, message: 'Sesión no válida.' });
  const db = await pool.connect();
  try {
    const profile = (await db.query<{ role: string }>('select role from public.profiles where id=$1', [userId])).rows[0];
    if (!['rrhh','admin','direccion'].includes(profile?.role || '')) return res.status(403).json({ success: false, message: 'Sólo RRHH o Administración puede registrar altas directas.' });
    const body = req.body || {}; const action = text(body.action) || 'create';
    if (action === 'create') {
      const dni = text(body.dni).replace(/\D/g, ''), supervisorId = text(body.supervisor_staff_id), roleId = text(body.role_id), areaId = text(body.area_id);
      if (!text(body.surname) || !text(body.given_names) || !/^\d{7,8}$/.test(dni) || !text(body.birth_date) || !roleId || !areaId || !supervisorId || !text(body.planned_start_date)) throw new Error('Completá todos los datos obligatorios antes de registrar el alta directa.');
      const supervisor = await db.query<{ effective_manager_staff_id: string | null }>(`select s.effective_manager_staff_id from public.staff_members s join public.hr_roles r on r.id=s.role_id where s.id=$1 and s.active and r.app_role_mapping='supervisor' and exists(select 1 from public.hr_roles where id=$2 and area_id=$3 and active)`, [supervisorId, roleId, areaId]);
      if (!supervisor.rowCount) throw new Error('La estructura, área o puesto no es válida.');
      if ((await db.query(`select 1 from public.staff_members where regexp_replace(coalesce(dni,''),'\\D','','g')=$1`, [dni])).rowCount) throw new Error('El DNI ya existe en Legajos; revisá el recurso existente antes de continuar.');
      const created = await db.query(`insert into public.incorporation_requests(status,surname,given_names,dni,birth_date,role_id,area_id,supervisor_staff_id,derived_manager_staff_id,planned_start_date,observations,requested_by,entry_mode,direct_registered_by,direct_registered_at) values('borrador',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'rrhh_direct',$11,now()) returning *`, [normalizeName(body.surname), normalizeName(body.given_names), dni, text(body.birth_date), roleId, areaId, supervisorId, supervisor.rows[0].effective_manager_staff_id, text(body.planned_start_date), text(body.observations) || null, userId]);
      return res.status(201).json({ success: true, data: created.rows[0] });
    }
    if (action !== 'authorize') return res.status(400).json({ success: false, message: 'Acción de alta directa inválida.' });
    const requestId = text(body.request_id); await db.query('begin');
    const staffId = await authorizeDirectHire(db,requestId,userId);
    await db.query('commit'); return res.status(200).json({ success: true, staff_member_id: staffId });
  } catch (error) {
    await db.query('rollback').catch(() => undefined);
    return res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No se pudo registrar el alta directa.' });
  } finally { db.release(); }
}
