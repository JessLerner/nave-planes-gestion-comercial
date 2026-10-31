import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { FileUp, Pencil, RefreshCw, Search, X } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';

type DirectoryRow = {
  id: string; full_name: string; dni?: string; legajo?: string; is_coaching: boolean;
  is_freelance: boolean; active: boolean; role_name?: string; responsible_name?: string;
  role_id?: string; responsible_staff_id?: string; employment_type?: string;
};
type Directory = {
  rows: DirectoryRow[]; total: number; areas: { id: string; name: string }[];
  teams: { id: string; name: string }[]; roles: { id: string; name: string; area_id: string }[];
  responsibles: { id: string; full_name: string }[];
};
type Decision = 'listo' | 'freelance' | 'excluido' | 'revisar';
type ImportRow = {
  line: number; name: string; dni: string; legajo: string; nomina: string;
  category: string; supervisor: string; manager: string; decision: Decision; note: string;
};

const upper = (value: unknown) => String(value ?? '').trim().toUpperCase();
const comparable = (value: string) => upper(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const matchScore = (reference: string, candidate: string) => {
  const ref = comparable(reference).split(' ').filter((token) => token.length > 1 && !/^\d+$/.test(token));
  const name = comparable(candidate).split(' ').filter((token) => token.length > 1);
  if (!ref.length || !name.length) return 0;
  return name.filter((token) => ref.some((value) => value === token || value.startsWith(token) || token.startsWith(value))).length / name.length;
};

export const LegajosDirectory: React.FC = () => {
  const { session } = useAuth();
  const [data, setData] = useState<Directory>();
  const [q, setQ] = useState(''); const [area, setArea] = useState('');
  const [team, setTeam] = useState(''); const [status, setStatus] = useState('active');
  const [loading, setLoading] = useState(false); const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState<ImportRow[]>([]); const [previewMessage, setPreviewMessage] = useState('');
  const [editing, setEditing] = useState<DirectoryRow>(); const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ full_name: '', dni: '', legajo: '', employment_type: '', role_id: '', responsible_staff_id: '', active: true });

  const load = async () => {
    if (!session) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ q, area, team, status });
      const response = await fetch(`/api/resources-directory?${params}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      const payload = await response.json();
      if (payload.success) setData(payload.data);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    const timeout = setTimeout(() => void load(), 200);
    return () => clearTimeout(timeout);
  }, [session, q, area, team, status]);

  const inspect = async (file?: File) => {
    if (!file) return;
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = workbook.Sheets['ESTRUCTURA RRHH ACTIVA OK'];
      if (!sheet) throw new Error('No se encontró la pestaña ESTRUCTURA RRHH ACTIVA OK.');
      const source = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
        .filter((row) => upper(row['NOMBRE DEL RECURSO']));
      const parsed = source.map((row, index): ImportRow => {
        const nomina = upper(row.NOMINA); const name = upper(row['NOMBRE DEL RECURSO']);
        const dni = String(row['NUMERO DE DNI'] ?? '').trim(); const legajo = String(row.LEGAJO ?? '').trim();
        const supervisor = upper(row['SUPERVISOR - RESPONSABLE']); const manager = upper(row['GERENTE A CARGO']);
        const category = upper(row.CATEGORIA);
        if (nomina === 'CONVENCIONAL') return { line: index + 2, name, dni, legajo, nomina, category, supervisor, manager, decision: 'excluido', note: 'Nómina Convencional: no se importa.' };
        if (nomina.includes('FREE LANCE')) return { line: index + 2, name, dni, legajo, nomina, category, supervisor: '', manager, decision: 'freelance', note: 'Freelance: equipo y supervisor no obligatorios.' };
        const alerts: string[] = [];
        if (!dni) alerts.push('Falta DNI');
        if (!category) alerts.push('Falta cargo/categoría');
        if (!manager && category.includes('SUPERVISOR')) alerts.push('Falta responsable superior');
        return { line: index + 2, name, dni, legajo, nomina, category, supervisor, manager,
          decision: alerts.length ? 'revisar' : 'listo', note: alerts.join(' · ') || 'Datos listos para aplicar.' };
      });

      // The manager of every subordinate is resolved recursively from the
      // matched supervisor. It is generic fuzzy matching, without exceptions
      // for individual people or organisations.
      const inheritedManager = (row: ImportRow, seen = new Set<number>()): string => {
        if (seen.has(row.line)) return row.manager;
        seen.add(row.line);
        const parent = parsed.filter((candidate) => candidate.name !== row.name)
          .map((candidate) => ({ candidate, score: matchScore(row.supervisor, candidate.name) }))
          .sort((a, b) => b.score - a.score)[0];
        if (!parent || parent.score < 0.75) return row.manager;
        return inheritedManager(parent.candidate, seen) || parent.candidate.manager || row.manager;
      };
      const hierarchy = parsed.map((row) => {
        if (!row.supervisor || row.decision === 'freelance') return row;
        const manager = inheritedManager(row);
        if (!manager) return row;
        return { ...row, manager,
          note: `${row.note}${row.manager && row.manager !== manager ? ' · Gerente informado reemplazado por herencia' : ''} · Gerente heredado desde supervisor` };
      });
      setPreview(hierarchy);
      setPreviewMessage(`${hierarchy.length} filas analizadas. No se cargó ningún recurso.`);
    } catch (error) {
      setPreview([]); setPreviewMessage(error instanceof Error ? error.message : 'No se pudo leer el archivo.');
    }
  };

  const apply = async () => {
    if (!session || preview.some((row) => row.decision === 'revisar')) return;
    setApplying(true);
    try {
      const response = await fetch('/api/hr-import', {
        method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: preview }),
      });
      const result = await response.json();
      setPreviewMessage(result.success ? `${result.created} recursos y ${result.teams} equipos de venta cargados.${result.duplicateSourceRows ? ` Se omitieron ${result.duplicateSourceRows} fila(s) repetida(s) del archivo.` : ''}` : result.message || 'No se pudo cargar.');
      if (result.success) { setPreview([]); await load(); }
    } finally { setApplying(false); }
  };

  const edit = (row: DirectoryRow) => {
    setEditing(row);
    setForm({ full_name: row.full_name, dni: row.dni || '', legajo: row.legajo || '', employment_type: row.employment_type || (row.is_coaching ? 'COACHING' : ''), role_id: row.role_id || '', responsible_staff_id: row.responsible_staff_id || '', active: row.active });
  };
  const save = async () => {
    if (!session || !editing || !form.role_id) return;
    setSaving(true);
    try {
      const result = await fetch('/api/resource-update', { method: 'PATCH', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editing.id, ...form }) });
      const payload = await result.json();
      if (!payload.success) { setPreviewMessage(payload.message || 'No se pudo guardar el recurso.'); return; }
      setEditing(undefined); await load();
    } finally { setSaving(false); }
  };

  const summary = useMemo(() => ({
    ready: preview.filter((row) => row.decision === 'listo').length,
    freelance: preview.filter((row) => row.decision === 'freelance').length,
    excluded: preview.filter((row) => row.decision === 'excluido').length,
    review: preview.filter((row) => row.decision === 'revisar').length,
  }), [preview]);
  const tone = (decision: Decision) => decision === 'listo' ? 'text-emerald-400' : decision === 'freelance' ? 'text-violet-300' : decision === 'excluido' ? 'text-slate-500' : 'text-amber-300';

  return <section className="space-y-4">
    <div className="flex items-center justify-between"><div><h3 className="text-lg font-bold text-white">Legajos</h3><p className="text-xs text-slate-400">Nómina maestra con acceso según jerarquía.</p></div><button onClick={() => void load()} className="rounded border border-slate-700 p-2"><RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /></button></div>
    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-700 bg-slate-900 p-3 text-xs text-slate-300"><FileUp className="h-4 w-4" />Previsualizar archivo RRHH<input className="hidden" type="file" accept=".xlsx,.xls" onChange={(event) => void inspect(event.target.files?.[0])} /></label>
    {previewMessage && <p className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-xs text-slate-300">{previewMessage}</p>}
    {preview.length > 0 && <>
      <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4"><p className="rounded bg-emerald-500/10 p-2 text-emerald-300">{summary.ready} listos</p><p className="rounded bg-violet-500/10 p-2 text-violet-300">{summary.freelance} Freelance</p><p className="rounded bg-slate-800 p-2 text-slate-400">{summary.excluded} excluidos</p><p className="rounded bg-amber-500/10 p-2 text-amber-300">{summary.review} a revisar</p></div>
      <div className="max-h-80 overflow-auto rounded-xl border border-slate-800"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-900 text-slate-400"><tr><th className="p-3">Recurso</th><th>DNI</th><th>Legajo</th><th>Cargo</th><th>Supervisor</th><th>Gerente</th><th>Decisión</th><th>Detalle</th></tr></thead><tbody>{preview.map((row) => <tr key={row.line} className="border-t border-slate-800"><td className="p-3 font-medium text-white">{row.name}</td><td>{row.dni || '—'}</td><td>{row.legajo}</td><td>{row.category || '—'}</td><td>{row.supervisor || '—'}</td><td>{row.manager || '—'}</td><td className={tone(row.decision)}>{row.decision}</td><td className="pr-3 text-slate-400">{row.note}</td></tr>)}</tbody></table></div>
      <button disabled={summary.review > 0 || applying} onClick={() => void apply()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-700">{applying ? 'Aplicando estructura…' : 'Aplicar estructura aprobada'}</button>
      {summary.review > 0 && <p className="text-xs text-amber-300">Resolvé los casos marcados antes de aplicar.</p>}
    </>}
    <div className="grid gap-2 md:grid-cols-[1fr_180px_210px_140px]"><label className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" /><input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Nombre, apellido, DNI o legajo" className="w-full rounded border border-slate-700 bg-slate-950 py-2.5 pl-9 text-sm" /></label><select value={area} onChange={(event) => setArea(event.target.value)} className="rounded border border-slate-700 bg-slate-950 px-2 text-sm"><option value="">Todos los sectores</option>{data?.areas.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select value={team} onChange={(event) => setTeam(event.target.value)} className="rounded border border-slate-700 bg-slate-950 px-2 text-sm"><option value="">Todos los equipos</option>{data?.teams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded border border-slate-700 bg-slate-950 px-2 text-sm"><option value="active">Activos</option><option value="inactive">No activos</option><option value="all">Todos</option></select></div>
    <div className="overflow-x-auto rounded-xl border border-slate-800"><table className="w-full text-left text-xs"><thead className="bg-slate-900 text-slate-400"><tr><th className="p-3">Nombre y apellido</th><th>DNI</th><th>Legajo / Coaching</th><th>Responsable</th><th>Cargo</th><th>Estado</th><th /></tr></thead><tbody>{data?.rows.map((row) => <tr key={row.id} className="border-t border-slate-800"><td className="p-3 font-medium">{row.full_name}{row.is_freelance && <span className="ml-2 text-violet-300">Freelance</span>}</td><td>{row.dni || '—'}</td><td>{row.legajo || (row.is_coaching ? 'Coaching' : '—')}</td><td>{row.responsible_name || 'Sin responsable'}</td><td>{row.role_name || 'Sin cargo'}</td><td className={row.active ? 'text-emerald-400' : 'text-slate-500'}>{row.active ? 'Activa' : 'No activa'}</td><td className="pr-3"><button onClick={() => edit(row)} className="inline-flex items-center gap-1 text-indigo-300 hover:text-white"><Pencil className="h-3.5 w-3.5" />Editar</button></td></tr>)}{!loading && !data?.rows.length && <tr><td colSpan={7} className="p-10 text-center text-slate-500">No hay recursos para los filtros seleccionados.</td></tr>}</tbody></table></div>
    {editing && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4"><div className="w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"><div className="mb-4 flex items-center justify-between"><h4 className="font-bold text-white">Editar recurso</h4><button onClick={() => setEditing(undefined)}><X className="h-4 w-4" /></button></div><div className="grid gap-3 md:grid-cols-2"><label className="text-xs text-slate-400">Nombre<input value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2 text-sm text-white" /></label><label className="text-xs text-slate-400">DNI<input value={form.dni} onChange={(event) => setForm({ ...form, dni: event.target.value })} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2 text-sm text-white" /></label><label className="text-xs text-slate-400">Legajo / Coaching<input value={form.legajo} onChange={(event) => setForm({ ...form, legajo: event.target.value })} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2 text-sm text-white" /></label><label className="text-xs text-slate-400">Nómina<input value={form.employment_type} onChange={(event) => setForm({ ...form, employment_type: event.target.value })} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2 text-sm text-white" /></label><label className="text-xs text-slate-400">Cargo<select value={form.role_id} onChange={(event) => setForm({ ...form, role_id: event.target.value })} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2 text-sm text-white"><option value="">Seleccionar cargo</option>{data?.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label><label className="text-xs text-slate-400">Responsable directo<select value={form.responsible_staff_id} onChange={(event) => setForm({ ...form, responsible_staff_id: event.target.value })} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2 text-sm text-white"><option value="">Sin asignar</option>{data?.responsibles.filter((item) => item.id !== editing.id).map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label></div><label className="mt-4 flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />Recurso activo</label><div className="mt-5 flex justify-end gap-2"><button onClick={() => setEditing(undefined)} className="rounded px-3 py-2 text-sm">Cancelar</button><button disabled={saving || !form.role_id} onClick={() => void save()} className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-700">{saving ? 'Guardando…' : 'Guardar cambios'}</button></div></div></div>}
  </section>;
};
