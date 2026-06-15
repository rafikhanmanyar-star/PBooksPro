import React from 'react';
import type { ExecutiveCommandCenterResponse } from '../../../types/executiveMobile.types';
import { APPROVAL_TYPE_META } from '../constants/mobileCategories';

type Props = {
  analytics: ExecutiveCommandCenterResponse['approvalAnalytics'];
};

export default function ExecutiveApprovalAnalyticsBanner({ analytics }: Props) {
  if (analytics.pendingTotal === 0) return null;

  return (
    <div className="mx-4 rounded-xl border border-amber-400/30 bg-amber-500/5 px-4 py-3">
      <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Approval Analytics</p>
      <p className="text-sm text-app-text mt-1">
        <span className="font-bold tabular-nums">{analytics.pendingActionable}</span> need your action
        {analytics.newSinceYesterday > 0 && (
          <span className="text-app-muted"> · {analytics.newSinceYesterday} new since yesterday</span>
        )}
      </p>
      <div className="flex flex-wrap gap-2 mt-2">
        {Object.entries(analytics.byType).map(([type, count]) => (
          <span
            key={type}
            className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-app-card border border-app-border text-app-muted"
          >
            {APPROVAL_TYPE_META[type as keyof typeof APPROVAL_TYPE_META]?.shortLabel ?? type}: {count}
          </span>
        ))}
      </div>
    </div>
  );
}
