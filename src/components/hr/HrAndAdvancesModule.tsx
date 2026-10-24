import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Briefcase,
  DollarSign,
  UserPlus,
  Users,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ShieldCheck,
  FileText,
  Lock,
  Unlock,
  Building,
  Check,
} from 'lucide-react';
import { Candidate, WageAdvance, Seller } from '../../types';
import { formatARS, validateAdvanceEligibility } from '../../utils/businessLogic';

export const HrAndAdvancesModule: React.FC = () => {
  const {
    sellers,
    teams,
    wageAdvances,
    candidates,
    monthlyConfig,
    salesBySeller,
    currentUser,
    requestAdvance,
    reviewAdvance,
    updateCandidateStage,
    updateCandidateDocs,
  } = useApp();

  const [activeSubTab, setActiveSubTab] = useState<'advances' | 'recruitment' | 'turnover'>('advances');

  // Advance request form state
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [targetSellerId, setTargetSellerId] = useState(sellers[0]?.id || 'seller-1');
  const [requestAmount, setRequestAmount] = useState<number>(200000);
  const [requestReason, setRequestReason] = useState('');
  const [requestFeedback, setRequestFeedback] = useState<{ success: boolean; msg: string } | null>(null);

  // Review modal state
  const [selectedAdvanceForReview, setSelectedAdvanceForReview] = useState<WageAdvance | null>(null);
  const [rejectionNotes, setRejectionNotes] = useState('');

  // Selected seller details for live validation check
  const selectedSeller = sellers.find(s => s.id === targetSellerId);
  const selectedSellerSales = selectedSeller ? (salesBySeller[selectedSeller.id] || 0) : 0;

  // Live validation preview
  const liveValidation = validateAdvanceEligibility(
    selectedSellerSales,
    monthlyConfig.min_sales_for_advance,
    requestAmount,
    monthlyConfig.max_advance_amount,
    14, // Simulated day 14 (within monthly deadline day 15)
    monthlyConfig.advance_deadline_day
  );

  const handleAdvanceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = requestAdvance(targetSellerId, requestAmount, requestReason);
    setRequestFeedback({
      success: res.success,
      msg: res.message,
    });

    if (res.success) {
      setTimeout(() => {
        setShowRequestModal(false);
        setRequestFeedback(null);
        setRequestReason('');
      }, 1400);
    }
  };

  // Team retention calculation
  const teamRetentionData = teams.map(team => {
    const teamSellers = sellers.filter(s => s.team_id === team.id);
    const active = teamSellers.filter(s => s.active).length;
    const terminated = teamSellers.filter(s => !s.active).length;
    const retentionRate = teamSellers.length > 0 ? Math.round((active / teamSellers.length) * 100) : 100;

    return {
      team,
      total: teamSellers.length,
      active,
      terminated,
      retentionRate,
    };
  }).sort((a, b) => b.retentionRate - a.retentionRate);

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-400">
            <Briefcase className="w-4 h-4" />
            <span>Recursos Humanos, Selección & Beneficios Comerciales</span>
          </div>
          <h2 className="text-xl font-bold text-white mt-1">
            Gestión de Nómina, Rotación & Adelantos de Sueldo
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            <strong className="text-emerald-400">Regla estricta de Adelanto:</strong> Mínimo de <strong className="text-white">{monthlyConfig.min_sales_for_advance} ventas cerradas</strong> registradas a la fecha límite mensual (día {monthlyConfig.advance_deadline_day}) · Tope máx: {formatARS(monthlyConfig.max_advance_amount)}.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowRequestModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-blue-600/20 transition-all"
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Gestionar Solicitud de Adelanto</span>
          </button>
        </div>
      </div>

      {/* 2. Sub-tab Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 text-xs">
        <button
          onClick={() => setActiveSubTab('advances')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeSubTab === 'advances'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Adelantos de Sueldo ({wageAdvances.length})
        </button>
        <button
          onClick={() => setActiveSubTab('recruitment')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeSubTab === 'recruitment'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Reclutamiento & Legajos ({candidates.length})
        </button>
        <button
          onClick={() => setActiveSubTab('turnover')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeSubTab === 'turnover'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Métricas de Rotación & Permanencia
        </button>
      </div>

      {/* SUB-TAB 1: WAGE ADVANCES */}
      {activeSubTab === 'advances' && (
        <div className="space-y-6">
          {/* Summary KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400">Total Solicitudes del Mes</div>
              <div className="text-2xl font-bold text-white font-mono mt-1">
                {wageAdvances.length}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Aprobados: {wageAdvances.filter(w => w.status === 'approved').length} · Pendientes: {wageAdvances.filter(w => w.status === 'pending').length}
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400">Monto Total Liquidado</div>
              <div className="text-2xl font-bold text-emerald-400 font-mono mt-1">
                {formatARS(
                  wageAdvances
                    .filter(w => w.status === 'approved')
                    .reduce((sum, w) => sum + w.amount, 0)
                )}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Tope máximo por asesor: {formatARS(monthlyConfig.max_advance_amount)}
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400">Vendedores Aptos (≥ 2 ventas)</div>
              <div className="text-2xl font-bold text-blue-400 font-mono mt-1">
                {sellers.filter(s => s.active && (salesBySeller[s.id] || 0) >= monthlyConfig.min_sales_for_advance).length}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {sellers.filter(s => s.active && (salesBySeller[s.id] || 0) < monthlyConfig.min_sales_for_advance).length} vendedores en 0 o 1 venta (bloqueados)
              </div>
            </div>
          </div>

          {/* Table of advances */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                <span>Registro de Solicitudes de Adelanto & Dictamen de RRHH</span>
              </h3>
              <div className="text-xs text-slate-400">
                Fecha de corte mensual: <span className="text-white font-mono">Día {monthlyConfig.advance_deadline_day}</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/60 text-slate-400 font-semibold border-b border-slate-800 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Fecha Solicitud</th>
                    <th className="py-3 px-4">Vendedor</th>
                    <th className="py-3 px-4">Equipo</th>
                    <th className="py-3 px-4 text-center">Ventas a la Fecha</th>
                    <th className="py-3 px-4 text-right">Monto Solicitado</th>
                    <th className="py-3 px-4">Motivo Declarado</th>
                    <th className="py-3 px-4 text-center">Estado Auditoría</th>
                    <th className="py-3 px-4 text-right">Acción RRHH</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {wageAdvances.map(wa => {
                    const seller = sellers.find(s => s.id === wa.seller_id);
                    const team = teams.find(t => t.id === seller?.team_id);
                    const isApproved = wa.status === 'approved';
                    const isPending = wa.status === 'pending';
                    const isRejected = wa.status === 'rejected';

                    return (
                      <tr key={wa.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4 font-mono text-slate-300">
                          {wa.request_date}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-white">{seller?.name}</div>
                          <div className="text-[11px] text-slate-400">DNI {seller?.dni}</div>
                        </td>
                        <td className="py-3 px-4 text-slate-300">
                          {team?.name.split('(')[0]}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`font-mono font-bold ${
                              wa.seller_sales_count_at_date >= 2 ? 'text-emerald-400' : 'text-red-400'
                            }`}
                          >
                            {wa.seller_sales_count_at_date} ventas
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-white">
                          {formatARS(wa.amount)}
                        </td>
                        <td className="py-3 px-4 text-slate-300 max-w-xs truncate" title={wa.reason}>
                          {wa.reason || 'Sin motivo especificado'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {isApproved && (
                            <div className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Aprobado</span>
                            </div>
                          )}
                          {isPending && (
                            <div className="inline-flex items-center gap-1 text-[11px] text-amber-400 font-medium">
                              <Clock className="w-3.5 h-3.5" />
                              <span>Pendiente RRHH</span>
                            </div>
                          )}
                          {isRejected && (
                            <div
                              className="inline-flex items-center gap-1 text-[11px] text-red-400 font-medium cursor-help"
                              title={wa.rejection_reason || 'Rechazado'}
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Rechazado</span>
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {isPending && (currentUser.role === 'rrhh' || currentUser.role === 'admin' || currentUser.role === 'gerente') ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                onClick={() => reviewAdvance(wa.id, 'approved')}
                                className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition-colors"
                              >
                                Aprobar
                              </button>
                              <button
                                onClick={() => setSelectedAdvanceForReview(wa)}
                                className="px-2 py-1 rounded bg-red-900/60 hover:bg-red-800 text-red-200 text-xs transition-colors"
                              >
                                Rechazar
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-500">
                              {wa.reviewed_by ? wa.reviewed_by.split('(')[0] : 'Auditado'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: RECRUITMENT */}
      {activeSubTab === 'recruitment' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {candidates.map(candidate => {
              const team = teams.find(t => t.id === candidate.target_team_id);
              const docsComplete = Object.values(candidate.docs).every(Boolean);

              return (
                <div key={candidate.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-bold text-white text-sm">{candidate.name}</h4>
                        <div className="text-xs text-slate-400">{candidate.position}</div>
                      </div>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-blue-900/40 text-blue-300 border border-blue-800 font-medium">
                        {candidate.stage.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>

                    <div className="mt-3 text-xs text-slate-400 space-y-1">
                      <div>Tel: <span className="font-mono text-slate-300">{candidate.phone}</span></div>
                      <div>Equipo Asignado: <span className="text-white font-medium">{team?.name.split('(')[0]}</span></div>
                      <div className="pt-2 text-slate-300 italic">{candidate.notes}</div>
                    </div>

                    {/* Documentation Checklist */}
                    <div className="mt-4 pt-3 border-t border-slate-800">
                      <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        Legajo / Documentación de Ingreso
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {[
                          { key: 'dni' as const, label: 'DNI Frente y Dorso' },
                          { key: 'cv' as const, label: 'CV Comercial' },
                          { key: 'cuil' as const, label: 'Constancia CUIL' },
                          { key: 'antecedentes' as const, label: 'Cert. Antecedentes' },
                        ].map(doc => {
                          const isChecked = candidate.docs[doc.key];
                          return (
                            <label key={doc.key} className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={e => updateCandidateDocs(candidate.id, doc.key, e.target.checked)}
                                className="rounded border-slate-700 text-blue-600 focus:ring-0"
                              />
                              <span className={isChecked ? 'text-slate-200' : 'text-slate-500'}>
                                {doc.label}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">
                      {docsComplete ? (
                        <span className="text-emerald-400 font-medium">✓ Documentación 100%</span>
                      ) : (
                        <span className="text-amber-400">Documentación pendiente</span>
                      )}
                    </span>
                    <select
                      value={candidate.stage}
                      onChange={e => updateCandidateStage(candidate.id, e.target.value as Candidate['stage'])}
                      className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded px-2 py-1"
                    >
                      <option value="postulacion">Postulación</option>
                      <option value="entrevista_rrhh">Entrevista RRHH</option>
                      <option value="entrevista_supervisor">Entrevista Supervisor</option>
                      <option value="documentacion">Recepción Legajo</option>
                      <option value="alta_confirmada">Alta Confirmada</option>
                      <option value="descartado">Descartado</option>
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUB-TAB 3: TURNOVER METRICS */}
      {activeSubTab === 'turnover' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-400" />
                <span>Ranking de Retención de Personal & Sostenimiento en Nómina</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Evaluación mensual de estabilidad de vendedores por equipo y supervisor
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/60 text-slate-400 font-semibold border-b border-slate-800 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Equipo Comercial</th>
                    <th className="py-3 px-4">Supervisor</th>
                    <th className="py-3 px-4 text-center">Vendedores en Nómina</th>
                    <th className="py-3 px-4 text-center">Bajas Registradas</th>
                    <th className="py-3 px-4 text-right">Índice de Retención</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {teamRetentionData.map(row => (
                    <tr key={row.team.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 font-semibold text-white">
                        {row.team.name}
                      </td>
                      <td className="py-3 px-4 text-slate-300">
                        {row.team.supervisor_name}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-medium text-emerald-400">
                        {row.active} activos
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-red-400">
                        {row.terminated} bajas
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="font-mono font-bold text-blue-400">
                          {row.retentionRate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Solicitar Adelanto (With strict business rule validation) */}
      {showRequestModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-blue-400" />
                <span>Solicitud de Adelanto de Sueldo</span>
              </h3>
              <button onClick={() => setShowRequestModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            {requestFeedback && (
              <div
                className={`mt-3 p-3 rounded text-xs ${
                  requestFeedback.success
                    ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-200'
                    : 'bg-red-950/60 border border-red-800 text-red-200'
                }`}
              >
                {requestFeedback.msg}
              </div>
            )}

            <form onSubmit={handleAdvanceSubmit} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Vendedor Solicitante
                </label>
                <select
                  value={targetSellerId}
                  onChange={e => setTargetSellerId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200"
                >
                  {sellers.filter(s => s.active).map(s => {
                    const salesCount = salesBySeller[s.id] || 0;
                    return (
                      <option key={s.id} value={s.id}>
                        {s.name} ({salesCount} ventas cerradas)
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Dynamic Live Eligibility Status Box */}
              <div
                className={`p-3 rounded-lg border flex items-start gap-2.5 ${
                  liveValidation.eligible
                    ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                    : 'bg-red-950/40 border-red-900 text-red-300'
                }`}
              >
                {liveValidation.eligible ? (
                  <Unlock className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <Lock className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-semibold text-xs">
                    {liveValidation.eligible
                      ? 'Vendedor Apto para Solicitar Adelanto'
                      : 'Solicitud Bloqueada por Regla de Negocio'}
                  </div>
                  <div className="text-[11px] mt-0.5 opacity-90">
                    {liveValidation.eligible
                      ? `Posee ${selectedSellerSales} ventas cerradas (supera el requisito mínimo de ${monthlyConfig.min_sales_for_advance}).`
                      : liveValidation.reasons.join(' ')}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Monto Solicitado ($ARS)
                </label>
                <input
                  type="number"
                  min="50000"
                  max={monthlyConfig.max_advance_amount}
                  step="10000"
                  value={requestAmount}
                  onChange={e => setRequestAmount(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-mono text-sm"
                />
                <div className="text-[10px] text-slate-400 mt-1">
                  Límite máximo permitido por Gerencia: {formatARS(monthlyConfig.max_advance_amount)}
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Motivo de la Solicitud
                </label>
                <textarea
                  rows={2}
                  required
                  value={requestReason}
                  onChange={e => setRequestReason(e.target.value)}
                  placeholder="Detalle el motivo extraordinario del pedido de adelanto..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowRequestModal(false)}
                  className="px-3.5 py-2 rounded-lg bg-slate-800 text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!liveValidation.eligible}
                  className={`px-4 py-2 rounded-lg font-medium shadow-md transition-all ${
                    liveValidation.eligible
                      ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/20'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  Enviar a RRHH
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Rechazar Adelanto con motivo */}
      {selectedAdvanceForReview && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-sm w-full p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-2">Rechazar Solicitud de Adelanto</h3>
            <p className="text-xs text-slate-400 mb-4">
              Indique el motivo por el cual RRHH o Gerencia desestima la solicitud de {formatARS(selectedAdvanceForReview.amount)}.
            </p>

            <textarea
              rows={3}
              value={rejectionNotes}
              onChange={e => setRejectionNotes(e.target.value)}
              placeholder="Ej. Cupo mensual agotado, antecedentes de mora interna, etc."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 mb-4"
            />

            <div className="flex justify-end gap-2 text-xs">
              <button
                onClick={() => setSelectedAdvanceForReview(null)}
                className="px-3 py-1.5 rounded bg-slate-800 text-slate-300"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  reviewAdvance(selectedAdvanceForReview.id, 'rejected', rejectionNotes);
                  setSelectedAdvanceForReview(null);
                  setRejectionNotes('');
                }}
                className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white font-medium"
              >
                Confirmar Rechazo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
