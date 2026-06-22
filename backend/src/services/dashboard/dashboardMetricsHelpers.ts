import type { DashboardComparisonPeriod, DashboardFilters } from './dashboardMetricsTypes.js';
import type { DataScopeEnforcementContext } from '../../auth/tenantRepositoryScope.js';
import { buildReportScopeSql } from '../../modules/reporting/query-builder/reportScopeSql.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Append mandatory RBAC scope (server-side); independent of client filter params. */
export function appendDashboardRbacScopeClauses(
  clauses: string[],
  params: unknown[],
  scopeCtx: DataScopeEnforcementContext | undefined,
  columns: { project?: string; property?: string; owner?: string; department?: string }
): void {
  if (!scopeCtx?.enabled) return;
  const scope = buildReportScopeSql(scopeCtx, columns, params.length + 1);
  clauses.push(...scope.clauses);
  params.push(...scope.params);
}

export function dashboardScopeCacheSuffix(scopeCtx?: DataScopeEnforcementContext): string {
  if (!scopeCtx?.enabled) return '';
  if (scopeCtx.failClosed) return ':rbac:deny';
  const parts = scopeCtx.scopes
    .map((s) => `${s.dimension}:${s.mode}:${(s.entityIds ?? []).join(',')}`)
    .sort();
  return `:rbac:${parts.join('|')}`;
}

export function isValidDateOnly(s: string): boolean {
  return DATE_RE.test(s);
}

/** Restrict rows to a rental building (direct building_id or property under that building). */
export function appendBuildingFilter(
  alias: string,
  buildingId: string | undefined,
  params: unknown[],
  clauses: string[],
  tenantParamRef = '$1'
): void {
  if (!buildingId) return;
  params.push(buildingId);
  const p = `$${params.length}`;
  clauses.push(`(
    ${alias}.building_id = ${p}
    OR ${alias}.property_id IN (
      SELECT pr.id FROM properties pr
      WHERE pr.tenant_id = ${tenantParamRef} AND pr.building_id = ${p} AND pr.deleted_at IS NULL
    )
  )`);
}

export function invoiceCollectionQuery(
  tenantId: string,
  from: string,
  to: string,
  filters: { projectId?: string; buildingId?: string },
  scopeCtx?: DataScopeEnforcementContext
): { sql: string; params: unknown[] } {
  const params: unknown[] = [tenantId, from, to];
  const clauses = [
    'i.tenant_id = $1',
    'i.deleted_at IS NULL',
    'i.issue_date >= $2::date',
    'i.issue_date <= $3::date',
  ];
  if (filters.projectId) {
    params.push(filters.projectId);
    clauses.push(`i.project_id = $${params.length}`);
  }
  appendBuildingFilter('i', filters.buildingId, params, clauses);
  if (scopeCtx?.enabled) {
    const scope = buildReportScopeSql(
      scopeCtx,
      { project: 'i.project_id', property: 'i.property_id' },
      params.length + 1
    );
    clauses.push(...scope.clauses);
    params.push(...scope.params);
  }
  return {
    sql: `SELECT
         COALESCE(SUM(i.amount), 0)::text AS due,
         COALESCE(SUM(i.paid_amount), 0)::text AS collected
       FROM invoices i
       WHERE ${clauses.join(' AND ')}`,
    params,
  };
}

/** Entity filter for AR/AP queries; param indices start after tenant_id ($1). */
export function buildDashboardEntityFilter(
  filters: Pick<DashboardFilters, 'projectId' | 'propertyId' | 'vendorId' | 'customerId' | 'buildingId'>,
  columnMap: {
    alias?: string;
    project?: string;
    property?: string;
    vendor?: string;
    customer?: string;
  },
  baseParamIndex = 1,
  scopeCtx?: DataScopeEnforcementContext
): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let idx = baseParamIndex;
  const add = (col: string | undefined, val: string | undefined) => {
    if (!col || !val) return;
    idx += 1;
    clauses.push(`${col} = $${idx}`);
    params.push(val);
  };
  add(columnMap.project, filters.projectId);
  add(columnMap.property, filters.propertyId);
  add(columnMap.vendor, filters.vendorId);
  add(columnMap.customer, filters.customerId);
  if (filters.buildingId && columnMap.alias) {
    idx += 1;
    const p = `$${idx}`;
    params.push(filters.buildingId);
    clauses.push(`(
      ${columnMap.alias}.building_id = ${p}
      OR ${columnMap.alias}.property_id IN (
        SELECT pr.id FROM properties pr
        WHERE pr.tenant_id = $1 AND pr.building_id = ${p} AND pr.deleted_at IS NULL
      )
    )`);
  }
  if (scopeCtx?.enabled) {
    const scopeStart = baseParamIndex + params.length + 1;
    const scope = buildReportScopeSql(
      scopeCtx,
      { project: columnMap.project, property: columnMap.property },
      scopeStart
    );
    clauses.push(...scope.clauses);
    params.push(...scope.params);
  }
  return { sql: clauses.length ? ` AND ${clauses.join(' AND ')}` : '', params };
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
    buildingId: str('buildingId') ?? str('building'),
    propertyId: str('propertyId') ?? str('property'),
    vendorId: str('vendorId') ?? str('vendor'),
    customerId: str('customerId') ?? str('customer'),
    branchId: str('branchId') ?? str('branch'),
    companyId: str('companyId') ?? str('company'),
    salesAgentId: str('salesAgentId') ?? str('salesAgent'),
  };
}

export function dashboardCacheKey(
  tenantId: string,
  filters: DashboardFilters,
  scopeCtx?: DataScopeEnforcementContext
): string {
  const parts = [
    tenantId,
    filters.from,
    filters.to,
    filters.comparisonPeriod,
    filters.projectId ?? '',
    filters.buildingId ?? '',
    filters.propertyId ?? '',
    filters.vendorId ?? '',
    filters.customerId ?? '',
    filters.branchId ?? '',
    filters.companyId ?? '',
    filters.salesAgentId ?? '',
    dashboardScopeCacheSuffix(scopeCtx),
  ];
  return `dashboard_metrics:${parts.join(':')}`;
}
