/**
 * Unified project / building scope for Accounting financial statements.
 * UI filter helpers + thin adapter over shared/financial-core/dimensionScope.
 */

import type { Transaction } from '../../types';
import { resolveBuildingIdForTransaction, resolveProjectIdForTransaction, type ReportStateSlice } from './reportUtils';
import {
  DIMENSION_FILTER_ALL,
  applyDimensionFilter,
  isDimensionScopeActive,
  matchesDimensionScope,
  scopeIsConsolidated,
  scopeTargetsBuilding,
  scopeTargetsProject,
  type FinancialDimensionScope,
} from '../../shared/financial-core/dimensionScope';

export {
  applyDimensionFilter,
  isDimensionScopeActive,
  matchesDimensionScope,
  scopeIsConsolidated,
  scopeTargetsBuilding,
  scopeTargetsProject,
  type FinancialDimensionScope,
};

export const FINANCIAL_ENTITY_FILTER_ALL = DIMENSION_FILTER_ALL;
export const FINANCIAL_ENTITY_PROJECT_PREFIX = 'project:';
export const FINANCIAL_ENTITY_BUILDING_PREFIX = 'building:';

/** @deprecated Use FinancialDimensionScope */
export interface FinancialEntityScope extends FinancialDimensionScope {
  projectId: string;
  buildingId: string;
}

export interface NamedEntity {
  id: string;
  name: string;
}

export function entityScopeFromFilterId(filterId: string): FinancialEntityScope {
  if (!filterId || filterId === FINANCIAL_ENTITY_FILTER_ALL) {
    return { projectId: FINANCIAL_ENTITY_FILTER_ALL, buildingId: FINANCIAL_ENTITY_FILTER_ALL };
  }
  if (filterId.startsWith(FINANCIAL_ENTITY_BUILDING_PREFIX)) {
    return {
      projectId: FINANCIAL_ENTITY_FILTER_ALL,
      buildingId: filterId.slice(FINANCIAL_ENTITY_BUILDING_PREFIX.length),
    };
  }
  if (filterId.startsWith(FINANCIAL_ENTITY_PROJECT_PREFIX)) {
    return {
      projectId: filterId.slice(FINANCIAL_ENTITY_PROJECT_PREFIX.length),
      buildingId: FINANCIAL_ENTITY_FILTER_ALL,
    };
  }
  return { projectId: filterId, buildingId: FINANCIAL_ENTITY_FILTER_ALL };
}

export function buildFinancialEntityFilterItems(
  projects: NamedEntity[],
  buildings: NamedEntity[]
): NamedEntity[] {
  return [
    { id: FINANCIAL_ENTITY_FILTER_ALL, name: 'All Projects & Buildings' },
    ...projects.map((p) => ({ id: `${FINANCIAL_ENTITY_PROJECT_PREFIX}${p.id}`, name: p.name })),
    ...buildings.map((b) => ({ id: `${FINANCIAL_ENTITY_BUILDING_PREFIX}${b.id}`, name: b.name })),
  ];
}

export function financialEntityFilterLabel(
  filterId: string,
  projects: NamedEntity[],
  buildings: NamedEntity[]
): string {
  if (!filterId || filterId === FINANCIAL_ENTITY_FILTER_ALL) return 'All Projects & Buildings';
  const scope = entityScopeFromFilterId(filterId);
  if (scope.buildingId !== FINANCIAL_ENTITY_FILTER_ALL) {
    return buildings.find((b) => b.id === scope.buildingId)?.name ?? 'Building';
  }
  if (scope.projectId !== FINANCIAL_ENTITY_FILTER_ALL) {
    return projects.find((p) => p.id === scope.projectId)?.name ?? 'Project';
  }
  return 'All Projects & Buildings';
}

export function matchesFinancialEntityScope(
  scope: FinancialEntityScope,
  projectId: string | undefined,
  buildingId: string | undefined
): boolean {
  return matchesDimensionScope(scope, { projectId, buildingId });
}

export function transactionMatchesFinancialEntityScope(
  tx: Transaction,
  state: ReportStateSlice,
  scope: FinancialEntityScope
): boolean {
  return matchesDimensionScope(scope, {
    projectId: resolveProjectIdForTransaction(tx, state),
    buildingId: resolveBuildingIdForTransaction(tx, state),
  });
}

export function billMatchesFinancialEntityScope(
  bill: { projectId?: string; buildingId?: string; propertyId?: string },
  state: ReportStateSlice,
  scope: FinancialEntityScope
): boolean {
  const projectId = bill.projectId;
  let buildingId = bill.buildingId;
  if (!buildingId && bill.propertyId && state.properties?.length) {
    buildingId = state.properties.find((p) => p.id === bill.propertyId)?.buildingId;
  }
  return matchesDimensionScope(scope, { projectId, buildingId });
}

export function invoiceMatchesFinancialEntityScope(
  invoice: { projectId?: string; buildingId?: string; propertyId?: string },
  state: ReportStateSlice,
  scope: FinancialEntityScope
): boolean {
  const projectId = invoice.projectId;
  let buildingId = invoice.buildingId;
  if (!buildingId && invoice.propertyId && state.properties?.length) {
    buildingId = state.properties.find((p) => p.id === invoice.propertyId)?.buildingId;
  }
  return matchesDimensionScope(scope, { projectId, buildingId });
}
