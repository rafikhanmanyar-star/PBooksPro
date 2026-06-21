import React, { Suspense } from 'react';

import { useExecutiveMode } from '../../context/ExecutiveModeContext';

import { PrintController } from '../../components/print/PrintController';

import ExecutiveBottomNav from './components/ExecutiveBottomNav';

import ExecutiveHomePage from './pages/ExecutiveHomePage';

import { ExecutiveModuleDashboardPage } from './pages/ExecutiveModulePages';

import QuickTransactionPage from './pages/QuickTransactionPage';

import ExecutiveReportsPage from './pages/ExecutiveReportsPage';

import ExecutiveSettingsPage from './pages/ExecutiveSettingsPage';

import ExecutiveProfilePage from './pages/ExecutiveProfilePage';

import MyTransactionsPage from './pages/MyTransactionsPage';

import ExecutiveApprovalsPage from './pages/ExecutiveApprovalsPage';

import ExecutiveInboxPage from './pages/ExecutiveInboxPage';

import ExecutiveCashPositionPage from './pages/ExecutiveCashPositionPage';

import ExecutiveConstructionDashboardPage from './pages/ExecutiveConstructionDashboardPage';

import ExecutiveNotificationsPage from './pages/ExecutiveNotificationsPage';

import MobileOfflineWarning from '../../components/ui/MobileOfflineWarning';
import CapturePermissionsBanner from './components/CapturePermissionsBanner';



function PageSkeleton() {

  return (

    <div className="p-4 space-y-3 animate-pulse">

      <div className="h-6 w-40 rounded-lg bg-app-card" />

      <div className="h-28 rounded-2xl bg-app-card" />

      <div className="h-28 rounded-2xl bg-app-card" />

    </div>

  );

}



export default function ExecutiveMobileShell() {

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

        return <ExecutiveReportsPage />;

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

      case 'inbox':

        return <ExecutiveInboxPage />;

      case 'cashPosition':

        return <ExecutiveCashPositionPage />;

      case 'constructionDashboard':

        return <ExecutiveConstructionDashboardPage />;

      case 'moduleList':

        return <ExecutiveProfilePage />;

      default:

        return <ExecutiveHomePage />;

    }

  };



  const isCaptureView = view === 'quickTransaction';



  return (

    <div className="executive-mobile-shell flex flex-col h-[100dvh] min-h-0 bg-app-bg text-app-text">

      <PrintController />

      <MobileOfflineWarning />

      <div className="px-4 pt-3 shrink-0">
        <CapturePermissionsBanner showInstallPrompt />
      </div>

      <main

        className={`flex-1 min-h-0 overscroll-contain ${

          isCaptureView ? 'overflow-hidden flex flex-col' : 'overflow-y-auto'

        }`}

      >

        <Suspense fallback={<PageSkeleton />}>{renderView()}</Suspense>

      </main>



      <ExecutiveBottomNav />

    </div>

  );

}


