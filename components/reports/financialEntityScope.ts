/**
 * Unified project / building scope for Accounting financial statements.
 */

import type { Transaction } from '../../types';
import { resolveBuildingIdForTransaction, resolveProjectIdForTransaction, type ReportStateSlice } from './reportUtils';

export const FINANCIAL_ENTITY_FILTER_ALL = 'all';
export const FINANCIAL_ENTITY_PROJECT_PREFIX = 'project:';
export const FINANCIAL_ENTITY_BUILDING_PREFIX = 'building:';

export interface FinancialEntityScope {
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
  const buildingActive = scope.buildingId !== FINANCIAL_ENTITY_FILTER_ALL;
  const projectActive = scope.projectId !== FINANCIAL_ENTITY_FILTER_ALL;
  if (!buildingActive && !projectActive) return true;
  if (buildingActive) return buildingId === scope.buildingId;
  if (projectActive) return projectId === scope.projectId && !buildingId;
  return true;
}

export function transactionMatchesFinancialEntityScope(
  tx: Transaction,
  state: ReportStateSlice,
  scope: FinancialEntityScope
): boolean {
  const projectId = resolveProjectIdForTransaction(tx, state);
  const buildingId = resolveBuildingIdForTransaction(tx, state);
  return matchesFinancialEntityScope(scope, projectId, buildingId);
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
  return matchesFinancialEntityScope(scope, projectId, buildingId);
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
  return matchesFinancialEntityScope(scope, projectId, buildingId);
}

export function scopeTargetsBuilding(scope: FinancialEntityScope): boolean {
  return scope.buildingId !== FINANCIAL_ENTITY_FILTER_ALL;
}

export function scopeTargetsProject(scope: FinancialEntityScope): boolean {
  return scope.projectId !== FINANCIAL_ENTITY_FILTER_ALL;
}

export function scopeIsConsolidated(scope: FinancialEntityScope): boolean {
  return !scopeTargetsBuilding(scope) && !scopeTargetsProject(scope);
}