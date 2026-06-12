import React, { Suspense } from 'react';
import { useExecutiveMode } from '../../context/ExecutiveModeContext';
import ExecutiveBottomNav from './components/ExecutiveBottomNav';
import ExecutiveHomePage from './pages/ExecutiveHomePage';
import { ExecutiveModuleDashboardPage } from './pages/ExecutiveModulePages';
import QuickTransactionPage from './pages/QuickTransactionPage';
import ExecutiveReportsPage from './pages/ExecutiveReportsPage';
import ExecutiveSettingsPage from './pages/ExecutiveSettingsPage';
import ExecutiveProfilePage from './pages/ExecutiveProfilePage';
import MyTransactionsPage from './pages/MyTransactionsPage';
import ExecutiveApprovalsPage from './pages/ExecutiveApprovalsPage';
import ExecutiveNotificationsPage from './pages/ExecutiveNotificationsPage';
import MobileOfflineWarning from '../../components/ui/MobileOfflineWarning';
import type { Page } from '../../types';

type Props = {
  onExitToFullErp?: (page?: Page) => void;
};

function PageSkeleton() {
  return (
    <div className="p-4 space-y-3 animate-pulse">
      <div className="h-6 w-40 rounded-lg bg-app-card" />
      <div className="h-28 rounded-2xl bg-app-card" />
      <div className="h-28 rounded-2xl bg-app-card" />
    </div>
  );
}

export default function ExecutiveMobileShell({ onExitToFullErp }: Props) {
  const { view } = useExecutiveMode();

  const renderView = () => {
    switch (view) {
      case 'home':
        return <ExecutiveHomePage />;
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
      case 'profile':
        return <ExecutiveProfilePage />;
      case 'myTransactions':
        return <MyTransactionsPage />;
      case 'approvals':
        return <ExecutiveApprovalsPage />;
      case 'notifications':
        return <ExecutiveNotificationsPage />;
      case 'moduleList':
        return <ExecutiveProfilePage />;
      default:
        return <ExecutiveHomePage />;
    }
  };

  return (
    <div className="executive-mobile-shell flex flex-col h-screen bg-app-bg text-app-text">
      <MobileOfflineWarning />

      <main className="flex-1 overflow-y-auto overscroll-contain">
        <Suspense fallback={<PageSkeleton />}>{renderView()}</Suspense>
      </main>

      <ExecutiveBottomNav />
    </div>
  );
}
