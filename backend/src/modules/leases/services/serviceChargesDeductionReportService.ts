import type pg from 'pg';
import { loadReportEngine } from '../../../reportEngines/loadReportEngine.js';
import { loadOwnerRentalIncomeStateInput } from './ownerRentalIncomeReportService.js';

type ServiceChargesEngineModule = {
  computeServiceChargesDeductionReport: (
    state: Record<string, unknown>,
    filters: Record<string, unknown>
  ) => unknown[];
};

async function loadServiceChargesDeductionEngine(): Promise<ServiceChargesEngineModule> {
  return loadReportEngine<ServiceChargesEngineModule>('serviceChargesDeduction');
}

export async function getServiceChargesDeductionReportJson(
  client: pg.PoolClient,
  tenantId: string,
  filters: {
    startDate: string;
    endDate: string;
    buildingId?: string;
    ownerId?: string;
    search?: string;
    sortKey?: string;
    sortDirection?: 'asc' | 'desc';
  }
) {
  const state = await loadOwnerRentalIncomeStateInput(client, tenantId, filters.endDate);
  const { computeServiceChargesDeductionReport } = await loadServiceChargesDeductionEngine();
  const rows = computeServiceChargesDeductionReport(state as never, {
    startDate: filters.startDate,
    endDate: filters.endDate,
    selectedBuildingId: filters.buildingId && filters.buildingId !== 'all' ? filters.buildingId : 'all',
    selectedOwnerId: filters.ownerId && filters.ownerId !== 'all' ? filters.ownerId : 'all',
    searchQuery: filters.search ?? '',
    sortKey: filters.sortKey,
    sortDirection: filters.sortDirection,
  });
  const totalAmount = (rows as { amount: number }[]).reduce((s, r) => s + (Number(r.amount) || 0), 0);
  return {
    startDate: filters.startDate,
    endDate: filters.endDate,
    buildingId: filters.buildingId ?? 'all',
    ownerId: filters.ownerId ?? 'all',
    rows,
    totalAmount,
  };
}
