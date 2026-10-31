import type { PoolClient } from 'pg';
import { confidentNameMatch, matchesSupervisorContext } from './lib/name-match';
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

async function accessProfile(db: PoolClient, userId: string) {
  const result = await db.query<{ role: 'admin' | 'supervisor'; team_id: string | null }>(`select role,team_id from public.profiles where id = $1 limit 1`, [userId]);
  return result.rows[0] || null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!rawConnectionString) return res.status(503).json({ success: false, message: 'La base operativa no está configurada.' });
  const userId = await userIdFromRequest(req);
  if (!userId) return res.status(401).json({ success: false, message: 'Sesión no válida o vencida.' });
  const db = await pool.connect();
  try {
    const profile = await accessProfile(db, userId);
    if (!profile || !['admin', 'supervisor'].includes(profile.role)) return res.status(403).json({ success: false, message: 'No tenés permisos para revisar asociaciones de Fox.' });
    if (req.method === 'GET') {
      const [users, historicalMappings, resources, pendingSuggestions] = await Promise.all([
        db.query(`
          with latest as (select max(snapshot_date) as snapshot_date from public.fox_lead_daily_snapshots)
          select s.fox_user_key, max(s.fox_user_name) as fox_user_name,
            max(s.fox_supervisor_name) as fox_supervisor_name, count(*)::int as lead_count
          from public.fox_lead_daily_snapshots s cross join latest
          where s.snapshot_date = latest.snapshot_date and s.seller_id is null and s.fox_user_key is not null
          group by s.fox_user_key order by lead_count desc, fox_user_name
        `),
        db.query(`
          with latest as (select max(snapshot_date) as snapshot_date from public.fox_lead_daily_snapshots)
          select m.fox_user_key,
            coalesce(max(s.fox_user_name), m.fox_user_name) as fox_user_name,
            max(s.fox_supervisor_name) as fox_supervisor_name,
            count(s.fox_lead_id)::int as lead_count
          from public.fox_user_mappings m
          join public.sellers historical on historical.id=m.seller_id
          left join public.fox_lead_daily_snapshots s on s.fox_user_key=m.fox_user_key
            and s.snapshot_date=(select snapshot_date from latest)
          where historical.full_name='RECURSOS CON BAJA — histórico Fox'
          group by m.fox_user_key,m.fox_user_name
          order by lead_count desc, fox_user_name
        `),
        db.query(`
          select staff.id,staff.full_name,team.id as team_id,responsible.full_name as responsible_name,
            not exists(select 1 from public.fox_user_mappings mapping where mapping.staff_member_id=staff.id) as available_for_review
          from public.staff_members staff
          left join public.staff_members responsible on responsible.id=staff.responsible_staff_id
          left join public.teams own_team on own_team.supervisor_staff_id=staff.id and own_team.active=true and own_team.is_sales_team=true
          left join public.teams parent_team on parent_team.supervisor_staff_id=staff.responsible_staff_id and parent_team.active=true and parent_team.is_sales_team=true
          cross join lateral (select coalesce(own_team.id,parent_team.id) as id) team
          where staff.active=true
          order by staff.full_name
        `),
        profile.role === 'admin'
          ? db.query(`
              select suggestion.id as suggestion_id, suggestion.fox_user_key, staff.id as suggested_seller_id,
                staff.full_name as suggested_resource_name, proposer.full_name as proposed_by_name
              from public.fox_user_mapping_suggestions suggestion
              join public.staff_members staff on staff.id=suggestion.proposed_staff_member_id
              left join public.profiles proposer on proposer.id=suggestion.proposed_by
              where suggestion.status='pending'
              order by suggestion.created_at asc
            `)
          : Promise.resolve({ rows: [] }),
      ]);
      const unmappedUsers = users.rows.map((user) => {
        const candidate = confidentNameMatch(user.fox_user_name, resources.rows);
        // A name alone never creates a proposal: it must also agree with the
        // supervisor extracted from Fox's Sucursal field.
        const validContext = candidate && matchesSupervisorContext(user.fox_supervisor_name, candidate.responsible_name);
        return { ...user, suggested_seller_id: validContext ? candidate.id : null };
      });
      return res.status(200).json({ success: true, canConfirm: profile.role === 'admin', unmappedUsers, sellers: [
        ...resources.rows,
        { id: '__terminated__', full_name: 'RECURSOS CON BAJA — histórico Fox', team_id: null },
      ], reviewUsers: historicalMappings.rows, pendingSuggestions: pendingSuggestions.rows });
    }
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Método no permitido.' });
    const body = req.body as { mappings?: unknown; suggestions?: unknown };
    const mappings = profile.role === 'admin' ? body?.mappings : body?.suggestions;
    if (!Array.isArray(mappings) || mappings.length === 0 || mappings.length > 200) return res.status(400).json({ success: false, message: 'Las asociaciones no tienen un formato válido.' });
    await db.query('begin');
    let updated = 0;
    for (const item of mappings as Array<{ foxUserKey?: unknown; sellerId?: unknown; suggestionId?: unknown }>) {
      const foxUserKey = typeof item.foxUserKey === 'string' ? item.foxUserKey.trim() : '';
      const sellerId = typeof item.sellerId === 'string' ? item.sellerId.trim() : '';
      if (!foxUserKey || !sellerId) continue;
      if (profile.role === 'supervisor') {
        const candidate = await db.query<{ id: string }>(`
          select staff.id from public.staff_members staff
          left join public.teams own_team on own_team.supervisor_staff_id=staff.id and own_team.active=true and own_team.is_sales_team=true
          left join public.teams parent_team on parent_team.supervisor_staff_id=staff.responsible_staff_id and parent_team.active=true and parent_team.is_sales_team=true
          where staff.id=$1 and staff.active=true and coalesce(own_team.id,parent_team.id)=$2
        `, [sellerId, profile.team_id]);
        if (!candidate.rows[0]) throw new Error('Sólo podés sugerir recursos de tu equipo.');
        await db.query(`
          insert into public.fox_user_mapping_suggestions(fox_user_key,proposed_staff_member_id,proposed_by)
          values($1,$2,$3) on conflict (fox_user_key,proposed_staff_member_id,proposed_by,status) do nothing
        `, [foxUserKey, sellerId, userId]);
        updated += 1;
        continue;
      }
      let id = ''; let team_id: string | null = null; let full_name = ''; let staff_member_id: string | null = null;
      if (sellerId === '__terminated__') {
        const retired = await db.query<{ id: string }>(`
          select id from public.sellers where full_name='RECURSOS CON BAJA — histórico Fox' and staff_member_id is null limit 1
        `);
        const bucket = retired.rows[0] || (await db.query<{ id: string }>(`
          insert into public.sellers(full_name,team_id,active,hire_date,dni,staff_member_id,legajo,employment_type)
          values('RECURSOS CON BAJA — histórico Fox',null,false,null,null,null,null,'HISTÓRICO FOX') returning id
        `)).rows[0];
        id = bucket.id; full_name = 'RECURSOS CON BAJA — histórico Fox';
      } else {
        const resource = await db.query<{ id: string; full_name: string; dni: string | null; legajo: string | null; employment_type: string | null; team_id: string | null }>(`
          select staff.id,staff.full_name,staff.dni,staff.legajo,staff.employment_type,coalesce(own_team.id,parent_team.id) as team_id
          from public.staff_members staff
          left join public.teams own_team on own_team.supervisor_staff_id=staff.id and own_team.active=true and own_team.is_sales_team=true
          left join public.teams parent_team on parent_team.supervisor_staff_id=staff.responsible_staff_id and parent_team.active=true and parent_team.is_sales_team=true
          where staff.id=$1 and staff.active=true
        `, [sellerId]);
        if (!resource.rows[0]) continue;
        const candidate = resource.rows[0];
        const seller = await db.query<{ id: string }>(`
          insert into public.sellers(full_name,team_id,active,hire_date,dni,staff_member_id,legajo,employment_type)
          values($1,$2,true,null,$3,$4,$5,$6)
          on conflict (staff_member_id) where staff_member_id is not null
          do update set full_name=excluded.full_name,team_id=excluded.team_id,active=true,dni=excluded.dni,legajo=excluded.legajo,employment_type=excluded.employment_type
          returning id
        `, [candidate.full_name, candidate.team_id, candidate.dni, candidate.id, candidate.legajo, candidate.employment_type]);
        id = seller.rows[0].id; team_id = candidate.team_id; full_name = candidate.full_name; staff_member_id = candidate.id;
        const occupied = await db.query<{ fox_user_key: string }>(`
          select fox_user_key from public.fox_user_mappings
          where staff_member_id=$1 and fox_user_key<>$2 limit 1
        `, [staff_member_id, foxUserKey]);
        if (occupied.rows[0]) throw new Error(`El recurso ${full_name} ya está asociado a otro usuario de Fox.`);
      }
      await db.query(`
        insert into public.fox_user_mappings (fox_user_key, fox_user_name, seller_id, staff_member_id, updated_at)
        values ($1, $2, $3, $4, now())
        on conflict (fox_user_key) do update set fox_user_name = excluded.fox_user_name, seller_id = excluded.seller_id, staff_member_id = excluded.staff_member_id, updated_at = now()
      `, [foxUserKey, full_name, id, staff_member_id]);
      const snapshotResult = await db.query(`update public.fox_lead_daily_snapshots set seller_id = $2, team_id = $3 where fox_user_key = $1`, [foxUserKey, id, team_id]);
      await db.query(`update public.fox_leads set seller_id = $2, team_id = $3, updated_at = now() where fox_user_key = $1`, [foxUserKey, id, team_id]);
      const suggestionId = typeof item.suggestionId === 'string' ? item.suggestionId : '';
      if (suggestionId) await db.query(`update public.fox_user_mapping_suggestions set status='approved',reviewed_by=$2,reviewed_at=now() where id=$1 and status='pending'`, [suggestionId, userId]);
      updated += snapshotResult.rowCount || 0;
    }
    await db.query('commit');
    return res.status(200).json({ success: true, updated, suggested: profile.role === 'supervisor' });
  } catch (error) {
    await db.query('rollback');
    console.error('Fox mapping update failed', error);
    return res.status(500).json({ success: false, message: 'No se pudieron guardar las asociaciones.' });
  } finally {
    db.release();
  }
}
