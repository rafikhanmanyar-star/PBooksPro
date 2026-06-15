import type pg from 'pg';
import { loadReportEngine } from '../../../reportEngines/loadReportEngine.js';
import { loadOwnerRentalIncomeStateInput } from './ownerRentalIncomeReportService.js';

type OwnerIncomeSummaryEngineModule = {
  computeOwnerIncomeSummaryReport: (
    state: Record<string, unknown>,
    filters: Record<string, unknown>
  ) => unknown[];
};

async function loadOwnerIncomeSummaryEngine(): Promise<OwnerIncomeSummaryEngineModule> {
  return loadReportEngine<OwnerIncomeSummaryEngineModule>('ownerIncomeSummary');
}

export async function getOwnerIncomeSummaryReportJson(
  client: pg.PoolClient,
  tenantId: string,
  filters: {
    startDate: string;
    endDate: string;
    buildingId?: string;
    ownerId?: string;
    search?: string;
  }
) {
  const state = await loadOwnerRentalIncomeStateInput(client, tenantId, filters.endDate);
  const { computeOwnerIncomeSummaryReport } = await loadOwnerIncomeSummaryEngine();
  const summaries = computeOwnerIncomeSummaryReport(state as never, {
    startDate: filters.startDate,
    endDate: filters.endDate,
    selectedBuildingId: filters.buildingId && filters.buildingId !== 'all' ? filters.buildingId : 'all',
    selectedOwnerId: filters.ownerId && filters.ownerId !== 'all' ? filters.ownerId : 'all',
    searchQuery: filters.search ?? '',
  });
  return {
    startDate: filters.startDate,
    endDate: filters.endDate,
    buildingId: filters.buildingId ?? 'all',
    ownerId: filters.ownerId ?? 'all',
    summaries,
  };
}
