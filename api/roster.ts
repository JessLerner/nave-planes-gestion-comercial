import { Pool, type PoolClient } from 'pg';

type VercelRequest = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown };
type VercelResponse = { status: (code: number) => VercelResponse; json: (body: unknown) => VercelResponse };

const rawConnectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL || '';
const connectionString = rawConnectionString.replace(/([?&])sslmode=[^&]*/i, '$1').replace(/[?&]$/, '');
const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

const validRoles = new Set(['administrador_general', 'director', 'gerente', 'supervisor', 'vendedor', 'administracion', 'rrhh', 'mora', 'contable', 'otro']);
const text = (value: unknown, max = 180) => typeof value === 'string' && value.trim() && value.trim().length <= max ? value.trim() : null;
const optionalText = (value: unknown, max = 180) => value == null || value === '' ? null : text(value, max);
const date = (value: unknown) => { const result = optionalText(value, 10); return result && /^\d{4}-\d{2}-\d{2}$/.test(result) ? result : null; };
const normalize = (value: string | null) => value ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ').toLowerCase() : null;
const nameTokens = (value: string | null) => (normalize(value) || '').split(' ').filter(Boolean);
// The HR sheet often omits a middle name or flips apellido/nombre.  Treat it
// as the same resource only when every token of the shorter name is present
// in the longer one; ambiguous candidates stay unresolved instead of guessed.
const namesCompatible = (left: string, right: string) => {
  const a = nameTokens(left); const b = nameTokens(right);
  if (a.length < 2 || b.length < 2) return false;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return shorter.every(token => longer.includes(token));
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
    db.query(`select id, full_name, role, active, legajo, dni, employment_type, commercial_structure, location, hire_date, termination_date, source_label from public.staff_members order by active desc, full_name`),
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
      if (!sourceFileName || !resources?.length || resources.length > 1000) return res.status(400).json({ success: false, message: 'La importación no contiene recursos válidos.' });
      const [currentStaff, currentTeams] = await Promise.all([
        db.query(`select id, full_name from public.staff_members`),
        db.query(`select id, name from public.teams`),
      ]);
      const staffByName = new Map<string, string>();
      const staffCandidates = currentStaff.rows.map(row => ({ id: row.id as string, fullName: row.full_name as string }));
      currentStaff.rows.forEach(row => { const key = normalize(row.full_name); if (key) staffByName.set(key, row.id); });
      const teamByName = new Map<string, string>();
      currentTeams.rows.forEach(row => { const key = normalize(row.name); if (key) teamByName.set(key, row.id); });
      let createdStaff = 0; let createdSellers = 0; let unresolvedRows = 0;
      for (const row of resources) {
        const fullName = text(row.fullName); const roleCandidate = text(row.role, 40)?.toLowerCase() || 'vendedor';
        const role = validRoles.has(roleCandidate) ? roleCandidate : 'vendedor';
        if (!fullName) { unresolvedRows++; continue; }
        const key = normalize(fullName)!;
        const dni = optionalText(row.dni, 30)?.replace(/\D/g, '') || null;
        const legajo = optionalText(row.legajo, 80); const employmentType = optionalText(row.employmentType, 80);
        const commercialStructure = optionalText(row.commercialStructure, 180); const location = optionalText(row.location, 180);
        const hireDate = date(row.hireDate); const teamName = optionalText(row.teamName, 180); const teamId = teamName ? teamByName.get(normalize(teamName) || '') : null;
        let staffId: string | null = staffByName.get(key) ?? null;
        if (!staffId) {
          const compatible = staffCandidates.filter(candidate => namesCompatible(fullName, candidate.fullName));
          if (compatible.length === 1) staffId = compatible[0].id;
        }
        if (staffId) {
          await db.query(`update public.staff_members set active=true, role=$2::public.staff_role, dni=coalesce($3,dni), legajo=coalesce($4,legajo), employment_type=coalesce($5,employment_type), commercial_structure=coalesce($6,commercial_structure), location=coalesce($7,location), hire_date=coalesce($8::date,hire_date), termination_date=null, source_label='ESTRUCTURA RRHH ACTIVA OK', updated_at=now() where id=$1`, [staffId, role, dni, legajo, employmentType, commercialStructure, location, hireDate]);
        } else {
          const created = await db.query(`insert into public.staff_members (full_name, role, active, dni, legajo, employment_type, commercial_structure, location, hire_date, source_label) values ($1,$2::public.staff_role,true,$3,$4,$5,$6,$7,$8::date,'ESTRUCTURA RRHH ACTIVA OK') returning id`, [fullName, role, dni, legajo, employmentType, commercialStructure, location, hireDate]);
          staffId = created.rows[0].id as string; staffByName.set(key, staffId); staffCandidates.push({ id: staffId, fullName }); createdStaff++;
        }
        if (role === 'vendedor') {
          if (!teamId) { unresolvedRows++; continue; }
          const seller = await db.query(`select id from public.sellers where staff_member_id=$1 limit 1`, [staffId]);
          if (seller.rows[0]) await db.query(`update public.sellers set full_name=$2, team_id=$3, active=true, termination_date=null, hire_date=coalesce($4::date,hire_date), legajo=coalesce($5,legajo), employment_type=coalesce($6,employment_type) where id=$1`, [seller.rows[0].id, fullName, teamId, hireDate, legajo, employmentType]);
          else { await db.query(`insert into public.sellers (full_name, team_id, staff_member_id, active, hire_date, dni, legajo, employment_type) values ($1,$2,$3,true,$4::date,$5,$6,$7)`, [fullName, teamId, staffId, hireDate, dni, legajo, employmentType]); createdSellers++; }
        }
      }
      const run = await db.query(`insert into public.roster_import_runs (source_file_name, received_rows, created_staff, created_sellers, unresolved_rows, imported_by, summary) values ($1,$2,$3,$4,$5,$6,$7::jsonb) returning id`, [sourceFileName, resources.length, createdStaff, createdSellers, unresolvedRows, userId, JSON.stringify({ source: 'ESTRUCTURA RRHH ACTIVA OK' })]);
      await logChange(db, 'import', run.rows[0].id, 'imported', null, { sourceFileName, receivedRows: resources.length, createdStaff, createdSellers, unresolvedRows }, userId);
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
      if (!fullName || !validRoles.has(role) || (role === 'vendedor' && !teamId)) return res.status(400).json({ success: false, message: 'Nombre, cargo o equipo inválido.' });
      if (teamId) { const team = await db.query(`select id from public.teams where id = $1`, [teamId]); if (!team.rows[0]) return res.status(400).json({ success: false, message: 'El equipo seleccionado no existe.' }); }
      const previous = id ? await db.query(`select * from public.staff_members where id = $1`, [id]) : { rows: [] as unknown[] };
      let staffId = id;
      if (id) {
        await db.query(`update public.staff_members set full_name=$2, role=$3::public.staff_role, active=$4, dni=$5, legajo=$6, employment_type=$7, commercial_structure=$8, location=$9, hire_date=$10::date, termination_date=$11::date, source_label='Administración Nave.Plan', updated_at=now() where id=$1`, [id, fullName, role, active, dni, legajo, employmentType, commercialStructure, location, hireDate, terminationDate]);
      } else {
        const created = await db.query(`insert into public.staff_members (full_name, role, active, dni, legajo, employment_type, commercial_structure, location, hire_date, termination_date, source_label) values ($1,$2::public.staff_role,$3,$4,$5,$6,$7,$8,$9::date,$10::date,'Administración Nave.Plan') returning id`, [fullName, role, active, dni, legajo, employmentType, commercialStructure, location, hireDate, terminationDate]);
        staffId = created.rows[0].id;
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
      }
      await logChange(db, 'staff_member', staffId!, id ? (active ? 'updated' : 'deactivated') : 'created', previous.rows[0] || null, { fullName, role, active, teamId }, userId);
    } else if (action === 'save_team') {
      const teamId = optionalText(body?.teamId, 80); const managerId = optionalText(body?.managerStaffId, 80); const supervisorId = optionalText(body?.supervisorStaffId, 80);
      if (!teamId) return res.status(400).json({ success: false, message: 'Equipo inválido.' });
      const before = await db.query(`select * from public.teams where id = $1`, [teamId]);
      if (!before.rows[0]) return res.status(404).json({ success: false, message: 'Equipo no encontrado.' });
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
