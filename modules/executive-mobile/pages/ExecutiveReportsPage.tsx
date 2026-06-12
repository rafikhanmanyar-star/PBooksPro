import React from 'react';
import { EXECUTIVE_REPORT_LINKS } from '../constants/moduleNav';
import { ICONS } from '../../../constants';

type Props = {
  onOpenFullErpReport?: (page: string, tab?: string) => void;
};

export default function ExecutiveReportsPage({ onOpenFullErpReport }: Props) {
  return (
    <div className="p-4 pb-24 space-y-4">
      <div>
        <h1 className="text-lg font-bold text-app-text">Reports</h1>
        <p className="text-xs text-app-muted mt-1">
          View and export reports. Create, edit, and post actions are disabled in executive mode.
        </p>
      </div>

      <div className="space-y-2">
        {EXECUTIVE_REPORT_LINKS.map((link) => (
          <button
            key={link.id}
            type="button"
            onClick={() => onOpenFullErpReport?.(link.page, link.tab)}
            className="w-full flex items-center justify-between p-4 rounded-xl bg-app-card border border-app-border touch-manipulation active:bg-app-highlight"
          >
            <div className="flex items-center gap-3">
              <div className="text-green-600">{ICONS.fileText}</div>
              <span className="font-medium text-app-text">{link.label}</span>
            </div>
            {ICONS.chevronRight}
          </button>
        ))}
      </div>

      <p className="text-xs text-app-muted px-1">
        PDF and Excel export are available inside each report when opened. Switch to Full ERP mode in
        Settings for advanced report designer access.
      </p>
    </div>
  );
}
