import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  FileCheck2,
  PlusCircle,
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  Car,
  Lock,
  Unlock,
  CheckCircle2,
  XCircle,
  PhoneCall,
  Search,
  Filter,
  DollarSign,
  Info,
} from 'lucide-react';
import {
  SalesOperation,
  ScoringStatus,
  BrandType,
  PlanType,
  LeadSource,
} from '../../types';
import { formatARS, canPresentToFactory } from '../../utils/businessLogic';

export const OperationsModule: React.FC = () => {
  const {
    operations,
    sellers,
    teams,
    priceLists,
    currentUser,
    selectedTeamId,
    auditScoring,
    addOperation,
  } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterBrand, setFilterBrand] = useState<string>('all');
  const [filterScoring, setFilterScoring] = useState<string>('all');

  // Modal states
  const [showNewOpModal, setShowNewOpModal] = useState(false);
  const [selectedOpForAudit, setSelectedOpForAudit] = useState<SalesOperation | null>(null);
  const [auditNotes, setAuditNotes] = useState('');
  const [auditStatus, setAuditStatus] = useState<ScoringStatus>('approved');
  const [auditReasons, setAuditReasons] = useState<string[]>([]);
  const [auditFeedback, setAuditFeedback] = useState<string | null>(null);

  // New operation form state
  const [newOpForm, setNewOpForm] = useState({
    client_name: '',
    client_dni: '',
    client_phone: '',
    subscription_number: '',
    brand: 'Peugeot' as BrandType,
    model: '208 Active 1.6',
    plan_type: '80/20' as PlanType,
    cuota_1_value: 245000,
    total_collected: 245000,
    factory_account: 'CTA-STELLANTIS-00912',
    used_car_flag: false,
    used_car_make: 'Chevrolet',
    used_car_model: 'Onix 1.4',
    used_car_year: 2018,
    used_car_km: 75000,
    used_car_appraisal: 11500000,
    used_car_plate: 'AA 332 KK',
    seller_id: sellers[0]?.id || 'seller-1',
    lead_source: 'Run One' as LeadSource,
  });

  // Filter operations based on team, search, and status
  const filteredOperations = operations.filter(op => {
    if (selectedTeamId !== 'all' && op.team_id !== selectedTeamId) return false;
    if (currentUser.role === 'supervisor' && currentUser.team_id && op.team_id !== currentUser.team_id) {
      return false;
    }
    if (filterBrand !== 'all' && op.brand !== filterBrand) return false;
    if (filterScoring !== 'all' && op.scoring_status !== filterScoring) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchClient = op.client_name.toLowerCase().includes(q);
      const matchDni = op.client_dni.includes(q);
      const matchSub = op.subscription_number.toLowerCase().includes(q);
      return matchClient || matchDni || matchSub;
    }
    return true;
  });

  const handleOpenAuditModal = (op: SalesOperation) => {
    setSelectedOpForAudit(op);
    setAuditStatus(op.scoring_status);
    setAuditNotes(op.scoring_notes || '');
    setAuditReasons(op.scoring_rejection_reasons || []);
    setAuditFeedback(null);
  };

  const handleSaveAudit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOpForAudit) return;

    if (auditStatus === 'rejected' && auditReasons.length === 0) {
      setAuditFeedback('Para rechazar el scoring, debe seleccionar al menos un motivo.');
      return;
    }

    const res = auditScoring(selectedOpForAudit.id, auditStatus, auditNotes, auditReasons);
    setAuditFeedback(res.message);
    setTimeout(() => {
      setSelectedOpForAudit(null);
      setAuditFeedback(null);
    }, 1200);
  };

  const handleCreateOperation = (e: React.FormEvent) => {
    e.preventDefault();
    const seller = sellers.find(s => s.id === newOpForm.seller_id);
    const teamId = seller?.team_id || 'team-1';

    const opPayload: Omit<SalesOperation, 'id' | 'status' | 'scoring_status'> = {
      date: new Date().toISOString().slice(0, 10),
      client_name: newOpForm.client_name,
      client_dni: newOpForm.client_dni,
      client_phone: newOpForm.client_phone,
      subscription_number: newOpForm.subscription_number || `SUB-${newOpForm.brand.slice(0, 4).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`,
      brand: newOpForm.brand,
      model: newOpForm.model,
      plan_type: newOpForm.plan_type,
      cuota_1_value: newOpForm.cuota_1_value,
      total_collected: newOpForm.total_collected,
      factory_account: newOpForm.factory_account,
      used_car_flag: newOpForm.used_car_flag,
      used_car_details: newOpForm.used_car_flag
        ? {
            make: newOpForm.used_car_make,
            model: newOpForm.used_car_model,
            year: newOpForm.used_car_year,
            kilometers: newOpForm.used_car_km,
            appraisal_value: newOpForm.used_car_appraisal,
            inspection_notes: 'Tasación peritada preliminar en concesionaria.',
            license_plate: newOpForm.used_car_plate,
          }
        : undefined,
      seller_id: newOpForm.seller_id,
      team_id: teamId,
      lead_source: newOpForm.lead_source,
    };

    addOperation(opPayload);
    setShowNewOpModal(false);
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Banner & Business Rule Callout */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-400">
            <FileCheck2 className="w-4 h-4" />
            <span>Control Operativo & Auditoría Administrativa</span>
          </div>
          <h2 className="text-xl font-bold text-white mt-1">
            Registro de Operaciones & Control de Scoring
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            <strong className="text-amber-400">Regla estricta de Fábrica:</strong> Un contrato solo puede avanzar a "Apto Presentación a Fábrica" si el llamado de Scoring figura como <strong className="text-emerald-400">APROBADO</strong>.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowNewOpModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-blue-600/20 transition-all"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Cargar Nueva Venta</span>
          </button>
        </div>
      </div>

      {/* 2. Search & Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Buscar por cliente, DNI o suscripción..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-3">
          <select
            value={filterBrand}
            onChange={e => setFilterBrand(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-slate-300 rounded-lg px-3 py-2 focus:outline-none"
          >
            <option value="all">Todas las Marcas</option>
            <option value="Peugeot">Peugeot</option>
            <option value="Fiat">Fiat</option>
            <option value="Renault">Renault</option>
            <option value="Jeep">Jeep</option>
            <option value="Citroën">Citroën</option>
            <option value="Leapmotor">Leapmotor</option>
          </select>

          <select
            value={filterScoring}
            onChange={e => setFilterScoring(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-slate-300 rounded-lg px-3 py-2 focus:outline-none"
          >
            <option value="all">Todos los Scorings</option>
            <option value="approved">Aprobados (Aptos)</option>
            <option value="pending">Pendientes de Calidad</option>
            <option value="rejected">Rechazados (Bloqueados)</option>
          </select>
        </div>
      </div>

      {/* 3. Operations Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 text-slate-400 font-semibold border-b border-slate-800 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">Fecha / Contrato</th>
                <th className="py-3 px-4">Cliente / Contacto</th>
                <th className="py-3 px-4">Vehículo & Plan</th>
                <th className="py-3 px-4">Vendedor & Equipo</th>
                <th className="py-3 px-4 text-right">Cuota 1 / Cobrado</th>
                <th className="py-3 px-4 text-center">Usado en Pago</th>
                <th className="py-3 px-4 text-center">Auditoría Scoring</th>
                <th className="py-3 px-4 text-center">Apto Fábrica</th>
                <th className="py-3 px-4 text-right">Acción Auditoría</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredOperations.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center">
                    <FileCheck2 className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <div className="text-slate-300 font-semibold text-sm">
                      Sin operaciones registradas en el período
                    </div>
                    <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
                      Las ventas se extraen automáticamente de la base de datos PostgreSQL/Supabase o pueden registrarse manualmente mediante el botón de carga.
                    </p>
                    <button
                      onClick={() => setShowNewOpModal(true)}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-blue-600/20"
                    >
                      Cargar Primera Operación
                    </button>
                  </td>
                </tr>
              ) : (
                filteredOperations.map(op => {
                  const seller = sellers.find(s => s.id === op.seller_id);
                  const team = teams.find(t => t.id === op.team_id);
                  const isApproved = op.scoring_status === 'approved';
                  const isPending = op.scoring_status === 'pending';
                  const isRejected = op.scoring_status === 'rejected';
                  const aptoFabrica = canPresentToFactory(op.scoring_status);

                  return (
                    <tr key={op.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-mono font-semibold text-white">
                          {op.subscription_number}
                        </div>
                        <div className="text-[11px] text-slate-400">{op.date}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-200">{op.client_name}</div>
                        <div className="text-[11px] text-slate-400">
                          DNI {op.client_dni} · {op.client_phone}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-white">
                          {op.brand} {op.model}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Plan {op.plan_type} · Lead: {op.lead_source}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-slate-200 font-medium">{seller?.name || 'Vendedor'}</div>
                        <div className="text-[11px] text-slate-400">{team?.name.split('(')[0]}</div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="font-mono font-semibold text-white">
                          {formatARS(op.cuota_1_value)}
                        </div>
                        <div className="text-[11px] font-mono text-emerald-400">
                          Total {formatARS(op.total_collected)}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {op.used_car_flag && op.used_car_details ? (
                          <div
                            className="inline-flex items-center gap-1 text-[11px] text-blue-400 font-medium cursor-help"
                            title={`${op.used_car_details.make} ${op.used_car_details.model} (${op.used_car_details.year}) - Tasación: ${formatARS(op.used_car_details.appraisal_value)}`}
                          >
                            <Car className="w-3.5 h-3.5" />
                            <span>{op.used_car_details.model}</span>
                          </div>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
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
                            <PhoneCall className="w-3.5 h-3.5" />
                            <span>Pendiente llamado</span>
                          </div>
                        )}
                        {isRejected && (
                          <div
                            className="inline-flex items-center gap-1 text-[11px] text-red-400 font-medium cursor-help"
                            title={op.scoring_rejection_reasons?.join(' | ') || 'Inconsistencias'}
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Rechazado</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {aptoFabrica ? (
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800 text-[11px] font-semibold text-emerald-300">
                            <Unlock className="w-3 h-3" />
                            <span>Apto Fábrica</span>
                          </div>
                        ) : (
                          <div
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-950/40 border border-red-900/60 text-[11px] font-medium text-red-300 cursor-help"
                            title="Bloqueado: El contrato requiere Scoring APROBADO por Administración para enviarse a fábrica."
                          >
                            <Lock className="w-3 h-3 text-red-400" />
                            <span>Bloqueado</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleOpenAuditModal(op)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-xs transition-colors"
                        >
                          Auditar Scoring
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Audit Scoring (Quality Call) */}
      {selectedOpForAudit && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <PhoneCall className="w-4 h-4 text-blue-400" />
                  <span>Auditoría de Scoring & Calidad de Venta</span>
                </h3>
                <p className="text-xs text-slate-400">
                  {selectedOpForAudit.client_name} · Contrato {selectedOpForAudit.subscription_number}
                </p>
              </div>
              <button
                onClick={() => setSelectedOpForAudit(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {auditFeedback && (
              <div
                className={`mt-3 p-3 rounded text-xs ${
                  auditStatus === 'approved'
                    ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-200'
                    : 'bg-red-950/60 border border-red-800 text-red-200'
                }`}
              >
                {auditFeedback}
              </div>
            )}

            <form onSubmit={handleSaveAudit} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Dictamen de Scoring Administrativo
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAuditStatus('approved');
                      setAuditReasons([]);
                    }}
                    className={`py-2 px-3 rounded-lg border text-center font-medium transition-colors ${
                      auditStatus === 'approved'
                        ? 'bg-emerald-900/40 border-emerald-500 text-emerald-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    Aprobar (Habilita Fábrica)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuditStatus('pending')}
                    className={`py-2 px-3 rounded-lg border text-center font-medium transition-colors ${
                      auditStatus === 'pending'
                        ? 'bg-amber-900/40 border-amber-500 text-amber-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    Pendiente Llamado
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuditStatus('rejected')}
                    className={`py-2 px-3 rounded-lg border text-center font-medium transition-colors ${
                      auditStatus === 'rejected'
                        ? 'bg-red-900/40 border-red-500 text-red-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    Rechazar (Bloquea)
                  </button>
                </div>
              </div>

              {/* Reasons if rejected */}
              {auditStatus === 'rejected' && (
                <div className="p-3 bg-red-950/30 border border-red-900/60 rounded-lg space-y-2">
                  <label className="block text-red-300 font-semibold">
                    Motivos de Rechazo / Inconsistencias Detectadas:
                  </label>
                  {[
                    'Inconsistencia en la propuesta comercial (promesa de cuota fija)',
                    'Dudas del cliente sobre alícuota pura vs gastos administrativos',
                    'Falta de capacidad económica o Veraz negativo crítico',
                    'Disconformidad con plazos de entrega pactados',
                    'Diferencias en tasación peritada de usado',
                  ].map(reason => {
                    const checked = auditReasons.includes(reason);
                    return (
                      <label key={reason} className="flex items-start gap-2 text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => {
                            if (e.target.checked) {
                              setAuditReasons(prev => [...prev, reason]);
                            } else {
                              setAuditReasons(prev => prev.filter(r => r !== reason));
                            }
                          }}
                          className="mt-0.5 rounded border-slate-700 text-red-600 focus:ring-0"
                        />
                        <span>{reason}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Notas del Llamado de Calidad / Auditoría
                </label>
                <textarea
                  rows={3}
                  value={auditNotes}
                  onChange={e => setAuditNotes(e.target.value)}
                  placeholder="Detallar respuestas del cliente sobre cuota, gastos de retiro, plazos de licitación y confirmación de dinero abonado..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                <div className="text-[11px] text-slate-500">
                  {auditStatus === 'approved' ? (
                    <span className="text-emerald-400">✓ Pasará a "Apto Presentación a Fábrica"</span>
                  ) : (
                    <span className="text-red-400">⚠ Bloqueará presentación a Fábrica</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedOpForAudit(null)}
                    className="px-3.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                  >
                    Cerrar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium"
                  >
                    Guardar Auditoría
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: New Operation */}
      {showNewOpModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <PlusCircle className="w-4 h-4 text-blue-400" />
                  <span>Registrar Nueva Operación de Venta</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Carga de suscripción comercial para posterior auditoría de scoring
                </p>
              </div>
              <button
                onClick={() => setShowNewOpModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateOperation} className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Nombre Completo del Cliente</label>
                  <input
                    type="text"
                    required
                    value={newOpForm.client_name}
                    onChange={e => setNewOpForm({ ...newOpForm, client_name: e.target.value })}
                    placeholder="Ej. Lucas Daniel Morales"
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">DNI del Titular</label>
                  <input
                    type="text"
                    required
                    value={newOpForm.client_dni}
                    onChange={e => setNewOpForm({ ...newOpForm, client_dni: e.target.value })}
                    placeholder="Ej. 35.889.012"
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Teléfono / WhatsApp</label>
                  <input
                    type="text"
                    required
                    value={newOpForm.client_phone}
                    onChange={e => setNewOpForm({ ...newOpForm, client_phone: e.target.value })}
                    placeholder="11-4567-8901"
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Vendedor a Cargo</label>
                  <select
                    value={newOpForm.seller_id}
                    onChange={e => setNewOpForm({ ...newOpForm, seller_id: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200"
                  >
                    {sellers.filter(s => s.active).map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Marca</label>
                  <select
                    value={newOpForm.brand}
                    onChange={e => setNewOpForm({ ...newOpForm, brand: e.target.value as BrandType })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200"
                  >
                    <option value="Peugeot">Peugeot</option>
                    <option value="Fiat">Fiat</option>
                    <option value="Renault">Renault</option>
                    <option value="Jeep">Jeep</option>
                    <option value="Citroën">Citroën</option>
                    <option value="Leapmotor">Leapmotor</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Modelo</label>
                  <input
                    type="text"
                    required
                    value={newOpForm.model}
                    onChange={e => setNewOpForm({ ...newOpForm, model: e.target.value })}
                    placeholder="Ej. 208 Active 1.6"
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Tipo de Plan</label>
                  <select
                    value={newOpForm.plan_type}
                    onChange={e => setNewOpForm({ ...newOpForm, plan_type: e.target.value as PlanType })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200"
                  >
                    <option value="80/20">80/20</option>
                    <option value="70/30">70/30</option>
                    <option value="100%">100%</option>
                    <option value="60/40">60/40</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Valor Cuota 1 ($ARS)</label>
                  <input
                    type="number"
                    required
                    value={newOpForm.cuota_1_value}
                    onChange={e => setNewOpForm({ ...newOpForm, cuota_1_value: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Total Cobrado (Cuota 1 + Seña / Sobrepauta)</label>
                  <input
                    type="number"
                    required
                    value={newOpForm.total_collected}
                    onChange={e => setNewOpForm({ ...newOpForm, total_collected: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 font-mono"
                  />
                </div>
              </div>

              {/* Usado como parte de pago toggle */}
              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg">
                <label className="flex items-center gap-2 cursor-pointer text-slate-200 font-medium">
                  <input
                    type="checkbox"
                    checked={newOpForm.used_car_flag}
                    onChange={e => setNewOpForm({ ...newOpForm, used_car_flag: e.target.checked })}
                    className="rounded border-slate-700 text-blue-600 focus:ring-0"
                  />
                  <span>Toma de Vehículo Usado como parte de pago (Con Peritaje)</span>
                </label>

                {newOpForm.used_car_flag && (
                  <div className="mt-3 grid grid-cols-3 gap-2.5 pt-2 border-t border-slate-800">
                    <div>
                      <label className="block text-slate-400 text-[11px] mb-0.5">Marca Usado</label>
                      <input
                        type="text"
                        value={newOpForm.used_car_make}
                        onChange={e => setNewOpForm({ ...newOpForm, used_car_make: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 text-[11px] mb-0.5">Modelo</label>
                      <input
                        type="text"
                        value={newOpForm.used_car_model}
                        onChange={e => setNewOpForm({ ...newOpForm, used_car_model: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 text-[11px] mb-0.5">Año</label>
                      <input
                        type="number"
                        value={newOpForm.used_car_year}
                        onChange={e => setNewOpForm({ ...newOpForm, used_car_year: Number(e.target.value) })}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 text-[11px] mb-0.5">Kilometraje</label>
                      <input
                        type="number"
                        value={newOpForm.used_car_km}
                        onChange={e => setNewOpForm({ ...newOpForm, used_car_km: Number(e.target.value) })}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 text-[11px] mb-0.5">Tasación Concesionaria ($)</label>
                      <input
                        type="number"
                        value={newOpForm.used_car_appraisal}
                        onChange={e => setNewOpForm({ ...newOpForm, used_car_appraisal: Number(e.target.value) })}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 text-[11px] mb-0.5">Patente</label>
                      <input
                        type="text"
                        value={newOpForm.used_car_plate}
                        onChange={e => setNewOpForm({ ...newOpForm, used_car_plate: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowNewOpModal(false)}
                  className="px-3.5 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-md shadow-blue-600/20"
                >
                  Registrar Venta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
