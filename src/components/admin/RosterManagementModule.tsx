import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { FileUp, LoaderCircle, Pencil, Plus, UsersRound } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../auth/AuthProvider';

type Team = { id: string; name: string; is_sales_team?: boolean; manager_staff_id: string | null; supervisor_staff_id: string | null; manager_name?: string; supervisor_name?: string };
type Staff = { id: string; full_name: string; role: string; active: boolean; legajo?: string | null; dni?: string | null; employment_type?: string | null; commercial_structure?: string | null; location?: string | null; hire_date?: string | null; termination_date?: string | null; supervisor_staff_id?: string | null; manager_staff_id?: string | null; supervisor_name?: string | null; manager_name?: string | null };
type Seller = { id: string; staff_member_id?: string | null; team_id: string; active: boolean };
type Roster = { teams: Team[]; staff: Staff[]; sellers: Seller[] };
type Form = { id?: string; fullName: string; role: string; active: boolean; teamId: string; supervisorId: string; managerId: string; dni: string; legajo: string; employmentType: string; commercialStructure: string; location: string; hireDate: string; terminationDate: string };

const emptyForm = (): Form => ({ fullName: '', role: 'vendedor', active: true, teamId: '', supervisorId: '', managerId: '', dni: '', legajo: '', employmentType: '', commercialStructure: '', location: '', hireDate: '', terminationDate: '' });
const normalizeHeader = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const read = (row: Record<string, unknown>, candidates: string[]) => { const key = Object.keys(row).find(header => candidates.some(candidate => normalizeHeader(header) === candidate || normalizeHeader(header).includes(candidate))); const value = key ? row[key] : null; return value == null ? '' : String(value).trim(); };
const roleFrom = (value: string) => { const normalized = normalizeHeader(value); if (normalized.includes('direccion') || normalized.includes('director')) return 'director'; if (normalized.includes('gerent')) return 'gerente'; if (normalized.includes('supervis')) return 'supervisor'; if (normalized.includes('mora')) return 'mora'; if (normalized.includes('contab')) return 'contable'; if (normalized.includes('rrhh') || normalized.includes('recursos humanos')) return 'rrhh'; if (normalized.includes('administr') || normalized.includes('admisntr')) return 'administracion'; if (normalized.includes('vendedor')) return 'vendedor'; return 'otro'; };
// The source uses suffixes such as "NP LEG 662" and "LUM LEG 947" in
// reporting columns. Remove only the known employment-code suffix, never a
// surname or a middle name, before matching it to a resource.
const cleanReference = (value: string) => value
  .replace(/\s+(?:np|pda|lum|lms|nvp-?o|pvn|coa|leg)\b.*$/i, '')
  // Dirección is referenced in the HR source as "NOMBRE APELLIDO DNI",
  // without an employment-code prefix. Keep the name and discard only a
  // standalone DNI-like suffix so hierarchy matching remains deterministic.
  .replace(/\s+\d{7,11}\s*$/, '')
  .trim();
const normalizedNameIs = (value: string, expected: string) => normalizeHeader(value) === normalizeHeader(expected);
const administrationManager = 'GONZALEZ MATIAS HERNAN';
const managerNames = new Set([
  'SOLDANO LEONARDO VICENTE',
  'GONZALEZ FABRICIO IGNACIO',
  'GONZALEZ FABRIZIO IGNACIO',
  'RODRIGUEZ FLORENCIA CECILIA',
].map(normalizeHeader));

const roleForImportedRow = (row: { fullName: string; managerName: string; explicitRole: string }, referencedSupervisors: Set<string>) => {
  // Organizational instruction confirmed by Administración: people reporting
  // to Dirección (Matías González) belong to Administración, except the three
  // formal Managers. This takes precedence over legacy spreadsheet labels.
  if (normalizedNameIs(row.fullName, 'LERNER JESICA')) return 'administrador_general';
  if (normalizedNameIs(row.managerName, administrationManager)) {
    return managerNames.has(normalizeHeader(row.fullName)) ? 'gerente' : 'administracion';
  }
  if (row.explicitRole !== 'otro') return row.explicitRole;
  return referencedSupervisors.has(normalizeHeader(row.fullName)) ? 'supervisor' : 'vendedor';
};

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
  const [replaceActiveRoster, setReplaceActiveRoster] = useState(false);
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [selectedSellerIds, setSelectedSellerIds] = useState<string[]>([]);
  const [bulkTeamId, setBulkTeamId] = useState('');
  const [view, setView] = useState<'active' | 'inactive'>('active');
  const [bulkSupervisorId, setBulkSupervisorId] = useState('');
  const [bulkManagerId, setBulkManagerId] = useState('');

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
  const teamIdsForStaff = (staffId: string) => {
    const ids = new Set<string>();
    const seller = sellerByStaff.get(staffId);
    if (seller?.team_id) ids.add(seller.team_id);
    (roster?.teams || []).forEach(team => {
      if (team.manager_staff_id === staffId || team.supervisor_staff_id === staffId) ids.add(team.id);
    });
    return ids;
  };
  const primaryTeamForStaff = (staff: Staff) => {
    const sellerTeam = sellerByStaff.get(staff.id)?.team_id;
    if (sellerTeam) return sellerTeam;
    const responsibility = (roster?.teams || []).find(team => team.manager_staff_id === staff.id || team.supervisor_staff_id === staff.id);
    return responsibility?.id || '';
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
    setForm({ id: staff.id, fullName: staff.full_name, role: staff.role, active: staff.active, teamId: primaryTeamForStaff(staff), supervisorId: staff.supervisor_staff_id || '', managerId: staff.manager_staff_id || '', dni: staff.dni || '', legajo: staff.legajo || '', employmentType: staff.employment_type || '', commercialStructure: staff.commercial_structure || '', location: staff.location || '', hireDate: staff.hire_date || '', terminationDate: staff.termination_date || '' });
    setIsFormOpen(true);
  };
  const readImport = async (file: File | null) => {
    setImportFile(file || null); setImportRows([]); setMessage(null); if (!file) return;
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false, raw: false });
      const sourceSheetName = workbook.SheetNames.find(name => normalizeHeader(name) === 'estructura rrhh activa ok' || normalizeHeader(name).includes('estructura rrhh activa'));
      if (!sourceSheetName) throw new Error('El archivo no contiene la pestaña “ESTRUCTURA RRHH ACTIVA OK”. No se importó nada.');
      const sheet = workbook.Sheets[sourceSheetName];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      const sourceRows = raw.map(row => {
        const firstName = read(row, ['nombre']); const lastName = read(row, ['apellido']);
        const fullName = read(row, ['nombre del recurso', 'nombre completo', 'nombre y apellido', 'apellidos y nombres', 'colaborador', 'recurso', 'vendedor']) || `${firstName} ${lastName}`.trim();
        const employmentType = read(row, ['nomina', 'tipo de vinculo', 'vinculo', 'modalidad']);
        return { fullName, explicitRole: roleFrom(read(row, ['categoria', 'cargo', 'rol', 'puesto', 'funcion'])), teamName: read(row, ['equipo', 'team', 'grupo']), supervisorName: cleanReference(read(row, ['supervisor responsable'])), managerName: cleanReference(read(row, ['gerente a cargo'])), dni: read(row, ['numero de dni', 'dni', 'documento']), legajo: read(row, ['legajo']), employmentType, commercialStructure: read(row, ['estructura comercial', 'estructura']), location: read(row, ['locacion', 'sucursal', 'ubicacion', 'localidad']), hireDate: read(row, ['fecha de ingreso', 'ingreso', 'alta']), activeInSource: normalizeHeader(read(row, ['estado'])) === 'activo' };
      }).filter(row => row.fullName && !normalizeHeader(row.fullName).includes('total') && row.activeInSource && normalizeHeader(row.employmentType) !== 'convencional');
      const referencedSupervisors = new Set(sourceRows.map(row => normalizeHeader(row.supervisorName)).filter(Boolean));
      const rows = sourceRows.map(({ explicitRole, activeInSource: _activeInSource, ...row }) => ({
        ...row,
        role: roleForImportedRow({ ...row, explicitRole }, referencedSupervisors),
      }));
      if (!rows.length) throw new Error('No se identificaron nombres. Descargá específicamente la pestaña “ESTRUCTURA RRHH ACTIVA OK”.');
      setImportRows(rows); setMessage(`${rows.length} recursos activos no convencionales leídos desde “${sourceSheetName}”. Revisá la muestra antes de aplicar: la importación sólo crea o actualiza altas; nunca da bajas automáticas.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo leer el archivo.'); }
  };
  const applyImport = async () => {
    if (!importFile || !importRows.length) return;
    setSaving(true); setMessage(null);
    try {
      const response = await fetch('/api/roster', { method: 'POST', headers: headers(), body: JSON.stringify({ action: 'import_roster', sourceFileName: importFile.name, resources: importRows, replaceActiveRoster }) });
      const payload = await response.json() as { success?: boolean; message?: string; data?: Roster };
      if (!response.ok || !payload.success || !payload.data) throw new Error(payload.message || 'No se pudo aplicar la importación.');
      setRoster(payload.data); setImportFile(null); setImportRows([]); setReplaceActiveRoster(false); setMessage(replaceActiveRoster ? 'Estructura reconstruida desde RRHH. Los registros no incluidos quedaron dados de baja lógicamente y su historial permanece.' : 'Importación aplicada. Las ausencias de la planilla no generaron bajas automáticas.');
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
  const setTeamSalesStatus = async (team: Team, isSalesTeam: boolean) => {
    setSaving(true); setMessage(null);
    try {
      const response = await fetch('/api/roster', { method: 'POST', headers: headers(), body: JSON.stringify({ action: 'set_team_sales_status', teamId: team.id, isSalesTeam }) });
      const payload = await response.json() as { success?: boolean; message?: string; data?: Roster };
      if (!response.ok || !payload.success || !payload.data) throw new Error(payload.message || 'No se pudo actualizar el estado comercial del equipo.');
      setRoster(payload.data); setMessage(isSalesTeam ? `${team.name} quedó visible como equipo de venta.` : `${team.name} quedó archivado y dejó de aparecer en los selectores comerciales.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo actualizar el estado comercial del equipo.'); }
    finally { setSaving(false); }
  };
  const moveSelectedSellers = async () => {
    if (!selectedSellerIds.length || !bulkTeamId) return;
    setSaving(true); setMessage(null);
    try {
      const response = await fetch('/api/roster', { method: 'POST', headers: headers(), body: JSON.stringify({ action: 'bulk_assign_team', staffIds: selectedSellerIds, teamId: bulkTeamId }) });
      const payload = await response.json() as { success?: boolean; message?: string; data?: Roster; moved?: number };
      if (!response.ok || !payload.success || !payload.data) throw new Error(payload.message || 'No se pudieron mover los recursos.');
      setRoster(payload.data); setSelectedSellerIds([]); setBulkTeamId(''); setMessage(`${payload.moved || 0} vendedor(es) reasignado(s) al equipo seleccionado.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudieron mover los recursos.'); }
    finally { setSaving(false); }
  };
  const assignSelectedReportingLines = async () => {
    if (!selectedSellerIds.length || (!bulkSupervisorId && !bulkManagerId)) return;
    setSaving(true); setMessage(null);
    try {
      const response = await fetch('/api/roster', { method: 'POST', headers: headers(), body: JSON.stringify({ action: 'bulk_reporting_lines', staffIds: selectedSellerIds, supervisorId: bulkSupervisorId || null, managerId: bulkManagerId || null }) });
      const payload = await response.json() as { success?: boolean; message?: string; data?: Roster };
      if (!response.ok || !payload.success || !payload.data) throw new Error(payload.message || 'No se pudieron actualizar los responsables.');
      setRoster(payload.data); setSelectedSellerIds([]); setBulkSupervisorId(''); setBulkManagerId(''); setMessage('Responsables actualizados en las fichas seleccionadas.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudieron actualizar los responsables.'); }
    finally { setSaving(false); }
  };
  const deactivateResource = async (staff: Staff) => {
    if (!window.confirm(`¿Dar de baja a ${staff.full_name}? Se conservará su historial, pero dejará de aparecer como recurso activo.`)) return;
    setSaving(true); setMessage(null);
    try {
      const response = await fetch('/api/roster', { method: 'POST', headers: headers(), body: JSON.stringify({ action: 'deactivate_resources', staffIds: [staff.id] }) });
      const payload = await response.json() as { success?: boolean; message?: string; data?: Roster; deactivated?: number };
      if (!response.ok || !payload.success || !payload.data) throw new Error(payload.message || 'No se pudo dar de baja al recurso.');
      setRoster(payload.data); setSelectedSellerIds(current => current.filter(id => id !== staff.id)); setMessage(`${payload.deactivated || 0} recurso dado de baja. Su historial permanece resguardado.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo dar de baja al recurso.'); }
    finally { setSaving(false); }
  };

  if (currentUser.role !== 'admin') return <section className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-400">La estructura maestra sólo puede ser modificada por Administración.</section>;
  if (loading) return <section className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-400">Cargando estructura real de Supabase…</section>;
  const commercialRoles = new Set(['vendedor', 'supervisor', 'gerente']);
  const isCommercialRole = commercialRoles.has(form.role);
  const directLeaders = (roster?.staff || []).filter(staff => staff.active && (isCommercialRole
    ? ['supervisor', 'gerente'].includes(staff.role)
    : ['administracion', 'rrhh', 'mora', 'contable', 'gerente', 'director'].includes(staff.role)));
  const bulkDirectLeaders = (roster?.staff || []).filter(staff => staff.active && ['supervisor', 'administracion', 'rrhh', 'mora', 'contable', 'gerente', 'director'].includes(staff.role));
  const seniorLeaders = (roster?.staff || []).filter(staff => staff.active && ['gerente', 'director'].includes(staff.role));
  const activeStaffById = new Map((roster?.staff || []).filter(staff => staff.active).map(staff => [staff.id, staff]));
  const salesCountByTeam = new Map<string, number>();
  (roster?.sellers || []).filter(seller => seller.active).forEach(seller => salesCountByTeam.set(seller.team_id, (salesCountByTeam.get(seller.team_id) || 0) + 1));
  // A selectable sales team is explicitly enabled by Administración and must
  // also have an active Supervisor plus at least one active seller.
  const isValidSalesTeam = (team: Team) => {
    const supervisor = team.supervisor_staff_id ? activeStaffById.get(team.supervisor_staff_id) : null;
    return Boolean(team.is_sales_team !== false && supervisor?.role === 'supervisor' && (salesCountByTeam.get(team.id) || 0) > 0);
  };
  const visibleTeams = (roster?.teams || []).filter(isValidSalesTeam);
  const normalizedSearch = normalizeHeader(search);
  const areaOf = (role: string) => ['vendedor', 'supervisor'].includes(role) ? 'ventas' : ['gerente', 'director'].includes(role) ? 'gerencia' : 'administracion';
  const filteredStaff = (roster?.staff || []).filter(staff => {
    if (staff.active !== (view === 'active')) return false;
    const matchesSearch = !normalizedSearch || [staff.full_name, staff.dni, staff.legajo].some(value => normalizeHeader(value).includes(normalizedSearch));
    const staffTeamIds = teamIdsForStaff(staff.id);
    const matchesTeam = !teamFilter || (teamFilter === '__unassigned__' ? staffTeamIds.size === 0 : staffTeamIds.has(teamFilter));
    const matchesArea = !areaFilter || areaOf(staff.role) === areaFilter;
    return matchesSearch && matchesTeam && matchesArea;
  });
  const filteredActiveStaffIds = filteredStaff.filter(staff => staff.active).map(staff => staff.id);
  const allFilteredSelected = filteredActiveStaffIds.length > 0 && filteredActiveStaffIds.every(id => selectedSellerIds.includes(id));
  return <div className="space-y-6">
    <section className="rounded-xl border border-indigo-500/25 bg-indigo-500/5 p-5"><div className="flex gap-3"><div className="rounded-lg bg-indigo-500/15 p-2 text-indigo-200"><UsersRound className="h-5 w-5" /></div><div><h2 className="font-bold text-white">Estructura y recursos</h2><p className="mt-1 text-xs leading-5 text-slate-400">Base maestra de Nave.Plan. Las bajas son lógicas: se conserva todo el historial comercial, de Scoring y Fox.</p></div></div></section>
    {message && <p className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200">{message}</p>}
    <div className="flex justify-end"><button onClick={() => { setForm(emptyForm()); setIsFormOpen(true); }} className="inline-flex items-center gap-2 rounded bg-indigo-600 px-3 py-2 text-xs font-bold text-white"><Plus className="h-4 w-4"/> Nuevo recurso</button></div>
    {isFormOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"><section className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"><div className="mb-4 flex items-center justify-between gap-2"><div className="flex items-center gap-2"><Plus className="h-4 w-4 text-indigo-300"/><h3 className="font-semibold text-white">{form.id ? 'Ficha de recurso' : 'Alta de recurso'}</h3></div><button onClick={() => setIsFormOpen(false)} className="rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-800">Cerrar</button></div><div className="grid gap-3 md:grid-cols-3">
      <label className="md:col-span-2 text-xs text-slate-300">Nombre completo<input value={form.fullName} onChange={e => set('fullName', e.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" /></label>
      <label className="text-xs text-slate-300">Cargo<select value={form.role} onChange={e => set('role', e.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"><option value="vendedor">Vendedor</option><option value="supervisor">Supervisor</option><option value="gerente">Gerente</option><option value="director">Director</option><option value="administracion">Administración</option><option value="rrhh">RRHH</option><option value="mora">Mora</option><option value="contable">Contable</option><option value="administrador_general">Administrador general</option><option value="otro">Otro</option></select></label>
      <label className="text-xs text-slate-300">Responsable directo<select value={form.supervisorId} onChange={e => set('supervisorId', e.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"><option value="">Sin asignar</option>{directLeaders.filter(staff => staff.id !== form.id).map(staff => <option key={staff.id} value={staff.id}>{staff.full_name} · {staff.role.replaceAll('_', ' ')}</option>)}</select></label>
      <label className="text-xs text-slate-300">Jerarquía superior<select value={form.managerId} onChange={e => set('managerId', e.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"><option value="">Sin asignar</option>{seniorLeaders.filter(staff => staff.id !== form.id && staff.id !== form.supervisorId).map(staff => <option key={staff.id} value={staff.id}>{staff.full_name} · {staff.role}</option>)}</select></label>
      {isCommercialRole ? <label className="text-xs text-slate-300">{form.role === 'vendedor' ? 'Equipo comercial' : 'Equipo comercial a cargo'} {form.role === 'vendedor' && <span className="text-red-300">*</span>}<select value={form.teamId} onChange={e => set('teamId', e.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"><option value="">Sin equipo</option>{visibleTeams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label> : <p className="self-end pb-2 text-xs leading-5 text-slate-400">Área administrativa: elegí el <b>Responsable directo</b> y, si corresponde, su <b>Jerarquía superior</b>. No pertenece a un equipo comercial.</p>}
      <label className="text-xs text-slate-300">DNI<input value={form.dni} onChange={e => set('dni', e.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" /></label>
      <label className="text-xs text-slate-300">Legajo<input value={form.legajo} onChange={e => set('legajo', e.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" /></label>
      <label className="text-xs text-slate-300">Vínculo<input value={form.employmentType} placeholder="Legajo / Coaching" onChange={e => set('employmentType', e.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" /></label>
      <label className="text-xs text-slate-300">Fecha de ingreso<input type="date" value={form.hireDate} onChange={e => set('hireDate', e.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" /></label>
      <label className="flex items-end gap-2 pb-2 text-xs text-slate-300"><input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)} /> Recurso activo</label>
    </div><div className="mt-4 flex gap-2"><button disabled={saving} onClick={() => void saveResource().then(saved => { if (saved) setIsFormOpen(false); })} className="rounded bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar recurso'}</button><button onClick={() => { setForm(emptyForm()); setIsFormOpen(false); }} className="rounded px-3 py-2 text-xs text-slate-300 hover:bg-slate-800">Cancelar</button></div></section></div>}
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-5"><div className="flex items-start gap-3"><FileUp className="mt-0.5 h-4 w-4 text-emerald-300"/><div><h3 className="font-semibold text-white">Carga desde Estructura RRHH Activa</h3><p className="mt-1 text-xs text-slate-400">Sólo se admite la pestaña “ESTRUCTURA RRHH ACTIVA OK”. Se toman recursos activos y se excluye NÓMINA CONVENCIONAL.</p></div></div><input type="file" accept=".xlsx,.xls,.csv" onChange={e => void readImport(e.target.files?.[0] || null)} className="mt-4 block w-full text-xs text-slate-300" />{importRows.length > 0 && <div className="mt-4 rounded border border-slate-800 p-3 text-xs text-slate-300"><p><b>{importRows.length}</b> recursos activos no convencionales detectados. Muestra: {importRows.slice(0, 4).map(row => String(row.fullName)).join(' · ')}</p><label className="mt-3 flex items-start gap-2 rounded border border-amber-700/60 bg-amber-950/20 p-3 text-xs text-amber-100"><input type="checkbox" checked={replaceActiveRoster} onChange={e => setReplaceActiveRoster(e.target.checked)} className="mt-0.5"/><span><b>Reconstruir nómina activa desde esta fuente.</b> Los recursos activos que no estén en la planilla se darán de baja lógicamente. Se conserva el historial de ventas, Fox y Scoring, y queda un resguardo de la estructura anterior.</span></label><button disabled={saving} onClick={() => void applyImport()} className="mt-3 rounded bg-emerald-600 px-3 py-2 font-bold text-white disabled:opacity-50">{replaceActiveRoster ? 'Reconstruir nómina activa' : 'Aplicar altas y actualizaciones'}</button></div>}</section>
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-5"><h3 className="font-semibold text-white">Visibilidad de equipos comerciales</h3><p className="mt-1 text-xs leading-5 text-slate-400">Administración decide aquí qué equipos aparecen en filtros, reportes y fichas de vendedores. Archivar un equipo no modifica personas, ventas ni historial.</p><div className="mt-4 max-h-64 space-y-2 overflow-auto">{(roster?.teams || []).map(team => <div key={team.id} className="flex items-center justify-between gap-3 rounded border border-slate-800 px-3 py-2"><div><p className="text-sm font-medium text-white">{team.name}</p><p className="text-xs text-slate-400">{salesCountByTeam.get(team.id) || 0} vendedor(es) activos · {team.is_sales_team === false ? 'Archivado' : 'Visible como equipo de venta'}</p></div><button disabled={saving} onClick={() => void setTeamSalesStatus(team, team.is_sales_team === false)} className={`rounded px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${team.is_sales_team === false ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-100'}`}>{team.is_sales_team === false ? 'Activar' : 'Archivar'}</button></div>)}</div></section>
    <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
      <div className="border-b border-slate-800 p-5">
        <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-white">Nómina registrada</h3><p className="mt-1 text-xs text-slate-400">{roster?.staff.filter(staff => staff.active).length || 0} activos · {roster?.staff.filter(staff => !staff.active).length || 0} bajas / históricos.</p></div><div className="flex rounded border border-slate-700 text-xs"><button onClick={() => { setView('active'); setSelectedSellerIds([]); }} className={`px-3 py-2 ${view === 'active' ? 'bg-indigo-600 text-white' : 'text-slate-300'}`}>Activos</button><button onClick={() => { setView('inactive'); setSelectedSellerIds([]); }} className={`px-3 py-2 ${view === 'inactive' ? 'bg-slate-700 text-white' : 'text-slate-300'}`}>Bajas e históricos</button></div></div>
        <div className="mt-4 grid gap-2 md:grid-cols-[1fr_12rem_12rem]"><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre, DNI o legajo" className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"/><select value={areaFilter} onChange={e => { setAreaFilter(e.target.value); setSelectedSellerIds([]); }} className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"><option value="">Todas las áreas</option><option value="ventas">Equipos de venta</option><option value="administracion">Administración</option><option value="gerencia">Gerencia / Dirección</option></select><select value={teamFilter} onChange={e => { setTeamFilter(e.target.value); setSelectedSellerIds([]); }} className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"><option value="">Todos los equipos</option><option value="__unassigned__">Sin asignar</option>{visibleTeams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></div>
        {selectedSellerIds.length > 0 && view === 'active' && <div className="mt-3 flex flex-wrap items-center gap-2 rounded border border-indigo-500/30 bg-indigo-500/5 p-3 text-xs text-slate-200"><span>{selectedSellerIds.length} recurso(s) seleccionado(s)</span><select value={bulkSupervisorId} onChange={e => setBulkSupervisorId(e.target.value)} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-white"><option value="">Responsable directo: no cambiar</option>{bulkDirectLeaders.map(staff => <option key={staff.id} value={staff.id}>{staff.full_name}</option>)}</select><select value={bulkManagerId} onChange={e => setBulkManagerId(e.target.value)} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-white"><option value="">Jerarquía superior: no cambiar</option>{seniorLeaders.map(staff => <option key={staff.id} value={staff.id}>{staff.full_name}</option>)}</select><button disabled={(!bulkSupervisorId && !bulkManagerId) || saving} onClick={() => void assignSelectedReportingLines()} className="rounded bg-indigo-600 px-3 py-1 font-semibold text-white disabled:opacity-50">Aplicar responsables</button><button onClick={() => setSelectedSellerIds([])} className="text-slate-300 hover:text-white">Cancelar</button></div>}
      </div>
      <div className="max-h-[32rem] overflow-auto"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-950 text-slate-400"><tr><th className="p-3"><input type="checkbox" checked={allFilteredSelected} disabled={!filteredActiveStaffIds.length || view === 'inactive'} onChange={e => setSelectedSellerIds(e.target.checked ? filteredActiveStaffIds : [])} aria-label="Seleccionar recursos filtrados"/></th><th className="p-3">Nombre</th><th className="p-3">Cargo</th><th className="p-3">Responsable / Gerencia / equipo</th><th className="p-3">Estado</th><th className="p-3"></th></tr></thead><tbody className="divide-y divide-slate-800">{filteredStaff.map(staff => <tr key={staff.id}><td className="p-3">{staff.active && <input type="checkbox" checked={selectedSellerIds.includes(staff.id)} onChange={e => setSelectedSellerIds(current => e.target.checked ? [...current, staff.id] : current.filter(id => id !== staff.id))} aria-label={`Seleccionar ${staff.full_name}`}/>}</td><td className="p-3 font-medium text-white">{staff.full_name}</td><td className="p-3 text-slate-300">{staff.role.replaceAll('_', ' ')}</td><td className="p-3 text-slate-300">{[staff.supervisor_name && `Responsable: ${staff.supervisor_name}`, staff.manager_name && `Gerencia/Dirección: ${staff.manager_name}`, responsibilities(staff.id)].filter(Boolean).join(' · ')}</td><td className="p-3"><span className={staff.active ? 'text-emerald-300' : 'text-slate-500'}>{staff.active ? 'Activo' : 'Baja'}</span></td><td className="p-3 text-right"><button onClick={() => edit(staff)} className="inline-flex items-center gap-1 rounded px-2 py-1 text-indigo-200 hover:bg-indigo-500/10"><Pencil className="h-3 w-3"/> Ficha</button>{staff.active && <button disabled={saving} onClick={() => void deactivateResource(staff)} className="ml-1 rounded px-2 py-1 text-rose-300 hover:bg-rose-500/10 disabled:opacity-50">Desactivar</button>}</td></tr>)}</tbody></table>{!filteredStaff.length && <p className="p-5 text-center text-sm text-slate-400">No hay recursos que coincidan con la búsqueda.</p>}</div>
    </section>
  </div>;
};
