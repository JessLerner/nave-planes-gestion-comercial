import { databasePool } from './lib/database';

type VercelRequest = { method?: string; headers?: Record<string, string | string[] | undefined> };
type VercelResponse = { status: (code: number) => VercelResponse; json: (body: unknown) => VercelResponse };

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
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Método no permitido.' });
  const identity = await verifySupabaseAccessToken(req);
  if (!identity) return res.status(401).json({ success: false, message: 'Sesión no válida o vencida.' });

  try {
    const result = await pool.query(
      `select id, full_name, role, team_id, branch, staff_member_id
         from public.profiles where id = $1 limit 1`,
      [identity.id],
    );
    if (!result.rowCount) return res.status(403).json({ success: false, message: 'Tu cuenta no tiene perfil operativo asignado.' });
    return res.status(200).json({ success: true, profile: result.rows[0] });
  } catch (error) {
    const details = error instanceof Error
      ? { name: error.name, message: error.message, code: (error as Error & { code?: string }).code }
      : { message: String(error) };
    console.error('Unable to load authenticated profile', details);
    return res.status(500).json({ success: false, message: 'No se pudo validar el perfil operativo.' });
  }
}
