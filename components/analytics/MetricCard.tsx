import React from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronRight, type LucideIcon } from 'lucide-react';
import { CURRENCY } from '../../constants';
import { formatRoundedNumber } from '../../utils/numberUtils';
import type { MetricFormat, MetricStatus } from '../../types/dashboardMetrics.types';

export interface MetricCardProps {
  label: string;
  value: number;
  format?: MetricFormat;
  icon?: LucideIcon;
  trendPercent?: number;
  previousValue?: number;
  status?: MetricStatus;
  description?: string;
  onClick?: () => void;
  className?: string;
  /** Sidebar KPI panel: horizontal row layout */
  size?: 'default' | 'compact';
  isActive?: boolean;
}

function formatValue(value: number, format: MetricFormat): string {
  if (format === 'percent') return `${Math.round(value * 10) / 10}%`;
  if (format === 'count') return formatRoundedNumber(Math.round(value));
  return formatRoundedNumber(value);
}

function statusAccent(status?: MetricStatus): string {
  switch (status) {
    case 'positive':
      return 'text-ds-success';
    case 'negative':
      return 'text-ds-danger';
    case 'warning':
      return 'text-amber-500';
    default:
      return 'text-app-muted';
  }
}

function iconWrapClass(status?: MetricStatus): string {
  switch (status) {
    case 'positive':
      return 'bg-ds-success/10 text-ds-success border-ds-success/20';
    case 'negative':
      return 'bg-ds-danger/10 text-ds-danger border-ds-danger/20';
    case 'warning':
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
    default:
      return 'bg-app-toolbar text-app-muted border-app-border';
  }
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  format = 'currency',
  icon: Icon,
  trendPercent,
  previousValue,
  status,
  description,
  onClick,
  className = '',
  size = 'default',
  isActive = false,
}) => {
  const showTrend = trendPercent !== undefined && Number.isFinite(trendPercent);
  const trendUp = (trendPercent ?? 0) >= 0;
  const TrendIcon = trendUp ? ArrowUpRight : ArrowDownRight;

  if (size === 'compact') {
    const isNegative = value < 0;
    const displayValue =
      format === 'percent'
        ? `${Math.round(Math.abs(value) * 10) / 10}%`
        : format === 'count'
          ? formatRoundedNumber(Math.round(Math.abs(value)))
          : Math.abs(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
    const valueColor = isNegative ? 'text-ds-danger' : statusAccent(status) || 'text-ds-success';

    const compact = (
      <div
        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-app-border transition-all group ${
          isActive
            ? 'bg-primary/10 shadow-inner border-primary/30'
            : 'bg-app-card hover:bg-app-toolbar hover:shadow-sm'
        } ${onClick ? 'cursor-pointer' : ''} ${className}`}
      >
        <span className="text-sm font-medium text-app-muted truncate mr-2 text-left flex-1 group-hover:text-app-text transition-colors">
          {label}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          {showTrend && (
            <span
              className={`flex items-center gap-0.5 text-[10px] font-semibold tabular-nums ${
                trendUp ? 'text-ds-success' : 'text-ds-danger'
              }`}
            >
              <TrendIcon className="w-3 h-3" />
              {Math.abs(Math.round(trendPercent! * 10) / 10)}%
            </span>
          )}
          <span className={`text-base font-bold whitespace-nowrap tabular-nums ${valueColor}`}>
            {displayValue}
          </span>
        </div>
      </div>
    );

    if (onClick) {
      return (
        <button type="button" onClick={onClick} className="w-full text-left">
          {compact}
        </button>
      );
    }
    return compact;
  }

  const content = (
    <div
      className={`
        relative overflow-hidden bg-app-card p-4 md:p-5 rounded-2xl border border-app-border shadow-ds-card
        transition-all duration-ds group
        ${onClick ? 'hover:shadow-md hover:border-primary/40 cursor-pointer active:scale-[0.99]' : ''}
        ${className}
      `}
    >
      <div className="flex justify-between items-start gap-2 mb-3 pr-1">
        {Icon && (
          <div className={`p-2.5 rounded-xl border transition-transform group-hover:scale-105 ${iconWrapClass(status)}`}>
            <Icon className="w-4 h-4 md:w-5 md:h-5" strokeWidth={2} />
          </div>
        )}
        {showTrend && (
          <div
            className={`flex items-center gap-0.5 text-[10px] md:text-xs font-semibold px-2 py-1 rounded-full tabular-nums shrink-0 ${
              trendUp ? 'ds-badge-paid' : 'ds-badge-unpaid'
            }`}
          >
            <TrendIcon className="w-3 h-3" />
            {Math.abs(Math.round(trendPercent! * 10) / 10)}%
          </div>
        )}
      </div>

      <div>
        <p className="text-xs md:text-sm font-medium text-app-muted mb-1 line-clamp-2 leading-snug min-h-[2.5rem]">{label}</p>
        <p className={`text-xl md:text-2xl font-bold tracking-tight tabular-nums ${statusAccent(status)}`}>
          {format === 'currency' && (
            <span className="text-xs md:text-sm font-normal text-app-muted mr-1">{CURRENCY}</span>
          )}
          {formatValue(value, format)}
        </p>
        {previousValue !== undefined && format !== 'count' && (
          <p className="text-[10px] md:text-xs text-app-muted mt-1.5">
            vs prior: {format === 'currency' ? `${CURRENCY} ` : ''}
            {formatValue(previousValue, format)}
          </p>
        )}
        {description && (
          <p className="text-[10px] md:text-xs text-app-muted mt-1 truncate" title={description}>
            {description}
          </p>
        )}
      </div>

      {onClick && (
        <ChevronRight className="absolute top-4 right-4 w-4 h-4 text-app-muted opacity-0 transition-opacity pointer-events-none max-md:hidden [@media(hover:hover)]:group-hover:opacity-100" />
      )}
    </div>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="w-full text-left">
        {content}
      </button>
    );
  }
  return content;
};

export default MetricCard;
