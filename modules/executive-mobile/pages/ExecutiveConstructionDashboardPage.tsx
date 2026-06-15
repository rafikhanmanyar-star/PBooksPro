import React from 'react';
import { useExecutiveMode } from '../../../context/ExecutiveModeContext';
import { useMobileCommandCenter } from '../hooks/useMobileCommandCenter';
import { useMobileDashboard } from '../hooks/useMobileDashboard';
import ExecutiveCommandHeader from '../components/ExecutiveCommandHeader';
import { ExecutiveMetricGrid } from '../components/ExecutiveMetricGrid';
import { ICONS } from '../../../constants';
import { formatExecutiveValue } from '../utils/executiveFormatters';

export default function ExecutiveConstructionDashboardPage() {
  const { setView } = useExecutiveMode();
  const { data: commandCenter } = useMobileCommandCenter();
  const { data, isLoading } = useMobileDashboard('construction');
  const c = commandCenter?.construction;

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
        <h1 className="text-xl font-bold text-app-text">Construction Health</h1>
        <p className="text-sm text-app-muted">Site spend, vendor payments, and outstanding bills.</p>

        {c && (
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Site Expenses', value: c.siteExpenses },
              { label: 'Vendor Payments', value: c.vendorPayments },
              { label: 'Material Cost', value: c.materialCost },
              { label: 'Outstanding Bills', value: c.outstandingBills },
            ].map((m) => (
              <div key={m.label} className="rounded-2xl border border-app-border bg-app-card p-4">
                <p className="text-[10px] text-app-muted uppercase tracking-wide">{m.label}</p>
                <p className="text-lg font-bold tabular-nums mt-1">{formatExecutiveValue(m.value)}</p>
              </div>
            ))}
          </div>
        )}

        <section className="rounded-2xl border border-app-border bg-app-card p-4">
          <h2 className="text-sm font-bold text-app-text mb-3">Construction KPIs</h2>
          <ExecutiveMetricGrid metrics={data?.metrics} loading={isLoading} />
        </section>
      </div>
    </div>
  );
}
