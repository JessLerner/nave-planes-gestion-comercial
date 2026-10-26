import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  RefreshCw,
  UserCheck,
  ShieldAlert,
  ChevronDown,
  Building2,
  Calendar,
  Layers,
  Settings,
  ExternalLink,
  Bell,
  Clock3,
} from 'lucide-react';

interface HeaderProps {
  activeTab: string;
  onOpenCalendarConfig: () => void;
  onToggleMobileSidebar: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onOpenCalendarConfig,
  onToggleMobileSidebar,
}) => {
  const {
    currentUser,
    setCurrentUser,
    users,
    teams,
    selectedTeamId,
    setSelectedTeamId,
    isSyncingDataExtractor,
    syncDataExtractor,
    lastSyncTime,
    monthlyConfig,
    wageAdvances,
    sellers,
  } = useApp();

  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const getBreadcrumbTitle = () => {
    switch (activeTab) {
      case 'pacing':
        return 'Control Comercial & Pacing';
      case 'crm':
        return 'CRM, Marketing & Reparto de Datos';
      case 'operations':
        return 'Operaciones & Auditoría de Scoring';
      case 'prices':
        return 'Listas de Precios & Modelos';
      case 'hr':
        return 'Recursos Humanos & Adelantos de Sueldo';
      case 'cartera':
        return 'Control de Cartera, Mora & Agrupamiento';
      case 'database':
        return 'Bases de Datos & Conectores ETL';
      case 'extractor':
        return 'Extractor Google Sheets & Supabase SQL';
      default:
        return 'Panel de Gestión';
    }
  };

  const currentTeam = teams.find(t => t.id === selectedTeamId);
  const pendingAdvances = currentUser.role === 'gerente'
    ? wageAdvances.filter(advance => advance.status === 'pending')
    : [];

  return (
    <header className="h-16 bg-slate-900/90 backdrop-blur border-b border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-3 sm:gap-6 z-20 shrink-0">
      {/* Zone 1: Breadcrumbs & Context */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          onClick={onToggleMobileSidebar}
          className="lg:hidden p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
          aria-label="Abrir menú de navegación"
        >
          <Layers className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-1.5 sm:gap-2 text-xs font-medium text-slate-400 min-w-0">
          <span className="hidden sm:inline">Nave Planes</span>
          <span className="hidden sm:inline text-slate-600">/</span>
          <span className="text-slate-200 font-semibold truncate">{getBreadcrumbTitle()}</span>
        </div>

        {/* Team filter dropdown (Visible for Gerente/Admin or displays locked team for supervisor) */}
        {currentUser.role !== 'supervisor' ? (
          <div className="hidden lg:flex items-center ml-4 pl-4 border-l border-slate-800">
            <span className="text-xs text-slate-400 mr-2 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5" /> Equipo:
            </span>
            <select
              aria-label="Filtrar por equipo"
              value={selectedTeamId}
              onChange={e => setSelectedTeamId(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-xs text-slate-200 rounded px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">Todos los Equipos (Global)</option>
              {teams.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="hidden lg:flex items-center ml-4 pl-4 border-l border-slate-800 text-xs text-blue-400 font-medium">
            <Layers className="w-3.5 h-3.5 mr-1.5" />
            <span>{currentTeam?.name || 'Mi Equipo'}</span>
          </div>
        )}
      </div>

      {/* Zone 2: Actions & Pipeline Sync */}
      <div className="flex items-center gap-3">
        <a
          href="https://foxcrm.net/app/reporte_cartera_leads.php"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-orange-500/10 hover:bg-orange-500/20 text-xs font-semibold text-orange-300 border border-orange-500/30 transition-colors"
          title="Abrir el reporte de cartera de leads en Fox CRM"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Ir a Fox CRM</span>
        </a>

        {/* Configuration is intentionally restricted to the platform administrator. */}
        {currentUser.role === 'admin' && (
          <button
            onClick={onOpenCalendarConfig}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-800/80 hover:bg-slate-700 text-xs font-medium text-slate-300 border border-slate-700/80 transition-colors"
            title="Configurar calendario operativo y parámetros de corte"
          >
            <Calendar className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline">{monthlyConfig.month_name}</span>
            <Settings className="w-3 h-3 text-slate-400 ml-1" />
          </button>
        )}

        {currentUser.role === 'gerente' && (
          <div className="relative">
            <button
              onClick={() => setShowNotifications(value => !value)}
              className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
              aria-label={`Notificaciones: ${pendingAdvances.length} adelantos pendientes`}
              aria-expanded={showNotifications}
              title="Adelantos pendientes de autorización"
            >
              <Bell className="w-4 h-4 text-amber-300" />
              {pendingAdvances.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 rounded-full bg-red-500 text-[10px] leading-4 text-white font-bold">
                  {pendingAdvances.length}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-bold text-white">Pendientes de Gerencia</span>
                  <span className="text-[10px] text-amber-300 font-semibold">{pendingAdvances.length} adelantos</span>
                </div>
                {pendingAdvances.length === 0 ? (
                  <div className="px-4 py-5 text-xs text-slate-400">No hay adelantos pendientes de autorización.</div>
                ) : (
                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-800">
                    {pendingAdvances.map(advance => {
                      const seller = sellers.find(item => item.id === advance.seller_id);
                      return (
                        <div key={advance.id} className="px-4 py-3">
                          <div className="text-xs font-semibold text-slate-100">Adelanto pendiente · {seller?.name || 'Vendedor'}</div>
                          <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
                            <Clock3 className="w-3 h-3" />
                            <span>Solicitado el {advance.request_date}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="px-4 py-2.5 bg-slate-950/60 text-[11px] text-slate-400">
                  Autorizá o rechazá cada pedido desde RRHH & Adelantos.
                </div>
              </div>
            )}
          </div>
        )}

        {/* Data-Extractor Sync Button */}
        {currentUser.role === 'admin' && <button
          onClick={syncDataExtractor}
          disabled={isSyncingDataExtractor}
          className="flex items-center gap-2 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700/80 text-xs font-medium text-slate-200 border border-slate-700 transition-colors"
          title={`Sincronizar leads de Fox CRM y planillas de calidad. Última: ${lastSyncTime}`}
        >
          <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isSyncingDataExtractor ? 'animate-spin' : ''}`} />
          <span className="hidden md:inline">
            {isSyncingDataExtractor ? 'Sincronizando Fox CRM...' : 'Data-Extractor'}
          </span>
          <span className="hidden xl:inline text-[10px] text-slate-400 ml-1 border-l border-slate-700 pl-1.5">
            {lastSyncTime.split('(')[0]}
          </span>
        </button>}

        {/* Role Switcher Simulator (Essential for executive evaluation) */}
        <div className="relative">
          <button
            onClick={() => setShowUserDropdown(!showUserDropdown)}
            className="flex items-center gap-2.5 px-3 py-1.5 rounded bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-left transition-colors"
            aria-expanded={showUserDropdown}
            aria-label="Cambiar perfil de usuario"
          >
            <div className="w-7 h-7 rounded-full bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-xs font-bold text-blue-300 shrink-0">
              {currentUser.name.charAt(0)}
            </div>
            <div className="hidden md:block leading-tight text-left">
              <div className="text-xs font-semibold text-slate-200">{currentUser.name}</div>
              <div className="text-[10px] text-blue-400 uppercase tracking-wider font-semibold">
                {currentUser.role === 'admin'
                  ? 'Administrador General'
                  : currentUser.role === 'gerente'
                  ? 'Gerente General'
                  : currentUser.role === 'supervisor'
                  ? 'Supervisor'
                  : 'RRHH & Calidad'}
              </div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-1" />
          </button>

          {/* User selector modal dropdown */}
          {showUserDropdown && (
            <div className="absolute right-0 mt-2 w-72 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl py-2 z-50">
              <div className="px-3 py-2 border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Simulador de Perfiles (Mandos Medios / Altos)
              </div>
              <div className="px-3 py-1.5 text-[11px] text-slate-400 leading-snug">
                Los vendedores no tienen acceso al sistema. Seleccione un usuario ejecutivo:
              </div>
              <div className="py-1">
                {users.map(u => (
                  <button
                    key={u.id}
                    onClick={() => {
                      setCurrentUser(u);
                      setShowUserDropdown(false);
                    }}
                    className={`w-full px-3 py-2 text-left flex items-start gap-2.5 hover:bg-slate-800 transition-colors ${
                      currentUser.id === u.id ? 'bg-blue-900/30 text-blue-200' : 'text-slate-300'
                    }`}
                  >
                    <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-200 mt-0.5 shrink-0">
                      {u.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-slate-200 truncate">{u.name}</div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {u.role.toUpperCase()} · {u.branch}
                      </div>
                    </div>
                    {currentUser.id === u.id && (
                      <span className="text-xs text-blue-400 font-bold">✓</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
