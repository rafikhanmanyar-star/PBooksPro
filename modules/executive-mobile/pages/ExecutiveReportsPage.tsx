import React from 'react';
import { EXECUTIVE_REPORT_LINKS } from '../constants/moduleNav';
import { ICONS } from '../../../constants';

type Props = {
  onOpenFullErpReport?: (page: string, tab?: string) => void;
};

const REPORT_GROUPS = [
  {
    id: 'financial',
    label: 'Financial Statements',
    description: 'Core accounting and performance reports',
    icon: ICONS.fileText,
    iconWrap: 'executive-metric-icon executive-metric-icon--teal',
    reportIds: ['pl', 'bs', 'cf'],
  },
  {
    id: 'operations',
    label: 'Operations',
    description: 'Collections and project reporting',
    icon: ICONS.barChart,
    iconWrap: 'executive-metric-icon executive-metric-icon--violet',
    reportIds: ['collections', 'projects'],
  },
] as const;

export default function ExecutiveReportsPage({ onOpenFullErpReport }: Props) {
  const linkById = Object.fromEntries(EXECUTIVE_REPORT_LINKS.map((link) => [link.id, link]));

  return (
    <div className="executive-home-page min-h-full pb-28">
      <div className="px-4 pt-5 pb-4 space-y-5">
        <div>
          <h1 className="text-xl font-bold text-app-text">Reports</h1>
          <p className="text-sm text-app-muted mt-1">
            View and export read-only reports. Switch to Full ERP for advanced designer tools.
          </p>
        </div>

        {REPORT_GROUPS.map((group) => {
          const links = group.reportIds
            .map((id) => linkById[id])
            .filter((link): link is (typeof EXECUTIVE_REPORT_LINKS)[number] => Boolean(link));

          if (links.length === 0) return null;

          return (
            <section key={group.id} aria-label={group.label}>
              <div className="flex items-center gap-3 mb-3 px-1">
                <span
                  className={`inline-flex w-10 h-10 items-center justify-center rounded-xl shrink-0 ${group.iconWrap}`}
                >
                  <span className="w-5 h-5">{group.icon}</span>
                </span>
                <div>
                  <h2 className="text-sm font-bold text-app-text">{group.label}</h2>
                  <p className="text-xs text-app-muted">{group.description}</p>
                </div>
              </div>
              <div className="rounded-2xl border border-app-border/60 bg-app-card shadow-ds-card overflow-hidden divide-y divide-app-border/60">
                {links.map((link) => (
                  <button
                    key={link.id}
                    type="button"
                    onClick={() => onOpenFullErpReport?.(link.page, link.tab)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left touch-manipulation min-h-[44px] active:bg-app-highlight/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-5 h-5 text-ds-primary shrink-0">{ICONS.fileText}</span>
                      <span className="font-medium text-app-text truncate">{link.label}</span>
                    </div>
                    <span className="w-4 h-4 text-app-muted shrink-0">{ICONS.chevronRight}</span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}

        <p className="text-xs text-app-muted px-1">
          PDF and Excel export are available inside each report. Profile and interface settings remain
          under the avatar on the dashboard.
        </p>
      </div>
    </div>
  );
}
