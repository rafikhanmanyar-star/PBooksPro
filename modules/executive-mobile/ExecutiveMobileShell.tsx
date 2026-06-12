import React, { Suspense } from 'react';
import { useExecutiveMode } from '../../context/ExecutiveModeContext';
import ExecutiveBottomNav from './components/ExecutiveBottomNav';
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
import { useAuth } from '../../context/AuthContext';
import { ICONS } from '../../constants';
import type { Page } from '../../types';

type Props = {
  onExitToFullErp?: (page?: Page) => void;
};

export default function ExecutiveMobileShell({ onExitToFullErp }: Props) {
  const { view, setView } = useExecutiveMode();
  const { tenant, logout } = useAuth();
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
    <div className="flex flex-col h-screen bg-app-bg text-app-text">
      <header className="flex items-center justify-between px-4 py-3 border-b border-app-border bg-app-header shrink-0">
        <div className="min-w-0">
          <p className="text-xs text-app-muted truncate">PBooks Pro Executive</p>
          <p className="text-sm font-semibold truncate">{tenant?.companyName ?? tenant?.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="relative p-2 text-app-muted touch-manipulation"
            onClick={() => setView('notifications')}
            aria-label="Notifications"
          >
            {ICONS.bell}
            {notifCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-ds-danger text-white text-[10px] font-bold flex items-center justify-center">
                {notifCount > 9 ? '9+' : notifCount}
              </span>
            )}
          </button>
          <button
            type="button"
            className="text-xs text-green-600 px-2 py-1 touch-manipulation"
            onClick={() => onExitToFullErp?.('dashboard')}
          >
            Full ERP
          </button>
          <button type="button" onClick={logout} className="p-2 text-app-muted touch-manipulation" aria-label="Logout">
            {ICONS.user}
          </button>
        </div>
      </header>

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
