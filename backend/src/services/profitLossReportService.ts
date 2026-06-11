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

export type ProfitLossReportJson = {
  from: string;
  to: string;
  projectId: string;
  revenue: unknown[];
  cost_of_sales: unknown[];
  gross_profit: number;
  operating_expenses: unknown[];
  operating_profit: number;
  other_income: unknown[];
  finance_cost: unknown[];
  profit_before_tax: number;
  tax: unknown[];
  net_profit: number;
  total_revenue: number;
  validation: unknown;
};

export type PreparedProfitLossState = {
  state: Record<string, unknown>;
};

/** Load tenant financial state once; reuse for multiple P&L date ranges in the same request. */
export async function prepareProfitLossState(
  client: pg.PoolClient,
  tenantId: string,
  asOfDate: string
): Promise<PreparedProfitLossState> {
  const stateIn = await loadBalanceSheetStateInput(client, tenantId, asOfDate);
  const categories = await mergePlCategoryMappings(
    client,
    tenantId,
    stateIn.categories as Record<string, unknown>[]
  );
  return { state: { ...stateIn, categories } as Record<string, unknown> };
}

function formatProfitLossResult(
  r: Record<string, unknown>,
  from: string,
  to: string,
  selectedProjectId: string
): ProfitLossReportJson {
  return {
    from,
    to,
    projectId: selectedProjectId,
    revenue: r.revenue as unknown[],
    cost_of_sales: r.cost_of_sales as unknown[],
    gross_profit: r.gross_profit as number,
    operating_expenses: r.operating_expenses as unknown[],
    operating_profit: r.operating_profit as number,
    other_income: r.other_income as unknown[],
    finance_cost: r.finance_cost as unknown[],
    profit_before_tax: r.profit_before_tax as number,
    tax: r.tax as unknown[],
    net_profit: r.net_profit as number,
    total_revenue: r.totalRevenue as number,
    validation: r.validation,
  };
}

/** Run P&L engine against preloaded state (no extra DB reads). */
export async function computeProfitLossFromPrepared(
  prepared: PreparedProfitLossState,
  from: string,
  to: string,
  selectedProjectId: string
): Promise<ProfitLossReportJson> {
  const { computeProfitLossReport } = await loadProfitLossEngine();
  const r = computeProfitLossReport(prepared.state, {
    startDate: from,
    endDate: to,
    selectedProjectId,
  }) as Record<string, unknown>;
  return formatProfitLossResult(r, from, to, selectedProjectId);
}

export function extractPlRevenueAndExpenses(pl: Pick<ProfitLossReportJson, 'total_revenue' | 'net_profit' | 'cost_of_sales' | 'operating_expenses' | 'finance_cost' | 'tax'>): {
  revenue: number;
  expenses: number;
} {
  const revenue = Number(pl.total_revenue ?? 0);
  const net = Number(pl.net_profit ?? 0);
  const expenseItems = [
    ...(Array.isArray(pl.cost_of_sales) ? pl.cost_of_sales : []),
    ...(Array.isArray(pl.operating_expenses) ? pl.operating_expenses : []),
    ...(Array.isArray(pl.finance_cost) ? pl.finance_cost : []),
    ...(Array.isArray(pl.tax) ? pl.tax : []),
  ] as { amount?: number }[];
  const expensesFromLines = expenseItems.reduce((s, row) => s + Number(row.amount ?? 0), 0);
  const expenses = expensesFromLines > 0 ? expensesFromLines : Math.max(0, revenue - net);
  return { revenue, expenses };
}

export async function getProfitLossReportJson(
  client: pg.PoolClient,
  tenantId: string,
  from: string,
  to: string,
  selectedProjectId: string
) {
  const prepared = await prepareProfitLossState(client, tenantId, to);
  return computeProfitLossFromPrepared(prepared, from, to, selectedProjectId);
}
