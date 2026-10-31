import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Database, ExternalLink, RefreshCw, Search, TrendingDown, Users } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../auth/AuthProvider';
import { FoxUserMappingPanel } from './FoxUserMappingPanel';

type Summary = { snapshot_date: string; total_leads: number; sin_gestion: number; con_gestion: number; cerrados: number; abiertos: number; vendidos: number };
type SellerMetric = Omit<Summary, 'snapshot_date'> & { seller_id: string | null; team_id: string | null; seller_name: string };
type CloseReason = { reason: string; total: number };

export const FoxMetricsPanel: React.FC = () => {
  const { currentUser, selectedTeamId } = useApp();
  const { session } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [bySeller, setBySeller] = useState<SellerMetric[]>([]);
  const [closeReasons, setCloseReasons] = useState<CloseReason[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showAllSellers, setShowAllSellers] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const teamQuery = selectedTeamId !== 'all' ? `?teamId=${encodeURIComponent(selectedTeamId)}` : '';
      const response = await fetch(`/api/fox-leads-metrics${teamQuery}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      const payload = await response.json() as { success?: boolean; ready?: boolean; message?: string; summary?: Summary; bySeller?: SellerMetric[]; closeReasons?: CloseReason[] };
      if (!response.ok || !payload.success) throw new Error(payload.message || 'No se pudo consultar Fox CRM.');
      setSummary(payload.ready ? payload.summary || null : null);
      setBySeller(payload.bySeller || []);
      setCloseReasons(payload.closeReasons || []);
      setMessage(payload.ready ? null : payload.message || 'Todavía no hay un corte de Fox cargado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo consultar Fox CRM.');
    } finally {
      setLoading(false);
    }
  }, [session, selectedTeamId]);

  useEffect(() => { void load(); }, [load]);
  const fmt = (value: number | undefined) => Number(value || 0).toLocaleString('es-AR');
  const pct = (value: number | undefined) => summary?.total_leads ? `${Math.round((Number(value || 0) / summary.total_leads) * 100)}%` : '0%';
  const matchingSellers = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('es-AR');
    return needle ? bySeller.filter((row) => row.seller_name.toLocaleLowerCase('es-AR').includes(needle)) : bySeller;
  }, [bySeller, search]);
  const displayedSellers = showAllSellers ? matchingSellers : matchingSellers.slice(0, 15);

  return <div className="space-y-6">
    <section className="flex flex-col justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900 p-5 md:flex-row md:items-center">
      <div><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400"><Database className="h-4 w-4" /> Fox CRM · Cartera vigente</div><h2 className="mt-1 text-xl font-bold text-white">Control diario de leads</h2><p className="mt-1 text-xs text-slate-400">La situación se toma exclusivamente de <strong className="text-slate-200">Estado</strong>: “Sin Gestión” identifica un dato sin gestión.</p></div>
      <div className="flex items-center gap-3"><button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Actualizar</button><a href="https://foxcrm.net/app/reporte_cartera_leads.php" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs font-semibold text-orange-200 hover:bg-orange-500/20"><ExternalLink className="h-3.5 w-3.5" /> Ir a Fox CRM</a></div>
    </section>

    {message && <section className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-400"><BarChart3 className="mx-auto mb-3 h-8 w-8 text-slate-600" />{message}</section>}
    {summary && <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5"><Kpi title="Cartera total" value={fmt(summary.total_leads)} detail={`Corte: ${summary.snapshot_date.slice(0, 10).split('-').reverse().join('/')}`} tone="text-white" /><Kpi title="Sin gestión" value={fmt(summary.sin_gestion)} detail={pct(summary.sin_gestion)} tone="text-amber-300" /><Kpi title="Con gestión" value={fmt(summary.con_gestion)} detail={pct(summary.con_gestion)} tone="text-sky-300" /><Kpi title="Abiertos" value={fmt(summary.abiertos)} detail={pct(summary.abiertos)} tone="text-violet-300" /><Kpi title="Cerrados" value={fmt(summary.cerrados)} detail={`Vendidos: ${fmt(summary.vendidos)}`} tone="text-emerald-300" /></div>
      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5"><h3 className="flex items-center gap-2 text-sm font-bold text-white"><TrendingDown className="h-4 w-4 text-red-300" /> Motivos de cierre</h3><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{closeReasons.map(item => <div key={item.reason} className="flex items-center justify-between gap-4 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2.5 text-xs"><span className="text-slate-300">{item.reason}</span><span className="font-mono font-bold text-red-300">{fmt(item.total)}</span></div>)}</div></section>
      <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900"><div className="border-b border-slate-800 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="flex items-center gap-2 text-sm font-bold text-white"><Users className="h-4 w-4 text-sky-300" /> Cartera por vendedor</h3><p className="mt-1 text-xs text-slate-400">{selectedTeamId === 'all' ? 'Mostrando todos los equipos.' : 'Filtrado por el equipo seleccionado en la cabecera.'}</p></div><label className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" /><input value={search} onChange={(event) => { setSearch(event.target.value); setShowAllSellers(false); }} placeholder="Buscar recurso" className="w-56 rounded border border-slate-700 bg-slate-950 py-2 pl-8 pr-3 text-xs text-white placeholder:text-slate-500" /></label></div></div><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-950/60 text-[10px] uppercase tracking-wider text-slate-400"><tr><th className="px-4 py-3">Vendedor</th><th className="px-3 py-3 text-center">Total</th><th className="px-3 py-3 text-center">Sin gestión</th><th className="px-3 py-3 text-center">Con gestión</th><th className="px-3 py-3 text-center">Abiertos</th><th className="px-3 py-3 text-center">Cerrados</th><th className="px-3 py-3 text-center">Vendidos</th></tr></thead><tbody className="divide-y divide-slate-800">{displayedSellers.map(row => <tr key={`${row.seller_id || row.seller_name}-${row.team_id || ''}`} className="hover:bg-slate-800/30"><td className="px-4 py-3 font-semibold text-white">{row.seller_name}</td><td className="px-3 py-3 text-center font-mono text-slate-200">{fmt(row.total_leads)}</td><td className="px-3 py-3 text-center font-mono text-amber-300">{fmt(row.sin_gestion)}</td><td className="px-3 py-3 text-center font-mono text-sky-300">{fmt(row.con_gestion)}</td><td className="px-3 py-3 text-center font-mono text-violet-300">{fmt(row.abiertos)}</td><td className="px-3 py-3 text-center font-mono text-slate-200">{fmt(row.cerrados)}</td><td className="px-3 py-3 text-center font-mono text-emerald-300">{fmt(row.vendidos)}</td></tr>)}</tbody></table></div>{matchingSellers.length > 15 && <div className="flex items-center justify-between border-t border-slate-800 px-4 py-3 text-xs text-slate-400"><span>{showAllSellers ? `${matchingSellers.length} recursos` : `Mostrando 15 de ${matchingSellers.length}`}</span><button type="button" onClick={() => setShowAllSellers((current) => !current)} className="font-semibold text-sky-300 hover:text-sky-200">{showAllSellers ? 'Mostrar menos' : 'Mostrar todos'}</button></div>}</section>
      {['admin', 'supervisor'].includes(currentUser.role) && <FoxUserMappingPanel canConfirm={currentUser.role === 'admin'} onSaved={() => void load()} />}
    </>}
  </div>;
};

const Kpi: React.FC<{ title: string; value: string; detail: string; tone: string }> = ({ title, value, detail, tone }) => <section className="rounded-xl border border-slate-800 bg-slate-900 p-4"><p className="text-xs text-slate-400">{title}</p><p className={`mt-1 font-mono text-2xl font-bold ${tone}`}>{value}</p><p className="mt-1 text-[11px] text-slate-500">{detail}</p></section>;
