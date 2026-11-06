import { execSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';

const root = resolve(import.meta.dirname, '..');
const local = resolve(root, '.local-supabase');
const output = execSync(`npx --yes supabase@latest --workdir "${local}" status --output env`, { cwd: root, encoding: 'utf8', windowsHide: true });
const env = Object.fromEntries(output.split(/\r?\n/).flatMap(line => {
  const found = line.match(/^([A-Z0-9_]+)=(.*)$/); return found ? [[found[1], found[2].replace(/^"|"$/g, '')]] : [];
}));
for (const key of ['API_URL', 'DB_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY']) if (!env[key]) throw new Error(`Falta ${key} en Supabase local.`);
if (!env.API_URL.startsWith('http://127.0.0.1:54321') || !env.DB_URL.includes('127.0.0.1:54322')) throw new Error('El script admite únicamente Supabase local.');
await writeFile(resolve(root, '.dev.vars'), `SUPABASE_URL=${env.API_URL}\nSUPABASE_ANON_KEY=${env.ANON_KEY}\nSUPABASE_PUBLISHABLE_KEY=${env.ANON_KEY}\nDATABASE_URL=${env.DB_URL}\n`, { mode: 0o600 });

const db = new Client({ connectionString: env.DB_URL }); await db.connect();
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const stamp = `MANUAL_BLK04_${Date.now()}`; let dni = 30_000_000 + Math.floor(Math.random() * 30_000_000);
try {
  const roles = await db.query('select id,area_id,app_role_mapping,creates_seller_record from public.hr_roles where active');
  const get = predicate => roles.rows.find(predicate);
  const gerente = get(row => row.app_role_mapping === 'gerente'); const supervisor = get(row => row.app_role_mapping === 'supervisor'); const seller = get(row => row.creates_seller_record); const rrhh = get(row => row.app_role_mapping === 'rrhh');
  if (!gerente || !supervisor || !seller || !rrhh) throw new Error('Faltan cargos necesarios en la base local.');
  const staff = async (name, role, parent = null) => { dni += 1; const fullName = name; const r = await db.query(`insert into public.staff_members(full_name,dni,legajo,employment_type,active,area_id,role_id,responsible_staff_id) values($1,$2,$3,'PLANTA',true,$4,$5,$6) returning id`, [fullName, String(dni), `${stamp}_${name}`, role.area_id, role.id, parent]); return r.rows[0].id; };
  const gerenciaA = await staff('GERENCIA A - PRUEBA', gerente); const gerenciaB = await staff('GERENCIA B - PRUEBA', gerente);
  const supervisorA1 = await staff('SUPERVISOR A1 - ORIGEN', supervisor, gerenciaA); const supervisorA2 = await staff('SUPERVISOR A2 - DESTINO', supervisor, gerenciaA); const supervisorB = await staff('SUPERVISOR B1 - FUERA DE ALCANCE', supervisor, gerenciaB);
  const vendedor = await staff('VENDEDOR PRUEBA - TRASLADAR', seller, supervisorA1); const rrhhStaff = await staff('RRHH PRUEBA LOCAL', rrhh);
  const createUser = async (email, password, name, role, member) => { let created = await admin.auth.admin.createUser({ email, password, email_confirm: true }); if (created.error?.code === 'email_exists') { const listed = await admin.auth.admin.listUsers({ perPage: 1000 }); const existing = listed.data.users.find(user => user.email === email); if (!existing) throw created.error; created = { data: { user: existing }, error: null }; } if (created.error || !created.data.user) throw created.error || new Error('No se pudo crear el usuario local.'); await db.query(`insert into public.profiles(id,full_name,role,staff_member_id) values($1,$2,$3::public.app_role,$4) on conflict(id) do update set full_name=excluded.full_name,role=excluded.role,staff_member_id=excluded.staff_member_id`, [created.data.user.id, name, role, member]); };
  await createUser('rrhh.manual@naveplan.local', 'NavePlan!Local2026', 'RRHH Prueba Local', 'rrhh', rrhhStaff);
  await createUser('gerencia.a.manual@naveplan.local', 'NavePlan!Local2026', 'Gerencia A Prueba Local', 'gerente', gerenciaA);
  await createUser('supervisor.a1.manual@naveplan.local', 'NavePlan!Local2026', 'Supervisor A1 Prueba Local', 'supervisor', supervisorA1);
  console.log(JSON.stringify({ stamp, supervisor: 'supervisor.a1.manual@naveplan.local', gerencia: 'gerencia.a.manual@naveplan.local', rrhh: 'rrhh.manual@naveplan.local', password: 'NavePlan!Local2026', vendedor: `VENDEDOR PRUEBA - TRASLADAR ${stamp}`, origen: `SUPERVISOR A1 - ORIGEN ${stamp}`, destino: `SUPERVISOR A2 - DESTINO ${stamp}`, fueraDeAlcance: `SUPERVISOR B1 - FUERA DE ALCANCE ${stamp}` }));
} finally { await db.end(); }
