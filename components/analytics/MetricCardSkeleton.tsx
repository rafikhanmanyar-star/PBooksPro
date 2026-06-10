import React from 'react';

export const MetricCardSkeleton: React.FC = () => (
  <div className="bg-app-card p-4 md:p-5 rounded-2xl border border-app-border shadow-ds-card animate-pulse">
    <div className="flex justify-between items-start mb-3">
      <div className="w-10 h-10 rounded-xl bg-app-toolbar" />
      <div className="w-14 h-6 rounded-full bg-app-toolbar" />
    </div>
    <div className="h-3 w-24 rounded bg-app-toolbar mb-2" />
    <div className="h-7 w-32 rounded bg-app-toolbar" />
  </div>
);

export const MetricCardGridSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
    {Array.from({ length: count }).map((_, i) => (
      <MetricCardSkeleton key={i} />
    ))}
  </div>
);

export default MetricCardSkeleton;
