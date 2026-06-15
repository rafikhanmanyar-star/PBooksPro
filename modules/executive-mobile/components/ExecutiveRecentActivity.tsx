import React from 'react';
import type { ExecutiveActivityItem } from '../../../types/executiveMobile.types';
import { ICONS } from '../../../constants';
import { relativeTime } from '../utils/executiveFormatters';

const KIND_META: Record<
  ExecutiveActivityItem['kind'],
  { icon: React.ReactNode; wrap: string }
> = {
  contract: { icon: ICONS.checkCircle, wrap: 'executive-metric-icon--green' },
  vendor_bill: { icon: ICONS.fileText, wrap: 'executive-metric-icon--amber' },
  payment: { icon: ICONS.wallet, wrap: 'executive-metric-icon--blue' },
  approval: { icon: ICONS.checkCircle, wrap: 'executive-metric-icon--teal' },
  invoice: { icon: ICONS.fileText, wrap: 'executive-metric-icon--violet' },
  transaction: { icon: ICONS.activity, wrap: 'executive-metric-icon--muted' },
};

type Props = {
  items: ExecutiveActivityItem[];
  onViewAll?: () => void;
};

export default function ExecutiveRecentActivity({ items, onViewAll }: Props) {
  return (
    <section className="mx-4 rounded-2xl border border-app-border/60 bg-app-card shadow-ds-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-app-border/40">
        <h2 className="text-sm font-bold text-app-text">Recent Activity</h2>
        {onViewAll && (
          <button type="button" onClick={onViewAll} className="text-xs font-semibold text-ds-primary touch-manipulation">
            View All
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-app-muted p-4">No recent activity.</p>
      ) : (
        <ul className="divide-y divide-app-border/40">
          {items.slice(0, 5).map((item) => {
            const meta = KIND_META[item.kind];
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left touch-manipulation active:bg-app-highlight/50"
                >
                  <span className={`w-10 h-10 rounded-xl shrink-0 inline-flex items-center justify-center ${meta.wrap}`}>
                    <span className="w-5 h-5">{meta.icon}</span>
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-app-text leading-snug truncate">{item.title}</p>
                    {item.subtitle && (
                      <p className="text-xs text-app-muted truncate mt-0.5">{item.subtitle}</p>
                    )}
                    <p className="text-[10px] text-app-muted mt-1">{relativeTime(item.occurredAt)}</p>
                  </div>
                  <span className="w-4 h-4 text-app-muted shrink-0">{ICONS.chevronRight}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
