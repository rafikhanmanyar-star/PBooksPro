import React from 'react';

type Variant = 'default' | 'ledger';

interface PageRouteSkeletonProps {
  variant?: Variant;
}

/**
 * Fixed-height route fallback to reduce CLS while lazy chunks load (Phase 4).
 */
const PageRouteSkeleton: React.FC<PageRouteSkeletonProps> = ({ variant = 'default' }) => {
  const tableRows = variant === 'ledger' ? 12 : 8;
  return (
    <div
      className="w-full h-full min-h-[min(100dvh,720px)] flex flex-col p-4 md:p-6 gap-4"
      aria-busy
      aria-label="Loading page"
    >
      <div className="h-8 w-48 bg-app-toolbar rounded animate-pulse shrink-0" />
      <div className="flex flex-wrap gap-3 shrink-0">
        <div className="h-10 flex-1 min-w-[140px] max-w-xs bg-app-toolbar rounded animate-pulse" />
        <div className="h-10 w-32 bg-app-toolbar rounded animate-pulse" />
        <div className="h-10 w-32 bg-app-toolbar rounded animate-pulse" />
      </div>
      <div className="flex-1 min-h-[400px] rounded-xl border border-app-border bg-app-card overflow-hidden flex flex-col">
        <div className="h-9 border-b border-app-border bg-app-table-header shrink-0" />
        <div className="flex-1 space-y-2 p-3">
          {Array.from({ length: tableRows }).map((_, i) => (
            <div
              key={i}
              className="h-9 rounded bg-app-toolbar/80 animate-pulse"
              style={{ animationDelay: `${i * 35}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default React.memo(PageRouteSkeleton);
