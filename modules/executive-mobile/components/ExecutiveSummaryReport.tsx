import React from 'react';
import { useMobileCommandCenter } from '../hooks/useMobileCommandCenter';
import ExecutiveKpiTicker from './ExecutiveKpiTicker';
import ExecutiveFinancialOverview from './ExecutiveFinancialOverview';
import ExecutiveProjectsOperations from './ExecutiveProjectsOperations';
import ExecutiveCollectionsHealth from './ExecutiveCollectionsHealth';
import ExecutiveApprovalAnalyticsBanner from './ExecutiveApprovalAnalyticsBanner';

/** Read-only executive summary — snapshot APIs only, no client-side GL math. */
export default function ExecutiveSummaryReport() {
  const { data, isLoading } = useMobileCommandCenter();

  if (isLoading && !data) {
    return <p className="p-4 text-sm text-app-muted">Loading executive summary…</p>;
  }

  if (!data) {
    return <p className="p-4 text-sm text-app-muted">No summary data available.</p>;
  }

  return (
    <div className="executive-v2-page space-y-4 p-4 pb-8">
      <p className="text-xs text-app-muted">
        Generated {new Date(data.generatedAt).toLocaleString()} · server snapshot
      </p>
      <ExecutiveKpiTicker items={data.ticker} />
      <ExecutiveApprovalAnalyticsBanner analytics={data.approvalAnalytics} />
      <ExecutiveFinancialOverview financial={data.financial} />
      <ExecutiveProjectsOperations projects={data.projects} />
      <ExecutiveCollectionsHealth collections={data.collections} />
    </div>
  );
}
