import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Users,
  Send,
  Database,
  ArrowRight,
  TrendingDown,
  Percent,
  CheckCircle,
  HelpCircle,
  RefreshCw,
  PlusCircle,
  BarChart2,
} from 'lucide-react';
import { LeadSource } from '../../types';

export const CrmLeadsModule: React.FC = () => {
  const {
    sellers,
    teams,
    leadDistributions,
    distributeLeads,
    selectedTeamId,
    currentUser,
    isSyncingDataExtractor,
    syncDataExtractor,
    lastSyncTime,
  } = useApp();

  const [showDistributeModal, setShowDistributeModal] = useState(false);
  const [selectedSellerId, setSelectedSellerId] = useState('');
  const [leadsCount, setLeadsCount] = useState<number>(15);
  const [leadSource, setLeadSource] = useState<LeadSource>('Run One');
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Filter sellers eligible for lead distribution (active sellers in team)
  const eligibleSellers = sellers.filter(s => {
    if (!s.active) return false;
    if (selectedTeamId !== 'all') return s.team_id === selectedTeamId;
    if (currentUser.role === 'supervisor' && currentUser.team_id) {
      return s.team_id === currentUser.team_id;
    }
    return true;
  });

  // Filter lead distributions
  const filteredDistributions = leadDistributions.filter(ld => {
    if (selectedTeamId !== 'all') return ld.team_id === selectedTeamId;
    if (currentUser.role === 'supervisor' && currentUser.team_id) {
      return ld.team_id === currentUser.team_id;
    }
    return true;
  });

  // Calculate aggregate CRM metrics
  const totalAssigned = filteredDistributions.reduce((sum, ld) => sum + ld.assigned_leads, 0);
  const totalContacted = filteredDistributions.reduce((sum, ld) => sum + ld.contacted_leads, 0);
  const totalClosed = filteredDistributions.reduce((sum, ld) => sum + ld.closed_leads, 0);
  const totalLost = filteredDistributions.reduce((sum, ld) => sum + ld.lost_leads, 0);

  const conversionRate = totalAssigned > 0 ? ((totalClosed / totalAssigned) * 100).toFixed(1) : '0';
  const contactRate = totalAssigned > 0 ? ((totalContacted / totalAssigned) * 100).toFixed(1) : '0';

  // Aggregate loss reasons
  const aggregatedLossReasons: Record<string, number> = {
    'No califica ingresos / Veraz': 0,
    'Dudas sobre cuota pura / ajuste': 0,
    'Fuera de radio de cobertura': 0,
    'Sin interés inmediato (curioso)': 0,
    'Optó por compra usada / competencia': 0,
    'Teléfono o WhatsApp inválido': 0,
  };

  filteredDistributions.forEach(ld => {
    if (ld.loss_reasons.no_califica_ingresos) {
      aggregatedLossReasons['No califica ingresos / Veraz'] += ld.loss_reasons.no_califica_ingresos;
    }
    if (ld.loss_reasons.dudas_cuota_pura) {
      aggregatedLossReasons['Dudas sobre cuota pura / ajuste'] += ld.loss_reasons.dudas_cuota_pura;
    }
    if (ld.loss_reasons.fuera_de_zona) {
      aggregatedLossReasons['Fuera de radio de cobertura'] += ld.loss_reasons.fuera_de_zona;
    }
    if (ld.loss_reasons.sin_interes_inmediato) {
      aggregatedLossReasons['Sin interés inmediato (curioso)'] += ld.loss_reasons.sin_interes_inmediato;
    }
    if (ld.loss_reasons.eligio_competencia) {
      aggregatedLossReasons['Optó por compra usada / competencia'] += ld.loss_reasons.eligio_competencia;
    }
    if (ld.loss_reasons.numero_invalido) {
      aggregatedLossReasons['Teléfono o WhatsApp inválido'] += ld.loss_reasons.numero_invalido;
    }
  });

  const handleDistributeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSellerId) {
      setFeedbackMsg('Seleccione un vendedor para asignar el lote de datos.');
      return;
    }
    distributeLeads(selectedSellerId, leadsCount, leadSource);
    const s = sellers.find(sel => sel.id === selectedSellerId);
    setFeedbackMsg(`Se asignaron ${leadsCount} datos de "${leadSource}" a ${s?.name}.`);
    setTimeout(() => {
      setShowDistributeModal(false);
      setFeedbackMsg(null);
    }, 1200);
  };

  return (
    <div className="space-y-6">
      {/* 1. Ingestion status & Data-Extractor Pipeline */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
            <Database className="w-4 h-4" />
            <span>Integración Inbound Fox CRM · Pipeline Data-Extractor</span>
          </div>
          <h2 className="text-xl font-bold text-white mt-1">
            Control de Ingesta, Reparto & Embudo de Leads
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Sincronización en tiempo real desde Fox CRM, Campañas Meta Ads, Stands presenciales y portales Subite/AGP.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (eligibleSellers.length > 0) {
                setSelectedSellerId(eligibleSellers[0].id);
              }
              setShowDistributeModal(true);
            }}
            className="flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-blue-600/20 transition-all"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Repartir Lote de Leads</span>
          </button>

          <button
            onClick={syncDataExtractor}
            disabled={isSyncingDataExtractor}
            className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium border border-slate-700 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isSyncingDataExtractor ? 'animate-spin' : ''}`} />
            <span>{isSyncingDataExtractor ? 'Ingiriendo...' : 'Sincronizar'}</span>
          </button>
        </div>
      </div>

      {/* 2. Conversion Metrics KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400">Total Leads Asignados</div>
          <div className="text-2xl font-bold text-white font-mono mt-1">{totalAssigned}</div>
          <div className="text-[11px] text-slate-500 mt-1">Repartidos a nómina comercial</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400">Leads Gestionados (Contacto)</div>
          <div className="text-2xl font-bold text-blue-400 font-mono mt-1">{totalContacted}</div>
          <div className="text-[11px] text-slate-400 mt-1">Tasa de contacto: <span className="font-mono text-white font-semibold">{contactRate}%</span></div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400">Suscripciones Cerradas</div>
          <div className="text-2xl font-bold text-emerald-400 font-mono mt-1">{totalClosed}</div>
          <div className="text-[11px] text-slate-400 mt-1">Conversión bruta: <span className="font-mono text-emerald-400 font-semibold">{conversionRate}%</span></div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400">Leads Caídos / Descartados</div>
          <div className="text-2xl font-bold text-red-400 font-mono mt-1">{totalLost}</div>
          <div className="text-[11px] text-slate-500 mt-1">Con motivo de no-venta tipificado</div>
        </div>
      </div>

      {/* 3. Distribution Matrix per Seller */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-400" />
              <span>Matriz de Asignación & Tasa de Contacto por Vendedor</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Control del reparto manual realizado por los supervisores y ritmo de contacto
            </p>
          </div>
          <div className="text-xs text-slate-400">
            Fuente principal de ingreso: <span className="text-blue-300 font-semibold">Run One / Subite</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 text-slate-400 font-semibold border-b border-slate-800 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">Vendedor Asignado</th>
                <th className="py-3 px-4">Equipo</th>
                <th className="py-3 px-4">Origen Predominante</th>
                <th className="py-3 px-4 text-center">Asignados</th>
                <th className="py-3 px-4 text-center">Contactados</th>
                <th className="py-3 px-4 text-center">Cierres</th>
                <th className="py-3 px-4 text-center">Caídos</th>
                <th className="py-3 px-4 text-right">Efectividad %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredDistributions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500 text-xs">
                    <Users className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <div className="text-slate-300 font-semibold text-sm">
                      Sin datos asignados en este período
                    </div>
                    <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
                      Sincronice con la API de Data-Extractor (Fox CRM) para importar lotes entrantes o reparta manualmente un lote a sus vendedores.
                    </p>
                    <button
                      onClick={() => {
                        if (eligibleSellers.length > 0) setSelectedSellerId(eligibleSellers[0].id);
                        setShowDistributeModal(true);
                      }}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-blue-600/20"
                    >
                      Repartir Primer Lote
                    </button>
                  </td>
                </tr>
              ) : (
                filteredDistributions.map(ld => {
                const seller = sellers.find(s => s.id === ld.seller_id);
                const team = teams.find(t => t.id === ld.team_id);
                const eff = ld.assigned_leads > 0 ? ((ld.closed_leads / ld.assigned_leads) * 100).toFixed(1) : '0';

                return (
                  <tr key={ld.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-white">{seller?.name || 'Vendedor'}</div>
                      <div className="text-[11px] text-slate-400">DNI {seller?.dni}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-300">
                      {team?.name.split('(')[0]}
                    </td>
                    <td className="py-3 px-4 text-slate-200">
                      {ld.lead_source}
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-medium text-slate-200">
                      {ld.assigned_leads}
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-medium text-blue-400">
                      {ld.contacted_leads} ({Math.round((ld.contacted_leads / Math.max(1, ld.assigned_leads)) * 100)}%)
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-emerald-400">
                      {ld.closed_leads}
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-red-400">
                      {ld.lost_leads}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-white">
                      {eff}%
                    </td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Motivos de Caída (Desglose de no-venta) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-1">
          <TrendingDown className="w-4 h-4 text-amber-400" />
          <span>Desglose de Motivos de Caída & Rechazo Comercial</span>
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          Auditoría de objeciones no superadas reportadas en Fox CRM
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(aggregatedLossReasons).map(([reason, count]) => {
            const pct = totalLost > 0 ? Math.round((count / totalLost) * 100) : 0;
            return (
              <div key={reason} className="bg-slate-950/60 border border-slate-800 rounded-lg p-3.5">
                <div className="flex justify-between items-start text-xs">
                  <span className="font-medium text-slate-300">{reason}</span>
                  <span className="font-mono font-bold text-red-400">{count} leads</span>
                </div>
                <div className="mt-2 w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-red-500 h-full rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-1 text-[11px] text-slate-500 font-mono text-right">
                  {pct}% del total de caídas
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal: Repartir Leads */}
      {showDistributeModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">
              Reparto Manual de Leads
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Asigne un paquete de datos calificados a un vendedor del equipo.
            </p>

            {feedbackMsg && (
              <div className="mb-4 p-3 bg-blue-900/30 border border-blue-500/40 rounded text-xs text-blue-200">
                {feedbackMsg}
              </div>
            )}

            <form onSubmit={handleDistributeSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Vendedor Destinatario
                </label>
                <select
                  value={selectedSellerId}
                  onChange={e => setSelectedSellerId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {eligibleSellers.map(s => {
                    const team = teams.find(t => t.id === s.team_id);
                    return (
                      <option key={s.id} value={s.id}>
                        {s.name} ({team?.name.split('(')[0]})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Origen del Lead (Fox CRM)
                </label>
                <select
                  value={leadSource}
                  onChange={e => setLeadSource(e.target.value as LeadSource)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="Run One">Run One (Campaña Inbound Web)</option>
                  <option value="Prospect">Prospect (Búsqueda Orgánica)</option>
                  <option value="Stand">Stand (Captación Presencial Shopping)</option>
                  <option value="Subite">Subite (Portal Multimarca)</option>
                  <option value="AGP">AGP (Plataforma B2B)</option>
                  <option value="Facebook Ads">Facebook / Instagram Ads</option>
                  <option value="Dato Propio">Dato Propio / Referido</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Cantidad de Leads a Asignar
                </label>
                <input
                  type="number"
                  min="5"
                  max="100"
                  step="5"
                  value={leadsCount}
                  onChange={e => setLeadsCount(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowDistributeModal(false)}
                  className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-md shadow-blue-600/20 transition-all"
                >
                  Confirmar Reparto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
