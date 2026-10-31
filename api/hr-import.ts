import { databasePool } from './lib/database';

type ImportRow = {
  line?: number; name?: string; dni?: string; legajo?: string; nomina?: string;
  category?: string; supervisor?: string; manager?: string; decision?: string;
};
type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: { rows?: ImportRow[] } };
type Response = { status: (code: number) => Response; json: (body: unknown) => Response };
type Role = { id: string; name: string; area_id: string; can_supervise_sales_team: boolean; creates_seller_record: boolean; app_role_mapping?: string | null; source_label?: string | null };
type Created = { id: string; full_name: string; role: Role; row: Required<ImportRow> };

const rawConnectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL || '';
const pool = databasePool(rawConnectionString);

const normalize = (value: unknown) => String(value || '').toUpperCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const tokens = (value: unknown) => normalize(value).split(' ').filter((token) => token.length > 1 && !/^\d+$/.test(token));
const similarity = (reference: unknown, candidate: unknown) => {
  const left = tokens(reference); const right = tokens(candidate);
  if (!left.length || !right.length) return 0;
  const tokenScore = right.filter((part) => left.some((item) => item === part || item.startsWith(part) || part.startsWith(item) || editSimilarity(item, part) >= 0.82)).length / right.length;
  return Math.max(tokenScore, editSimilarity(normalize(reference), normalize(candidate)));
};
const editSimilarity = (left: string, right: string) => {
  if (!left || !right) return 0;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0]; previous[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const stored = previous[column];
      previous[column] = Math.min(previous[column] + 1, previous[column - 1] + 1, diagonal + (left[row - 1] === right[column - 1] ? 0 : 1));
      diagonal = stored;
    }
  }
  return 1 - previous[right.length] / Math.max(left.length, right.length);
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
  const approvedRows = submitted.filter((row) => !['excluido', 'excluded'].includes(row.decision));
  const identities = new Set<string>();
  const duplicates: Required<ImportRow>[] = [];
  const rows = approvedRows.filter((row) => {
    // DNI is mandatory and is the stable identity for import de-duplication.
    const key = `dni:${row.dni.replace(/\D/g, '')}`;
    if (identities.has(key)) { duplicates.push(row); return false; }
    identities.add(key); return true;
  });
  if (!rows.length || rows.length > 1000 || rows.some((row) => {
    const dni = row.dni.replace(/\D/g, '');
    const withoutLegajo = row.category.includes('COACHING') || ['freelance', 'free lance'].includes(row.decision);
    return !row.name || !row.category || dni.length < 7 || dni.length > 8 || (!row.legajo && !withoutLegajo) || ['revisar', 'review'].includes(row.decision);
  })) {
    return response.status(400).json({ success: false, message: 'La estructura contiene filas sin aprobar: DNI obligatorio (7 a 8 dígitos) y legajo obligatorio salvo Coaching o Freelance.' });
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
      ['ESTRUCTURA RRHH ACTIVA OK', submitted.length, JSON.stringify({ imported: rows.length, excluded: submitted.length - approvedRows.length, duplicate_source_rows: duplicates.length }), userId],
    );
    const runId = run.rows[0].id as string;
    const roleResult = await database.query<Role>(
      `select role.id,role.name,role.area_id,role.can_supervise_sales_team,role.creates_seller_record,
              role.app_role_mapping,label.source_label
       from public.hr_roles role
       left join public.hr_role_source_labels label on label.role_id=role.id
       where role.active=true`,
    );
    const roles = roleResult.rows;
    const knownProfiles = (await database.query<{ id: string; full_name: string; role: string }>('select id,full_name,role from public.profiles')).rows;
    const created: Created[] = [];

    for (const row of rows) {
      const linkedProfile = knownProfiles.map((profile) => ({ profile, score: similarity(row.name, profile.full_name) })).sort((a, b) => b.score - a.score)[0];
      const configuredRole = linkedProfile?.score && linkedProfile.score >= 0.9
        ? roles.find((role) => role.app_role_mapping === linkedProfile.profile.role)
        : undefined;
      const roleMatch = configuredRole
        ? { role: configuredRole, score: 1 }
        : roles.map((role) => ({ role, score: Math.max(similarity(row.category, role.name), similarity(row.category, role.source_label || '')) })).sort((a, b) => b.score - a.score)[0];
      if (!roleMatch || roleMatch.score < 0.7) throw new Error(`Cargo sin configurar: ${row.category}`);
      const inserted = await database.query<{ id: string; full_name: string }>(
        `insert into public.staff_members
          (full_name,dni,legajo,employment_type,active,area_id,role_id,is_coaching,is_freelance,source_label)
         values($1,$2,$3,$4,true,$5,$6,$7,$8,$9) returning id,full_name`,
        [row.name, row.dni.replace(/\D/g, ''), (row.category.includes('COACHING') || ['freelance', 'free lance'].includes(row.decision)) ? null : row.legajo,
          row.nomina || null, roleMatch.role.area_id, roleMatch.role.id,
          row.category.includes('COACHING'), ['freelance', 'free lance'].includes(row.decision), 'ESTRUCTURA RRHH ACTIVA OK'],
      );
      created.push({ ...inserted.rows[0], role: roleMatch.role, row });
      if (linkedProfile?.score && linkedProfile.score >= 0.9) {
        await database.query('update public.profiles set staff_member_id=$2 where id=$1', [linkedProfile.profile.id, inserted.rows[0].id]);
      }
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
        [item.id, responsibleId, manager?.id || null, 'inherited'],
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
        [seller.full_name, teamId, seller.row.dni.replace(/\D/g, ''), seller.id,
          (seller.row.category.includes('COACHING') || ['freelance', 'free lance'].includes(seller.row.decision)) ? null : seller.row.legajo, seller.row.nomina || null],
      );
    }

    await database.query('commit');
    return response.status(200).json({ success: true, runId, created: created.length, teams: teamBySupervisor.size, duplicateSourceRows: duplicates.length });
  } catch (error) {
    await database.query('rollback');
    return response.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No se pudo aplicar la estructura.' });
  } finally {
    database.release();
  }
}
