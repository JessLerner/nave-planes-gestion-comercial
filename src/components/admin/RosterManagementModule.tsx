import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { FileUp, LoaderCircle, Pencil, Plus, UsersRound } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../auth/AuthProvider';

type Team = { id: string; name: string; manager_staff_id: string | null; supervisor_staff_id: string | null; manager_name?: string; supervisor_name?: string };
type Staff = { id: string; full_name: string; role: string; active: boolean; legajo?: string | null; dni?: string | null; employment_type?: string | null; commercial_structure?: string | null; location?: string | null; hire_date?: string | null; termination_date?: string | null };
type Seller = { id: string; staff_member_id?: string | null; team_id: string; active: boolean };
type Roster = { teams: Team[]; staff: Staff[]; sellers: Seller[] };
type Form = { id?: string; fullName: string; role: string; active: boolean; teamId: string; dni: string; legajo: string; employmentType: string; commercialStructure: string; location: string; hireDate: string; terminationDate: string };

const emptyForm = (): Form => ({ fullName: '', role: 'vendedor', active: true, teamId: '', dni: '', legajo: '', employmentType: '', commercialStructure: '', location: '', hireDate: '', terminationDate: '' });
const normalizeHeader = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const read = (row: Record<string, unknown>, candidates: string[]) => { const key = Object.keys(row).find(header => candidates.some(candidate => normalizeHeader(header) === candidate || normalizeHeader(header).includes(candidate))); const value = key ? row[key] : null; return value == null ? '' : String(value).trim(); };
const roleFrom = (value: string) => { const normalized = normalizeHeader(value); if (normalized.includes('admin')) return 'administrador_general'; if (normalized.includes('director')) return 'director'; if (normalized.includes('gerent')) return 'gerente'; if (normalized.includes('supervis')) return 'supervisor'; if (normalized.includes('mora')) return 'mora'; if (normalized.includes('contab')) return 'contable'; if (normalized.includes('rrhh') || normalized.includes('recursos humanos')) return 'rrhh'; if (normalized.includes('administracion')) return 'administracion'; return 'vendedor'; };

export const RosterManagementModule: React.FC = () => {
  const { currentUser } = useApp();
  const { session } = useAuth();
  const [roster, setRoster] = useState<Roster | null>(null);
  const [form, setForm] = useState<Form>(emptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importRows, setImportRows] = useState<Array<Record<string, unknown>>>([]);

  const headers = () => ({ Authorization: `Bearer ${session?.access_token || ''}`, 'Content-Type': 'application/json' });
  const load = async () => {
    if (!session || currentUser.role !== 'admin') return;
    setLoading(true);
    try {
      const response = await fetch('/api/roster', { headers: { Authorization: `Bearer ${session.access_token}` } });
      const payload = await response.json() as { success?: boolean; message?: string; data?: Roster };
      if (!response.ok || !payload.success || !payload.data) throw new Error(payload.message || 'No se pudo cargar la estructura.');
      setRoster(payload.data);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo cargar la estructura.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [session, currentUser.role]);

  const sellerByStaff = useMemo(() => new Map((roster?.sellers || []).filter(s => s.staff_member_id).map(s => [s.staff_member_id!, s])), [roster]);
  const teamName = (id?: string | null) => roster?.teams.find(team => team.id === id)?.name || 'Sin equipo';
  const responsibilities = (staffId: string) => {
    const sellerTeam = sellerByStaff.get(staffId)?.team_id;
    if (sellerTeam) return teamName(sellerTeam);
    const managed = (roster?.teams || []).filter(team => team.manager_staff_id === staffId).map(team => `Gerencia: ${team.name}`);
    const supervised = (roster?.teams || []).filter(team => team.supervisor_staff_id === staffId).map(team => `Supervisión: ${team.name}`);
    return [...managed, ...supervised].join(' · ') || 'Sin equipo';
  };
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm(current => ({ ...current, [key]: value }));
  const saveResource = async (): Promise<boolean> => {
    if (!form.fullName.trim()) return false;
    setSaving(true); setMessage(null);
    try {
      const response = await fetch('/api/roster', { method: 'POST', headers: headers(), body: JSON.stringify({ action: 'save_resource', resource: form }) });
      const payload = await response.json() as { success?: boolean; message?: string; data?: Roster };
      if (!response.ok || !payload.success || !payload.data) throw new Error(payload.message || 'No se pudo guardar el recurso.');
      setRoster(payload.data); setForm(emptyForm()); setMessage('Estructura actualizada y registrada en Supabase.');
      return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo guardar el recurso.'); return false; }
    finally { setSaving(false); }
  };
  const edit = (staff: Staff) => {
    const seller = sellerByStaff.get(staff.id);
    setForm({ id: staff.id, fullName: staff.full_name, role: staff.role, active: staff.active, teamId: seller?.team_id || '', dni: staff.dni || '', legajo: staff.legajo || '', employmentType: staff.employment_type || '', commercialStructure: staff.commercial_structure || '', location: staff.location || '', hireDate: staff.hire_date || '', terminationDate: staff.termination_date || '' });
    setIsFormOpen(true);
  };
  const readImport = async (file: File | null) => {
    setImportFile(file || null); setImportRows([]); setMessage(null); if (!file) return;
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false, raw: false });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      const rows = raw.map(row => {
        const firstName = read(row, ['nombre']); const lastName = read(row, ['apellido']);
        const fullName = read(row, ['nombre completo', 'nombre y apellido', 'apellidos y nombres', 'colaborador', 'recurso', 'vendedor']) || `${firstName} ${lastName}`.trim();
        return { fullName, role: roleFrom(read(row, ['cargo', 'rol', 'puesto', 'funcion'])), teamName: read(row, ['equipo', 'team', 'grupo']), dni: read(row, ['dni', 'documento']), legajo: read(row, ['legajo']), employmentType: read(row, ['tipo de vinculo', 'vinculo', 'modalidad']), commercialStructure: read(row, ['estructura comercial', 'estructura']), location: read(row, ['sucursal', 'ubicacion', 'localidad']), hireDate: read(row, ['fecha de ingreso', 'ingreso', 'alta']) };
      }).filter(row => row.fullName && !normalizeHeader(row.fullName).includes('total'));
      if (!rows.length) throw new Error('No se identificaron nombres. Descargá específicamente la pestaña “ESTRUCTURA RRHH ACTIVA OK”.');
      setImportRows(rows); setMessage(`${rows.length} recursos leídos. Revisá la muestra antes de aplicar: la importación sólo crea o actualiza altas; nunca da bajas automáticas.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo leer el archivo.'); }
  };
  const applyImport = async () => {
    if (!importFile || !importRows.length) return;
    setSaving(true); setMessage(null);
    try {
      const response = await fetch('/api/roster', { method: 'POST', headers: headers(), body: JSON.stringify({ action: 'import_roster', sourceFileName: importFile.name, resources: importRows }) });
      const payload = await response.json() as { success?: boolean; message?: string; data?: Roster };
      if (!response.ok || !payload.success || !payload.data) throw new Error(payload.message || 'No se pudo aplicar la importación.');
      setRoster(payload.data); setImportFile(null); setImportRows([]); setMessage('Importación aplicada. Las ausencias de la planilla no generaron bajas automáticas.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo aplicar la importación.'); }
    finally { setSaving(false); }
  };
  const saveTeam = async (team: Team, key: 'manager_staff_id' | 'supervisor_staff_id', value: string) => {
    setSaving(true); setMessage(null);
    try {
      const response = await fetch('/api/roster', { method: 'POST', headers: headers(), body: JSON.stringify({ action: 'save_team', teamId: team.id, managerStaffId: key === 'manager_staff_id' ? value || null : team.manager_staff_id, supervisorStaffId: key === 'supervisor_staff_id' ? value || null : team.supervisor_staff_id }) });
      const payload = await response.json() as { success?: boolean; message?: string; data?: Roster };
      if (!response.ok || !payload.success || !payload.data) throw new Error(payload.message || 'No se pudo actualizar el equipo.');
      setRoster(payload.data); setMessage(`Responsable actualizado para ${team.name}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo actualizar el equipo.'); }
    finally { setSaving(false); }
  };

  if (currentUser.role !== 'admin') return <section className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-400">La estructura maestra sólo puede ser modificada por Administración.</section>;
  if (loading) return <section className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-400">Cargando estructura real de Supabase…</section>;
  // The historical roster was initially loaded with many leadership records
  // classified as sellers.  Every active person is selectable here; saving the
  // assignment promotes a seller/other record to the corresponding role.
  const activeStaff = (roster?.staff || []).filter(staff => staff.active);
  return <div className="space-y-6">
    <section className="rounded-xl border border-indigo-500/25 bg-indigo-500/5 p-5"><div className="flex gap-3"><div className="rounded-lg bg-indigo-500/15 p-2 text-indigo-200"><UsersRound className="h-5 w-5" /></div><div><h2 className="font-bold text-white">Estructura y recursos</h2><p className="mt-1 text-xs leading-5 text-slate-400">Base maestra de Nave.Plan. Las bajas son lógicas: se conserva todo el historial comercial, de Scoring y Fox.</p></div></div></section>
    {message && <p className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200">{message}</p>}
    <div className="flex justify-end"><button onClick={() => { setForm(emptyForm()); setIsFormOpen(true); }} className="inline-flex items-center gap-2 rounded bg-indigo-600 px-3 py-2 text-xs font-bold text-white"><Plus className="h-4 w-4"/> Nuevo recurso</button></div>
    {isFormOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"><section className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"><div className="mb-4 flex items-center justify-between gap-2"><div className="flex items-center gap-2"><Plus className="h-4 w-4 text-indigo-300"/><h3 className="font-semibold text-white">{form.id ? 'Ficha de recurso' : 'Alta de recurso'}</h3></div><button onClick={() => setIsFormOpen(false)} className="rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-800">Cerrar</button></div><div className="grid gap-3 md:grid-cols-3">
      <label className="md:col-span-2 text-xs text-slate-300">Nombre completo<input value={form.fullName} onChange={e => set('fullName', e.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" /></label>
      <label className="text-xs text-slate-300">Cargo<select value={form.role} onChange={e => set('role', e.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"><option value="vendedor">Vendedor</option><option value="supervisor">Supervisor</option><option value="gerente">Gerente</option><option value="director">Director</option><option value="administracion">Administración</option><option value="rrhh">RRHH</option><option value="mora">Mora</option><option value="contable">Contable</option><option value="administrador_general">Administrador general</option><option value="otro">Otro</option></select></label>
      <label className="text-xs text-slate-300">Equipo {form.role === 'vendedor' && <span className="text-red-300">*</span>}<select value={form.teamId} onChange={e => set('teamId', e.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"><option value="">Sin equipo</option>{roster?.teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
      <label className="text-xs text-slate-300">DNI<input value={form.dni} onChange={e => set('dni', e.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" /></label>
      <label className="text-xs text-slate-300">Legajo<input value={form.legajo} onChange={e => set('legajo', e.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" /></label>
      <label className="text-xs text-slate-300">Vínculo<input value={form.employmentType} placeholder="Legajo / Coaching" onChange={e => set('employmentType', e.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" /></label>
      <label className="text-xs text-slate-300">Fecha de ingreso<input type="date" value={form.hireDate} onChange={e => set('hireDate', e.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" /></label>
      <label className="flex items-end gap-2 pb-2 text-xs text-slate-300"><input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)} /> Recurso activo</label>
    </div><div className="mt-4 flex gap-2"><button disabled={saving} onClick={() => void saveResource().then(saved => { if (saved) setIsFormOpen(false); })} className="rounded bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar recurso'}</button><button onClick={() => { setForm(emptyForm()); setIsFormOpen(false); }} className="rounded px-3 py-2 text-xs text-slate-300 hover:bg-slate-800">Cancelar</button></div></section></div>}
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-5"><div className="flex items-start gap-3"><FileUp className="mt-0.5 h-4 w-4 text-emerald-300"/><div><h3 className="font-semibold text-white">Carga inicial desde Estructura RRHH Activa</h3><p className="mt-1 text-xs text-slate-400">Descargá sólo la primera pestaña como XLSX/CSV. Se agregan y actualizan recursos activos; una ausencia nunca produce una baja automática.</p></div></div><input type="file" accept=".xlsx,.xls,.csv" onChange={e => void readImport(e.target.files?.[0] || null)} className="mt-4 block w-full text-xs text-slate-300" />{importRows.length > 0 && <div className="mt-4 rounded border border-slate-800 p-3 text-xs text-slate-300"><p><b>{importRows.length}</b> recursos detectados. Muestra: {importRows.slice(0, 4).map(row => String(row.fullName)).join(' · ')}</p><button disabled={saving} onClick={() => void applyImport()} className="mt-3 rounded bg-emerald-600 px-3 py-2 font-bold text-white disabled:opacity-50">Aplicar altas y actualizaciones</button></div>}</section>
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-5"><h3 className="font-semibold text-white">Responsables por equipo</h3><p className="mt-1 text-xs text-slate-400">Podés seleccionar a una persona ya cargada aunque haya ingresado inicialmente como vendedor: al confirmarla, se actualizará su cargo a gerente o supervisor.</p><div className="mt-4 grid gap-3 lg:grid-cols-2">{roster?.teams.map(team => <div key={team.id} className="rounded border border-slate-800 p-3"><p className="mb-2 text-sm font-semibold text-white">{team.name}</p><div className="grid gap-2 sm:grid-cols-2"><label className="text-xs text-slate-400">Gerente<select value={team.manager_staff_id || ''} onChange={e => void saveTeam(team, 'manager_staff_id', e.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2 text-xs text-white"><option value="">Sin asignar</option>{activeStaff.map(s => <option key={s.id} value={s.id}>{s.full_name}{s.role !== 'gerente' ? ` · ${s.role.replaceAll('_', ' ')}` : ''}</option>)}</select></label><label className="text-xs text-slate-400">Supervisor<select value={team.supervisor_staff_id || ''} onChange={e => void saveTeam(team, 'supervisor_staff_id', e.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2 text-xs text-white"><option value="">Sin asignar</option>{activeStaff.map(s => <option key={s.id} value={s.id}>{s.full_name}{s.role !== 'supervisor' ? ` · ${s.role.replaceAll('_', ' ')}` : ''}</option>)}</select></label></div></div>)}</div></section>
    <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900"><div className="border-b border-slate-800 p-5"><h3 className="font-semibold text-white">Nómina registrada</h3><p className="mt-1 text-xs text-slate-400">{roster?.staff.filter(staff => staff.active).length || 0} activos · {roster?.staff.length || 0} históricos. Gerencias y supervisiones se indican junto a cada responsable.</p></div><div className="max-h-[32rem] overflow-auto"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-950 text-slate-400"><tr><th className="p-3">Nombre</th><th className="p-3">Cargo</th><th className="p-3">Responsabilidad / equipo</th><th className="p-3">Estado</th><th className="p-3"></th></tr></thead><tbody className="divide-y divide-slate-800">{roster?.staff.map(staff => <tr key={staff.id}><td className="p-3 font-medium text-white">{staff.full_name}</td><td className="p-3 text-slate-300">{staff.role.replaceAll('_', ' ')}</td><td className="p-3 text-slate-300">{responsibilities(staff.id)}</td><td className="p-3"><span className={staff.active ? 'text-emerald-300' : 'text-slate-500'}>{staff.active ? 'Activo' : 'Baja'}</span></td><td className="p-3 text-right"><button onClick={() => edit(staff)} className="inline-flex items-center gap-1 rounded px-2 py-1 text-indigo-200 hover:bg-indigo-500/10"><Pencil className="h-3 w-3"/> Ficha</button></td></tr>)}</tbody></table></div></section>
  </div>;
};
