import { Pool } from 'pg';

type ImportRow = {
  line?: number; name?: string; dni?: string; legajo?: string; nomina?: string;
  category?: string; supervisor?: string; manager?: string; decision?: string;
};
type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: { rows?: ImportRow[] } };
type Response = { status: (code: number) => Response; json: (body: unknown) => Response };
type Role = { id: string; name: string; area_id: string; can_supervise_sales_team: boolean; creates_seller_record: boolean };
type Created = { id: string; full_name: string; role: Role; row: Required<ImportRow> };

const connectionString = (process.env.POSTGRES_URL || process.env.DATABASE_URL || '')
  .replace(/([?&])sslmode=[^&]*/i, '$1').replace(/[?&]$/, '');
const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

const normalize = (value: unknown) => String(value || '').toUpperCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const tokens = (value: unknown) => normalize(value).split(' ').filter((token) => token.length > 1 && !/^\d+$/.test(token));
const similarity = (reference: unknown, candidate: unknown) => {
  const left = tokens(reference); const right = tokens(candidate);
  if (!left.length || !right.length) return 0;
  return right.filter((part) => left.some((item) => item === part || item.startsWith(part) || part.startsWith(item))).length / right.length;
};
const bestMatch = <T extends { full_name: string }>(reference: unknown, candidates: T[], except?: string) => {
  if (!normalize(reference)) return undefined;
  return candidates
    .filter((candidate) => candidate.full_name !== except)
    .map((candidate) => ({ candidate, score: similarity(reference, candidate.full_name) }))
    .sort((a, b) => b.score - a.score)[0];
};

async function authenticatedUserId(request: Request) {
  const header = request.headers?.authorization;
  const authorization = Array.isArray(header) ? header[0] : header;
  if (!authorization?.startsWith('Bearer ') || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return null;
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: process.env.SUPABASE_ANON_KEY },
  });
  return response.ok ? ((await response.json() as { id?: string }).id || null) : null;
}

function normalizeRow(row: ImportRow): Required<ImportRow> {
  return {
    line: Number(row.line) || 0, name: normalize(row.name), dni: String(row.dni || '').trim(),
    legajo: String(row.legajo || '').trim(), nomina: String(row.nomina || '').trim(),
    category: normalize(row.category), supervisor: normalize(row.supervisor), manager: normalize(row.manager),
    decision: String(row.decision || '').toLowerCase(),
  };
}

export default async function handler(request: Request, response: Response) {
  if (request.method !== 'POST') return response.status(405).json({ success: false, message: 'Método no permitido.' });
  const userId = await authenticatedUserId(request);
  if (!userId) return response.status(401).json({ success: false, message: 'Sesión no válida.' });

  const submitted = (request.body?.rows || []).map(normalizeRow);
  const rows = submitted.filter((row) => !['excluido', 'excluded'].includes(row.decision));
  if (!rows.length || rows.length > 1000 || rows.some((row) => !row.name || !row.category || ['revisar', 'review'].includes(row.decision))) {
    return response.status(400).json({ success: false, message: 'La estructura contiene filas sin aprobar o no es válida.' });
  }

  const database = await pool.connect();
  try {
    const profile = await database.query('select role from public.profiles where id=$1', [userId]);
    if (profile.rows[0]?.role !== 'admin') return response.status(403).json({ success: false, message: 'Sólo Administración puede aplicar la estructura.' });
    const existing = await database.query('select count(*)::int as total from public.staff_members');
    if ((existing.rows[0]?.total || 0) > 0) return response.status(409).json({ success: false, message: 'Ya existe una nómina. No se reemplaza automáticamente.' });

    await database.query('begin');
    const run = await database.query(
      `insert into public.hr_import_runs(source_name,status,received_rows,summary,created_by)
       values($1,'applied',$2,$3,$4) returning id`,
      ['ESTRUCTURA RRHH ACTIVA OK', submitted.length, JSON.stringify({ imported: rows.length, excluded: submitted.length - rows.length }), userId],
    );
    const runId = run.rows[0].id as string;
    const roleResult = await database.query<Role>(
      `select id,name,area_id,can_supervise_sales_team,creates_seller_record
       from public.hr_roles where active=true`,
    );
    const roles = roleResult.rows;
    const created: Created[] = [];

    for (const row of rows) {
      const roleMatch = roles.map((role) => ({ role, score: similarity(row.category, role.name) })).sort((a, b) => b.score - a.score)[0];
      if (!roleMatch || roleMatch.score < 0.7) throw new Error(`Cargo sin configurar: ${row.category}`);
      const inserted = await database.query<{ id: string; full_name: string }>(
        `insert into public.staff_members
          (full_name,dni,legajo,employment_type,active,area_id,role_id,is_coaching,is_freelance,source_label)
         values($1,$2,$3,$4,true,$5,$6,$7,$8,$9) returning id,full_name`,
        [row.name, row.dni || null, normalize(row.legajo) === 'COACHING' ? null : row.legajo || null,
          row.nomina || null, roleMatch.role.area_id, roleMatch.role.id,
          normalize(row.legajo) === 'COACHING', ['freelance', 'free lance'].includes(row.decision), 'ESTRUCTURA RRHH ACTIVA OK'],
      );
      created.push({ ...inserted.rows[0], role: roleMatch.role, row });
      await database.query(
        `insert into public.hr_import_rows
          (import_run_id,source_line,source_payload,normalized_payload,decision,approved,reviewed_by,reviewed_at)
         values($1,$2,$3,$3,$4,true,$5,now())`,
        [runId, row.line, JSON.stringify(row), row.decision === 'freelance' ? 'freelance' : 'ready', userId],
      );
    }

    const managerFor = (item: Created, visited = new Set<string>()): Created | undefined => {
      if (visited.has(item.id)) return undefined;
      visited.add(item.id);
      const supervisor = bestMatch(item.row.supervisor, created, item.full_name);
      if (supervisor?.score && supervisor.score >= 0.75) {
        return managerFor(supervisor.candidate, visited) || bestMatch(supervisor.candidate.row.manager, created)?.candidate;
      }
      const manager = bestMatch(item.row.manager, created, item.full_name);
      return manager?.score && manager.score >= 0.75 ? manager.candidate : undefined;
    };

    for (const item of created) {
      const supervisor = bestMatch(item.row.supervisor, created, item.full_name);
      const responsibleId = supervisor && supervisor.score >= 0.75 ? supervisor.candidate.id : null;
      const manager = managerFor(item);
      await database.query(
        `update public.staff_members
         set responsible_staff_id=$2,effective_manager_staff_id=$3,effective_manager_source=$4 where id=$1`,
        [item.id, responsibleId, manager?.id || null, manager ? 'inherited' : 'source'],
      );
    }

    const teamBySupervisor = new Map<string, string>();
    for (const supervisor of created.filter((item) => item.role.can_supervise_sales_team)) {
      const team = await database.query<{ id: string }>(
        `insert into public.teams(name,supervisor_staff_id,manager_staff_id,active,is_sales_team)
         select $1,$2,effective_manager_staff_id,true,true from public.staff_members where id=$2
         returning id`,
        [supervisor.full_name, supervisor.id],
      );
      teamBySupervisor.set(supervisor.id, team.rows[0].id);
    }

    for (const seller of created.filter((item) => item.role.creates_seller_record)) {
      const supervisor = bestMatch(seller.row.supervisor, created, seller.full_name);
      const teamId = supervisor && supervisor.score >= 0.75 ? teamBySupervisor.get(supervisor.candidate.id) || null : null;
      await database.query(
        `insert into public.sellers(full_name,team_id,active,hire_date,dni,staff_member_id,legajo,employment_type)
         values($1,$2,true,null,$3,$4,$5,$6)`,
        [seller.full_name, teamId, seller.row.dni || null, seller.id,
          normalize(seller.row.legajo) === 'COACHING' ? null : seller.row.legajo || null, seller.row.nomina || null],
      );
    }

    await database.query('commit');
    return response.status(200).json({ success: true, runId, created: created.length, teams: teamBySupervisor.size });
  } catch (error) {
    await database.query('rollback');
    return response.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No se pudo aplicar la estructura.' });
  } finally {
    database.release();
  }
}
