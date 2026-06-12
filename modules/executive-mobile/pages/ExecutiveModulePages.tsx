import React from 'react';
import { useExecutiveMode } from '../../../context/ExecutiveModeContext';
import type { ExecutiveModuleId } from '../../../types/executiveMobile.types';
import { EXECUTIVE_MODULE_LABELS } from '../constants/moduleNav';
import { useMobileDashboard } from '../hooks/useMobileDashboard';
import { ExecutiveMetricGrid } from '../components/ExecutiveMetricGrid';
import { ICONS } from '../../../constants';

export function ExecutiveModuleDashboardPage() {
  const { activeModule, setView } = useExecutiveMode();
  const summaryKey = activeModule === 'inventory' ? 'dashboard' : activeModule;
  const { data, isLoading } = useMobileDashboard(summaryKey);

  return (
    <div className="p-4 pb-28 space-y-4 bg-app-bg min-h-full">
      <button
        type="button"
        onClick={() => setView('home')}
        className="flex items-center gap-1 text-sm text-ds-primary touch-manipulation min-h-[44px]"
      >
        {ICONS.chevronLeft}
        <span>Dashboard</span>
      </button>
      <h1 className="text-lg font-bold text-app-text">
        {EXECUTIVE_MODULE_LABELS[activeModule] ?? 'Dashboard'}
      </h1>
      {activeModule === 'inventory' ? (
        <p className="text-sm text-app-muted">Inventory executive dashboard is planned for a future release.</p>
      ) : (
        <ExecutiveMetricGrid metrics={data?.metrics} loading={isLoading} />
      )}
    </div>
  );
}
