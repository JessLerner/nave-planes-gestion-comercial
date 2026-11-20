/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { LegajosDirectory } from './components/hr/LegajosDirectory';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { PacingDashboard } from './components/pacing/PacingDashboard';
import { CrmLeadsModule } from './components/crm/CrmLeadsModule';
import { OperationsModule } from './components/operations/OperationsModule';
import { PriceListModule } from './components/prices/PriceListModule';
import { HrAndAdvancesModule } from './components/hr/HrAndAdvancesModule';
import { CarteraMoraModule } from './components/cartera/CarteraMoraModule';
import { DatabaseConnectorsModule } from './components/database/DatabaseConnectorsModule';
import { ExtractorHubModule } from './components/extractor/ExtractorHubModule';
import { CalendarConfigModal } from './components/calendar/CalendarConfigModal';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { LoginScreen } from './auth/LoginScreen';
import { PasswordSetupScreen } from './auth/PasswordSetupScreen';

function MainLayout() {
  const { currentUser } = useApp();
  const canManageEtl = currentUser.isPlatformOwner === true;
  const [activeTab, setActiveTab] = useState<string>('pacing');
  // Keep every visited workspace mounted. Switching sections must never erase
  // an unfinished form, filters, preview or import selection.
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(() => new Set(['pacing']));
  const [isCalendarConfigOpen, setIsCalendarConfigOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // ETL administration is a global-admin surface. Keep hidden tabs from
  // remaining mounted after a session/profile change as well as hiding them
  // from navigation.
  React.useEffect(() => {
    if ((activeTab === 'database' || activeTab === 'extractor') && !canManageEtl) {
      setActiveTab('pacing');
    }
  }, [canManageEtl, activeTab]);

  const openTab = (tab: string) => {
    const workspace = tab.startsWith('operations-') ? 'operations' : tab.startsWith('hr-') ? 'hr' : tab;
    setVisitedTabs(current => new Set([...current, workspace]));
    setActiveTab(tab);
  };

  const activeWorkspace = activeTab.startsWith('operations-') ? 'operations' : activeTab.startsWith('hr-') ? 'hr' : activeTab;
  const operationView = activeTab === 'operations-scoring' ? 'scoring' : activeTab === 'operations-presentations' ? 'presentations' : 'cantadas';
  const hrView = (activeTab.startsWith('hr-') ? activeTab.slice(3) : 'advances') as 'advances' | 'turnover' | 'legajos' | 'incorporations' | 'departures';

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* Sidebar navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={openTab}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main content area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Header */}
        <Header
          activeTab={activeTab}
          onOpenCalendarConfig={() => setIsCalendarConfigOpen(true)}
          onToggleMobileSidebar={() => setIsMobileSidebarOpen(prev => !prev)}
        />

        {/* Viewport content */}
        <main className="flex-1 overflow-y-auto p-6 bg-slate-950">
          <div className="max-w-7xl mx-auto pb-12">
            {visitedTabs.has('pacing') && <div className={activeTab === 'pacing' ? '' : 'hidden'}><PacingDashboard onOpenCalendarConfig={() => setIsCalendarConfigOpen(true)} /></div>}
            {visitedTabs.has('crm') && <div className={activeTab === 'crm' ? '' : 'hidden'}><CrmLeadsModule /></div>}
            {visitedTabs.has('operations') && <div className={activeWorkspace === 'operations' ? '' : 'hidden'}><OperationsModule view={operationView} /></div>}
            {visitedTabs.has('prices') && <div className={activeTab === 'prices' ? '' : 'hidden'}><PriceListModule /></div>}
            {visitedTabs.has('hr') && <div className={activeWorkspace === 'hr' ? '' : 'hidden'}><HrAndAdvancesModule initialSubTab={hrView} /></div>}
            {visitedTabs.has('cartera') && <div className={activeTab === 'cartera' ? '' : 'hidden'}><CarteraMoraModule /></div>}
            {canManageEtl && visitedTabs.has('database') && <div className={activeTab === 'database' ? '' : 'hidden'}><DatabaseConnectorsModule /></div>}
            {canManageEtl && visitedTabs.has('extractor') && <div className={activeTab === 'extractor' ? '' : 'hidden'}><ExtractorHubModule /></div>}
          </div>
        </main>
      </div>

      {/* Calendar and parameters modal */}
      <CalendarConfigModal
        isOpen={isCalendarConfigOpen}
        onClose={() => setIsCalendarConfigOpen(false)}
      />
    </div>
  );
}

function AuthenticatedApp() {
  const { user, session, loading, mustSetPassword, signOut } = useAuth();
  if (loading) {
    return <div className="min-h-screen bg-[#18191b] text-white flex items-center justify-center text-sm">Validando acceso seguro…</div>;
  }
  // A valid recovery/invitation session must choose a password before it can
  // enter the application, even while the operational profile is hydrating.
  if (session && mustSetPassword) return <PasswordSetupScreen mode={window.location.hash.includes('type=invite') ? 'invite' : 'recovery'} />;
  if (!user || !session) return <LoginScreen />;
  if (user.role === 'administrativo' || user.role === 'marketing' || user.role === 'contaduria') {
    const legajos = user.role === 'administrativo' && user.capabilities?.some(item => item === 'view_legajos' || item === 'manage_legajos');
    return <main className="p-6">{legajos ? <LegajosDirectory /> : <p>Tu cuenta está activa. Todavía no tenés módulos asignados.</p>}<button onClick={() => void signOut()}>Cerrar sesión</button></main>;
  }
  return (
    <AppProvider key={JSON.stringify([user.id,user.role,user.isPlatformOwner,user.capabilities,user.team_id,user.staff_member_id])} initialUser={user} accessToken={session.access_token}>
      <MainLayout />
    </AppProvider>
  );
}

export default function App() {
  return <AuthProvider><AuthenticatedApp /></AuthProvider>;
}
