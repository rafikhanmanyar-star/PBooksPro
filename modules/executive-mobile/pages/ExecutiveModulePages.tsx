import React from 'react';
import { useExecutiveMode } from '../../../context/ExecutiveModeContext';
import type { ExecutiveModuleId } from '../../../types/executiveMobile.types';
import { EXECUTIVE_MODULE_LABELS, EXECUTIVE_MODULE_NAV } from '../constants/moduleNav';
import { useMobileDashboard } from '../hooks/useMobileDashboard';
import { ExecutiveMetricGrid } from '../components/ExecutiveMetricGrid';
import { ICONS } from '../../../constants';

export function ExecutiveModuleHubPage() {
  const { openModule, setView } = useExecutiveMode();

  return (
    <div className="p-4 pb-24 space-y-4">
      <h1 className="text-lg font-bold text-app-text">Modules</h1>
      <div className="space-y-2">
        {EXECUTIVE_MODULE_NAV.map((mod) => (
          <button
            key={mod.id}
            type="button"
            disabled={!mod.enabled}
            onClick={() => {
              if (mod.id === 'quickTransaction') {
                setView('quickTransaction');
                return;
              }
              if (mod.id === 'approvals') {
                setView('approvals');
                return;
              }
              if (mod.id === 'notifications') {
                setView('notifications');
                return;
              }
              if (mod.enabled && mod.summaryKey) {
                openModule(mod.id as ExecutiveModuleId);
              }
            }}
            className={`w-full flex items-center gap-3 p-4 rounded-xl border text-left touch-manipulation ${
              mod.enabled
                ? 'bg-app-card border-app-border active:bg-app-highlight'
                : 'bg-app-bg border-app-border opacity-60'
            }`}
          >
            <div className="w-10 h-10 flex items-center justify-center text-green-600 shrink-0">
              {mod.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-app-text">{mod.label}</p>
              {mod.phase && <p className="text-xs text-app-muted">{mod.phase}</p>}
            </div>
            {mod.enabled && <div className="text-app-muted">{ICONS.chevronRight}</div>}
          </button>
        ))}
      </div>

      <section className="pt-2 border-t border-app-border">
        <h2 className="text-sm font-semibold text-app-text mb-3">More</h2>
        <div className="space-y-2">
          {[
            { view: 'reports' as const, label: 'Reports', icon: ICONS.fileText },
            { view: 'myTransactions' as const, label: 'My quick transactions', icon: ICONS.list },
            { view: 'settings' as const, label: 'Settings', icon: ICONS.settings },
          ].map((item) => (
            <button
              key={item.view}
              type="button"
              onClick={() => setView(item.view)}
              className="w-full flex items-center gap-3 p-4 rounded-xl border text-left touch-manipulation bg-app-card border-app-border active:bg-app-highlight"
            >
              <div className="w-10 h-10 flex items-center justify-center text-green-600 shrink-0">
                {item.icon}
              </div>
              <p className="font-medium text-app-text flex-1">{item.label}</p>
              <div className="text-app-muted">{ICONS.chevronRight}</div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

export function ExecutiveModuleDashboardPage() {
  const { activeModule, setView } = useExecutiveMode();
  const summaryKey = activeModule === 'inventory' ? 'dashboard' : activeModule;
  const { data, isLoading } = useMobileDashboard(summaryKey);

  return (
    <div className="p-4 pb-24 space-y-4">
      <button
        type="button"
        onClick={() => setView('moduleList')}
        className="flex items-center gap-1 text-sm text-green-600 touch-manipulation"
      >
        {ICONS.chevronLeft}
        <span>All modules</span>
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
