import React, { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMobileDashboard } from '../hooks/useMobileDashboard';
import ExecutiveHomeKeyMetrics from '../components/ExecutiveHomeKeyMetrics';
import ExecutiveModuleAccordion from '../components/ExecutiveModuleAccordion';
import PullToRefresh from '../components/PullToRefresh';
import { useAuth } from '../../../context/AuthContext';
import { useExecutiveMode } from '../../../context/ExecutiveModeContext';
import { useExecutiveModules } from '../hooks/useExecutiveModules';
import { useMobileNotifications } from '../hooks/useMobileNotifications';
import { useMobileApprovals } from '../hooks/useMobileApprovals';
import { ICONS } from '../../../constants';
import pbooksProLogo from '../../../pbookspro logo.png';



function greeting(): string {

  const h = new Date().getHours();

  if (h < 12) return 'Good Morning';

  if (h < 17) return 'Good Afternoon';

  return 'Good Evening';

}



export default function ExecutiveHomePage() {

  const { tenant, user } = useAuth();

  const { setView } = useExecutiveMode();

  const { accordionSections } = useExecutiveModules();

  const { data, isLoading, refetch, isFetching } = useMobileDashboard('dashboard');

  const { data: notifications } = useMobileNotifications();

  const { data: approvals } = useMobileApprovals();

  const queryClient = useQueryClient();



  const firstName = user?.name?.split(/\s+/)[0] ?? user?.name ?? 'there';

  const companyLabel = (tenant?.companyName ?? tenant?.name ?? 'Organization').toUpperCase();
  const userInitials = (user?.name ?? 'U').slice(0, 2).toUpperCase();

  const notifCount = notifications?.length ?? 0;

  const approvalCount = approvals?.length ?? 0;



  const handleRefresh = useCallback(async () => {

    await Promise.all([

      refetch(),

      queryClient.invalidateQueries({ queryKey: ['mobile-dashboard'] }),

      queryClient.invalidateQueries({ queryKey: ['mobile-notifications'] }),

      queryClient.invalidateQueries({ queryKey: ['mobile-approvals'] }),

    ]);

  }, [refetch, queryClient]);



  return (

    <PullToRefresh onRefresh={handleRefresh} className="min-h-full executive-home-page">

      <div className="pb-28">

        {/* Header */}

        <header className="px-4 pt-5 pb-2 flex items-center gap-3">
          <img
            src={pbooksProLogo}
            alt="PBooks Pro"
            className="executive-org-logo w-12 h-12 rounded-full object-cover shrink-0"
          />

          <div className="flex-1 min-w-0">

            <p className="text-[10px] font-semibold tracking-[0.12em] text-app-muted truncate uppercase">

              {companyLabel}

            </p>

            <h1 className="text-base font-bold text-app-text truncate leading-tight mt-0.5">

              Main Branch

            </h1>

          </div>

          <button

            type="button"

            onClick={() => setView('notifications')}

            className="relative w-11 h-11 rounded-full border border-app-border/60 bg-app-card/80 text-app-muted touch-manipulation flex items-center justify-center active:scale-95 transition-transform"

            aria-label="Notifications"

          >

            <span className="w-5 h-5">{ICONS.bell}</span>

            {notifCount > 0 && (

              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-pink-500 ring-2 ring-app-bg" />

            )}

          </button>

          <button

            type="button"

            onClick={() => setView('profile')}

            className="executive-user-avatar w-11 h-11 rounded-full text-xs font-bold flex items-center justify-center touch-manipulation shrink-0 active:scale-95 transition-transform"

            aria-label="Profile"

          >

            {userInitials}

          </button>

        </header>



        {/* Welcome */}

        <section className="px-4 pb-5 pt-1">

          <p className="text-sm text-app-muted">{greeting()},</p>

          <h2 className="text-[1.75rem] font-bold text-app-text mt-0.5 leading-tight tracking-tight">

            {firstName}

          </h2>

        </section>



        {/* Summary cards */}

        <section className="px-4 mb-6">

          <div className="grid grid-cols-2 gap-3">

            <button

              type="button"

              onClick={() => setView('approvals')}

              className="executive-summary-card rounded-2xl border border-app-border/60 bg-app-card p-4 text-left touch-manipulation min-h-[4.5rem] active:scale-[0.98] transition-transform"

            >

              <p className="text-[10px] font-semibold uppercase tracking-wider text-app-muted">

                Pending Approvals

              </p>

              <p className="text-2xl font-bold text-app-text tabular-nums mt-1">{approvalCount}</p>

            </button>

            <button

              type="button"

              onClick={() => setView('notifications')}

              className="executive-summary-card rounded-2xl border border-app-border/60 bg-app-card p-4 text-left touch-manipulation min-h-[4.5rem] active:scale-[0.98] transition-transform"

            >

              <p className="text-[10px] font-semibold uppercase tracking-wider text-app-muted">

                Active Alerts

              </p>

              <p className="text-2xl font-bold text-app-text tabular-nums mt-1">{notifCount}</p>

            </button>

          </div>

        </section>



        {/* Key metrics */}

        <section className="mb-6">

          <div className="px-4 flex items-center justify-between mb-3">

            <h3 className="text-base font-bold text-app-text">Key Metrics</h3>

            <button

              type="button"

              onClick={() => void handleRefresh()}

              disabled={isFetching}

              className="text-sm font-semibold text-ds-primary touch-manipulation min-h-[44px] px-1 disabled:opacity-50"

            >

              {isFetching ? 'Updating…' : 'Live Update'}

            </button>

          </div>

          <ExecutiveHomeKeyMetrics metrics={data?.metrics} loading={isLoading} />

        </section>



        {/* Module accordions */}

        <section className="px-4">

          <ExecutiveModuleAccordion sections={accordionSections} />

        </section>

      </div>

    </PullToRefresh>

  );

}

