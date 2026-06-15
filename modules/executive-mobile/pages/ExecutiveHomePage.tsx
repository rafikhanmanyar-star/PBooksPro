import React, { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { useExecutiveMode } from '../../../context/ExecutiveModeContext';
import { useMobileCommandCenter, MOBILE_COMMAND_CENTER_KEY } from '../hooks/useMobileCommandCenter';
import { useMobileNotifications } from '../hooks/useMobileNotifications';
import { useMobileApprovals } from '../hooks/useMobileApprovals';
import { bulkApproveMobileItems } from '../../../services/api/mobileCommandCenterApi';
import { useNotification } from '../../../context/NotificationContext';
import { formatApiErrorMessage } from '../../../utils/formatApiErrorMessage';
import PullToRefresh from '../components/PullToRefresh';
import ExecutiveCommandHeader from '../components/ExecutiveCommandHeader';
import ExecutiveKpiTicker from '../components/ExecutiveKpiTicker';
import ExecutiveQuickActionsPanel from '../components/ExecutiveQuickActionsPanel';
import ExecutiveFinancialOverview from '../components/ExecutiveFinancialOverview';
import ExecutiveProjectsOperations from '../components/ExecutiveProjectsOperations';
import ExecutiveCollectionsHealth from '../components/ExecutiveCollectionsHealth';
import ExecutiveRecentActivity from '../components/ExecutiveRecentActivity';
import ExecutiveApprovalAnalyticsBanner from '../components/ExecutiveApprovalAnalyticsBanner';
import ExecutiveModuleAccordion from '../components/ExecutiveModuleAccordion';
import { useExecutiveModules } from '../hooks/useExecutiveModules';
import type { QuickActionId } from '../../../types/executiveMobile.types';
import { todayLocalYyyyMmDd } from '../../../utils/dateUtils';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

export default function ExecutiveHomePage() {
  const { user } = useAuth();
  const { setView, openModule } = useExecutiveMode();
  const { accordionSections } = useExecutiveModules();
  const { data, isLoading, refetch, isFetching } = useMobileCommandCenter();
  const { data: notifications } = useMobileNotifications();
  const { data: approvals } = useMobileApprovals();
  const { showToast } = useNotification();
  const queryClient = useQueryClient();

  const firstName = user?.name?.split(/\s+/)[0] ?? user?.name ?? 'there';
  const notifCount = notifications?.length ?? 0;
  const todayLabel = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }, []);

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      refetch(),
      queryClient.invalidateQueries({ queryKey: MOBILE_COMMAND_CENTER_KEY }),
      queryClient.invalidateQueries({ queryKey: ['mobile-notifications'] }),
      queryClient.invalidateQueries({ queryKey: ['mobile-approvals'] }),
    ]);
  }, [refetch, queryClient]);

  const handleKpiClick = useCallback(
    (id: string) => {
      if (id === 'pendingApprovals') setView('approvals');
      else if (id === 'criticalAlerts') setView('inbox');
      else if (id === 'projectsAtRisk') setView('constructionDashboard');
      else if (id === 'collectionsToday') setView('reports');
      else setView('cashPosition');
    },
    [setView]
  );

  const handleQuickAction = useCallback(
    async (id: QuickActionId) => {
      switch (id) {
        case 'approve_all': {
          const actionable = (approvals ?? []).filter((a) => a.canApprove && !a.requiresFullErp);
          if (actionable.length === 0) {
            showToast('No approvals ready for bulk action.', 'info');
            return;
          }
          try {
            const result = await bulkApproveMobileItems(
              actionable.map((a) => ({ type: a.type, id: a.id }))
            );
            showToast(`Approved ${result.approved} item(s).`, 'success');
            if (result.failed.length > 0) {
              showToast(`${result.failed.length} could not be approved.`, 'error');
            }
            await handleRefresh();
          } catch (e) {
            showToast(formatApiErrorMessage(e), 'error');
          }
          break;
        }
        case 'review_contracts':
          setView('approvals');
          break;
        case 'view_collections':
          setView('reports');
          break;
        case 'review_vendor_bills':
          setView('approvals');
          break;
        case 'retention_releases':
          setView('constructionDashboard');
          break;
        case 'quick_capture':
          setView('quickTransaction');
          break;
        case 'construction_health':
          setView('constructionDashboard');
          break;
        default:
          break;
      }
    },
    [approvals, setView, showToast, handleRefresh]
  );

  return (
    <PullToRefresh onRefresh={handleRefresh} className="min-h-full executive-home-page executive-v2-page">
      <ExecutiveCommandHeader notifCount={notifCount} />

      <div className="pb-28 space-y-5 pt-4">
        <section className="px-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-app-text leading-tight">
              {greeting()}, {firstName} 👋
            </h1>
            <p className="text-sm text-app-muted mt-1">Here&apos;s your business summary for today.</p>
          </div>
          <div
            className="shrink-0 px-3 py-2 rounded-xl border border-app-border/60 bg-app-card text-xs font-medium text-app-muted flex items-center gap-1.5"
            aria-label={`Summary date ${todayLabel}`}
          >
            <span aria-hidden>📅</span>
            {todayLabel}
          </div>
        </section>

        <ExecutiveKpiTicker
          items={data?.ticker ?? []}
          loading={isLoading}
          onItemClick={handleKpiClick}
        />

        {data?.approvalAnalytics && (
          <ExecutiveApprovalAnalyticsBanner analytics={data.approvalAnalytics} />
        )}

        <ExecutiveQuickActionsPanel onAction={handleQuickAction} />

        {data && (
          <>
            <ExecutiveFinancialOverview
              financial={data.financial}
              onViewAll={() => setView('cashPosition')}
            />
            <ExecutiveProjectsOperations
              projects={data.projects}
              onViewAll={() => openModule('projects')}
            />
            <ExecutiveCollectionsHealth
              collections={data.collections}
              onViewAll={() => setView('reports')}
            />
            <ExecutiveRecentActivity
              items={data.recentActivity}
              onViewAll={() => setView('inbox')}
            />
          </>
        )}

        {isLoading && !data && (
          <div className="px-4 space-y-3">
            <div className="h-32 rounded-2xl bg-app-card animate-pulse" />
            <div className="h-32 rounded-2xl bg-app-card animate-pulse" />
          </div>
        )}

        <section className="px-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-app-text">Module Dashboards</h3>
            <button
              type="button"
              onClick={() => void handleRefresh()}
              disabled={isFetching}
              className="text-xs font-semibold text-ds-primary touch-manipulation disabled:opacity-50"
            >
              {isFetching ? 'Updating…' : 'Live Update'}
            </button>
          </div>
          <ExecutiveModuleAccordion sections={accordionSections} />
        </section>

        <p className="text-[10px] text-center text-app-muted px-4 pb-2">
          Snapshot as of {data?.generatedAt ? new Date(data.generatedAt).toLocaleTimeString() : todayLocalYyyyMmDd()}
        </p>
      </div>
    </PullToRefresh>
  );
}
