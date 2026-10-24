import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  TrendingUp,
  Target,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Sparkles,
  UserX,
  UserCheck,
  Edit2,
  ChevronRight,
  Flame,
  Award,
  Layers,
  ArrowUpRight,
  Lightbulb,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Line,
  ComposedChart,
  CartesianGrid,
} from 'recharts';
import { formatARS } from '../../utils/businessLogic';

export const PacingDashboard: React.FC<{ onOpenCalendarConfig: () => void }> = ({
  onOpenCalendarConfig,
}) => {
  const {
    currentUser,
    teams,
    sellers,
    operations,
    monthlyConfig,
    teamMetrics,
    workingDaysInfo,
    overallPacing,
    sellersAtZero,
    sellersAtOne,
    sellersAtTwoPlus,
    salesBySeller,
    updateSellerTarget,
    updateTeamTargetOverride,
    selectedTeamId,
    recommendations,
  } = useApp();

  const [editingSellerId, setEditingSellerId] = useState<string | null>(null);
  const [editingTargetValue, setEditingTargetValue] = useState<number>(4);
  const [activeTabRecom, setActiveTabRecom] = useState<'all' | 'tactical' | 'executive'>('all');

  // Filter metrics based on selected team
  const filteredTeamMetrics =
    selectedTeamId === 'all'
      ? teamMetrics
      : teamMetrics.filter(tm => tm.team.id === selectedTeamId);

  // Active sellers filtered
  const filteredSellers =
    selectedTeamId === 'all'
      ? sellers.filter(s => s.active)
      : sellers.filter(s => s.active && s.team_id === selectedTeamId);

  // Zeros and Ones filtered
  const filteredZeros = sellersAtZero.filter(
    s => selectedTeamId === 'all' || s.team_id === selectedTeamId
  );
  const filteredOnes = sellersAtOne.filter(
    s => selectedTeamId === 'all' || s.team_id === selectedTeamId
  );

  // Chart data for teams
  const teamChartData = teamMetrics.map(tm => ({
    name: tm.team.name.split('(')[0].trim(),
    Ventas: tm.currentSales,
    Objetivo: tm.teamTarget,
    Proyección: tm.pacing.projectedSales,
  }));

  // Brand sales breakdown
  const brandSales: Record<string, number> = {
    Peugeot: 0,
    Fiat: 0,
    Renault: 0,
    Jeep: 0,
    Citroën: 0,
    Leapmotor: 0,
  };
  operations.forEach(op => {
    if (op.status !== 'caido' && brandSales[op.brand] !== undefined) {
      if (selectedTeamId === 'all' || op.team_id === selectedTeamId) {
        brandSales[op.brand]++;
      }
    }
  });

  const brandChartData = Object.entries(brandSales).map(([brand, count]) => ({
    brand,
    ventas: count,
  }));

  // Filter recommendations by role and audience
  const relevantRecommendations = recommendations.filter(rec => {
    if (activeTabRecom === 'tactical' && rec.audience !== 'supervisor') return false;
    if (activeTabRecom === 'executive' && rec.audience !== 'gerente') return false;
    if (currentUser.role === 'supervisor' && rec.target_team_id && rec.target_team_id !== currentUser.team_id) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* 1. Header Banner: Calendario Comercial Flexible */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-400">
            <Calendar className="w-4 h-4" />
            <span>Calendario Comercial Operativo · {monthlyConfig.month_name}</span>
          </div>
          <h2 className="text-xl font-bold text-white mt-1">
            Tablero de Pacing & Ritmo Comercial
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Jornada laboral: Lunes a Sábados (Domingos inhábiles) · {workingDaysInfo.elapsedWorkingDays} de {workingDaysInfo.totalWorkingDays} días laborables transcurridos ({Math.round(workingDaysInfo.completionRate * 100)}%).
          </p>
        </div>

        {/* Calendar progress visual */}
        <div className="flex items-center gap-4 bg-slate-950/60 p-3 rounded-lg border border-slate-800/80 shrink-0">
          <div className="text-right">
            <div className="text-[11px] text-slate-400">Días Restantes</div>
            <div className="text-lg font-bold font-mono text-emerald-400">
              {workingDaysInfo.remainingWorkingDays} días
            </div>
          </div>
          <div className="w-24 bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className="bg-blue-500 h-full rounded-full transition-all"
              style={{ width: `${Math.round(workingDaysInfo.completionRate * 100)}%` }}
            />
          </div>
          {(currentUser.role === 'admin' || currentUser.role === 'gerente') && (
            <button
              onClick={onOpenCalendarConfig}
              className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded transition-colors"
            >
              Configurar Fechas
            </button>
          )}
        </div>
      </div>

      {/* 2. Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Ventas Actuales vs Objetivo */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Ventas Acumuladas</span>
            <Target className="w-4 h-4 text-blue-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white font-mono">
              {selectedTeamId === 'all'
                ? operations.filter(op => op.status !== 'caido').length
                : operations.filter(op => op.team_id === selectedTeamId && op.status !== 'caido').length}
            </span>
            <span className="text-xs text-slate-400 font-mono">
              / meta{' '}
              {filteredTeamMetrics.reduce((sum, tm) => sum + tm.teamTarget, 0)} u.
            </span>
          </div>
          <div className="mt-3 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Cumplimiento Actual</span>
            <span className="font-mono font-semibold text-blue-400">
              {overallPacing.targetAchievementPct}%
            </span>
          </div>
        </div>

        {/* Card 2: Proyección Cierre de Mes */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Proyección Cierre</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-400 font-mono">
              {overallPacing.projectedSales} u.
            </span>
            <span className="text-xs text-slate-400">
              ritmo {overallPacing.dailyPace} vtas/día
            </span>
          </div>
          <div className="mt-3 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Ritmo necesario restante</span>
            <span className="font-mono font-semibold text-amber-400">
              {overallPacing.requiredDailyPace} vtas/día
            </span>
          </div>
        </div>

        {/* Card 3: Vendedores en 0 Ventas (Critical Indicator) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Vendedores en 0 Ventas</span>
            <UserX className="w-4 h-4 text-red-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-red-400 font-mono">
              {filteredZeros.length}
            </span>
            <span className="text-xs text-slate-400">
              de {filteredSellers.length} vendedores
            </span>
          </div>
          <div className="mt-3 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Riesgo comercial</span>
            <span className="font-semibold text-red-400">
              {Math.round((filteredZeros.length / Math.max(1, filteredSellers.length)) * 100)}% en cero
            </span>
          </div>
        </div>

        {/* Card 4: Vendedores en 1 Venta */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Vendedores en 1 Venta</span>
            <Flame className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-amber-400 font-mono">
              {filteredOnes.length}
            </span>
            <span className="text-xs text-slate-400">en umbral de despegue</span>
          </div>
          <div className="mt-3 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Con 2+ ventas (aptos adelanto)</span>
            <span className="font-mono font-semibold text-emerald-400">
              {sellersAtTwoPlus.filter(s => selectedTeamId === 'all' || s.team_id === selectedTeamId).length}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Dynamic Team Target & Pacing Matrix */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-400" />
              <span>Matriz Dinámica de Objetivos y Ritmo por Equipo</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Fórmula reglamentaria: <span className="font-mono text-blue-300">Objetivo Equipo = Max(15, {monthlyConfig.default_team_target_per_seller} * Vendedores Activos)</span>
            </p>
          </div>
          <div className="text-xs text-slate-400">
            {currentUser.role === 'gerente' || currentUser.role === 'admin' ? (
              <span className="text-blue-400 font-medium">Gerencia: Objetivos editables</span>
            ) : (
              <span className="text-slate-400">Supervisión: Vista táctica asignada</span>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 text-slate-400 font-semibold border-b border-slate-800 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">Equipo / Marca</th>
                <th className="py-3 px-4">Supervisor a Cargo</th>
                <th className="py-3 px-4 text-center">Vendedores Activos</th>
                <th className="py-3 px-4 text-right">Objetivo Ideal</th>
                <th className="py-3 px-4 text-right">Ventas Actuales</th>
                <th className="py-3 px-4 text-right">Proyección</th>
                <th className="py-3 px-4 text-center">En 0 / En 1</th>
                <th className="py-3 px-4 text-right">Pacing %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredTeamMetrics.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500 text-xs">
                    No hay equipos registrados. Conecte su base de datos o extraiga la nómina desde el módulo de Bases de Datos & ETL.
                  </td>
                </tr>
              ) : (
                filteredTeamMetrics.map(tm => {
                  const isOverperforming = tm.pacing.pacingIndexPct >= 100;
                  return (
                    <tr key={tm.team.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-white">{tm.team.name}</div>
                        <div className="text-[11px] text-slate-400">{tm.team.branch}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-300">
                        {tm.team.supervisor_name}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-medium text-slate-200">
                        {tm.activeSellersCount}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-white">
                        {tm.teamTarget} u.
                        {tm.team.target_override && (
                          <span className="text-[10px] text-amber-400 ml-1">(override)</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-blue-400">
                        {tm.currentSales} u.
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-medium text-emerald-400">
                        {tm.pacing.projectedSales} u.
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="text-red-400 font-mono font-bold">{tm.sellersAtZeroCount}</span>
                        <span className="text-slate-600 mx-1">/</span>
                        <span className="text-amber-400 font-mono font-bold">{tm.sellersAtOneCount}</span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span
                          className={`inline-block font-mono font-bold ${
                            isOverperforming ? 'text-emerald-400' : 'text-amber-400'
                          }`}
                        >
                          {tm.pacing.pacingIndexPct}%
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Interactive Pacing Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart 1: Team Pacing Comparison */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-white">
                Rendimiento Comercial vs. Meta por Equipo
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Ventas actuales, proyección de cierre y objetivo ideal
              </p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={teamChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#f8fafc',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar dataKey="Ventas" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Proyección" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Objetivo" fill="#64748b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Brand Distribution */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-bold text-white">
            Ventas por Marca Oficial
          </h3>
          <p className="text-xs text-slate-400 mt-0.5 mb-4">
            Distribución de operaciones del mes
          </p>
          <div className="space-y-3">
            {brandChartData.map(item => {
              const totalVentas = operations.filter(op => op.status !== 'caido').length;
              const pct = totalVentas > 0 ? Math.round((item.ventas / totalVentas) * 100) : 0;
              return (
                <div key={item.brand} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-slate-300">{item.brand}</span>
                    <span className="font-mono text-slate-400">
                      {item.ventas} u. ({pct}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-blue-500 h-full rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 5. Individual Sellers Management (Audited Entity) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-emerald-400" />
              <span>Nómina de Vendedores Auditados & Asignación de Objetivos</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Supervisores pueden fijar y ajustar la meta individual mensual de cada vendedor.
            </p>
          </div>
          <div className="text-xs text-slate-400">
            Total Vendedores Activos: <span className="font-mono font-bold text-white">{filteredSellers.length}</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 text-slate-400 font-semibold border-b border-slate-800 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">Vendedor</th>
                <th className="py-3 px-4">Equipo</th>
                <th className="py-3 px-4 text-center">Ventas Cerradas</th>
                <th className="py-3 px-4 text-center">Objetivo Individual</th>
                <th className="py-3 px-4 text-center">Estado Pacing</th>
                <th className="py-3 px-4 text-center">Elegibilidad Adelanto</th>
                <th className="py-3 px-4 text-right">Acción Supervisor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredSellers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500 text-xs">
                    No hay vendedores activos registrados. Sincronice con su base de datos relacional para cargar la nómina de asesores.
                  </td>
                </tr>
              ) : (
                filteredSellers.map(seller => {
                const count = salesBySeller[seller.id] || 0;
                const target = seller.individual_target || 4;
                const team = teams.find(t => t.id === seller.team_id);
                const isZero = count === 0;
                const isOne = count === 1;
                const isEligibleAdvance = count >= monthlyConfig.min_sales_for_advance;

                return (
                  <tr key={seller.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-white">{seller.name}</div>
                      <div className="text-[11px] text-slate-400">
                        DNI {seller.dni} · Alta {seller.hire_date}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-300">
                      {team?.name.split('(')[0] || 'Equipo'}
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold">
                      <span
                        className={
                          isZero
                            ? 'text-red-400'
                            : isOne
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        }
                      >
                        {count} vtas
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {editingSellerId === seller.id ? (
                        <div className="inline-flex items-center gap-1.5">
                          <input
                            type="number"
                            min="1"
                            max="20"
                            aria-label={`Objetivo de ventas para ${seller.name}`}
                            value={editingTargetValue}
                            onChange={e => setEditingTargetValue(Number(e.target.value))}
                            className="w-14 bg-slate-950 border border-blue-500 rounded px-1.5 py-0.5 text-xs text-center font-mono text-white"
                          />
                          <button
                            onClick={() => {
                              updateSellerTarget(seller.id, editingTargetValue);
                              setEditingSellerId(null);
                            }}
                            className="px-2 py-0.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-[11px]"
                          >
                            OK
                          </button>
                        </div>
                      ) : (
                        <span className="font-mono font-semibold text-slate-200">
                          {target} vtas
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {isZero ? (
                        <span className="text-[11px] font-medium text-red-400">
                          Alerta: En 0 ventas
                        </span>
                      ) : isOne ? (
                        <span className="text-[11px] font-medium text-amber-400">
                          1 venta (a 1 de meta inicial)
                        </span>
                      ) : (
                        <span className="text-[11px] font-medium text-emerald-400">
                          {Math.round((count / target) * 100)}% de objetivo
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {isEligibleAdvance ? (
                        <span className="text-[11px] font-medium text-emerald-400">
                          Apto Adelanto (≥2 vtas)
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-500">
                          No califica (&lt;2 vtas)
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {editingSellerId !== seller.id && (
                        <button
                          onClick={() => {
                            setEditingSellerId(seller.id);
                            setEditingTargetValue(target);
                          }}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs flex items-center gap-1 ml-auto transition-colors"
                        >
                          <Edit2 className="w-3 h-3 text-slate-400" />
                          <span>Ajustar Meta</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. Motor de Consejos y Recomendaciones Inteligentes (Solapa Adaptativa) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                Motor de Recomendaciones & Consejos Inteligentes
              </h3>
              <p className="text-xs text-slate-400">
                Algoritmo de optimización comercial adaptado según el rol ({currentUser.role.toUpperCase()})
              </p>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => setActiveTabRecom('all')}
              className={`px-3 py-1 rounded-md transition-colors ${
                activeTabRecom === 'all'
                  ? 'bg-slate-800 text-white font-medium'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Todos ({recommendations.length})
            </button>
            <button
              onClick={() => setActiveTabRecom('tactical')}
              className={`px-3 py-1 rounded-md transition-colors ${
                activeTabRecom === 'tactical'
                  ? 'bg-slate-800 text-white font-medium'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Tácticos (Supervisores)
            </button>
            <button
              onClick={() => setActiveTabRecom('executive')}
              className={`px-3 py-1 rounded-md transition-colors ${
                activeTabRecom === 'executive'
                  ? 'bg-slate-800 text-white font-medium'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Ejecutivos (Gerencia)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          {relevantRecommendations.map(rec => {
            const isCritical = rec.type === 'critical';
            const isWarning = rec.type === 'warning';
            return (
              <div
                key={rec.id}
                className="bg-slate-950/70 border border-slate-800 rounded-lg p-4 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400 mb-2">
                    <span className="font-medium text-blue-400">{rec.metric_tag}</span>
                    <span>
                      {rec.audience === 'supervisor'
                        ? 'Táctico'
                        : rec.audience === 'gerente'
                        ? 'Gerencial'
                        : 'Estratégico'}
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-white flex items-start gap-1.5">
                    <Lightbulb className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${isCritical ? 'text-red-400' : isWarning ? 'text-amber-400' : 'text-blue-400'}`} />
                    <span>{rec.title}</span>
                  </h4>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                    {rec.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800/80">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                    Acción recomendada
                  </div>
                  <div className="text-xs text-slate-200 mt-1 font-medium">
                    {rec.suggested_action}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
