import React, { useState } from 'react';
import { ICONS } from '../../../constants';
import type { ExecutiveModuleId } from '../../../types/executiveMobile.types';
import { EXECUTIVE_MODULE_NAV } from '../constants/moduleNav';
import { useMobileDashboard } from '../hooks/useMobileDashboard';
import ExecutiveKpiCard from './ExecutiveKpiCard';
import { useExecutiveMode } from '../../../context/ExecutiveModeContext';

type Section = {
  id: string;
  label: string;
  moduleId: ExecutiveModuleId;
};

function AccordionPanel({ section }: { section: Section }) {
  const nav = EXECUTIVE_MODULE_NAV.find((m) => m.id === section.moduleId);
  const summaryKey = nav?.summaryKey ?? section.moduleId;
  const { data, isLoading } = useMobileDashboard(
    summaryKey === 'dashboard' ? 'dashboard' : (summaryKey as ExecutiveModuleId)
  );
  const { openModule } = useExecutiveMode();

  if (nav && !nav.enabled) {
    return (
      <p className="text-sm text-app-muted py-2">
        {nav.phase ?? 'This module dashboard is not available yet.'}
      </p>
    );
  }

  if (isLoading) {
    return (
      <div className="flex gap-2 overflow-x-auto py-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="shrink-0 w-[9rem] h-[6.5rem] rounded-xl bg-app-surface-2 animate-pulse" />
        ))}
      </div>
    );
  }

  const metrics = data?.metrics ?? [];
  if (metrics.length === 0) {
    return <p className="text-sm text-app-muted py-2">No metrics for this period.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory scrollbar-hide">
        {metrics.slice(0, 4).map((m) => (
          <div key={m.id} className="snap-start">
            <ExecutiveKpiCard metric={m} compact />
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => openModule(section.moduleId)}
        className="text-sm font-medium text-ds-primary touch-manipulation min-h-[44px] flex items-center"
      >
        View full dashboard →
      </button>
    </div>
  );
}

export default function ExecutiveModuleAccordion({ sections }: { sections: Section[] }) {
  const [expanded, setExpanded] = useState<string | null>(sections[0]?.id ?? null);

  if (sections.length === 0) return null;

  return (
    <section className="space-y-2" aria-label="Module dashboards">
      <h2 className="text-base font-semibold text-app-text px-1">Module Dashboards</h2>
      {sections.map((section) => {
        const isOpen = expanded === section.id;
        const nav = EXECUTIVE_MODULE_NAV.find((m) => m.id === section.moduleId);
        return (
          <div
            key={section.id}
            className="rounded-2xl border border-app-border bg-app-card shadow-ds-card overflow-hidden executive-accordion"
          >
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : section.id)}
              className="w-full flex items-center gap-3 p-4 text-left touch-manipulation min-h-[44px] transition-colors active:bg-app-highlight"
              aria-expanded={isOpen}
            >
              <span className="w-9 h-9 flex items-center justify-center rounded-xl bg-ds-primary/10 text-ds-primary shrink-0">
                <span className="w-5 h-5">{nav?.icon ?? ICONS.barChart}</span>
              </span>
              <span className="flex-1 font-semibold text-app-text">{section.label}</span>
              <span
                className={`w-5 h-5 text-app-muted transition-transform duration-200 ${
                  isOpen ? 'rotate-180' : ''
                }`}
              >
                {ICONS.chevronDown}
              </span>
            </button>
            {isOpen && (
              <div className="px-4 pb-4 pt-0 border-t border-app-border animate-fade-in">
                <AccordionPanel section={section} />
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
