import React from 'react';
export const AdministrativeStatusBadge: React.FC<{ status?: 'coaching' | 'alta_definitiva' | null }> = ({ status }) => {
  const label = status === 'coaching' ? 'Coaching' : status === 'alta_definitiva' ? 'Alta definitiva' : 'Pendiente de clasificación';
  const tone = status === 'coaching' ? 'text-amber-300 border-amber-700/60 bg-amber-500/10' : status === 'alta_definitiva' ? 'text-slate-200 border-slate-600 bg-slate-800' : 'text-slate-400 border-slate-700 bg-slate-900';
  return <span className={`inline-flex rounded border px-2 py-0.5 text-[11px] font-medium ${tone}`}>{label}</span>;
};
