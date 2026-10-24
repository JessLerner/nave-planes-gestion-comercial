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
import { CalendarConfigModal } from './components/calendar/CalendarConfigModal';

function MainLayout() {
  const { currentUser } = useApp();
  const [activeTab, setActiveTab] = useState<string>('pacing');
  const [isCalendarConfigOpen, setIsCalendarConfigOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // If user switches away from admin while on extractor, gracefully return to pacing
  React.useEffect(() => {
    if (activeTab === 'extractor' && currentUser.role !== 'admin') {
      setActiveTab('pacing');
    }
  }, [currentUser.role, activeTab]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* Sidebar navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
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
            {activeTab === 'pacing' && (
              <PacingDashboard onOpenCalendarConfig={() => setIsCalendarConfigOpen(true)} />
            )}
            {activeTab === 'crm' && <CrmLeadsModule />}
            {activeTab === 'operations' && <OperationsModule />}
            {activeTab === 'prices' && <PriceListModule />}
            {activeTab === 'hr' && <HrAndAdvancesModule />}
            {activeTab === 'cartera' && <CarteraMoraModule />}
            {activeTab === 'database' && <DatabaseConnectorsModule />}
            {activeTab === 'extractor' && <ExtractorHubModule />}
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

export default function App() {
  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
}
