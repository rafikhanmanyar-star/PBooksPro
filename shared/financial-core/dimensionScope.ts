/**
 * Unified financial dimension scope for GL reports and operational document filtering.
 * Single source of truth for project / building / cost-center report filters.
 */

import { normalizeDimensionId } from './journalDimensions';

export const DIMENSION_FILTER_ALL = 'all';

export interface FinancialDimensionScope {
  projectId?: string | null;
  buildingId?: string | null;
  costCenterId?: string | null;
}

export interface DimensionValues {
  projectId?: string | null;
  buildingId?: string | null;
  costCenterId?: string | null;
}

export function normalizeScope(scope?: FinancialDimensionScope | null): FinancialDimensionScope {
  return {
    projectId: scope?.projectId ?? DIMENSION_FILTER_ALL,
    buildingId: scope?.buildingId ?? DIMENSION_FILTER_ALL,
    costCenterId: scope?.costCenterId ?? DIMENSION_FILTER_ALL,
  };
}

/** Build scope from report filter params (API / UI). */
export function scopeFromReportFilters(
  projectId?: string | null,
  buildingId?: string | null,
  costCenterId?: string | null
): FinancialDimensionScope {
  return {
    projectId: projectId ?? DIMENSION_FILTER_ALL,
    buildingId: buildingId ?? DIMENSION_FILTER_ALL,
    costCenterId: costCenterId ?? DIMENSION_FILTER_ALL,
  };
}

export function isDimensionScopeActive(scope?: FinancialDimensionScope | null): boolean {
  const s = normalizeScope(scope);
  return (
    (typeof s.projectId === 'string' && s.projectId.trim() !== '' && s.projectId !== DIMENSION_FILTER_ALL) ||
    (typeof s.buildingId === 'string' && s.buildingId.trim() !== '' && s.buildingId !== DIMENSION_FILTER_ALL) ||
    (typeof s.costCenterId === 'string' &&
      s.costCenterId.trim() !== '' &&
      s.costCenterId !== DIMENSION_FILTER_ALL)
  );
}

/** @deprecated Use isDimensionScopeActive — kept for journalLedgerCore callers. */
export const isJournalEntityScopeActive = isDimensionScopeActive;

export function scopeTargetsProject(scope: FinancialDimensionScope): boolean {
  const s = normalizeScope(scope);
  return s.projectId !== DIMENSION_FILTER_ALL;
}

export function scopeTargetsBuilding(scope: FinancialDimensionScope): boolean {
  const s = normalizeScope(scope);
  return s.buildingId !== DIMENSION_FILTER_ALL;
}

export function scopeTargetsCostCenter(scope: FinancialDimensionScope): boolean {
  const s = normalizeScope(scope);
  return s.costCenterId !== DIMENSION_FILTER_ALL;
}

export function scopeIsConsolidated(scope: FinancialDimensionScope): boolean {
  return !isDimensionScopeActive(scope);
}

/**
 * Match dimension values against report scope.
 * Precedence when multiple filters are set: building → project → cost center.
 */
export function matchesDimensionScope(
  scope: FinancialDimensionScope,
  values: DimensionValues | null | undefined
): boolean {
  const s = normalizeScope(scope);
  const buildingActive = scopeTargetsBuilding(s);
  const projectActive = scopeTargetsProject(s);
  const costCenterActive = scopeTargetsCostCenter(s);
  if (!buildingActive && !projectActive && !costCenterActive) return true;

  const projectId = normalizeDimensionId(values?.projectId);
  const buildingId = normalizeDimensionId(values?.buildingId);
  const costCenterId = normalizeDimensionId(values?.costCenterId);

  if (buildingActive) return buildingId === s.buildingId;
  if (projectActive) return projectId === s.projectId;
  if (costCenterActive) return costCenterId === s.costCenterId;
  return true;
}

/** Filter a collection by dimension scope. */
export function applyDimensionFilter<T>(
  items: readonly T[],
  scope: FinancialDimensionScope,
  getDimensions: (item: T) => DimensionValues
): T[] {
  if (!isDimensionScopeActive(scope)) return [...items];
  return items.filter((item) => matchesDimensionScope(scope, getDimensions(item)));
}

export interface JournalScopeLine {
  projectId?: string | null;
  buildingId?: string | null;
  costCenterId?: string | null;
}

export interface JournalScopeEntry {
  projectId?: string | null;
  buildingId?: string | null;
  costCenterId?: string | null;
}

/** Resolved dimensions on a journal line (line overrides entry header). */
export function resolveJournalLineDimensions(
  line: JournalScopeLine,
  entry: JournalScopeEntry
): DimensionValues {
  return {
    projectId: normalizeDimensionId(line.projectId) ?? normalizeDimensionId(entry.projectId),
    buildingId: normalizeDimensionId(line.buildingId) ?? normalizeDimensionId(entry.buildingId),
    costCenterId: normalizeDimensionId(line.costCenterId) ?? normalizeDimensionId(entry.costCenterId),
  };
}

/** True when a journal line belongs in the scoped GL report (uses stored GL dimensions only). */
export function journalLineMatchesDimensionScope(
  line: JournalScopeLine,
  entry: JournalScopeEntry,
  scope?: FinancialDimensionScope | null
): boolean {
  if (!scope || !isDimensionScopeActive(scope)) return true;
  return matchesDimensionScope(scope, resolveJournalLineDimensions(line, entry));
}

export type DimensionSqlParamStyle = 'postgres' | 'sqlite';

export interface BuildDimensionSqlOptions {
  lineAlias?: string;
  entryAlias?: string;
  /** `$1` for PostgreSQL (default) or `?` for SQLite local bridge queries. */
  paramStyle?: DimensionSqlParamStyle;
}

function dimensionSqlParam(index: number, style: DimensionSqlParamStyle): string {
  return style === 'sqlite' ? '?' : `$${index}`;
}

/**
 * SQL AND-clause fragment for journal_lines (+ journal_entries) dimension filters.
 * Uses COALESCE(line, entry) — no operational table lookups.
 */
export function buildDimensionSql(
  scope: FinancialDimensionScope,
  params: unknown[],
  options: BuildDimensionSqlOptions = {}
): string {
  const lineAlias = options.lineAlias ?? 'jl';
  const entryAlias = options.entryAlias ?? 'je';
  const paramStyle = options.paramStyle ?? 'postgres';
  const s = normalizeScope(scope);

  if (scopeTargetsBuilding(s)) {
    params.push(s.buildingId);
    const n = params.length;
    const p = dimensionSqlParam(n, paramStyle);
    return ` AND COALESCE(
      NULLIF(TRIM(${lineAlias}.building_id), ''),
      NULLIF(TRIM(${entryAlias}.building_id), '')
    ) = ${p}`;
  }
  if (scopeTargetsProject(s)) {
    params.push(s.projectId);
    const n = params.length;
    const p = dimensionSqlParam(n, paramStyle);
    return ` AND COALESCE(
      NULLIF(TRIM(${lineAlias}.project_id), ''),
      NULLIF(TRIM(${entryAlias}.project_id), '')
    ) = ${p}`;
  }
  if (scopeTargetsCostCenter(s)) {
    params.push(s.costCenterId);
    const n = params.length;
    const p = dimensionSqlParam(n, paramStyle);
    return ` AND COALESCE(
      NULLIF(TRIM(${lineAlias}.cost_center_id), ''),
      NULLIF(TRIM(${entryAlias}.cost_center_id), '')
    ) = ${p}`;
  }
  return '';
}

/** @deprecated Use journalLineMatchesDimensionScope */
export function journalLineMatchesEntityScope(
  line: JournalScopeLine,
  entry: JournalScopeEntry,
  scope?: FinancialDimensionScope | null
): boolean {
  return journalLineMatchesDimensionScope(line, entry, scope);
}

/** Opening balances apply only on consolidated (non-scoped) trial balance / balance sheet. */
export function shouldApplyOpeningBalancesForScope(scope?: FinancialDimensionScope | null): boolean {
  return !isDimensionScopeActive(scope);
}
