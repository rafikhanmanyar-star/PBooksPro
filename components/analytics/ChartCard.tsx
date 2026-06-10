import React, { Suspense } from 'react';
import { Download, MoreHorizontal } from 'lucide-react';
import Button from '../ui/Button';

export interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onExport?: () => void;
  headerRight?: React.ReactNode;
  className?: string;
  minHeight?: number;
}

const ChartFallback: React.FC<{ minHeight: number }> = ({ minHeight }) => (
  <div
    className="w-full animate-pulse rounded-xl bg-app-toolbar/60"
    style={{ minHeight }}
  />
);

export const ChartCard: React.FC<ChartCardProps> = ({
  title,
  subtitle,
  children,
  onExport,
  headerRight,
  className = '',
  minHeight = 280,
}) => (
  <div
    className={`bg-app-card rounded-2xl border border-app-border shadow-ds-card p-4 md:p-6 min-w-0 ${className}`}
  >
    <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
      <div>
        <h3 className="text-base md:text-lg font-bold text-app-text">{title}</h3>
        {subtitle && <p className="text-xs text-app-muted mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        {headerRight}
        {onExport && (
          <Button variant="secondary" onClick={onExport} className="text-xs px-2 py-1 h-8 gap-1">
            <Download className="w-3.5 h-3.5" />
            Export
          </Button>
        )}
        {!onExport && !headerRight && (
          <MoreHorizontal className="w-4 h-4 text-app-muted opacity-40" />
        )}
      </div>
    </div>
    <Suspense fallback={<ChartFallback minHeight={minHeight} />}>{children}</Suspense>
  </div>
);

export default ChartCard;
