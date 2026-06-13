import React, { useState } from 'react';
import { ICONS } from '../../../constants';
import type { ExecutiveModuleId } from '../../../types/executiveMobile.types';
import { EXECUTIVE_MODULE_NAV } from '../constants/moduleNav';
import { useMobileDashboard } from '../hooks/useMobileDashboard';
import ExecutiveAccordionMetricGrid from './ExecutiveAccordionMetricGrid';
import { useExecutiveMode } from '../../../context/ExecutiveModeContext';

type Section = {
  id: string;
  label: string;
  moduleId: ExecutiveModuleId;
};

const MODULE_HEADER_STYLES: Record<string, string> = {
  projects: 'executive-module-icon executive-module-icon--green',
  construction: 'executive-module-icon executive-module-icon--green',
  finance: 'executive-module-icon executive-module-icon--teal',
  hr: 'executive-module-icon executive-module-icon--blue',
  crm: 'executive-module-icon executive-module-icon--violet',
  inventory: 'executive-module-icon executive-module-icon--amber',
  sales: 'executive-module-icon executive-module-icon--teal',
  rentals: 'executive-module-icon executive-module-icon--violet',
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

  return (
    <div className="space-y-3">
      <ExecutiveAccordionMetricGrid metrics={data?.metrics} loading={isLoading} />
      <button
        type="button"
        onClick={() => openModule(section.moduleId)}
        className="text-sm font-semibold text-ds-primary touch-manipulation min-h-[44px] flex items-center w-full"
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
    <section className="space-y-3" aria-label="Module dashboards">
      {sections.map((section) => {
        const isOpen = expanded === section.id;
        const nav = EXECUTIVE_MODULE_NAV.find((m) => m.id === section.moduleId);
        const headerStyle =
          MODULE_HEADER_STYLES[section.moduleId] ??
          MODULE_HEADER_STYLES[section.id] ??
          'executive-module-icon executive-module-icon--teal';

        return (
          <div
            key={section.id}
            className="rounded-2xl border border-app-border/60 bg-app-card/90 shadow-ds-card overflow-hidden executive-accordion"
          >
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : section.id)}
              className="w-full flex items-center gap-3 p-4 text-left touch-manipulation min-h-[44px] transition-colors active:bg-app-highlight/50"
              aria-expanded={isOpen}
            >
              <span className={`w-10 h-10 flex items-center justify-center rounded-xl shrink-0 ${headerStyle}`}>
                <span className="w-5 h-5">{nav?.icon ?? ICONS.briefcase}</span>
              </span>
              <span className="flex-1 font-bold text-app-text">{section.label}</span>
              <span
                className={`w-5 h-5 text-app-muted transition-transform duration-200 ${
                  isOpen ? '' : 'rotate-180'
                }`}
              >
                {ICONS.chevronDown}
              </span>
            </button>
            {isOpen && (
              <div className="px-4 pb-4 pt-0 animate-fade-in">
                <AccordionPanel section={section} />
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
