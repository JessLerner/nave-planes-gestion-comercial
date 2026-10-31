import { Pool } from 'pg';

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: Record<string, unknown> };
type Response = { status: (code: number) => Response; json: (body: unknown) => Response };
const connectionString = (process.env.POSTGRES_URL || process.env.DATABASE_URL || '')
  .replace(/([?&])sslmode=[^&]*/i, '$1').replace(/[?&]$/, '');
const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

async function userId(request: Request) {
  const value = request.headers?.authorization; const authorization = Array.isArray(value) ? value[0] : value;
  if (!authorization?.startsWith('Bearer ') || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return null;
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: authorization, apikey: process.env.SUPABASE_ANON_KEY } });
  return response.ok ? ((await response.json() as { id?: string }).id || null) : null;
}
const text = (value: unknown) => String(value ?? '').trim();

export default async function handler(request: Request, response: Response) {
  if (request.method !== 'PATCH') return response.status(405).json({ success: false, message: 'Método no permitido.' });
  const user = await userId(request); if (!user) return response.status(401).json({ success: false, message: 'Sesión no válida.' });
  const id = text(request.body?.id); if (!id) return response.status(400).json({ success: false, message: 'Recurso inválido.' });
  const database = await pool.connect();
  try {
    const profile = await database.query('select role from public.profiles where id=$1', [user]);
    if (!['admin', 'gerente', 'rrhh'].includes(profile.rows[0]?.role)) return response.status(403).json({ success: false, message: 'No tenés permiso para editar la nómina.' });
    const roleId = text(request.body?.role_id); const responsibleId = text(request.body?.responsible_staff_id) || null;
    const role = await database.query<{ area_id: string }>('select area_id from public.hr_roles where id=$1 and active=true', [roleId]);
    if (!role.rows[0]) return response.status(400).json({ success: false, message: 'Cargo inválido.' });
    if (responsibleId === id) return response.status(400).json({ success: false, message: 'Una persona no puede ser su propio responsable.' });
    await database.query('begin');
    const parent = responsibleId ? await database.query<{ effective_manager_staff_id: string | null }>('select effective_manager_staff_id from public.staff_members where id=$1 and active=true', [responsibleId]) : { rows: [] };
    if (responsibleId && !parent.rows[0]) throw new Error('El responsable seleccionado no está activo.');
    const updated = await database.query(
      `update public.staff_members set full_name=$2,dni=$3,legajo=$4,employment_type=$5,
       role_id=$6,area_id=$7,responsible_staff_id=$8,active=$9,
       effective_manager_staff_id=case when $8::uuid is null then effective_manager_staff_id else $10::uuid end,
       effective_manager_source=case when $8::uuid is null then effective_manager_source else 'inherited' end,
       updated_at=now() where id=$1
       returning id,full_name`,
      [id, text(request.body?.full_name).toUpperCase(), text(request.body?.dni) || null, text(request.body?.legajo) || null,
        text(request.body?.employment_type) || null, roleId, role.rows[0].area_id, responsibleId,
        Boolean(request.body?.active), parent.rows[0]?.effective_manager_staff_id || null],
    );
    if (!updated.rows[0]) throw new Error('No existe el recurso.');
    await database.query('commit');
    return response.status(200).json({ success: true, resource: updated.rows[0] });
  } catch (error) {
    await database.query('rollback');
    return response.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No se pudo guardar el recurso.' });
  } finally { database.release(); }
}
