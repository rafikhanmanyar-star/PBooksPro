import React, { Suspense } from 'react';
import { useExecutiveMode } from '../../context/ExecutiveModeContext';
import ExecutiveBottomNav from './components/ExecutiveBottomNav';
import ExecutiveHeader from './components/ExecutiveHeader';
import ExecutiveHomePage from './pages/ExecutiveHomePage';
import { ExecutiveModuleDashboardPage, ExecutiveModuleHubPage } from './pages/ExecutiveModulePages';
import QuickTransactionPage from './pages/QuickTransactionPage';
import ExecutiveReportsPage from './pages/ExecutiveReportsPage';
import ExecutiveSettingsPage from './pages/ExecutiveSettingsPage';
import MyTransactionsPage from './pages/MyTransactionsPage';
import ExecutiveApprovalsPage from './pages/ExecutiveApprovalsPage';
import ExecutiveNotificationsPage from './pages/ExecutiveNotificationsPage';
import { useMobileNotifications } from './hooks/useMobileNotifications';
import MobileOfflineWarning from '../../components/ui/MobileOfflineWarning';
import type { Page } from '../../types';

type Props = {
  onExitToFullErp?: (page?: Page) => void;
};

export default function ExecutiveMobileShell({ onExitToFullErp }: Props) {
  const { view } = useExecutiveMode();
  const { data: notifications } = useMobileNotifications();
  const notifCount = notifications?.length ?? 0;

  const renderView = () => {
    switch (view) {
      case 'home':
        return <ExecutiveHomePage />;
      case 'moduleList':
        return <ExecutiveModuleHubPage />;
      case 'moduleDashboard':
        return <ExecutiveModuleDashboardPage />;
      case 'quickTransaction':
        return <QuickTransactionPage />;
      case 'reports':
        return (
          <ExecutiveReportsPage
            onOpenFullErpReport={(page) => onExitToFullErp?.(page as Page)}
          />
        );
      case 'settings':
        return <ExecutiveSettingsPage />;
      case 'myTransactions':
        return <MyTransactionsPage />;
      case 'approvals':
        return <ExecutiveApprovalsPage />;
      case 'notifications':
        return <ExecutiveNotificationsPage />;
      default:
        return <ExecutiveHomePage />;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50/80 dark:bg-app-bg text-app-text">
      <ExecutiveHeader notifCount={notifCount} onExitToFullErp={onExitToFullErp} />

      <MobileOfflineWarning />

      <main className="flex-1 overflow-y-auto overscroll-contain">
        <Suspense fallback={<div className="p-4 text-app-muted">Loading…</div>}>
          {renderView()}
        </Suspense>
      </main>

      <ExecutiveBottomNav />
    </div>
  );
}
