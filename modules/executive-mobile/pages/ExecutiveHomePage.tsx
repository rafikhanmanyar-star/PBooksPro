import React from 'react';
import { useMobileDashboard } from '../hooks/useMobileDashboard';
import { ExecutiveMetricGrid } from '../components/ExecutiveMetricGrid';
import { useAuth } from '../../../context/AuthContext';
import { useExecutiveMode } from '../../../context/ExecutiveModeContext';
import type { ExecutiveModuleId } from '../../../types/executiveMobile.types';
import { EXECUTIVE_MODULE_NAV } from '../constants/moduleNav';

export default function ExecutiveHomePage() {
  const { tenant, user } = useAuth();
  const { openModule } = useExecutiveMode();
  const { data, isLoading } = useMobileDashboard('dashboard');

  const quickModules = EXECUTIVE_MODULE_NAV.filter(
    (m) => m.enabled && m.summaryKey && m.id !== 'dashboard'
  ).slice(0, 6);

  return (
    <div className="p-4 pb-24 space-y-6">
      <header>
        <p className="text-sm text-app-muted">Executive overview</p>
        <h1 className="text-xl font-bold text-app-text">{tenant?.companyName ?? tenant?.name}</h1>
        <p className="text-xs text-app-muted mt-1">Welcome, {user?.name}</p>
      </header>

      <section>
        <h2 className="text-sm font-semibold text-app-text mb-3">Key metrics</h2>
        <ExecutiveMetricGrid metrics={data?.metrics} loading={isLoading} />
      </section>

      <section>
        <h2 className="text-sm font-semibold text-app-text mb-3">Modules</h2>
        <div className="grid grid-cols-3 gap-2">
          {quickModules.map((mod) => (
            <button
              key={mod.id}
              type="button"
              onClick={() => openModule(mod.id as ExecutiveModuleId)}
              className="flex flex-col items-center gap-2 p-3 rounded-xl bg-app-card border border-app-border touch-manipulation active:bg-app-highlight"
            >
              <div className="w-8 h-8 text-green-600">{mod.icon}</div>
              <span className="text-[11px] text-center text-app-text leading-tight">{mod.label}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
