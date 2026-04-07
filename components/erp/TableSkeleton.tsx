import React from 'react';

export interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  className?: string;
}

export const TableSkeleton: React.FC<TableSkeletonProps> = ({ rows = 8, columns = 5, className = '' }) => {
  return (
    <div className={`animate-pulse rounded-ds-md border border-app-border overflow-hidden ${className}`} aria-busy="true" aria-label="Loading table">
      <div className="grid gap-px bg-app-border p-px" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {Array.from({ length: columns }).map((_, c) => (
          <div key={`h-${c}`} className="h-9 bg-app-table-header/80" />
        ))}
        {Array.from({ length: rows * columns }).map((_, i) => (
          <div key={`c-${i}`} className="h-10 bg-app-card" />
        ))}
      </div>
    </div>
  );
};

export default TableSkeleton;
