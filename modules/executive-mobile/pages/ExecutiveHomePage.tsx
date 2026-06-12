import React, { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMobileDashboard } from '../hooks/useMobileDashboard';
import ExecutiveKpiCarousel from '../components/ExecutiveKpiCarousel';
import ExecutiveModuleAccordion from '../components/ExecutiveModuleAccordion';
import PullToRefresh from '../components/PullToRefresh';
import { useAuth } from '../../../context/AuthContext';
import { useExecutiveMode } from '../../../context/ExecutiveModeContext';
import { useExecutiveModules } from '../hooks/useExecutiveModules';
import { useMobileNotifications } from '../hooks/useMobileNotifications';
import { useMobileApprovals } from '../hooks/useMobileApprovals';
import { ICONS } from '../../../constants';

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
  const { data, isLoading, refetch } = useMobileDashboard('dashboard');
  const { data: notifications } = useMobileNotifications();
  const { data: approvals } = useMobileApprovals();
  const queryClient = useQueryClient();

  const firstName = user?.name?.split(/\s+/)[0] ?? user?.name ?? 'there';
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
    <PullToRefresh onRefresh={handleRefresh} className="min-h-full bg-app-bg">
      <div className="pb-28">
        {/* Header */}
        <header className="px-4 pt-4 pb-3 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-ds-primary/15 text-ds-primary flex items-center justify-center shrink-0 font-bold text-sm">
            {(tenant?.companyName ?? tenant?.name ?? 'P').slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-app-muted truncate">Organization</p>
            <h1 className="text-base font-bold text-app-text truncate leading-tight">
              {tenant?.companyName ?? tenant?.name}
            </h1>
            <p className="text-[11px] text-app-muted truncate">Main Branch</p>
          </div>
          <button
            type="button"
            onClick={() => setView('notifications')}
            className="relative p-2.5 rounded-xl text-app-muted touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center active:bg-app-highlight"
            aria-label="Notifications"
          >
            <span className="w-5 h-5">{ICONS.bell}</span>
            {notifCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-ds-danger text-white text-[9px] font-bold flex items-center justify-center">
                {notifCount > 9 ? '9+' : notifCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setView('profile')}
            className="w-11 h-11 rounded-full bg-ds-primary/15 text-ds-primary text-xs font-bold flex items-center justify-center touch-manipulation shrink-0"
            aria-label="Profile"
          >
            {(user?.name ?? 'U').slice(0, 2).toUpperCase()}
          </button>
        </header>

        {/* Welcome */}
        <section className="px-4 pb-4">
          <p className="text-sm text-app-muted">{greeting()}</p>
          <h2 className="text-2xl font-bold text-app-text mt-0.5">{firstName}</h2>
        </section>

        {/* Today summary */}
        <section className="px-4 mb-5">
          <h3 className="text-sm font-semibold text-app-text mb-2">Today&apos;s Summary</h3>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setView('approvals')}
              className="rounded-2xl border border-app-border bg-app-card p-3 text-left shadow-ds-card touch-manipulation min-h-[44px] active:scale-[0.98] transition-transform"
            >
              <p className="text-[11px] text-app-muted">Pending Approvals</p>
              <p className="text-xl font-bold text-app-text tabular-nums">{approvalCount}</p>
            </button>
            <button
              type="button"
              onClick={() => setView('notifications')}
              className="rounded-2xl border border-app-border bg-app-card p-3 text-left shadow-ds-card touch-manipulation min-h-[44px] active:scale-[0.98] transition-transform"
            >
              <p className="text-[11px] text-app-muted">Active Alerts</p>
              <p className="text-xl font-bold text-app-text tabular-nums">{notifCount}</p>
            </button>
          </div>
        </section>

        {/* KPI carousel */}
        <section className="mb-6">
          <div className="px-4 flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-app-text">Key Metrics</h3>
          </div>
          <ExecutiveKpiCarousel metrics={data?.metrics} loading={isLoading} />
        </section>

        {/* Module accordions */}
        <section className="px-4">
          <ExecutiveModuleAccordion sections={accordionSections} />
        </section>
      </div>
    </PullToRefresh>
  );
}
