import React from 'react';
import { useMobileDashboard } from '../hooks/useMobileDashboard';
import { ExecutiveMetricGrid } from '../components/ExecutiveMetricGrid';
import ExecutiveHeroIllustration from '../components/ExecutiveHeroIllustration';
import ExecutiveModuleRow from '../components/ExecutiveModuleRow';
import { useAuth } from '../../../context/AuthContext';
import { useExecutiveMode } from '../../../context/ExecutiveModeContext';
import type { ExecutiveModuleId } from '../../../types/executiveMobile.types';
import { EXECUTIVE_MODULE_NAV } from '../constants/moduleNav';

const HOME_MODULE_ORDER: (ExecutiveModuleId | 'inventory')[] = [
  'sales',
  'crm',
  'projects',
  'inventory',
  'propertySelling',
  'rentals',
];

export default function ExecutiveHomePage() {
  const { tenant, user } = useAuth();
  const { openModule } = useExecutiveMode();
  const { data, isLoading } = useMobileDashboard('dashboard');

  const homeModules = HOME_MODULE_ORDER.map((id) =>
    EXECUTIVE_MODULE_NAV.find((m) => m.id === id)
  ).filter(Boolean);

  return (
    <div className="pb-28 bg-slate-50/80 dark:bg-app-bg min-h-full">
      {/* Hero */}
      <section className="px-4 pt-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-app-muted">Executive overview</p>
            <h1 className="text-2xl font-bold text-app-text leading-tight mt-0.5">
              {tenant?.companyName ?? tenant?.name}
            </h1>
            <p className="text-sm text-app-muted mt-2">
              Welcome, {user?.name?.split(/\s+/)[0] ?? user?.name} 👋
            </p>
          </div>
          <ExecutiveHeroIllustration />
        </div>
      </section>

      {/* Key metrics */}
      <section className="px-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-app-text">Key metrics</h2>
          <button
            type="button"
            onClick={() => openModule('finance')}
            className="text-sm font-medium text-emerald-600 touch-manipulation"
          >
            View all &gt;
          </button>
        </div>
        <ExecutiveMetricGrid metrics={data?.metrics} loading={isLoading} />
      </section>

      {/* Modules */}
      <section className="px-4">
        <h2 className="text-base font-semibold text-app-text mb-3">Modules</h2>
        <div className="grid grid-cols-2 gap-2.5">
          {homeModules.map((mod) =>
            mod ? (
              <ExecutiveModuleRow
                key={mod.id}
                label={mod.label}
                icon={mod.icon}
                disabled={!mod.enabled}
                phase={mod.phase}
                onClick={() => {
                  if (mod.enabled && mod.id !== 'dashboard') {
                    openModule(mod.id as ExecutiveModuleId);
                  }
                }}
              />
            ) : null
          )}
        </div>
      </section>
    </div>
  );
}
