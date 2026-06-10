import type { DashboardComparisonPeriod, DashboardFilters } from './dashboardMetricsTypes.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateOnly(s: string): boolean {
  return DATE_RE.test(s);
}

export function parseDateOnly(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toDateOnlyString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** First day of current calendar month through today. */
export function defaultDashboardPeriod(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: toDateOnlyString(from), to: toDateOnlyString(now) };
}

export function daysBetweenInclusive(from: string, to: string): number {
  const a = parseDateOnly(from).getTime();
  const b = parseDateOnly(to).getTime();
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

/** Comparison window immediately before `from`. */
export function previousPeriodRange(from: string, to: string): { from: string; to: string } {
  const span = daysBetweenInclusive(from, to);
  const end = parseDateOnly(from);
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - (span - 1));
  return { from: toDateOnlyString(start), to: toDateOnlyString(end) };
}

/** Same calendar dates one year earlier. */
export function previousYearRange(from: string, to: string): { from: string; to: string } {
  const f = parseDateOnly(from);
  const t = parseDateOnly(to);
  f.setFullYear(f.getFullYear() - 1);
  t.setFullYear(t.getFullYear() - 1);
  return { from: toDateOnlyString(f), to: toDateOnlyString(t) };
}

export function resolveComparisonRange(
  filters: Pick<DashboardFilters, 'from' | 'to' | 'comparisonPeriod'>
): { from: string; to: string } | null {
  if (filters.comparisonPeriod === 'none') return null;
  if (filters.comparisonPeriod === 'previous_year') {
    return previousYearRange(filters.from, filters.to);
  }
  return previousPeriodRange(filters.from, filters.to);
}

export function computeTrendPercent(current: number, previous: number | undefined): number | undefined {
  if (previous === undefined) return undefined;
  if (previous === 0) {
    if (current === 0) return 0;
    return current > 0 ? 100 : -100;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function metricStatusForTrend(
  trendPercent: number | undefined,
  higherIsBetter = true
): 'positive' | 'negative' | 'neutral' | undefined {
  if (trendPercent === undefined || Math.abs(trendPercent) < 0.05) return 'neutral';
  const up = trendPercent > 0;
  if (higherIsBetter) return up ? 'positive' : 'negative';
  return up ? 'negative' : 'positive';
}

export function parseDashboardFilters(query: Record<string, unknown>): DashboardFilters {
  const defaults = defaultDashboardPeriod();
  const fromRaw = query.from ?? query.startDate;
  const toRaw = query.to ?? query.endDate;
  const from = typeof fromRaw === 'string' && isValidDateOnly(fromRaw.trim()) ? fromRaw.trim() : defaults.from;
  const to = typeof toRaw === 'string' && isValidDateOnly(toRaw.trim()) ? toRaw.trim() : defaults.to;

  const cmpRaw = query.comparisonPeriod ?? query.comparison;
  const comparisonPeriod: DashboardComparisonPeriod =
    cmpRaw === 'previous_year' || cmpRaw === 'none' ? cmpRaw : 'previous_period';

  const str = (k: string) => {
    const v = query[k];
    return typeof v === 'string' && v.trim() && v.trim() !== 'all' ? v.trim() : undefined;
  };

  return {
    from,
    to,
    comparisonPeriod,
    projectId: str('projectId') ?? str('project'),
    propertyId: str('propertyId') ?? str('property'),
    vendorId: str('vendorId') ?? str('vendor'),
    customerId: str('customerId') ?? str('customer'),
    branchId: str('branchId') ?? str('branch'),
    companyId: str('companyId') ?? str('company'),
    salesAgentId: str('salesAgentId') ?? str('salesAgent'),
  };
}

export function dashboardCacheKey(tenantId: string, filters: DashboardFilters): string {
  const parts = [
    tenantId,
    filters.from,
    filters.to,
    filters.comparisonPeriod,
    filters.projectId ?? '',
    filters.propertyId ?? '',
    filters.vendorId ?? '',
    filters.customerId ?? '',
    filters.branchId ?? '',
    filters.companyId ?? '',
    filters.salesAgentId ?? '',
  ];
  return `dashboard_metrics:${parts.join(':')}`;
}
