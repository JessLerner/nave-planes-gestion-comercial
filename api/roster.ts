import { Pool, type PoolClient } from 'pg';

type VercelRequest = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown };
type VercelResponse = { status: (code: number) => VercelResponse; json: (body: unknown) => VercelResponse };

const rawConnectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL || '';
const connectionString = rawConnectionString.replace(/([?&])sslmode=[^&]*/i, '$1').replace(/[?&]$/, '');
const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

const validRoles = new Set(['administrador_general', 'director', 'gerente', 'supervisor', 'vendedor', 'administracion', 'rrhh', 'mora', 'contable', 'otro']);
const directLeaderRoles = new Set(['supervisor', 'administracion', 'rrhh', 'mora', 'contable', 'director']);
const seniorLeaderRoles = new Set(['gerente', 'director']);
const administrationManagerName = 'gonzalez matias hernan';
const formalManagerNames = new Set([
  'soldano leonardo vicente',
  'gonzalez fabricio ignacio',
  'gonzalez fabrizio ignacio',
  'rodriguez florencia cecilia',
]);
const text = (value: unknown, max = 180) => typeof value === 'string' && value.trim() && value.trim().length <= max ? value.trim() : null;
const optionalText = (value: unknown, max = 180) => value == null || value === '' ? null : text(value, max);
const date = (value: unknown) => {
  const result = optionalText(value, 10);
  if (!result) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(result)) return result;
  const match = result.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!match) return null;
  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText); const month = Number(monthText); const year = Number(yearText);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
    ? `${yearText}-${monthText.padStart(2, '0')}-${dayText.padStart(2, '0')}`
    : null;
};
const normalize = (value: string | null) => value ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ').toLowerCase() : null;
const normalizeReferenceName = (value: string | null) => normalize(value?.replace(/\s+(?:np|pda|lum|lms|nvp-?o|pvn|coa|leg)\b.*$/i, '').replace(/\s+\d{7,11}\s*$/, '') || null);
const nameTokens = (value: string | null) => (normalize(value) || '').split(' ').filter(Boolean);
const editDistance = (left: string, right: string) => {
  if (left === right) return 0;
  if (Math.abs(left.length - right.length) > 1) return 2;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row++) {
    const current = [row];
    for (let column = 1; column <= right.length; column++) current[column] = Math.min(current[column - 1] + 1, previous[column] + 1, previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1));
    previous = current;
  }
  return previous[right.length];
};
// The HR sheet often omits a middle name or flips apellido/nombre.  Treat it
// as the same resource only when every token of the shorter name is present
// in the longer one. A one-letter typo is allowed only in a long token (for
// example Fabricio/Fabrizio); ambiguous candidates stay unresolved instead of guessed.
const namesCompatible = (left: string, right: string) => {
  const a = nameTokens(left); const b = nameTokens(right);
  if (a.length < 2 || b.length < 2) return false;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return shorter.every(token => longer.some(candidate => candidate === token || (token.length >= 6 && candidate.length >= 6 && editDistance(token, candidate) <= 1)));
};

async function userIdFromRequest(req: VercelRequest) {
  const header = req.headers?.authorization;
  const authorization = Array.isArray(header) ? header[0] : header;
  if (!authorization?.startsWith('Bearer ')) return null;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return null;
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: authorization, apikey: process.env.SUPABASE_ANON_KEY } });
  if (!response.ok) return null;
  return ((await response.json()) as { id?: string }).id || null;
}

async function assertAdmin(db: PoolClient, userId: string) {
  const result = await db.query(`select role from public.profiles where id = $1 limit 1`, [userId]);
  return result.rows[0]?.role === 'admin';
}

async function logChange(db: PoolClient, entityType: string, entityId: string | null, action: string, before: unknown, after: unknown, userId: string) {
  await db.query(`insert into public.roster_change_log (entity_type, entity_id, action, before_value, after_value, changed_by) values ($1, $2, $3, $4::jsonb, $5::jsonb, $6)`, [entityType, entityId, action, JSON.stringify(before ?? null), JSON.stringify(after ?? null), userId]);
}

async function roster(db: PoolClient) {
  const [teams, staff, sellers] = await Promise.all([
    db.query(`select t.id, t.name, t.branch, t.commercial_structure, t.manager_staff_id, t.supervisor_staff_id, manager.full_name as manager_name, supervisor.full_name as supervisor_name from public.teams t left join public.staff_members manager on manager.id = t.manager_staff_id left join public.staff_members supervisor on supervisor.id = t.supervisor_staff_id order by t.name`),
    db.query(`select staff.id, staff.full_name, staff.role, staff.active, staff.legajo, staff.dni, staff.employment_type, staff.commercial_structure, staff.location, staff.hire_date, staff.termination_date, staff.source_label, staff.supervisor_staff_id, staff.manager_staff_id, supervisor.full_name as supervisor_name, manager.full_name as manager_name from public.staff_members staff left join public.staff_members supervisor on supervisor.id=staff.supervisor_staff_id left join public.staff_members manager on manager.id=staff.manager_staff_id order by staff.active desc, staff.full_name`),
    db.query(`select id, full_name, team_id, staff_member_id, active, hire_date, termination_date, legajo, employment_type, individual_target from public.sellers order by active desc, full_name`),
  ]);
  return { teams: teams.rows, staff: staff.rows, sellers: sellers.rows };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!rawConnectionString) return res.status(503).json({ success: false, message: 'La base operativa no está configurada.' });
  const userId = await userIdFromRequest(req);
  if (!userId) return res.status(401).json({ success: false, message: 'Sesión no válida o vencida.' });
  const db = await pool.connect();
  try {
    if (!await assertAdmin(db, userId)) return res.status(403).json({ success: false, message: 'Sólo Administración puede modificar la estructura.' });
    if (req.method === 'GET') return res.status(200).json({ success: true, data: await roster(db) });
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Método no permitido.' });
    const body = req.body as Record<string, unknown> | undefined;
    const action = text(body?.action, 40);
    if (!action) return res.status(400).json({ success: false, message: 'Acción inválida.' });
    await db.query('begin');
    if (action === 'import_roster') {
      const sourceFileName = text(body?.sourceFileName, 240);
      const resources = Array.isArray(body?.resources) ? body?.resources as Array<Record<string, unknown>> : null;
      const replaceActiveRoster = body?.replaceActiveRoster === true;
      if (!sourceFileName || !resources?.length || resources.length > 1000) return res.status(400).json({ success: false, message: 'La importación no contiene recursos válidos.' });
      const [currentStaff, currentTeams] = await Promise.all([
        db.query(`select id, full_name, dni from public.staff_members`),
        db.query(`select id, name from public.teams`),
      ]);
      const staffByName = new Map<string, string>();
      const staffByDni = new Map<string, string>();
      const staffCandidates = currentStaff.rows.map(row => ({ id: row.id as string, fullName: row.full_name as string }));
      currentStaff.rows.forEach(row => { const key = normalize(row.full_name); if (key) staffByName.set(key, row.id); if (row.dni) staffByDni.set(String(row.dni).replace(/\D/g, ''), row.id); });
      const teamByName = new Map<string, string>();
      currentTeams.rows.forEach(row => { const key = normalize(row.name); if (key) teamByName.set(key, row.id); });
      const beforeSnapshot = replaceActiveRoster ? await roster(db) : null;
      let createdStaff = 0; let createdSellers = 0; let unresolvedRows = 0;
      const imported = new Map<string, { staffId: string; fullName: string; role: string; supervisorName: string | null; managerName: string | null; hireDate: string | null; dni: string | null; legajo: string | null; employmentType: string | null; commercialStructure: string | null; location: string | null }>();
      for (const row of resources) {
        const fullName = text(row.fullName); const roleCandidate = text(row.role, 40)?.toLowerCase() || 'vendedor';
        const normalizedFullName = normalize(fullName);
        const normalizedManagerName = normalizeReferenceName(text(row.managerName));
        // These rules are enforced server-side as well as in the importer so
        // a stale browser bundle cannot create an incorrect organizational role.
        const role = normalizedFullName === 'lerner jesica'
          ? 'administrador_general'
          : normalizedFullName === administrationManagerName
            ? 'director'
            : normalizedFullName && formalManagerNames.has(normalizedFullName)
              ? 'gerente'
              : normalizedManagerName === administrationManagerName
                ? 'administracion'
                : validRoles.has(roleCandidate) ? roleCandidate : 'vendedor';
        if (!fullName) { unresolvedRows++; continue; }
        const key = normalize(fullName)!;
        const dni = optionalText(row.dni, 30)?.replace(/\D/g, '') || null;
        const legajo = optionalText(row.legajo, 80); const employmentType = optionalText(row.employmentType, 80);
        const commercialStructure = optionalText(row.commercialStructure, 180); const location = optionalText(row.location, 180);
        const hireDate = date(row.hireDate); const teamName = optionalText(row.teamName, 180); const teamId = teamName ? teamByName.get(normalize(teamName) || '') : null;
        let staffId: string | null = (dni ? staffByDni.get(dni) : null) ?? staffByName.get(key) ?? null;
        if (!staffId) {
          const compatible = staffCandidates.filter(candidate => namesCompatible(fullName, candidate.fullName));
          if (compatible.length === 1) staffId = compatible[0].id;
        }
        if (staffId) {
          await db.query(`update public.staff_members set active=true, role=$2::public.staff_role, dni=coalesce($3,dni), legajo=coalesce($4,legajo), employment_type=coalesce($5,employment_type), commercial_structure=coalesce($6,commercial_structure), location=coalesce($7,location), hire_date=coalesce($8::date,hire_date), termination_date=null, source_label='ESTRUCTURA RRHH ACTIVA OK', updated_at=now() where id=$1`, [staffId, role, dni, legajo, employmentType, commercialStructure, location, hireDate]);
        } else {
          const created = await db.query(`insert into public.staff_members (full_name, role, active, dni, legajo, employment_type, commercial_structure, location, hire_date, source_label) values ($1,$2::public.staff_role,true,$3,$4,$5,$6,$7,$8::date,'ESTRUCTURA RRHH ACTIVA OK') returning id`, [fullName, role, dni, legajo, employmentType, commercialStructure, location, hireDate]);
          staffId = created.rows[0].id as string; staffByName.set(key, staffId); if (dni) staffByDni.set(dni, staffId); staffCandidates.push({ id: staffId, fullName }); createdStaff++;
        }
        imported.set(staffId, { staffId, fullName, role, supervisorName: normalizeReferenceName(optionalText(row.supervisorName)), managerName: normalizedManagerName, hireDate, dni, legajo, employmentType, commercialStructure, location });
      }
      // Resolve reporting lines only after every employee exists.  The source
      // sheet writes the leader's name together with an internal code, so the
      // browser sends the clean name and we match it conservatively here.
      const findStaff = (fullName: string | null) => {
        if (!fullName) return null;
        const exact = staffByName.get(normalize(fullName) || '');
        if (exact) return exact;
        const matches = staffCandidates.filter(candidate => namesCompatible(fullName, candidate.fullName));
        return matches.length === 1 ? matches[0].id : null;
      };
      const teamBySupervisor = new Map<string, string>();
      for (const row of imported.values()) {
        const sourceSupervisorId = findStaff(row.supervisorName);
        const sourceManagerId = findStaff(row.managerName);
        if ((row.supervisorName && !sourceSupervisorId) || (row.managerName && !sourceManagerId)) unresolvedRows++;
        // Dirección is sometimes repeated in both source columns. Keep it as
        // one direct responsibility, never as two identical relationships.
        const isTopLevel = row.role === 'administrador_general' || row.role === 'director';
        const supervisorId = isTopLevel ? null : sourceSupervisorId;
        const managerId = isTopLevel || sourceSupervisorId === sourceManagerId ? null : sourceManagerId;
        await db.query(`update public.staff_members set supervisor_staff_id=$2::uuid, manager_staff_id=$3::uuid, updated_at=now() where id=$1`, [row.staffId, supervisorId, managerId]);
        if (row.role !== 'vendedor') continue;
        let resolvedTeamId: string | null = null;
        if (supervisorId) {
          resolvedTeamId = teamBySupervisor.get(supervisorId) || null;
          if (!resolvedTeamId) {
            const existing = await db.query(`select id from public.teams where supervisor_staff_id=$1 limit 1`, [supervisorId]);
            if (existing.rows[0]) resolvedTeamId = existing.rows[0].id as string;
            else {
              const supervisor = staffCandidates.find(candidate => candidate.id === supervisorId);
              const createdTeam = await db.query(`insert into public.teams (name, supervisor_staff_id, manager_staff_id, commercial_structure) values ($1,$2::uuid,$3::uuid,$4) returning id`, [supervisor?.fullName || row.supervisorName || 'Equipo sin nombre', supervisorId, managerId, row.commercialStructure]);
              resolvedTeamId = createdTeam.rows[0].id as string;
            }
            teamBySupervisor.set(supervisorId, resolvedTeamId);
          }
          await db.query(`update public.teams set manager_staff_id=$2::uuid, supervisor_staff_id=$3::uuid where id=$1`, [resolvedTeamId, managerId, supervisorId]);
        }
        if (!resolvedTeamId) { unresolvedRows++; continue; }
        const seller = await db.query(`select id from public.sellers where staff_member_id=$1 limit 1`, [row.staffId]);
        if (seller.rows[0]) await db.query(`update public.sellers set full_name=$2, team_id=$3, active=true, termination_date=null, hire_date=coalesce($4::date,hire_date), legajo=coalesce($5,legajo), employment_type=coalesce($6,employment_type) where id=$1`, [seller.rows[0].id, row.fullName, resolvedTeamId, row.hireDate, row.legajo, row.employmentType]);
        else { await db.query(`insert into public.sellers (full_name, team_id, staff_member_id, active, hire_date, dni, legajo, employment_type) values ($1,$2,$3,true,$4::date,$5,$6,$7)`, [row.fullName, resolvedTeamId, row.staffId, row.hireDate, row.dni, row.legajo, row.employmentType]); createdSellers++; }
      }
      let deactivatedStaff = 0;
      let deactivatedSellers = 0;
      if (replaceActiveRoster) {
        const importedIds = [...imported.keys()];
        const staleStaff = await db.query(`select id from public.staff_members where active=true and not (id = any($1::uuid[]))`, [importedIds]);
        const staleIds = staleStaff.rows.map(row => row.id as string);
        if (staleIds.length) {
          const staleSellers = await db.query(`select id from public.sellers where active=true and staff_member_id = any($1::uuid[])`, [staleIds]);
          deactivatedStaff = staleIds.length;
          deactivatedSellers = staleSellers.rows.length;
          await db.query(`update public.staff_members set active=false, termination_date=coalesce(termination_date,current_date), supervisor_staff_id=null, manager_staff_id=null, updated_at=now() where id=any($1::uuid[])`, [staleIds]);
          await db.query(`update public.sellers set active=false, termination_date=coalesce(termination_date,current_date) where staff_member_id=any($1::uuid[]) and active=true`, [staleIds]);
          await db.query(`update public.teams set manager_staff_id=null where manager_staff_id=any($1::uuid[])`, [staleIds]);
          await db.query(`update public.teams set supervisor_staff_id=null where supervisor_staff_id=any($1::uuid[])`, [staleIds]);
          await db.query(`update public.staff_members set supervisor_staff_id=null where supervisor_staff_id=any($1::uuid[])`, [staleIds]);
          await db.query(`update public.staff_members set manager_staff_id=null where manager_staff_id=any($1::uuid[])`, [staleIds]);
        }
      }
      const summary = { source: 'ESTRUCTURA RRHH ACTIVA OK', replaceActiveRoster, deactivatedStaff, deactivatedSellers };
      const run = await db.query(`insert into public.roster_import_runs (source_file_name, received_rows, created_staff, created_sellers, unresolved_rows, imported_by, summary) values ($1,$2,$3,$4,$5,$6,$7::jsonb) returning id`, [sourceFileName, resources.length, createdStaff, createdSellers, unresolvedRows, userId, JSON.stringify(summary)]);
      await logChange(db, 'import', run.rows[0].id, 'imported', beforeSnapshot, { sourceFileName, receivedRows: resources.length, createdStaff, createdSellers, unresolvedRows, ...summary }, userId);
    } else if (action === 'save_resource') {
      const resource = (body?.resource || {}) as Record<string, unknown>;
      const id = optionalText(resource.id, 80);
      const fullName = text(resource.fullName);
      const role = text(resource.role, 40) || 'vendedor';
      const active = resource.active !== false;
      const dni = optionalText(resource.dni, 30)?.replace(/\D/g, '') || null;
      const legajo = optionalText(resource.legajo, 80);
      const employmentType = optionalText(resource.employmentType, 80);
      const commercialStructure = optionalText(resource.commercialStructure, 180);
      const location = optionalText(resource.location, 180);
      const hireDate = date(resource.hireDate);
      const terminationDate = active ? null : date(resource.terminationDate) || new Date().toISOString().slice(0, 10);
      const teamId = optionalText(resource.teamId, 80);
      const supervisorId = optionalText(resource.supervisorId, 80);
      const managerId = optionalText(resource.managerId, 80);
      if (!fullName || !validRoles.has(role) || (role === 'vendedor' && !teamId)) return res.status(400).json({ success: false, message: 'Nombre, cargo o equipo inválido.' });
      if (id && (id === supervisorId || id === managerId)) return res.status(400).json({ success: false, message: 'La persona no puede depender de sí misma.' });
      const reportingIds = [supervisorId, managerId].filter((value): value is string => Boolean(value));
      if (reportingIds.length) {
        const reporting = await db.query(`select id, role, active from public.staff_members where id = any($1::uuid[])`, [reportingIds]);
        if (reporting.rows.length !== reportingIds.length || reporting.rows.some(row => !row.active) || reporting.rows.some(row => row.id === supervisorId && !directLeaderRoles.has(row.role)) || reporting.rows.some(row => row.id === managerId && !seniorLeaderRoles.has(row.role))) return res.status(400).json({ success: false, message: 'El responsable directo o la Gerencia/Dirección seleccionados no están activos o no tienen esa función.' });
      }
      if (teamId) { const team = await db.query(`select id from public.teams where id = $1`, [teamId]); if (!team.rows[0]) return res.status(400).json({ success: false, message: 'El equipo seleccionado no existe.' }); }
      const previous = id ? await db.query(`select * from public.staff_members where id = $1`, [id]) : { rows: [] as unknown[] };
      let staffId = id;
      if (id) {
        await db.query(`update public.staff_members set full_name=$2, role=$3::public.staff_role, active=$4, dni=$5, legajo=$6, employment_type=$7, commercial_structure=$8, location=$9, hire_date=$10::date, termination_date=$11::date, supervisor_staff_id=$12::uuid, manager_staff_id=$13::uuid, source_label='Administración Nave.Plan', updated_at=now() where id=$1`, [id, fullName, role, active, dni, legajo, employmentType, commercialStructure, location, hireDate, terminationDate, supervisorId, managerId]);
      } else {
        const created = await db.query(`insert into public.staff_members (full_name, role, active, dni, legajo, employment_type, commercial_structure, location, hire_date, termination_date, supervisor_staff_id, manager_staff_id, source_label) values ($1,$2::public.staff_role,$3,$4,$5,$6,$7,$8,$9::date,$10::date,$11::uuid,$12::uuid,'Administración Nave.Plan') returning id`, [fullName, role, active, dni, legajo, employmentType, commercialStructure, location, hireDate, terminationDate, supervisorId, managerId]);
        staffId = created.rows[0].id;
      }
      // The resource record is the source of truth for the organizational
      // chart. A manager/supervisor assignment made from a ficha is reflected
      // immediately in teams; changing away from a leadership function clears
      // stale reporting links without deleting any historical information.
      if (role === 'gerente' || role === 'supervisor') {
        const leadershipColumn = role === 'gerente' ? 'manager_staff_id' : 'supervisor_staff_id';
        const oppositeColumn = role === 'gerente' ? 'supervisor_staff_id' : 'manager_staff_id';
        await db.query(`update public.teams set ${oppositeColumn}=null where ${oppositeColumn}=$1`, [staffId]);
        if (teamId) await db.query(`update public.teams set ${leadershipColumn}=$2 where id=$1`, [teamId, staffId]);
      } else {
        await db.query(`update public.teams set manager_staff_id=null where manager_staff_id=$1`, [staffId]);
        await db.query(`update public.teams set supervisor_staff_id=null where supervisor_staff_id=$1`, [staffId]);
        await db.query(`update public.staff_members set supervisor_staff_id=null, manager_staff_id=null where supervisor_staff_id=$1 or manager_staff_id=$1`, [staffId]);
      }
      if (role === 'vendedor') {
        const existingSeller = await db.query(`select * from public.sellers where staff_member_id = $1 limit 1`, [staffId]);
        if (existingSeller.rows[0]) {
          await db.query(`update public.sellers set full_name=$2, team_id=$3, active=$4, hire_date=$5::date, termination_date=$6::date, legajo=$7, employment_type=$8 where id=$1`, [existingSeller.rows[0].id, fullName, teamId, active, hireDate, terminationDate, legajo, employmentType]);
          await logChange(db, 'seller', existingSeller.rows[0].id, active ? 'updated' : 'deactivated', existingSeller.rows[0], { fullName, teamId, active }, userId);
        } else if (teamId) {
          const seller = await db.query(`insert into public.sellers (full_name, team_id, staff_member_id, active, hire_date, termination_date, dni, legajo, employment_type) values ($1,$2,$3,$4,$5::date,$6::date,$7,$8,$9) returning id`, [fullName, teamId, staffId, active, hireDate, terminationDate, dni, legajo, employmentType]);
          await logChange(db, 'seller', seller.rows[0].id, 'created', null, { fullName, teamId, active }, userId);
        }
      } else if (staffId) {
        await db.query(`update public.sellers set active=false, termination_date=coalesce(termination_date, current_date) where staff_member_id=$1 and active=true`, [staffId]);
      }
      await logChange(db, 'staff_member', staffId!, id ? (active ? 'updated' : 'deactivated') : 'created', previous.rows[0] || null, { fullName, role, active, teamId }, userId);
    } else if (action === 'bulk_assign_team') {
      const teamId = optionalText(body?.teamId, 80);
      const staffIds = Array.isArray(body?.staffIds) ? [...new Set((body?.staffIds as unknown[]).map(value => optionalText(value, 80)).filter((id): id is string => Boolean(id)))] : [];
      if (!teamId || !staffIds.length || staffIds.length > 300) return res.status(400).json({ success: false, message: 'Seleccioná un equipo y entre uno y 300 vendedores.' });
      const team = await db.query(`select id, name from public.teams where id=$1`, [teamId]);
      if (!team.rows[0]) return res.status(404).json({ success: false, message: 'El equipo seleccionado no existe.' });
      const sellers = await db.query(`select id, staff_member_id, team_id from public.sellers where staff_member_id = any($1::uuid[]) and active=true`, [staffIds]);
      if (sellers.rows.length !== staffIds.length) return res.status(400).json({ success: false, message: 'Sólo se pueden reasignar recursos activos que tengan función de vendedor.' });
      await db.query(`update public.sellers set team_id=$2 where staff_member_id = any($1::uuid[])`, [staffIds, teamId]);
      await logChange(db, 'seller_batch', null, 'reassigned_team', sellers.rows, { staffIds, teamId, teamName: team.rows[0].name }, userId);
      await db.query('commit');
      return res.status(200).json({ success: true, moved: sellers.rows.length, data: await roster(db) });
    } else if (action === 'bulk_reporting_lines') {
      const staffIds = Array.isArray(body?.staffIds) ? [...new Set((body?.staffIds as unknown[]).map(value => optionalText(value, 80)).filter((id): id is string => Boolean(id)))] : [];
      const supervisorId = optionalText(body?.supervisorId, 80); const managerId = optionalText(body?.managerId, 80);
      if (!staffIds.length || staffIds.length > 300 || (!supervisorId && !managerId)) return res.status(400).json({ success: false, message: 'Seleccioná recursos y al menos un responsable.' });
      const selected = await db.query(`select id from public.staff_members where id=any($1::uuid[]) and active=true`, [staffIds]);
      if (selected.rows.length !== staffIds.length || staffIds.includes(supervisorId || '') || staffIds.includes(managerId || '')) return res.status(400).json({ success: false, message: 'La selección contiene recursos inválidos o un responsable asignado a sí mismo.' });
      const leaders = await db.query(`select id, role, active from public.staff_members where id=any($1::uuid[])`, [[supervisorId, managerId].filter(Boolean)]);
      if (leaders.rows.some(row => !row.active) || (supervisorId && !leaders.rows.some(row => row.id === supervisorId && directLeaderRoles.has(row.role))) || (managerId && !leaders.rows.some(row => row.id === managerId && seniorLeaderRoles.has(row.role)))) return res.status(400).json({ success: false, message: 'El responsable directo o la Gerencia/Dirección seleccionados no son válidos.' });
      if (supervisorId) await db.query(`update public.staff_members set supervisor_staff_id=$2::uuid, updated_at=now() where id=any($1::uuid[])`, [staffIds, supervisorId]);
      if (managerId) await db.query(`update public.staff_members set manager_staff_id=$2::uuid, updated_at=now() where id=any($1::uuid[])`, [staffIds, managerId]);
      await logChange(db, 'staff_member_batch', null, 'updated', null, { staffIds, supervisorId, managerId }, userId);
    } else if (action === 'deactivate_resources') {
      const staffIds = Array.isArray(body?.staffIds) ? [...new Set((body?.staffIds as unknown[]).map(value => optionalText(value, 80)).filter((id): id is string => Boolean(id)))] : [];
      if (!staffIds.length || staffIds.length > 300) return res.status(400).json({ success: false, message: 'Seleccioná entre uno y 300 recursos para dar de baja.' });
      const current = await db.query(`select id, full_name, role, active from public.staff_members where id = any($1::uuid[])`, [staffIds]);
      if (current.rows.length !== staffIds.length) return res.status(404).json({ success: false, message: 'Uno o más recursos ya no existen.' });
      const activeIds = current.rows.filter(row => row.active).map(row => row.id as string);
      if (activeIds.length) {
        await db.query(`update public.staff_members set active=false, termination_date=coalesce(termination_date, current_date), updated_at=now() where id = any($1::uuid[])`, [activeIds]);
        await db.query(`update public.sellers set active=false, termination_date=coalesce(termination_date, current_date) where staff_member_id = any($1::uuid[]) and active=true`, [activeIds]);
        await db.query(`update public.teams set manager_staff_id=null where manager_staff_id = any($1::uuid[])`, [activeIds]);
        await db.query(`update public.teams set supervisor_staff_id=null where supervisor_staff_id = any($1::uuid[])`, [activeIds]);
        await db.query(`update public.staff_members set supervisor_staff_id=null where supervisor_staff_id = any($1::uuid[])`, [activeIds]);
        await db.query(`update public.staff_members set manager_staff_id=null where manager_staff_id = any($1::uuid[])`, [activeIds]);
        await logChange(db, 'staff_member_batch', null, 'deactivated', current.rows, { staffIds: activeIds }, userId);
      }
      await db.query('commit');
      return res.status(200).json({ success: true, deactivated: activeIds.length, data: await roster(db) });
    } else if (action === 'save_team') {
      const teamId = optionalText(body?.teamId, 80); const managerId = optionalText(body?.managerStaffId, 80); const supervisorId = optionalText(body?.supervisorStaffId, 80);
      if (!teamId) return res.status(400).json({ success: false, message: 'Equipo inválido.' });
      if (managerId && supervisorId && managerId === supervisorId) return res.status(400).json({ success: false, message: 'Una misma persona no puede ocupar Gerencia y Supervisión del mismo equipo.' });
      const before = await db.query(`select * from public.teams where id = $1`, [teamId]);
      if (!before.rows[0]) return res.status(404).json({ success: false, message: 'Equipo no encontrado.' });
      const selectedIds = [managerId, supervisorId].filter((id): id is string => Boolean(id));
      if (selectedIds.length) {
        const selected = await db.query(`select id, role, active from public.staff_members where id = any($1::uuid[])`, [selectedIds]);
        if (selected.rows.length !== selectedIds.length || selected.rows.some(row => !row.active)) return res.status(400).json({ success: false, message: 'El responsable seleccionado no existe o está dado de baja.' });
        // The initial HR import predated organizational roles.  Preserve
        // specialized roles, but promote legacy seller/other rows when they
        // are formally appointed to lead a team.
        if (managerId) await db.query(`update public.staff_members set role='gerente'::public.staff_role, updated_at=now() where id=$1 and role in ('vendedor'::public.staff_role, 'otro'::public.staff_role)`, [managerId]);
        if (supervisorId) await db.query(`update public.staff_members set role='supervisor'::public.staff_role, updated_at=now() where id=$1 and role in ('vendedor'::public.staff_role, 'otro'::public.staff_role)`, [supervisorId]);
      }
      await db.query(`update public.teams set manager_staff_id=$2::uuid, supervisor_staff_id=$3::uuid where id=$1`, [teamId, managerId, supervisorId]);
      await logChange(db, 'team', teamId, 'updated', before.rows[0], { managerStaffId: managerId, supervisorStaffId: supervisorId }, userId);
    } else return res.status(400).json({ success: false, message: 'Acción no reconocida.' });
    await db.query('commit');
    return res.status(200).json({ success: true, data: await roster(db) });
  } catch (error) {
    await db.query('rollback');
    console.error('Roster management failed', error);
    return res.status(500).json({ success: false, message: 'No se pudieron guardar los cambios de estructura.' });
  } finally { db.release(); }
}
