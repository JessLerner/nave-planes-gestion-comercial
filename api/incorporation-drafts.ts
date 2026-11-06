import { databasePool } from './lib/database';

type Req = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: Record<string, unknown> };
type Res = { status: (n: number) => Res; json: (x: unknown) => Res };
const pool = databasePool(process.env.POSTGRES_URL || process.env.DATABASE_URL || '');

async function identity(req: Req) {
  const header = req.headers?.authorization;
  const token = Array.isArray(header) ? header[0] : header;
  if (!token?.startsWith('Bearer ') || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return null;
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: token, apikey: process.env.SUPABASE_ANON_KEY } });
  return response.ok ? ((await response.json() as { id?: string }).id || null) : null;
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'DELETE') return res.status(405).json({ success: false, message: 'Método no permitido.' });
  const userId = await identity(req); const requestId = String(req.body?.id || '').trim();
  const authorization = Array.isArray(req.headers?.authorization) ? req.headers?.authorization[0] : req.headers?.authorization;
  if (!userId || !requestId) return res.status(400).json({ success: false, message: 'Borrador inválido.' });
  const db = await pool.connect();
  try {
    await db.query('begin');
    const draft = await db.query(`select id from public.incorporation_requests where id=$1 and requested_by=$2 and status='borrador' for update`, [requestId, userId]);
    if (!draft.rowCount) throw new Error('Sólo podés eliminar un borrador propio.');
    const profile = await db.query('select id from public.profiles where id=$1', [userId]);
    if (!profile.rowCount) throw new Error('Perfil operativo no encontrado.');
    const files = await db.query<{ storage_path: string }>(`select name as storage_path from storage.objects where bucket_id='rrhh-legajos' and name like $1`, [`incorporations/${requestId}/%`]);
    if (files.rowCount) {
      const deleted = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/rrhh-legajos`, { method: 'DELETE', headers: { Authorization: authorization || '', apikey: process.env.SUPABASE_ANON_KEY || '', 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: files.rows.map(file => file.storage_path) }) });
      if (!deleted.ok) throw new Error('No se pudieron eliminar los archivos privados; el borrador sigue disponible para reintentar.');
    }
    await db.query('delete from public.incorporation_request_documents where request_id=$1', [requestId]);
    await db.query(`insert into public.incorporation_request_audit(request_id,event_type,actor_id,metadata) values($1,'draft_deleted',$2,'{}')`, [requestId, userId]);
    await db.query('delete from public.incorporation_requests where id=$1', [requestId]);
    await db.query('commit');
    return res.status(200).json({ success: true });
  } catch (error) {
    await db.query('rollback').catch(() => undefined);
    return res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No se pudo eliminar el borrador.' });
  } finally { db.release(); }
}
