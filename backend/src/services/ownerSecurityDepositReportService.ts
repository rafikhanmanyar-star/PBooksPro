import type pg from 'pg';
import { loadReportEngine } from '../reportEngines/loadReportEngine.js';
import { loadOwnerRentalIncomeStateInput } from './ownerRentalIncomeReportService.js';

type OwnerSecurityDepositEngineModule = {
  computeOwnerSecurityDepositReport: (
    state: Record<string, unknown>,
    filters: Record<string, unknown>
  ) => unknown[];
};

async function loadOwnerSecurityDepositEngine(): Promise<OwnerSecurityDepositEngineModule> {
  return loadReportEngine<OwnerSecurityDepositEngineModule>('ownerSecurityDeposit');
}

const VALID_SORT_KEYS = new Set([
  'date',
  'ownerName',
  'tenantName',
  'propertyName',
  'buildingName',
  'particulars',
  'depositIn',
  'refundOut',
  'balance',
]);

export async function getOwnerSecurityDepositReportJson(
  client: pg.PoolClient,
  tenantId: string,
  filters: {
    startDate: string;
    endDate: string;
    buildingId?: string;
    ownerId?: string;
    propertyId?: string;
    search?: string;
    sortKey?: string;
    sortDirection?: 'asc' | 'desc';
  }
) {
  const state = await loadOwnerRentalIncomeStateInput(client, tenantId, filters.endDate);
  const { computeOwnerSecurityDepositReport } = await loadOwnerSecurityDepositEngine();
  const sortKey = filters.sortKey || 'date';
  const rows = computeOwnerSecurityDepositReport(state as never, {
    startDate: filters.startDate,
    endDate: filters.endDate,
    selectedBuildingId: filters.buildingId && filters.buildingId !== 'all' ? filters.buildingId : 'all',
    selectedOwnerId: filters.ownerId && filters.ownerId !== 'all' ? filters.ownerId : 'all',
    selectedUnitId: filters.propertyId && filters.propertyId !== 'all' ? filters.propertyId : 'all',
    searchQuery: filters.search ?? '',
    sortConfig: {
      key: VALID_SORT_KEYS.has(sortKey) ? sortKey : 'date',
      direction: filters.sortDirection === 'desc' ? 'desc' : 'asc',
    },
  });
  return {
    startDate: filters.startDate,
    endDate: filters.endDate,
    buildingId: filters.buildingId ?? 'all',
    ownerId: filters.ownerId ?? 'all',
    propertyId: filters.propertyId ?? 'all',
    rows,
  };
}
