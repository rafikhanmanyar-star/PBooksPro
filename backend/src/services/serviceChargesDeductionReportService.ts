import path from 'path';
import { pathToFileURL } from 'url';
import fs from 'fs';
import type pg from 'pg';
import { loadOwnerRentalIncomeStateInput } from './ownerRentalIncomeReportService.js';

type ServiceChargesEngineModule = {
  computeServiceChargesDeductionReport: (
    state: Record<string, unknown>,
    filters: Record<string, unknown>
  ) => unknown[];
};

let cachedEngine: ServiceChargesEngineModule | null = null;

async function loadServiceChargesDeductionEngine(): Promise<ServiceChargesEngineModule> {
  if (cachedEngine) return cachedEngine;
  const bundled = path.join(process.cwd(), 'dist', 'serviceChargesDeductionReportEngine.mjs');
  if (!fs.existsSync(bundled)) {
    throw new Error(
      `Service charges deduction engine bundle missing: ${bundled}. Run: node scripts/ensure-service-charges-deduction-engine.mjs`
    );
  }
  cachedEngine = (await import(pathToFileURL(bundled).href)) as ServiceChargesEngineModule;
  return cachedEngine;
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
