/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
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
import { RosterManagementModule } from './components/admin/RosterManagementModule';
import { CalendarConfigModal } from './components/calendar/CalendarConfigModal';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { LoginScreen } from './auth/LoginScreen';
import { PasswordSetupScreen } from './auth/PasswordSetupScreen';

function MainLayout() {
  const { currentUser } = useApp();
  const [activeTab, setActiveTab] = useState<string>('pacing');
  // Keep every visited workspace mounted. Switching sections must never erase
  // an unfinished form, filters, preview or import selection.
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(() => new Set(['pacing']));
  const [isCalendarConfigOpen, setIsCalendarConfigOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // If user switches away from admin while on extractor, gracefully return to pacing
  React.useEffect(() => {
    if ((activeTab === 'extractor' || activeTab === 'structure') && currentUser.role !== 'admin') {
      setActiveTab('pacing');
    }
  }, [currentUser.role, activeTab]);

  const openTab = (tab: string) => {
    setVisitedTabs(current => new Set([...current, tab]));
    setActiveTab(tab);
  };

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
            {visitedTabs.has('operations') && <div className={activeTab === 'operations' ? '' : 'hidden'}><OperationsModule /></div>}
            {visitedTabs.has('prices') && <div className={activeTab === 'prices' ? '' : 'hidden'}><PriceListModule /></div>}
            {visitedTabs.has('hr') && <div className={activeTab === 'hr' ? '' : 'hidden'}><HrAndAdvancesModule /></div>}
            {visitedTabs.has('cartera') && <div className={activeTab === 'cartera' ? '' : 'hidden'}><CarteraMoraModule /></div>}
            {visitedTabs.has('database') && <div className={activeTab === 'database' ? '' : 'hidden'}><DatabaseConnectorsModule /></div>}
            {visitedTabs.has('extractor') && <div className={activeTab === 'extractor' ? '' : 'hidden'}><ExtractorHubModule /></div>}
            {visitedTabs.has('structure') && <div className={activeTab === 'structure' ? '' : 'hidden'}><RosterManagementModule /></div>}
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
  const { user, session, loading, mustSetPassword } = useAuth();
  if (loading) {
    return <div className="min-h-screen bg-[#18191b] text-white flex items-center justify-center text-sm">Validando acceso seguro…</div>;
  }
  // A valid recovery/invitation session must choose a password before it can
  // enter the application, even while the operational profile is hydrating.
  if (session && mustSetPassword) return <PasswordSetupScreen mode={window.location.hash.includes('type=invite') ? 'invite' : 'recovery'} />;
  if (!user || !session) return <LoginScreen />;
  return (
    <AppProvider initialUser={user} accessToken={session.access_token}>
      <MainLayout />
    </AppProvider>
  );
}

export default function App() {
  return <AuthProvider><AuthenticatedApp /></AuthProvider>;
}
