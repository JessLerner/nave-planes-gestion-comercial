import React, { useMemo, useState } from 'react';
import { FileUp, LoaderCircle, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { getSupabaseClient } from '../../auth/supabase';
import { parseFoxLeadReport, type FoxLeadReportPreview } from '../../services/fox/parseFoxLeadReport';

const isoToday = () => new Date().toISOString().slice(0, 10);
const firstDayOfMonth = () => `${isoToday().slice(0, 8)}01`;
const IMPORT_BATCH_SIZE = 500;
type ImportResult = { success?: boolean; message?: string; stored?: number; unmappedRows?: number };

export const FoxReportImportPanel: React.FC = () => {
  const { session } = useAuth();
  const [snapshotDate, setSnapshotDate] = useState(isoToday());
  const [periodStart, setPeriodStart] = useState(firstDayOfMonth());
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<FoxLeadReportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const periodValid = periodStart <= snapshotDate;
  const managed = useMemo(() => preview?.rows.filter(row => row.managedAt).length ?? 0, [preview]);

  const chooseFile = async (selected: File | null) => {
    setFile(selected);
    setPreview(null);
    setMessage(null);
    if (!selected) return;
    setLoading(true);
    try {
      setPreview(await parseFoxLeadReport(selected));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo leer el reporte de Fox.');
    } finally {
      setLoading(false);
    }
  };

  const upload = async () => {
    if (!file || !preview || !periodValid || !session) return;
    setLoading(true);
    setMessage(null);
    try {
      let stored = 0;
      let unmappedRows = 0;
      const batches = Math.ceil(preview.rows.length / IMPORT_BATCH_SIZE);
      for (let index = 0; index < batches; index += 1) {
        setMessage(`Registrando corte Fox: lote ${index + 1} de ${batches}…`);
        const supabase = await getSupabaseClient();
        if (!supabase) throw new Error('No se pudo abrir la conexión segura con Supabase.');
        const { data, error } = await supabase.rpc('import_fox_leads', {
          p_snapshot_date: snapshotDate,
          p_period_start: periodStart,
          p_period_end: snapshotDate,
          p_source_file_name: file.name,
          p_source_file_sha256: preview.sha256,
          // The raw file never leaves the browser. This payload intentionally
          // contains no customer name, phone, email, DNI, address or notes.
          p_leads: preview.rows.slice(index * IMPORT_BATCH_SIZE, (index + 1) * IMPORT_BATCH_SIZE),
        });
        if (error) throw new Error(error.message);
        const result = data as ImportResult | null;
        if (!result?.success) throw new Error(result?.message || 'La importación fue rechazada por Supabase.');
        stored += result.stored || 0;
        unmappedRows += result.unmappedRows || 0;
      }
      setMessage(`Reporte registrado: ${stored} IDs actualizados. ${unmappedRows} filas aún no tienen vendedor asociado.`);
      setFile(null);
      setPreview(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo registrar el reporte.');
    } finally {
      setLoading(false);
    }
  };

  return <section className="rounded-xl border border-orange-500/25 bg-orange-500/5 p-4">
    <div className="flex items-start gap-3">
      <div className="rounded-lg bg-orange-500/15 p-2 text-orange-300"><FileUp className="h-4 w-4" /></div>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-bold text-white">Corte diario de Fox CRM</h3>
        <p className="mt-1 text-xs leading-5 text-slate-400">Exportá el mes en curso desde el día 1 hasta hoy. El navegador toma sólo ID, fechas, estado, asignación y métricas; los datos personales del cliente no se suben.</p>
      </div>
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className="text-xs font-semibold text-slate-300">Desde
        <input type="date" value={periodStart} max={snapshotDate} onChange={event => setPeriodStart(event.target.value)} className="mt-1.5 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" />
      </label>
      <label className="text-xs font-semibold text-slate-300">Corte del reporte
        <input type="date" value={snapshotDate} onChange={event => setSnapshotDate(event.target.value)} className="mt-1.5 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" />
      </label>
      <label className="text-xs font-semibold text-slate-300">Archivo Fox (CSV o XLS)
        <input type="file" accept=".csv,.xls,.xlsx" onChange={event => void chooseFile(event.target.files?.[0] ?? null)} className="mt-1.5 block w-full text-xs text-slate-400 file:mr-3 file:rounded file:border-0 file:bg-slate-700 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white" />
      </label>
    </div>
    {!periodValid && <p className="mt-3 text-xs text-red-300">La fecha de inicio no puede ser posterior al corte.</p>}
    {preview && <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
      <Metric label="Filas leídas" value={preview.totalRows} />
      <Metric label="IDs válidos" value={preview.rows.length} />
      <Metric label="Con gestión" value={managed} />
      <Metric label="IDs repetidos" value={preview.duplicateIds} />
    </div>}
    {message && <p className="mt-3 rounded border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs text-slate-300">{message}</p>}
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3">
      <span className="flex items-center gap-1.5 text-[11px] text-slate-500"><LockKeyhole className="h-3.5 w-3.5" /> No se conserva el archivo ni PII de clientes.</span>
      <button type="button" disabled={!preview || !file || !periodValid || loading} onClick={() => void upload()} className="inline-flex items-center gap-2 rounded bg-orange-500 px-3 py-2 text-xs font-bold text-white hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50">
        {loading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />} Registrar corte diario
      </button>
    </div>
  </section>;
};

const Metric: React.FC<{ label: string; value: number }> = ({ label, value }) => <div className="rounded border border-slate-800 bg-slate-950/60 px-3 py-2"><div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 font-mono text-base font-bold text-white">{value.toLocaleString('es-AR')}</div></div>;
