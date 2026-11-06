import { databasePool } from './lib/database';

type Req = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: Record<string, unknown> };
type Res = { status: (n: number) => Res; json: (x: unknown) => Res };
const pool = databasePool(process.env.POSTGRES_URL || process.env.DATABASE_URL || '');
const text = (value: unknown) => String(value ?? '').trim();
const requiredDocuments = ['dni_front', 'dni_back', 'cv', 'criminal_record', 'employment_application'];
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
    if (!['rrhh','admin'].includes(profile?.role || '')) return res.status(403).json({ success: false, message: 'Sólo RRHH o Administración puede registrar altas directas.' });
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
    const request = (await db.query<any>(`select * from public.incorporation_requests where id=$1 and entry_mode='rrhh_direct' and direct_registered_by=$2 and status='borrador' for update`, [requestId, userId])).rows[0];
    if (!request) throw new Error('El alta directa no está disponible para finalizar.');
    const documents = await db.query<{ document_kind: string }>(`select d.document_kind from public.incorporation_request_documents d join storage.objects o on o.bucket_id='rrhh-legajos' and o.name=d.storage_path where d.request_id=$1`, [requestId]);
    if (requiredDocuments.some(kind => !documents.rows.some(document => document.document_kind === kind))) throw new Error('Falta documentación obligatoria o algún archivo privado no está disponible.');
    await db.query('select pg_advisory_xact_lock(hashtext($1))', [request.dni]);
    if ((await db.query(`select id from public.staff_members where regexp_replace(coalesce(dni,''),'\\D','','g')=$1 for update`, [request.dni])).rowCount) throw new Error('El DNI ya existe en Legajos; no se generó un legajo duplicado.');
    if (!(await db.query(`select id from public.hr_roles where id=$1 and area_id=$2 and active`, [request.role_id, request.area_id])).rowCount) throw new Error('El puesto ya no pertenece al área o no está activo.');
    const staff = await db.query<{ id: string }>(`insert into public.staff_members(full_name,dni,legajo,employment_type,active,area_id,role_id,responsible_staff_id,is_coaching,administrative_status,incorporation_authorized_at,incorporation_authorized_by) values($1,$2,null,'COACHING',true,$3,$4,$5,true,'coaching',now(),$6) returning id`, [`${request.surname} ${request.given_names}`.trim(), request.dni, request.area_id, request.role_id, request.supervisor_staff_id, userId]);
    await db.query(`update public.incorporation_requests set status='autorizado',reviewed_by=$2,reviewed_at=now(),review_note='Alta directa de RRHH',authorized_staff_member_id=$3,updated_at=now() where id=$1`, [requestId, userId, staff.rows[0].id]);
    await db.query(`insert into public.incorporation_request_decisions(request_id,decision,reason,decided_by) values($1,'autorizado','Alta directa de RRHH',$2)`, [requestId, userId]);
    await db.query(`insert into public.incorporation_request_audit(request_id,event_type,actor_id,metadata) values($1,'rrhh_direct_authorized',$2,jsonb_build_object('staff_member_id',$3::uuid))`, [requestId, userId, staff.rows[0].id]);
    await db.query('commit'); return res.status(200).json({ success: true, staff_member_id: staff.rows[0].id });
  } catch (error) {
    await db.query('rollback').catch(() => undefined);
    return res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No se pudo registrar el alta directa.' });
  } finally { db.release(); }
}
