import type pg from 'pg';
import { computeBmAnalysisReport } from '../../../reportEngines/index.js';
import { loadOwnerRentalIncomeStateInput } from './ownerRentalIncomeReportService.js';

export async function getBmAnalysisReportJson(
  client: pg.PoolClient,
  tenantId: string,
  filters: {
    startDate: string;
    endDate: string;
    buildingId?: string;
    search?: string;
    sortKey?: string;
    sortDirection?: 'asc' | 'desc';
  }
) {
  const state = await loadOwnerRentalIncomeStateInput(client, tenantId, filters.endDate);
  const { reportData, bmDetailsByBuilding } = computeBmAnalysisReport(state as never, {
    startDate: filters.startDate,
    endDate: filters.endDate,
    selectedBuildingId:
      filters.buildingId && filters.buildingId !== 'all' ? filters.buildingId : 'all',
    searchQuery: filters.search ?? '',
    sortKey: filters.sortKey,
    sortDirection: filters.sortDirection,
  });

  const rows = reportData as {
    collected: number;
    receivable: number;
    expenses: number;
    net: number;
  }[];
  const totals = rows.reduce(
    (acc, curr) => ({
      collected: acc.collected + curr.collected,
      receivable: acc.receivable + curr.receivable,
      expenses: acc.expenses + curr.expenses,
      net: acc.net + curr.net,
    }),
    { collected: 0, receivable: 0, expenses: 0, net: 0 }
  );

  return {
    startDate: filters.startDate,
    endDate: filters.endDate,
    buildingId: filters.buildingId ?? 'all',
    reportData,
    bmDetailsByBuilding,
    totals,
  };
}
