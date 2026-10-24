import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Calendar, Settings, Check, X, ShieldAlert } from 'lucide-react';
import { calculateWorkingDays } from '../../utils/businessLogic';

interface CalendarConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CalendarConfigModal: React.FC<CalendarConfigModalProps> = ({ isOpen, onClose }) => {
  const { monthlyConfig, updateMonthlyConfig, currentUser } = useApp();

  const [form, setForm] = useState({
    start_date: monthlyConfig.start_date,
    end_date: monthlyConfig.end_date,
    default_team_target_per_seller: monthlyConfig.default_team_target_per_seller,
    min_sales_for_advance: monthlyConfig.min_sales_for_advance,
    max_advance_amount: monthlyConfig.max_advance_amount,
    advance_deadline_day: monthlyConfig.advance_deadline_day,
  });

  const [savedNotice, setSavedNotice] = useState(false);

  if (!isOpen) return null;

  // Working days preview
  const daysPreview = calculateWorkingDays(form.start_date, form.end_date);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMonthlyConfig({
      ...form,
      working_days: daysPreview.totalWorkingDays,
    });
    setSavedNotice(true);
    setTimeout(() => {
      setSavedNotice(false);
      onClose();
    }, 1000);
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Configuración del Calendario Operativo & Parámetros
              </h3>
              <p className="text-xs text-slate-400">
                Parámetros exclusivos para Gerencia General y Administración
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>

        {savedNotice && (
          <div className="mt-3 p-3 bg-emerald-950/60 border border-emerald-800 rounded-lg text-xs text-emerald-200">
            ✓ Parámetros comerciales actualizados correctamente.
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Fecha Inicio Mes Operativo
              </label>
              <input
                type="date"
                required
                value={form.start_date}
                onChange={e => setForm({ ...form, start_date: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Fecha Fin / Corte Operativo
              </label>
              <input
                type="date"
                required
                value={form.end_date}
                onChange={e => setForm({ ...form, end_date: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-mono"
              />
            </div>
          </div>

          {/* Working days auto calculated preview */}
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-between">
            <span className="text-slate-400">Días Laborables calculados (Lunes a Sábado):</span>
            <span className="font-mono font-bold text-blue-400 text-sm">
              {daysPreview.totalWorkingDays} días laborables
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Objetivo General por Vendedor (Fórmula)
              </label>
              <input
                type="number"
                min="1"
                max="10"
                step="0.5"
                value={form.default_team_target_per_seller}
                onChange={e => setForm({ ...form, default_team_target_per_seller: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-mono"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Fórmula: Max(15, {form.default_team_target_per_seller} * Vendedores Activos)
              </span>
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Día Límite Mensual para Adelantos
              </label>
              <input
                type="number"
                min="1"
                max="31"
                value={form.advance_deadline_day}
                onChange={e => setForm({ ...form, advance_deadline_day: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-mono"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Día {form.advance_deadline_day} de cada mes
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Mínimo de Ventas para Adelanto
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={form.min_sales_for_advance}
                onChange={e => setForm({ ...form, min_sales_for_advance: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-mono"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Regla comercial estricta ({form.min_sales_for_advance} ventas)
              </span>
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Monto Máximo de Adelanto ($ARS)
              </label>
              <input
                type="number"
                min="50000"
                max="1000000"
                step="50000"
                value={form.max_advance_amount}
                onChange={e => setForm({ ...form, max_advance_amount: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-mono"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Tope máximo por vendedor
              </span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-md shadow-blue-600/20"
            >
              Guardar Parámetros
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
