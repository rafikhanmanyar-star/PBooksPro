import path from 'path';
import { pathToFileURL } from 'url';
import fs from 'fs';
import type pg from 'pg';
import { loadOwnerRentalIncomeStateInput } from './ownerRentalIncomeReportService.js';

type BmAnalysisEngineModule = {
  computeBmAnalysisReport: (
    state: Record<string, unknown>,
    filters: Record<string, unknown>
  ) => { reportData: unknown[]; bmDetailsByBuilding: Record<string, unknown> };
};

let cachedEngine: BmAnalysisEngineModule | null = null;

async function loadBmAnalysisEngine(): Promise<BmAnalysisEngineModule> {
  if (cachedEngine) return cachedEngine;
  const bundled = path.join(process.cwd(), 'dist', 'bmAnalysisReportEngine.mjs');
  if (!fs.existsSync(bundled)) {
    throw new Error(
      `BM analysis engine bundle missing: ${bundled}. Run: node scripts/ensure-bm-analysis-engine.mjs`
    );
  }
  cachedEngine = (await import(pathToFileURL(bundled).href)) as BmAnalysisEngineModule;
  return cachedEngine;
}

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
  const { computeBmAnalysisReport } = await loadBmAnalysisEngine();
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
