import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  PieChart,
  UploadCloud,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  User,
  Layers,
  Search,
  Filter,
  DollarSign,
} from 'lucide-react';
import { CarteraMora } from '../../types';
import { formatARS } from '../../utils/businessLogic';

export const CarteraMoraModule: React.FC = () => {
  const { carteraMora, sellers, teams, importCarteraBatch, selectedTeamId, currentUser } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterGrouping, setFilterGrouping] = useState<string>('all');
  const [importNotice, setImportNotice] = useState<string | null>(null);

  // Filter cartera records
  const filteredRecords = carteraMora.filter(record => {
    if (selectedTeamId !== 'all' && record.team_id !== selectedTeamId) return false;
    if (currentUser.role === 'supervisor' && currentUser.team_id && record.team_id !== currentUser.team_id) {
      return false;
    }
    if (filterStatus !== 'all' && record.plan_status !== filterStatus) return false;
    if (filterGrouping !== 'all' && record.grouping_status !== filterGrouping) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (
        record.client_name.toLowerCase().includes(q) ||
        record.subscription_number.toLowerCase().includes(q) ||
        record.brand.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Calculate totals
  const totalDebt = filteredRecords.reduce((sum, r) => sum + r.total_debt, 0);
  const alDiaCount = filteredRecords.filter(r => r.plan_status === 'Al Día').length;
  const moraLeveCount = filteredRecords.filter(r => r.plan_status === 'Mora Leve (1-2)').length;
  const moraSeveraCount = filteredRecords.filter(r => r.plan_status === 'Mora Severa (3+)').length;

  // Simulate bulk import
  const handleSimulateImport = () => {
    const sampleImportBatch: CarteraMora[] = [
      {
        id: `cm-${Date.now()}-1`,
        operation_id: 'op-batch-01',
        subscription_number: 'SUB-FIAT-9912',
        client_name: 'Santiago Andrés Leguizamón',
        seller_id: 'seller-6',
        team_id: 'team-2',
        brand: 'Fiat',
        model: 'Cronos Drive',
        grouping_status: 'Agrupado',
        group_number: 'GRP-9901',
        order_number: 'ORD-022',
        overdue_installments: 0,
        total_debt: 0,
        plan_status: 'Al Día',
        last_payment_date: '2026-10-18',
      },
      {
        id: `cm-${Date.now()}-2`,
        operation_id: 'op-batch-02',
        subscription_number: 'SUB-PEUG-5541',
        client_name: 'Clara Elena Valenzuela',
        seller_id: 'seller-1',
        team_id: 'team-1',
        brand: 'Peugeot',
        model: '2008 Allure',
        grouping_status: 'Agrupado',
        group_number: 'GRP-9012',
        order_number: 'ORD-077',
        overdue_installments: 2,
        total_debt: 660000,
        plan_status: 'Mora Leve (1-2)',
        last_payment_date: '2026-08-20',
      },
    ];

    importCarteraBatch(sampleImportBatch);
    setImportNotice(`Se importaron exitosamente ${sampleImportBatch.length} contratos desde informe bancario de Fábrica.`);
    setTimeout(() => setImportNotice(null), 3000);
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-400">
            <PieChart className="w-4 h-4" />
            <span>Auditoría de Cartera, Agrupamiento & Calidad de Cobranza</span>
          </div>
          <h2 className="text-xl font-bold text-white mt-1">
            Control de Agrupamiento & Trazabilidad de Mora
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Trazabilidad directa: la mora de cada plan se asocia al vendedor y al equipo original para evaluar la calidad de venta y permanencia.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSimulateImport}
            className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-emerald-600/20 transition-all"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Importar CSV / Excel de Fábrica</span>
          </button>
        </div>
      </div>

      {importNotice && (
        <div className="p-3 bg-emerald-950/60 border border-emerald-800 rounded-lg text-xs text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{importNotice}</span>
        </div>
      )}

      {/* 2. KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400">Planes en Cartera Auditada</div>
          <div className="text-2xl font-bold text-white font-mono mt-1">{filteredRecords.length}</div>
          <div className="text-[11px] text-slate-500 mt-1">Contratos suscriptos</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400">Planes Al Día (Cobranza Normal)</div>
          <div className="text-2xl font-bold text-emerald-400 font-mono mt-1">{alDiaCount}</div>
          <div className="text-[11px] text-slate-400 mt-1">
            Salud: <span className="font-mono text-emerald-400 font-semibold">{Math.round((alDiaCount / Math.max(1, filteredRecords.length)) * 100)}%</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400">Mora Leve (1 a 2 cuotas)</div>
          <div className="text-2xl font-bold text-amber-400 font-mono mt-1">{moraLeveCount}</div>
          <div className="text-[11px] text-slate-500 mt-1">En gestión de recupero</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400">Mora Crítica (3+ cuotas)</div>
          <div className="text-2xl font-bold text-red-400 font-mono mt-1">{moraSeveraCount}</div>
          <div className="text-[11px] text-red-400 font-mono mt-1 font-semibold">
            Deuda: {formatARS(totalDebt)}
          </div>
        </div>
      </div>

      {/* 3. Search & Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Buscar por cliente, contrato o marca..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-3">
          <select
            value={filterGrouping}
            onChange={e => setFilterGrouping(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-slate-300 rounded-lg px-3 py-2 focus:outline-none"
          >
            <option value="all">Todos los Agrupamientos</option>
            <option value="Agrupado">Agrupado (Grupo y Orden)</option>
            <option value="En Formación">En Formación</option>
            <option value="Licitación">En Licitación</option>
            <option value="Adjudicado">Adjudicado</option>
          </select>

          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-slate-300 rounded-lg px-3 py-2 focus:outline-none"
          >
            <option value="all">Todos los Estados de Mora</option>
            <option value="Al Día">Al Día</option>
            <option value="Mora Leve (1-2)">Mora Leve (1-2)</option>
            <option value="Mora Severa (3+)">Mora Severa (3+)</option>
          </select>
        </div>
      </div>

      {/* 4. Cartera & Mora Table with Seller Traceability */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 text-slate-400 font-semibold border-b border-slate-800 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">Contrato & Agrupamiento</th>
                <th className="py-3 px-4">Titular del Plan</th>
                <th className="py-3 px-4">Vehículo</th>
                <th className="py-3 px-4">Vendedor Origen (Trazabilidad)</th>
                <th className="py-3 px-4">Equipo</th>
                <th className="py-3 px-4 text-center">Cuotas Vencidas</th>
                <th className="py-3 px-4 text-right">Deuda Total</th>
                <th className="py-3 px-4 text-center">Estado de Cobranza</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500 text-xs">
                    <PieChart className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <div className="text-slate-300 font-semibold text-sm">
                      Sin contratos de cartera o mora cargados
                    </div>
                    <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
                      Importe un archivo Excel / CSV de Fábrica o conecte su base de datos para sincronizar el estado de agrupamiento y cuotas impagas.
                    </p>
                    <button
                      onClick={handleSimulateImport}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-emerald-600/20"
                    >
                      Importar Archivo de Fábrica
                    </button>
                  </td>
                </tr>
              ) : (
                filteredRecords.map(record => {
                const seller = sellers.find(s => s.id === record.seller_id);
                const team = teams.find(t => t.id === record.team_id);
                const isAlDia = record.plan_status === 'Al Día';
                const isSevera = record.plan_status === 'Mora Severa (3+)';

                return (
                  <tr key={record.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-mono font-semibold text-white">
                        {record.subscription_number}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {record.grouping_status} · {record.group_number}/{record.order_number}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-200">{record.client_name}</div>
                      <div className="text-[11px] text-slate-500">Último pago: {record.last_payment_date}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-300">
                      {record.brand} {record.model}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-white flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-blue-400" />
                        <span>{seller?.name || 'Vendedor'}</span>
                      </div>
                      <div className="text-[10px] text-slate-500">DNI {seller?.dni}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-300">
                      {team?.name.split('(')[0]}
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold">
                      <span className={isAlDia ? 'text-emerald-400' : isSevera ? 'text-red-400' : 'text-amber-400'}>
                        {record.overdue_installments}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-white">
                      {record.total_debt > 0 ? formatARS(record.total_debt) : '—'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded text-[11px] font-semibold border ${
                          isAlDia
                            ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                            : isSevera
                            ? 'bg-red-950/60 border-red-800 text-red-300'
                            : 'bg-amber-950/60 border-amber-800 text-amber-300'
                        }`}
                      >
                        {record.plan_status}
                      </span>
                    </td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
