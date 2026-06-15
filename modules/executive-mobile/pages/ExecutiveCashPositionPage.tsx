import React from 'react';
import { useExecutiveMode } from '../../../context/ExecutiveModeContext';
import { useMobileCommandCenter } from '../hooks/useMobileCommandCenter';
import { useMobileDashboard } from '../hooks/useMobileDashboard';
import ExecutiveCommandHeader from '../components/ExecutiveCommandHeader';
import { ExecutiveMetricGrid } from '../components/ExecutiveMetricGrid';
import ExecutiveFinancialOverview from '../components/ExecutiveFinancialOverview';
import { ICONS } from '../../../constants';

export default function ExecutiveCashPositionPage() {
  const { setView } = useExecutiveMode();
  const { data: commandCenter } = useMobileCommandCenter();
  const { data: financeData, isLoading } = useMobileDashboard('finance');

  return (
    <div className="executive-v2-page min-h-full pb-28">
      <ExecutiveCommandHeader />
      <div className="px-4 pt-4 space-y-4">
        <button
          type="button"
          onClick={() => setView('home')}
          className="flex items-center gap-1 text-sm text-ds-primary touch-manipulation min-h-[44px]"
        >
          {ICONS.chevronLeft}
          <span>Command Center</span>
        </button>
        <h1 className="text-xl font-bold text-app-text">Cash Position Dashboard</h1>
        <p className="text-sm text-app-muted">Real-time treasury snapshot from server aggregates.</p>

        {commandCenter?.financial && (
          <ExecutiveFinancialOverview financial={commandCenter.financial} />
        )}

        <section className="rounded-2xl border border-app-border bg-app-card p-4">
          <h2 className="text-sm font-bold text-app-text mb-3">Accounts Detail</h2>
          <ExecutiveMetricGrid metrics={financeData?.metrics} loading={isLoading} />
        </section>
      </div>
    </div>
  );
}
