import React from 'react';
import type { ExecutiveCommandCenterResponse } from '../../../types/executiveMobile.types';
import { getApprovalTypeMeta } from '../constants/mobileCategories';

type Props = {
  analytics: ExecutiveCommandCenterResponse['approvalAnalytics'];
};

export default function ExecutiveApprovalAnalyticsBanner({ analytics }: Props) {
  if (analytics.pendingTotal === 0) return null;

  return (
    <div className="rounded-2xl border border-amber-400/25 bg-gradient-to-br from-amber-500/10 to-transparent px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-300">
            Needs attention
          </p>
          <p className="text-sm text-app-text mt-1">
            <span className="font-bold tabular-nums text-lg">{analytics.pendingActionable}</span>
            <span className="text-app-muted"> awaiting your decision</span>
          </p>
          {analytics.newSinceYesterday > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-200 mt-1">
              +{analytics.newSinceYesterday} new since yesterday
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] uppercase tracking-wider text-app-muted">In queue</p>
          <p className="text-xl font-bold tabular-nums text-app-text">{analytics.pendingTotal}</p>
        </div>
      </div>
      {Object.keys(analytics.byType).length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {Object.entries(analytics.byType).map(([type, count]) => (
            <span
              key={type}
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-app-card/80 border border-app-border/60 text-app-muted"
            >
              {getApprovalTypeMeta(type).shortLabel}: {count}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
