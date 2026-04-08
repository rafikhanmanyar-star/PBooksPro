import path from 'path';
import { pathToFileURL } from 'url';
import fs from 'fs';
import type pg from 'pg';
import { loadBalanceSheetStateInput } from './balanceSheetReportService.js';
import { GLOBAL_SYSTEM_TENANT_ID } from '../constants/globalSystemChart.js';

type ProfitLossEngineModule = {
  computeProfitLossReport: (
    state: Record<string, unknown>,
    opts: { startDate: string; endDate: string; selectedProjectId: string }
  ) => Record<string, unknown>;
};

let cachedEngine: ProfitLossEngineModule | null = null;

async function loadProfitLossEngine(): Promise<ProfitLossEngineModule> {
  if (cachedEngine) return cachedEngine;
  const bundled = path.join(process.cwd(), 'dist', 'profitLossEngine.mjs');
  if (!fs.existsSync(bundled)) {
    throw new Error(
      `Profit & loss engine bundle missing: ${bundled}. Run: node scripts/ensure-profit-loss-engine.mjs`
    );
  }
  cachedEngine = (await import(pathToFileURL(bundled).href)) as ProfitLossEngineModule;
  return cachedEngine;
}

async function mergePlCategoryMappings(
  client: pg.PoolClient,
  tenantId: string,
  categories: Record<string, unknown>[]
): Promise<Record<string, unknown>[]> {
  try {
    const r = await client.query<{ category_id: string; pl_type: string }>(
      `SELECT category_id, pl_type FROM pl_category_mapping WHERE tenant_id = $1 OR tenant_id = $2`,
      [tenantId, GLOBAL_SYSTEM_TENANT_ID]
    );
    const map = new Map(r.rows.map((row) => [row.category_id, row.pl_type]));
    return categories.map((c) => ({
      ...c,
      plSubType: map.get(String(c.id)) ?? c.plSubType,
    }));
  } catch {
    return categories;
  }
}

export async function getProfitLossReportJson(
  client: pg.PoolClient,
  tenantId: string,
  from: string,
  to: string,
  selectedProjectId: string
) {
  const stateIn = await loadBalanceSheetStateInput(client, tenantId, to);
  const categories = await mergePlCategoryMappings(client, tenantId, stateIn.categories as Record<string, unknown>[]);
  const state = { ...stateIn, categories } as Record<string, unknown>;
  const { computeProfitLossReport } = await loadProfitLossEngine();
  const r = computeProfitLossReport(state, {
    startDate: from,
    endDate: to,
    selectedProjectId,
  }) as {
    revenue: unknown[];
    cost_of_sales: unknown[];
    gross_profit: number;
    operating_expenses: unknown[];
    operating_profit: number;
    other_income: unknown[];
    finance_cost: unknown[];
    profit_before_tax: number;
    tax: number;
    net_profit: number;
    totalRevenue: number;
    validation: unknown;
  };

  return {
    from,
    to,
    projectId: selectedProjectId,
    revenue: r.revenue,
    cost_of_sales: r.cost_of_sales,
    gross_profit: r.gross_profit,
    operating_expenses: r.operating_expenses,
    operating_profit: r.operating_profit,
    other_income: r.other_income,
    finance_cost: r.finance_cost,
    profit_before_tax: r.profit_before_tax,
    tax: r.tax,
    net_profit: r.net_profit,
    total_revenue: r.totalRevenue,
    validation: r.validation,
  };
}
