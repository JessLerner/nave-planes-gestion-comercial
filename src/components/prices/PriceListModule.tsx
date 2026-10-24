import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Tag,
  Search,
  Filter,
  Car,
  FileSpreadsheet,
  Edit,
  Plus,
  ArrowUpDown,
  Sparkles,
  Calculator,
} from 'lucide-react';
import { PriceListItem, BrandType, PlanType } from '../../types';
import { formatARS } from '../../utils/businessLogic';

export const PriceListModule: React.FC = () => {
  const { priceLists, updatePriceListItem, addPriceListItem, currentUser } = useApp();

  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingItem, setEditingItem] = useState<PriceListItem | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Quick simulator state
  const [simItem, setSimItem] = useState<PriceListItem | null>(null);
  const [simAdvanceInstallments, setSimAdvanceInstallments] = useState<number>(10);

  const filteredItems = priceLists.filter(item => {
    if (selectedBrand !== 'all' && item.brand !== selectedBrand) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (
        item.model.toLowerCase().includes(q) ||
        item.version.toLowerCase().includes(q) ||
        item.brand.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const brandsList: BrandType[] = ['Peugeot', 'Fiat', 'Renault', 'Jeep', 'Citroën', 'Leapmotor'];

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-400">
            <Tag className="w-4 h-4" />
            <span>Listas de Precios Oficiales por Marca & Equipo</span>
          </div>
          <h2 className="text-xl font-bold text-white mt-1">
            Catálogo Comercial de Modelos & Alícuotas
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Valores oficiales de Cuota #1 con bonificación comercial, cuota pura fábrica y valor de lista para Peugeot, Fiat, Renault, Jeep, Citroën y Leapmotor.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {(currentUser.role === 'admin' || currentUser.role === 'gerente') && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-blue-600/20 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nuevo Modelo</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Brand Selector Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <button
          onClick={() => setSelectedBrand('all')}
          className={`px-3.5 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
            selectedBrand === 'all'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
              : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          Todas las Marcas ({priceLists.length})
        </button>
        {brandsList.map(brand => {
          const count = priceLists.filter(p => p.brand === brand).length;
          return (
            <button
              key={brand}
              onClick={() => setSelectedBrand(brand)}
              className={`px-3.5 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
                selectedBrand === brand
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {brand} ({count})
            </button>
          );
        })}
      </div>

      {/* 3. Price Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="relative w-72">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar por modelo o versión..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Sincronizado con Google Sheets Oficial</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 text-slate-400 font-semibold border-b border-slate-800 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">Marca & Modelo</th>
                <th className="py-3 px-4">Versión</th>
                <th className="py-3 px-4 text-center">Tipo Plan</th>
                <th className="py-3 px-4 text-right">Cuota 1 (Promocional)</th>
                <th className="py-3 px-4 text-right">Cuota Fábrica</th>
                <th className="py-3 px-4 text-right">Valor Vehículo</th>
                <th className="py-3 px-4 text-right">Bonificación</th>
                <th className="py-3 px-4 text-center">Simulador</th>
                {(currentUser.role === 'admin' || currentUser.role === 'gerente') && (
                  <th className="py-3 px-4 text-right">Acción</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500 text-xs">
                    <Tag className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <div className="text-slate-300 font-semibold text-sm">
                      Lista de precios sin modelos cargados
                    </div>
                    <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
                      Sincronice la planilla oficial de Google Sheets / PDF o cargue las versiones oficiales de fábrica.
                    </p>
                    {(currentUser.role === 'admin' || currentUser.role === 'gerente') && (
                      <button
                        onClick={() => setShowAddModal(true)}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-blue-600/20"
                      >
                        Cargar Primer Modelo
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredItems.map(item => (
                <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-bold text-white">{item.brand} {item.model}</div>
                    <div className="text-[10px] text-slate-500">Actualizado: {item.updated_at}</div>
                  </td>
                  <td className="py-3 px-4 text-slate-300 font-medium">
                    {item.version}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-200 text-[11px] font-semibold border border-slate-700">
                      {item.plan_type}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-blue-400">
                    {formatARS(item.cuota_1_value)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-300">
                    {formatARS(item.factory_quota_value)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-white font-medium">
                    {formatARS(item.car_value)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-emerald-400">
                    {formatARS(item.bonus_discount)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={() => setSimItem(item)}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs flex items-center gap-1 mx-auto transition-colors"
                    >
                      <Calculator className="w-3 h-3 text-blue-400" />
                      <span>Simular</span>
                    </button>
                  </td>
                  {(currentUser.role === 'admin' || currentUser.role === 'gerente') && (
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setEditingItem(item)}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
                      >
                        Editar
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Simulator Modal */}
      {simItem && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Calculator className="w-4 h-4 text-blue-400" />
                <span>Simulador de Adjudicación & Cancelación</span>
              </h3>
              <button onClick={() => setSimItem(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                <div className="font-bold text-white text-sm">{simItem.brand} {simItem.model}</div>
                <div className="text-slate-400 text-[11px]">{simItem.version} · Plan {simItem.plan_type}</div>
                <div className="mt-2 text-slate-300">
                  Valor de Unidad: <span className="font-mono text-white font-bold">{formatARS(simItem.car_value)}</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Cantidad de Cuotas Puras a Adelantar / Licitación:
                </label>
                <input
                  type="number"
                  min="1"
                  max="84"
                  value={simAdvanceInstallments}
                  onChange={e => setSimAdvanceInstallments(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-mono text-sm"
                />
              </div>

              <div className="p-4 bg-blue-950/40 border border-blue-800 rounded-lg space-y-2">
                <div className="flex justify-between text-slate-300">
                  <span>Monto Total de Licitación Estimado:</span>
                  <span className="font-mono font-bold text-white">
                    {formatARS(simItem.factory_quota_value * simAdvanceInstallments)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Ahorro en Gastos Administrativos:</span>
                  <span className="font-mono font-semibold text-emerald-400">
                    {formatARS((simItem.factory_quota_value * 0.12) * simAdvanceInstallments)}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 pt-1 border-t border-blue-900/60">
                  Alícuota pura directa aplicada al valor móvil de fábrica sin seguro de vida.
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setSimItem(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal (Admin/Gerente) */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">
              Editar Precios: {editingItem.brand} {editingItem.model}
            </h3>
            <p className="text-xs text-slate-400 mb-4">{editingItem.version}</p>

            <form
              onSubmit={e => {
                e.preventDefault();
                updatePriceListItem(editingItem);
                setEditingItem(null);
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="block text-slate-300 mb-1">Valor Cuota 1 ($)</label>
                <input
                  type="number"
                  value={editingItem.cuota_1_value}
                  onChange={e => setEditingItem({ ...editingItem, cuota_1_value: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-slate-200 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Valor Cuota Fábrica ($)</label>
                <input
                  type="number"
                  value={editingItem.factory_quota_value}
                  onChange={e => setEditingItem({ ...editingItem, factory_quota_value: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-slate-200 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Valor de Lista Vehículo ($)</label>
                <input
                  type="number"
                  value={editingItem.car_value}
                  onChange={e => setEditingItem({ ...editingItem, car_value: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-slate-200 font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-3 py-1.5 rounded bg-slate-800 text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Model Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-2">Cargar Nuevo Modelo Oficial</h3>
            <p className="text-xs text-slate-400 mb-4">Ingreso de modelo, versión y valores de cuota de lista oficial.</p>

            <form
              onSubmit={e => {
                e.preventDefault();
                const formEl = e.currentTarget;
                const fd = new FormData(formEl);
                addPriceListItem({
                  brand: fd.get('brand') as BrandType,
                  model: fd.get('model') as string,
                  version: fd.get('version') as string,
                  plan_type: fd.get('plan_type') as PlanType,
                  cuota_1_value: Number(fd.get('cuota_1_value')),
                  factory_quota_value: Number(fd.get('factory_quota_value')),
                  car_value: Number(fd.get('car_value')),
                  bonus_discount: Number(fd.get('bonus_discount')) || 0,
                  active: true,
                });
                setShowAddModal(false);
              }}
              className="space-y-3 text-xs"
            >
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-300 mb-1">Marca</label>
                  <select name="brand" className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200">
                    <option value="Peugeot">Peugeot</option>
                    <option value="Fiat">Fiat</option>
                    <option value="Renault">Renault</option>
                    <option value="Jeep">Jeep</option>
                    <option value="Citroën">Citroën</option>
                    <option value="Leapmotor">Leapmotor</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">Tipo de Plan</label>
                  <select name="plan_type" className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200">
                    <option value="80/20">80/20</option>
                    <option value="70/30">70/30</option>
                    <option value="100%">100%</option>
                    <option value="60/40">60/40</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Modelo</label>
                <input required name="model" placeholder="Ej. 208, Cronos, Duster, Renegade..." className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200" />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Versión</label>
                <input required name="version" placeholder="Ej. Active 1.6 MT, Drive Plus..." className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-300 mb-1">Cuota 1 Promocional ($)</label>
                  <input required type="number" name="cuota_1_value" className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 font-mono" />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">Cuota Fábrica ($)</label>
                  <input required type="number" name="factory_quota_value" className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 font-mono" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-300 mb-1">Valor Lista Unidad ($)</label>
                  <input required type="number" name="car_value" className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 font-mono" />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">Bonificación Concesionaria ($)</label>
                  <input type="number" name="bonus_discount" defaultValue="0" className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 font-mono" />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 rounded bg-slate-800 text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium"
                >
                  Crear Modelo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
