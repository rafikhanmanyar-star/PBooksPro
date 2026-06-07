/**
 * Server-side financial reports (LAN/API mode).
 * Aggregates on PostgreSQL instead of shipping full transaction state to the browser.
 */

import { apiClient } from './client';
import type { BalanceSheetReportResult } from '../../components/reports/balanceSheetEngine';
import type { ProfitLossReportResult } from '../../components/reports/profitLossEngine';
import type { CashFlowReportResult } from '../../components/reports/cashFlowEngine';

export async function fetchBalanceSheetReport(options: {
  asOfDate: string;
  projectId?: string;
  debug?: boolean;
}): Promise<BalanceSheetReportResult> {
  const q = new URLSearchParams({ date: options.asOfDate });
  if (options.projectId && options.projectId !== 'all') q.set('projectId', options.projectId);
  if (options.debug) q.set('debug', '1');
  const raw = await apiClient.get<Record<string, unknown>>(`/reports/balance-sheet?${q.toString()}`);
  return {
    asOfDate: String(raw.date ?? options.asOfDate),
    selectedProjectId: String(raw.projectId ?? options.projectId ?? 'all'),
    assets: raw.assets as BalanceSheetReportResult['assets'],
    liabilities: raw.liabilities as BalanceSheetReportResult['liabilities'],
    equity: raw.equity as BalanceSheetReportResult['equity'],
    supplemental: raw.supplemental as BalanceSheetReportResult['supplemental'],
    totals: raw.totals as BalanceSheetReportResult['totals'],
    retainedEarningsFromPL: Number(raw.retainedEarningsFromPL ?? 0),
    isBalanced: Boolean(raw.isBalanced),
    discrepancy: Number(raw.discrepancy ?? 0),
    validation: (raw.validation as BalanceSheetReportResult['validation']) ?? [],
    debugLines: (raw.debugLines as BalanceSheetReportResult['debugLines']) ?? [],
  };
}

export async function fetchProfitLossReport(options: {
  from: string;
  to: string;
  projectId?: string;
}): Promise<ProfitLossReportResult> {
  const q = new URLSearchParams({ from: options.from, to: options.to });
  if (options.projectId && options.projectId !== 'all') q.set('projectId', options.projectId);
  const raw = await apiClient.get<Record<string, unknown>>(`/reports/profit-loss?${q.toString()}`);
  return {
    period: { from: String(raw.from ?? options.from), to: String(raw.to ?? options.to) },
    selectedProjectId: String(raw.projectId ?? options.projectId ?? 'all'),
    totalRevenue: Number(raw.total_revenue ?? 0),
    revenue: (raw.revenue as ProfitLossReportResult['revenue']) ?? [],
    cost_of_sales: (raw.cost_of_sales as ProfitLossReportResult['cost_of_sales']) ?? [],
    gross_profit: Number(raw.gross_profit ?? 0),
    operating_expenses: (raw.operating_expenses as ProfitLossReportResult['operating_expenses']) ?? [],
    operating_profit: Number(raw.operating_profit ?? 0),
    other_income: (raw.other_income as ProfitLossReportResult['other_income']) ?? [],
    finance_cost: (raw.finance_cost as ProfitLossReportResult['finance_cost']) ?? [],
    profit_before_tax: Number(raw.profit_before_tax ?? 0),
    tax: Number(raw.tax ?? 0),
    net_profit: Number(raw.net_profit ?? 0),
    validation: normalizeProfitLossValidation(raw.validation),
  };
}

function normalizeProfitLossValidation(raw: unknown): ProfitLossReportResult['validation'] {
  if (raw && typeof raw === 'object' && 'issues' in raw) {
    return raw as ProfitLossReportResult['validation'];
  }
  return {
    issues: [],
    legacyNetProfit: 0,
    structuredNetProfit: 0,
    ledgerMatch: true,
  };
}

export async function fetchCashFlowReport(options: {
  from: string;
  to: string;
  projectId?: string;
}): Promise<CashFlowReportResult> {
  const q = new URLSearchParams({ from: options.from, to: options.to });
  if (options.projectId && options.projectId !== 'all') q.set('projectId', options.projectId);
  const raw = await apiClient.get<Record<string, unknown>>(`/reports/cash-flow?${q.toString()}`);
  return raw as unknown as CashFlowReportResult;
}

export type ClientLedgerReportApiResult = {
  startDate: string;
  endDate: string;
  selectionKind: 'all' | 'owner' | 'unit';
  ownerId?: string;
  unitId?: string;
  rows: import('../../components/reports/clientLedgerReportEngine').ClientLedgerItem[];
  agreementSummaries: import('../../components/reports/clientLedgerReportEngine').ClientAgreementSummary[];
  totals: { debit: number; credit: number };
  closingBalance: number;
};

export async function fetchClientLedgerReport(options: {
  startDate: string;
  endDate: string;
  selection: import('../../components/reports/clientLedgerReportEngine').ClientLedgerTreeSelection;
  sortKey?: string;
  sortDirection?: 'asc' | 'desc';
}): Promise<ClientLedgerReportApiResult> {
  const q = new URLSearchParams({
    startDate: options.startDate,
    endDate: options.endDate,
    selectionKind: options.selection.kind,
  });
  if (options.selection.kind === 'owner') q.set('ownerId', options.selection.ownerId);
  if (options.selection.kind === 'unit') q.set('unitId', options.selection.unitId);
  if (options.sortKey) q.set('sortKey', options.sortKey);
  if (options.sortDirection) q.set('sortDirection', options.sortDirection);

  const raw = await apiClient.get<Record<string, unknown>>(`/reports/client-ledger?${q.toString()}`);
  return {
    startDate: String(raw.startDate ?? options.startDate),
    endDate: String(raw.endDate ?? options.endDate),
    selectionKind: (raw.selectionKind as ClientLedgerReportApiResult['selectionKind']) ?? options.selection.kind,
    ownerId: typeof raw.ownerId === 'string' ? raw.ownerId : undefined,
    unitId: typeof raw.unitId === 'string' ? raw.unitId : undefined,
    rows: (raw.rows as ClientLedgerReportApiResult['rows']) ?? [],
    agreementSummaries: (raw.agreementSummaries as ClientLedgerReportApiResult['agreementSummaries']) ?? [],
    totals: {
      debit: Number((raw.totals as Record<string, unknown>)?.debit ?? 0),
      credit: Number((raw.totals as Record<string, unknown>)?.credit ?? 0),
    },
    closingBalance: Number(raw.closingBalance ?? 0),
  };
}

export type VendorLedgerReportApiResult = {
  startDate: string;
  endDate: string;
  vendorId: string;
  buildingId: string;
  context: 'Rental' | 'Project' | null;
  rows: import('../../components/reports/vendorLedgerReportEngine').VendorLedgerRow[];
  totals: { bill: number; paid: number };
  closingBalance: number;
};

export async function fetchVendorLedgerReport(options: {
  startDate: string;
  endDate: string;
  vendorId?: string;
  buildingId?: string;
  search?: string;
  context?: 'Rental' | 'Project';
  sortDirection?: 'asc' | 'desc';
}): Promise<VendorLedgerReportApiResult> {
  const q = new URLSearchParams({
    startDate: options.startDate,
    endDate: options.endDate,
  });
  if (options.vendorId && options.vendorId !== 'all') q.set('vendorId', options.vendorId);
  if (options.buildingId && options.buildingId !== 'all') q.set('buildingId', options.buildingId);
  if (options.search?.trim()) q.set('search', options.search.trim());
  if (options.context) q.set('context', options.context);
  if (options.sortDirection) q.set('sortDirection', options.sortDirection);

  const raw = await apiClient.get<Record<string, unknown>>(`/reports/vendor-ledger?${q.toString()}`);
  const ctxRaw = raw.context;
  return {
    startDate: String(raw.startDate ?? options.startDate),
    endDate: String(raw.endDate ?? options.endDate),
    vendorId: String(raw.vendorId ?? 'all'),
    buildingId: String(raw.buildingId ?? 'all'),
    context: ctxRaw === 'Rental' || ctxRaw === 'Project' ? ctxRaw : null,
    rows: (raw.rows as VendorLedgerReportApiResult['rows']) ?? [],
    totals: {
      bill: Number((raw.totals as Record<string, unknown>)?.bill ?? 0),
      paid: Number((raw.totals as Record<string, unknown>)?.paid ?? 0),
    },
    closingBalance: Number(raw.closingBalance ?? 0),
  };
}
