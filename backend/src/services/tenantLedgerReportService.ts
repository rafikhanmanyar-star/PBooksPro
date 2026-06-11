import type pg from 'pg';
import { loadReportEngine } from '../reportEngines/loadReportEngine.js';
import { loadOwnerRentalIncomeStateInput } from './ownerRentalIncomeReportService.js';

type TenantLedgerEngineModule = {
  computeTenantLedgerReport: (
    state: Record<string, unknown>,
    filters: Record<string, unknown>
  ) => {
    rows: unknown[];
    totals: { debit: number; credit: number };
    closingBalance: number;
  };
};

async function loadTenantLedgerEngine(): Promise<TenantLedgerEngineModule> {
  return loadReportEngine<TenantLedgerEngineModule>('tenantLedger');
}

export async function getTenantLedgerReportJson(
  client: pg.PoolClient,
  tenantId: string,
  filters: {
    startDate: string;
    endDate: string;
    tenantId?: string;
    search?: string;
    groupBy?: string;
    sortKey?: string;
    sortDirection?: 'asc' | 'desc';
  }
) {
  const state = await loadOwnerRentalIncomeStateInput(client, tenantId, filters.endDate);
  const { computeTenantLedgerReport } = await loadTenantLedgerEngine();

  const sortKey = filters.sortKey === 'date' ? 'date' : null;
  const sortDirection =
    sortKey === 'date' && filters.sortDirection === 'desc' ? 'desc' : null;

  const result = computeTenantLedgerReport(state as never, {
    startDate: filters.startDate,
    endDate: filters.endDate,
    selectedTenantId:
      filters.tenantId && filters.tenantId !== 'all' ? filters.tenantId : 'all',
    searchQuery: filters.search ?? '',
    groupBy: filters.groupBy === 'tenant' ? 'tenant' : '',
    sortKey,
    sortDirection,
  });

  return {
    startDate: filters.startDate,
    endDate: filters.endDate,
    tenantId: filters.tenantId ?? 'all',
    groupBy: filters.groupBy === 'tenant' ? 'tenant' : '',
    rows: result.rows,
    totals: result.totals,
    closingBalance: result.closingBalance,
  };
}
