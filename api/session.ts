import { databasePool } from './lib/database';
import { ACCOUNT_ROLE_LABELS } from '../src/security/accountRoles';
import type { ApiRequest, ApiResponse } from './lib/http';

const rawConnectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL || '';
const pool = databasePool(rawConnectionString);

export async function verifySupabaseAccessToken(req: ApiRequest) {
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

export async function getOperationalRole(id: string) {
  const result = await pool.query('select role from public.profiles where id=$1', [id]);
  return result.rows[0]?.role;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Método no permitido.' });
  const identity = await verifySupabaseAccessToken(req);
  if (!identity) return res.status(401).json({ success: false, message: 'Sesión no válida o vencida.' });

  try {
    const result = await pool.query(
      `select profile.id, profile.full_name, profile.role, profile.team_id, profile.branch, profile.staff_member_id,
              exists(select 1 from naveplan_private.platform_owner o where o.profile_id=profile.id and profile.role='admin') as is_platform_owner,
              coalesce(array_agg(permission.capability order by permission.capability) filter (where permission.capability is not null), '{}') as capabilities
         from public.profiles profile
         left join public.profile_access_permissions permission on permission.profile_id=profile.id
        where profile.id = $1
        group by profile.id, profile.full_name, profile.role, profile.team_id, profile.branch, profile.staff_member_id`,
      [identity.id],
    );
    if (!result.rowCount || !Object.hasOwn(ACCOUNT_ROLE_LABELS,result.rows[0].role)) return res.status(403).json({ success: false, message: 'Tu cuenta no tiene perfil operativo asignado.' });
    return res.status(200).json({ success: true, profile: result.rows[0] });
  } catch (error) {
    const details = error instanceof Error
      ? { name: error.name, message: error.message, code: (error as Error & { code?: string }).code }
      : { message: String(error) };
    console.error('Unable to load authenticated profile', details);
    return res.status(500).json({ success: false, message: 'No se pudo validar el perfil operativo.' });
  }
}
