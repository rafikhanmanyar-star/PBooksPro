/**
 * IFRS/GAAP-style Profit & Loss engine.
 * Classification comes from Category.plSubType (pl_category_mapping) — no hardcoded category names.
 * Amounts and inclusion rules match computeProjectProfitLossTotals (projectProfitLossComputation).
 *
 * Double-entry: the Trial Balance report (journal_lines) is the GL source of truth for posted journals;
 * this engine remains category/transaction-based until operational flows post through the journal.
 */

import type { AppState, Category, ProfitLossSubType } from '../../types';
import { TransactionType } from '../../types';
import { computeProjectProfitLossTotals } from './projectProfitLossComputation';

export const PL_TYPES: readonly ProfitLossSubType[] = [
  'revenue',
  'cost_of_sales',
  'operating_expense',
  'other_income',
  'finance_cost',
  'tax',
] as const;

export type PlType = ProfitLossSubType;

export interface ProfitLossLine {
  id: string;
  name: string;
  amount: number;
  /** (line / total_revenue) * 100 — total_revenue = net revenue section total */
  pctOfRevenue: number;
  level: number;
  type: 'group' | 'item';
}

export interface ProfitLossValidationIssue {
  code: string;
  message: string;
  severity: 'warning' | 'error';
  categoryId?: string;
}

export interface ProfitLossReportResult {
  period: { from: string; to: string };
  selectedProjectId: string;
  /** Net of revenue bucket — used as % denominator */
  totalRevenue: number;
  revenue: ProfitLossLine[];
  cost_of_sales: ProfitLossLine[];
  gross_profit: number;
  operating_expenses: ProfitLossLine[];
  operating_profit: number;
  other_income: ProfitLossLine[];
  finance_cost: ProfitLossLine[];
  profit_before_tax: number;
  tax: number;
  net_profit: number;
  validation: {
    issues: ProfitLossValidationIssue[];
    legacyNetProfit: number;
    structuredNetProfit: number;
    ledgerMatch: boolean;
  };
}

function categoryById(state: AppState): Map<string, Category> {
  return new Map(state.categories.map((c) => [c.id, c]));
}

/**
 * Map category → P&L bucket using optional plSubType (from pl_category_mapping) or structural defaults.
 */
export function resolvePlTypeForCategory(
  cat: Category | undefined,
  plSubType: ProfitLossSubType | undefined
): { plType: ProfitLossSubType; usedInference: boolean } {
  if (plSubType && PL_TYPES.includes(plSubType)) {
    return { plType: plSubType, usedInference: false };
  }
  if (!cat) {
    return { plType: 'operating_expense', usedInference: true };
  }
  if (cat.type === TransactionType.INCOME) {
    return { plType: 'revenue', usedInference: true };
  }
  return { plType: 'operating_expense', usedInference: true };
}

function classifySyntheticKey(
  key: string,
  gainLossAmount: number,
  issues: ProfitLossValidationIssue[]
): ProfitLossSubType {
  if (key === 'uncategorized_income') {
    if (Math.abs(gainLossAmount) > 0.01) {
      issues.push({
        code: 'UNCATEGORIZED_INCOME',
        message: 'Uncategorized income exists — assign categories to all P&L transactions.',
        severity: 'error',
      });
    }
    return 'revenue';
  }
  if (key === 'uncategorized_expense') {
    if (Math.abs(gainLossAmount) > 0.01) {
      issues.push({
        code: 'UNCATEGORIZED_EXPENSE',
        message: 'Uncategorized expense exists — assign categories to all P&L transactions.',
        severity: 'error',
      });
    }
    return 'operating_expense';
  }
  return 'operating_expense';
}

function flagSuspiciousCategoryName(cat: Category | undefined, issues: ProfitLossValidationIssue[]) {
  if (!cat) return;
  const n = cat.name.trim().toLowerCase();
  if (n === 'test' || n === 'unknown' || n === 'misc' || n === 'temp') {
    issues.push({
      code: 'SUSPICIOUS_CATEGORY_NAME',
      message: `Category "${cat.name}" may need a clear business label for audit.`,
      severity: 'warning',
      categoryId: cat.id,
    });
  }
}

/** Add signed amount into bucket totals (amounts follow projectProfitLossComputation signs). */
function accumulateBucket(
  totals: Record<ProfitLossSubType, number>,
  plType: ProfitLossSubType,
  amount: number
): void {
  totals[plType] = (totals[plType] || 0) + amount;
}

function buildRowsForBucket(
  state: AppState,
  bucket: ProfitLossSubType,
  categoryAmounts: Record<string, number>,
  totalRevenueForPct: number,
  excludeRental: boolean
): ProfitLossLine[] {
  const catMap = categoryById(state);
  const relevant = state.categories.filter((c) => {
    if (excludeRental && c.isRental) return false;
    const sub = c.plSubType;
    const { plType } = resolvePlTypeForCategory(c, sub);
    return plType === bucket;
  });

  const getTotal = (catId: string): number => {
    let t = categoryAmounts[catId] || 0;
    relevant
      .filter((c) => c.parentCategoryId === catId)
      .forEach((ch) => {
        t += getTotal(ch.id);
      });
    return t;
  };

  const rows: ProfitLossLine[] = [];
  const roots = relevant.filter((c) => !c.parentCategoryId).sort((a, b) => a.name.localeCompare(b.name));

  const process = (cat: Category, level: number) => {
    const amount = getTotal(cat.id);
    if (Math.abs(amount) < 1e-8 && level > 0) return;
    const hasChildren = relevant.some((c) => c.parentCategoryId === cat.id);
    if (Math.abs(amount) < 1e-8 && !hasChildren) return;

    rows.push({
      id: cat.id,
      name: cat.name,
      amount,
      pctOfRevenue: totalRevenueForPct !== 0 ? (amount / totalRevenueForPct) * 100 : 0,
      level,
      type: hasChildren ? 'group' : 'item',
    });
    relevant
      .filter((c) => c.parentCategoryId === cat.id)
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((ch) => process(ch, level + 1));
  };

  roots.forEach((c) => process(c, 0));

  return rows;
}

/**
 * Full IFRS/GAAP-style P&L: bucket totals from mapped categories + same net as legacy P&L when mappings cover all flows.
 */
export function computeProfitLossReport(
  state: AppState,
  opts: { startDate: string; endDate: string; selectedProjectId: string }
): ProfitLossReportResult {
  const { startDate, endDate, selectedProjectId } = opts;
  const pl = computeProjectProfitLossTotals(state, selectedProjectId, startDate, endDate);
  const { categoryAmounts, assetSaleRevenue, assetSaleCost, netProfit: legacyNet } = pl;

  const issues: ProfitLossValidationIssue[] = [];
  const catMap = categoryById(state);

  const totals: Record<ProfitLossSubType, number> = {
    revenue: 0,
    cost_of_sales: 0,
    operating_expense: 0,
    other_income: 0,
    finance_cost: 0,
    tax: 0,
  };

  for (const [key, raw] of Object.entries(categoryAmounts)) {
    if (Math.abs(raw) < 1e-9) continue;

    if (key === 'uncategorized_income' || key === 'uncategorized_expense') {
      const synType = classifySyntheticKey(key, raw, issues);
      accumulateBucket(totals, synType, raw);
      continue;
    }

    const cat = catMap.get(key);
    flagSuspiciousCategoryName(cat, issues);
    const sub = cat?.plSubType;
    const { plType, usedInference } = resolvePlTypeForCategory(cat, sub);
    if (usedInference && cat) {
      issues.push({
        code: 'PL_TYPE_INFERRED',
        message: `P&L line type inferred for "${cat.name}" — set P&L classification in Settings → Categories.`,
        severity: 'warning',
        categoryId: cat.id,
      });
    }
    accumulateBucket(totals, plType, raw);
  }

  const gainLoss = assetSaleRevenue - assetSaleCost;
  if (Math.abs(assetSaleRevenue) > 0.01 || Math.abs(assetSaleCost) > 0.01) {
    const t = gainLoss >= 0 ? 'other_income' : 'operating_expense';
    accumulateBucket(totals, t, gainLoss);
  }

  const totalRevenue = totals.revenue;
  const totalCos = totals.cost_of_sales;
  const totalOpex = totals.operating_expense;
  const totalOtherInc = totals.other_income;
  const totalFinance = totals.finance_cost;
  const totalTax = totals.tax;

  const gross_profit = totalRevenue - totalCos;
  const operating_profit = gross_profit - totalOpex;
  const profit_before_tax = operating_profit + totalOtherInc - totalFinance;
  const net_profit = profit_before_tax - totalTax;

  const structuredNet = net_profit;
  const ledgerMatch = Math.abs(structuredNet - legacyNet) < 0.02;
  if (!ledgerMatch) {
    issues.push({
      code: 'NET_MISMATCH',
      message: `Structured P&L net (${structuredNet.toFixed(2)}) differs from ledger P&L net (${legacyNet.toFixed(2)}). Review category P&L mappings and uncategorized lines.`,
      severity: 'warning',
    });
  }

  const denom = Math.abs(totalRevenue) > 1e-9 ? totalRevenue : 1;

  const revenueRows = buildRowsForBucket(state, 'revenue', categoryAmounts, denom, true);
  const cogsRows = buildRowsForBucket(state, 'cost_of_sales', categoryAmounts, denom, true);
  const opexRows = buildRowsForBucket(state, 'operating_expense', categoryAmounts, denom, true);
  const otherIncRows = buildRowsForBucket(state, 'other_income', categoryAmounts, denom, true);
  const financeRows = buildRowsForBucket(state, 'finance_cost', categoryAmounts, denom, true);
  const taxRows = buildRowsForBucket(state, 'tax', categoryAmounts, denom, true);

  if ((assetSaleRevenue > 0 || assetSaleCost > 0) && Math.abs(gainLoss) > 0.01) {
    const row: ProfitLossLine = {
      id: 'gain-loss-fixed-asset',
      name: gainLoss >= 0 ? 'Gain / (loss) on disposal of fixed assets' : 'Loss on disposal of fixed assets',
      amount: Math.abs(gainLoss),
      pctOfRevenue: (Math.abs(gainLoss) / Math.abs(denom)) * 100,
      level: 0,
      type: 'item',
    };
    if (gainLoss >= 0) {
      otherIncRows.push(row);
    } else {
      opexRows.push(row);
    }
  }

  const uncInc = categoryAmounts['uncategorized_income'] || 0;
  if (Math.abs(uncInc) > 0.01) {
    revenueRows.push({
      id: 'uncategorized_income',
      name: 'Uncategorized',
      amount: uncInc,
      pctOfRevenue: denom !== 0 ? (uncInc / denom) * 100 : 0,
      level: 0,
      type: 'item',
    });
  }
  const uncExp = categoryAmounts['uncategorized_expense'] || 0;
  if (Math.abs(uncExp) > 0.01) {
    opexRows.push({
      id: 'uncategorized_expense',
      name: 'Uncategorized',
      amount: uncExp,
      pctOfRevenue: denom !== 0 ? (uncExp / denom) * 100 : 0,
      level: 0,
      type: 'item',
    });
  }

  return {
    period: { from: startDate, to: endDate },
    selectedProjectId,
    totalRevenue,
    revenue: revenueRows,
    cost_of_sales: cogsRows,
    gross_profit,
    operating_expenses: opexRows,
    operating_profit,
    other_income: otherIncRows,
    finance_cost: financeRows,
    profit_before_tax,
    tax: totalTax,
    net_profit,
    validation: {
      issues,
      legacyNetProfit: legacyNet,
      structuredNetProfit: structuredNet,
      ledgerMatch,
    },
  };
}
