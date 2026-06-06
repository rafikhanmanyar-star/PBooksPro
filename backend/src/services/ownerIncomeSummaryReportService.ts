import path from 'path';
import { pathToFileURL } from 'url';
import fs from 'fs';
import type pg from 'pg';
import { loadOwnerRentalIncomeStateInput } from './ownerRentalIncomeReportService.js';

type OwnerIncomeSummaryEngineModule = {
  computeOwnerIncomeSummaryReport: (
    state: Record<string, unknown>,
    filters: Record<string, unknown>
  ) => unknown[];
};

let cachedEngine: OwnerIncomeSummaryEngineModule | null = null;

async function loadOwnerIncomeSummaryEngine(): Promise<OwnerIncomeSummaryEngineModule> {
  if (cachedEngine) return cachedEngine;
  const bundled = path.join(process.cwd(), 'dist', 'ownerIncomeSummaryReportEngine.mjs');
  if (!fs.existsSync(bundled)) {
    throw new Error(
      `Owner income summary engine bundle missing: ${bundled}. Run: node scripts/ensure-owner-income-summary-engine.mjs`
    );
  }
  cachedEngine = (await import(pathToFileURL(bundled).href)) as OwnerIncomeSummaryEngineModule;
  return cachedEngine;
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
