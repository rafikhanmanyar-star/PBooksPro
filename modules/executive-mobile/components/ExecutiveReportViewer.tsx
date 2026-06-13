import React, { Suspense, lazy } from 'react';
import { ICONS } from '../../../constants';
import { usePermissions } from '../../../hooks/usePermissions';
import type { ExecutiveReportId } from '../constants/moduleNav';

const REPORT_COMPONENTS: Record<ExecutiveReportId, React.LazyExoticComponent<React.FC>> = {
  pl: lazy(() => import('../../../components/reports/ProjectProfitLossReport')),
  bs: lazy(() => import('../../../components/reports/ProjectBalanceSheetReport')),
  cf: lazy(() => import('../../../components/reports/ProjectCashFlowReport')),
  collections: lazy(() => import('../../../modules/collections-analytics/CollectionsAnalyticsPage')),
  projects: lazy(() => import('../../../components/dashboard/ProjectBuildingFundsReport')),
};

function canViewReport(id: ExecutiveReportId, perms: ReturnType<typeof usePermissions>): boolean {
  switch (id) {
    case 'pl':
      return perms.canReadProfitLoss;
    case 'bs':
      return perms.canReadBalanceSheet;
    case 'cf':
      return perms.canReadCashFlow;
    default:
      return true;
  }
}

type Props = {
  reportId: ExecutiveReportId;
  title: string;
  onBack: () => void;
};

export default function ExecutiveReportViewer({ reportId, title, onBack }: Props) {
  const perms = usePermissions();
  const allowed = canViewReport(reportId, perms);
  const ReportComponent = REPORT_COMPONENTS[reportId];

  return (
    <div className="executive-home-page flex flex-col min-h-full pb-28">
      <header className="sticky top-0 z-10 shrink-0 flex items-center gap-2 px-3 py-3 border-b border-app-border/60 bg-app-card/95 backdrop-blur-sm">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-sm font-semibold text-ds-primary touch-manipulation min-h-[44px] px-1 shrink-0"
        >
          <span className="w-5 h-5">{ICONS.chevronLeft}</span>
          <span>Reports</span>
        </button>
        <h1 className="text-base font-bold text-app-text truncate flex-1 min-w-0">{title}</h1>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {!allowed ? (
          <p className="p-4 text-sm text-app-muted">You do not have permission to view this report.</p>
        ) : (
          <Suspense fallback={<p className="p-4 text-sm text-app-muted">Loading report…</p>}>
            <ReportComponent />
          </Suspense>
        )}
      </div>
    </div>
  );
}
