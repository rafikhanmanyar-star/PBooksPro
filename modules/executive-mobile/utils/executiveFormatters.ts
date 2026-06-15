import { CURRENCY } from '../../../constants';
import type { MobileMetric } from '../../../types/executiveMobile.types';
import type { ExecutiveKpiTickerItem } from '../../../types/executiveMobile.types';

export function formatExecutiveValue(
  value: number,
  format: 'currency' | 'number' | 'percent' = 'currency'
): string {
  if (format === 'percent') return `${value.toFixed(0)}%`;
  if (format === 'number') return value.toLocaleString();
  if (value >= 1_000_000) return `${CURRENCY} ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${CURRENCY} ${(value / 1_000).toFixed(0)}k`;
  return `${CURRENCY} ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function formatMetricValue(metric: MobileMetric | ExecutiveKpiTickerItem): string {
  const fmt = metric.format ?? 'currency';
  return formatExecutiveValue(metric.value, fmt);
}

export function formatTrend(trend?: number | null, suffix = '%'): string | null {
  if (trend === null || trend === undefined || Number.isNaN(trend)) return null;
  const sign = trend > 0 ? '↑' : trend < 0 ? '↓' : '→';
  return `${sign} ${Math.abs(trend).toFixed(0)}${suffix}`;
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
