import path from 'path';
import { pathToFileURL } from 'url';
import fs from 'fs';
import type pg from 'pg';
import { loadBalanceSheetStateInput } from './balanceSheetReportService.js';
import { GLOBAL_SYSTEM_TENANT_ID } from '../constants/globalSystemChart.js';

type CashFlowEngineModule = {
  computeCashFlowReport: (
    state: Record<string, unknown>,
    opts: {
      fromDate: string;
      toDate: string;
      selectedProjectId: string;
      interestPaidAsOperating?: boolean;
      cashFlowCategoryByAccountId?: Record<string, 'operating' | 'investing' | 'financing'>;
    }
  ) => Record<string, unknown>;
  cashFlowCategoryMapFromEntries: (
    entries: { accountId: string; category: string }[] | undefined
  ) => Record<string, 'operating' | 'investing' | 'financing'>;
};

let cachedEngine: CashFlowEngineModule | null = null;

async function loadCashFlowEngine(): Promise<CashFlowEngineModule> {
  if (cachedEngine) return cachedEngine;
  const bundled = path.join(process.cwd(), 'dist', 'cashFlowEngine.mjs');
  if (!fs.existsSync(bundled)) {
    throw new Error(
      `Cash flow engine bundle missing: ${bundled}. Run: node scripts/ensure-cash-flow-engine.mjs`
    );
  }
  cachedEngine = (await import(pathToFileURL(bundled).href)) as CashFlowEngineModule;
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
      plSubType: map.get(String(c.id)) ?? (c as { plSubType?: string }).plSubType,
    }));
  } catch {
    return categories;
  }
}

async function loadCashflowAccountMappings(
  client: pg.PoolClient,
  tenantId: string
): Promise<{ accountId: string; category: string }[]> {
  try {
    const r = await client.query<{ account_id: string; category: string }>(
      `SELECT account_id, category FROM cashflow_category_mapping WHERE tenant_id = $1 OR tenant_id = $2`,
      [tenantId, GLOBAL_SYSTEM_TENANT_ID]
    );
    return r.rows.map((row) => ({ accountId: row.account_id, category: row.category }));
  } catch {
    return [];
  }
}

async function getInterestPaidAsOperating(client: pg.PoolClient, tenantId: string): Promise<boolean> {
  try {
    const r = await client.query<{ value: unknown }>(
      `SELECT value FROM app_settings WHERE tenant_id = $1 AND key = $2`,
      [tenantId, 'cashflow_interest_paid_as_operating']
    );
    if (r.rows.length === 0) return true;
    const v = r.rows[0].value;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return v.toLowerCase() === 'true' || v === '1';
    if (v && typeof v === 'object' && 'value' in (v as object)) {
      return Boolean((v as { value?: boolean }).value);
    }
    return true;
  } catch {
    return true;
  }
}

export async function getCashFlowReportJson(
  client: pg.PoolClient,
  tenantId: string,
  from: string,
  to: string,
  selectedProjectId: string
) {
  const stateIn = await loadBalanceSheetStateInput(client, tenantId, to);
  const categories = await mergePlCategoryMappings(client, tenantId, stateIn.categories as Record<string, unknown>[]);
  const mappingRows = await loadCashflowAccountMappings(client, tenantId);
  const interestPaidAsOperating = await getInterestPaidAsOperating(client, tenantId);

  const { computeCashFlowReport, cashFlowCategoryMapFromEntries } = await loadCashFlowEngine();
  const cashFlowCategoryByAccountId = cashFlowCategoryMapFromEntries(mappingRows);

  const state = { ...stateIn, categories } as Record<string, unknown>;
  const report = computeCashFlowReport(state, {
    fromDate: from,
    toDate: to,
    selectedProjectId,
    interestPaidAsOperating,
    cashFlowCategoryByAccountId,
  }) as {
    operating: { items: unknown[]; total: number };
    investing: { items: unknown[]; total: number };
    financing: { items: unknown[]; total: number };
    summary: {
      net_change: number;
      opening_cash: number;
      closing_cash: number;
      computed_closing_cash: number;
    };
    validation: {
      reconciled: boolean;
      discrepancy: number;
      balance_sheet_cash: number;
      messages: string[];
    };
    flags: { negative_opening_cash: boolean };
  };

  return {
    from,
    to,
    projectId: selectedProjectId,
    operating: { items: report.operating.items, total: report.operating.total },
    investing: { items: report.investing.items, total: report.investing.total },
    financing: { items: report.financing.items, total: report.financing.total },
    summary: {
      net_change: report.summary.net_change,
      opening_cash: report.summary.opening_cash,
      closing_cash: report.summary.closing_cash,
      computed_closing_cash: report.summary.computed_closing_cash,
    },
    validation: report.validation,
    flags: report.flags,
  };
}
