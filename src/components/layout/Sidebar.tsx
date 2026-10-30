import React from 'react';
import { useApp } from '../../context/AppContext';
import {
  TrendingUp,
  Users,
  FileCheck2,
  Tag,
  Briefcase,
  PieChart,
  ShieldCheck,
  Building,
  Car,
  Database,
  Sparkles,
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  isOpenMobile = false,
  onCloseMobile,
}) => {
  const { operations, wageAdvances, currentUser } = useApp();

  const pendingScoringCount = operations.filter(op => op.scoring_status === 'pending').length;
  const pendingAdvancesCount = wageAdvances.filter(wa => wa.status === 'pending').length;

  const navItems = [
    {
      id: 'pacing',
      label: 'Control Comercial & Pacing',
      icon: TrendingUp,
      badge: null,
      description: 'Objetivos, ritmos y proyección',
    },
    {
      id: 'crm',
      label: 'CRM & Reparto de Datos',
      icon: Users,
      badge: null,
      description: 'Fox CRM y asignación de leads',
    },
    {
      id: 'operations',
      label: 'Operaciones & Scoring',
      icon: FileCheck2,
      badge: pendingScoringCount > 0 ? `${pendingScoringCount} audit` : null,
      badgeColor: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
      description: 'Ventas, peritajes y calidad',
    },
    {
      id: 'prices',
      label: 'Listas de Precios',
      icon: Tag,
      badge: null,
      description: 'Peugeot, Fiat, Renault, Jeep...',
    },
    {
      id: 'hr',
      label: 'RRHH & Adelantos',
      icon: Briefcase,
      badge: pendingAdvancesCount > 0 ? `${pendingAdvancesCount} pend.` : null,
      badgeColor: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
      description: 'Legajos, rotación y adelantos',
    },
    {
      id: 'cartera',
      label: 'Cartera & Mora',
      icon: PieChart,
      badge: null,
      description: 'Agrupamiento y trazabilidad',
    },
    {
      id: 'database',
      label: 'Bases de Datos & ETL',
      icon: Database,
      badge: null,
      description: 'PostgreSQL, Fox CRM & Sheets',
    },
    ...(currentUser.role === 'admin'
      ? [
          {
            id: 'extractor',
            label: 'Extractor Google & Supabase',
            icon: Sparkles,
            badge: 'Admin',
            badgeColor: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
            description: 'Sheets, archivos y CRM a Supabase SQL',
          },
        ]
      : []),
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-30 lg:hidden"
        />
      )}

      <aside
        className={`${
          isOpenMobile ? 'fixed inset-y-0 left-0 z-40 flex' : 'hidden lg:flex'
        } w-64 bg-slate-900 border-r border-slate-800 flex-col justify-between shrink-0 select-none`}
      >
        {/* Brand Header */}
        <div>
          <div className="p-5 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
                <Car className="w-5 h-5" />
              </div>
              <div>
                <div className="text-base font-bold tracking-tight text-white leading-none">
                  NAVE PLANES
                </div>
                <div className="text-[11px] text-slate-400 mt-1 font-medium">
                  Concesionaria Oficial
                </div>
              </div>
            </div>
            {onCloseMobile && (
              <button
                onClick={onCloseMobile}
                className="lg:hidden text-slate-400 hover:text-white p-1"
              >
                ✕
              </button>
            )}
          </div>
          <div className="p-3">
            <div className="px-2 py-1 bg-slate-800/80 rounded border border-slate-700/60 text-[10px] text-slate-300 flex items-center justify-between">
              <span className="text-slate-400">Plataforma:</span>
              <span className="font-semibold text-blue-400">Gestión Mandos Medios</span>
            </div>
          </div>

          {/* Navigation list */}
          <nav className="p-3 space-y-1">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    onCloseMobile?.();
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white font-medium shadow-md shadow-blue-600/20'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span className="text-xs truncate">{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium shrink-0 ml-1.5 ${
                      isActive ? 'bg-white/20 text-white' : item.badgeColor
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Security notice & Footer */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/40">
        <div className="flex items-start gap-2 text-[11px] text-slate-400 leading-snug">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-slate-300">Acceso Restringido:</span>
            <p className="mt-0.5 text-slate-400">
              Vendedores no poseen login. Son auditados por supervisores y auditoría.
            </p>
          </div>
        </div>
      </div>
    </aside>
  </>
  );
};
