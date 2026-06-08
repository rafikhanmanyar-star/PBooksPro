/**
 * Server-side rental reports (LAN/API mode).
 */

import { apiClient } from './client';
import type { ReportRow } from '../../components/reports/ownerRentalIncomeLedgerEngine';

export type OwnerRentalIncomeReportApiResult = {
  startDate: string;
  endDate: string;
  buildingId: string;
  ownerId: string;
  propertyId: string;
  openingBalance: number;
  fullLedgerClosingBalance: number;
  rows: ReportRow[];
};

export async function fetchOwnerRentalIncomeReport(options: {
  startDate: string;
  endDate: string;
  buildingId?: string;
  ownerId?: string;
  propertyId?: string;
  search?: string;
  sortKey?: string;
  sortDirection?: 'asc' | 'desc';
}): Promise<OwnerRentalIncomeReportApiResult> {
  const q = new URLSearchParams({
    startDate: options.startDate,
    endDate: options.endDate,
  });
  if (options.buildingId && options.buildingId !== 'all') q.set('buildingId', options.buildingId);
  if (options.ownerId && options.ownerId !== 'all') q.set('ownerId', options.ownerId);
  if (options.propertyId && options.propertyId !== 'all') q.set('propertyId', options.propertyId);
  if (options.search?.trim()) q.set('search', options.search.trim());
  if (options.sortKey) q.set('sortKey', options.sortKey);
  if (options.sortDirection) q.set('sortDirection', options.sortDirection);

  const raw = await apiClient.get<Record<string, unknown>>(`/reports/owner-rental-income?${q.toString()}`);
  return {
    startDate: String(raw.startDate ?? options.startDate),
    endDate: String(raw.endDate ?? options.endDate),
    buildingId: String(raw.buildingId ?? 'all'),
    ownerId: String(raw.ownerId ?? 'all'),
    propertyId: String(raw.propertyId ?? 'all'),
    openingBalance: Number(raw.openingBalance ?? 0),
    fullLedgerClosingBalance: Number(raw.fullLedgerClosingBalance ?? 0),
    rows: (raw.rows as ReportRow[]) ?? [],
  };
}

export type RentalBillsDashboardTreeNode = {
  id: string;
  name: string;
  type: 'building' | 'property' | 'vendor' | 'bearer' | 'all';
  outstanding: number;
  overdue: number;
  invoiceCount: number;
  children?: RentalBillsDashboardTreeNode[];
};

export type RentalBillsDashboardRow =
  | { kind: 'bill'; bill: Record<string, unknown> }
  | { kind: 'payment'; payment: Record<string, unknown>; bill: Record<string, unknown> };

export type RentalBillsDashboardApiResult = {
  tree: RentalBillsDashboardTreeNode[];
  summary: {
    totalOutstanding: number;
    overdueBills: number;
    paidThisMonth: number;
    paidBillsCount: number;
    changePercent: number;
  };
  rows: RentalBillsDashboardRow[];
  totalRows: number;
  page: number;
  pageSize: number;
};

export async function fetchRentalBillsDashboard(options: {
  viewBy: 'building' | 'property' | 'vendor' | 'bearer';
  status?: string;
  search?: string;
  tab?: 'all' | 'unpaid' | 'overdue';
  typeFilter?: 'All' | 'Bills' | 'Payments';
  nodeId?: string;
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}): Promise<RentalBillsDashboardApiResult> {
  const q = new URLSearchParams({ viewBy: options.viewBy });
  if (options.status && options.status !== 'all') q.set('status', options.status);
  if (options.search?.trim()) q.set('search', options.search.trim());
  if (options.tab) q.set('tab', options.tab);
  if (options.typeFilter) q.set('typeFilter', options.typeFilter);
  if (options.nodeId) q.set('nodeId', options.nodeId);
  if (options.sortKey) q.set('sortKey', options.sortKey);
  if (options.sortDir) q.set('sortDir', options.sortDir);
  if (options.page != null) q.set('page', String(options.page));
  if (options.pageSize != null) q.set('pageSize', String(options.pageSize));

  const raw = await apiClient.get<Record<string, unknown>>(`/rental/bills-dashboard?${q.toString()}`);
  return {
    tree: (raw.tree as RentalBillsDashboardTreeNode[]) ?? [],
    summary: {
      totalOutstanding: Number((raw.summary as Record<string, unknown>)?.totalOutstanding ?? 0),
      overdueBills: Number((raw.summary as Record<string, unknown>)?.overdueBills ?? 0),
      paidThisMonth: Number((raw.summary as Record<string, unknown>)?.paidThisMonth ?? 0),
      paidBillsCount: Number((raw.summary as Record<string, unknown>)?.paidBillsCount ?? 0),
      changePercent: Number((raw.summary as Record<string, unknown>)?.changePercent ?? 0),
    },
    rows: (raw.rows as RentalBillsDashboardRow[]) ?? [],
    totalRows: Number(raw.totalRows ?? 0),
    page: Number(raw.page ?? 1),
    pageSize: Number(raw.pageSize ?? 20),
  };
}

export type ServiceChargesDeductionReportApiResult = {
  startDate: string;
  endDate: string;
  buildingId: string;
  ownerId: string;
  rows: import('../../components/reports/serviceChargesDeductionReportEngine').ServiceChargeDeductionRow[];
  totalAmount: number;
};

export type BmAnalysisReportApiResult = {
  startDate: string;
  endDate: string;
  buildingId: string;
  reportData: import('../../components/reports/bmAnalysisReportEngine').BuildingBMData[];
  bmDetailsByBuilding: Record<
    string,
    import('../../components/reports/bmAnalysisReportEngine').BMBuildingDetail
  >;
  totals: { collected: number; receivable: number; expenses: number; net: number };
};

export async function fetchBmAnalysisReport(options: {
  startDate: string;
  endDate: string;
  buildingId?: string;
  search?: string;
  sortKey?: string;
  sortDirection?: 'asc' | 'desc';
}): Promise<BmAnalysisReportApiResult> {
  const q = new URLSearchParams({
    startDate: options.startDate,
    endDate: options.endDate,
  });
  if (options.buildingId && options.buildingId !== 'all') q.set('buildingId', options.buildingId);
  if (options.search?.trim()) q.set('search', options.search.trim());
  if (options.sortKey) q.set('sortKey', options.sortKey);
  if (options.sortDirection) q.set('sortDirection', options.sortDirection);

  const raw = await apiClient.get<Record<string, unknown>>(`/reports/bm-analysis?${q.toString()}`);
  return {
    startDate: String(raw.startDate ?? options.startDate),
    endDate: String(raw.endDate ?? options.endDate),
    buildingId: String(raw.buildingId ?? 'all'),
    reportData:
      (raw.reportData as BmAnalysisReportApiResult['reportData']) ?? [],
    bmDetailsByBuilding:
      (raw.bmDetailsByBuilding as BmAnalysisReportApiResult['bmDetailsByBuilding']) ?? {},
    totals: {
      collected: Number((raw.totals as Record<string, unknown>)?.collected ?? 0),
      receivable: Number((raw.totals as Record<string, unknown>)?.receivable ?? 0),
      expenses: Number((raw.totals as Record<string, unknown>)?.expenses ?? 0),
      net: Number((raw.totals as Record<string, unknown>)?.net ?? 0),
    },
  };
}

export type TenantLedgerReportApiResult = {
  startDate: string;
  endDate: string;
  tenantId: string;
  groupBy: '' | 'tenant';
  rows: import('../../components/reports/tenantLedgerReportEngine').TenantLedgerItem[];
  totals: { debit: number; credit: number };
  closingBalance: number;
};

export async function fetchTenantLedgerReport(options: {
  startDate: string;
  endDate: string;
  tenantId?: string;
  search?: string;
  groupBy?: '' | 'tenant';
  sortKey?: 'date';
  sortDirection?: 'asc' | 'desc';
}): Promise<TenantLedgerReportApiResult> {
  const q = new URLSearchParams({
    startDate: options.startDate,
    endDate: options.endDate,
  });
  if (options.tenantId && options.tenantId !== 'all') q.set('tenantId', options.tenantId);
  if (options.search?.trim()) q.set('search', options.search.trim());
  if (options.groupBy === 'tenant') q.set('groupBy', 'tenant');
  if (options.sortKey) q.set('sortKey', options.sortKey);
  if (options.sortDirection) q.set('sortDirection', options.sortDirection);

  const raw = await apiClient.get<Record<string, unknown>>(`/reports/tenant-ledger?${q.toString()}`);
  return {
    startDate: String(raw.startDate ?? options.startDate),
    endDate: String(raw.endDate ?? options.endDate),
    tenantId: String(raw.tenantId ?? 'all'),
    groupBy: raw.groupBy === 'tenant' ? 'tenant' : '',
    rows: (raw.rows as TenantLedgerReportApiResult['rows']) ?? [],
    totals: {
      debit: Number((raw.totals as Record<string, unknown>)?.debit ?? 0),
      credit: Number((raw.totals as Record<string, unknown>)?.credit ?? 0),
    },
    closingBalance: Number(raw.closingBalance ?? 0),
  };
}

export async function fetchServiceChargesDeductionReport(options: {
  startDate: string;
  endDate: string;
  buildingId?: string;
  ownerId?: string;
  search?: string;
  sortKey?: string;
  sortDirection?: 'asc' | 'desc';
}): Promise<ServiceChargesDeductionReportApiResult> {
  const q = new URLSearchParams({
    startDate: options.startDate,
    endDate: options.endDate,
  });
  if (options.buildingId && options.buildingId !== 'all') q.set('buildingId', options.buildingId);
  if (options.ownerId && options.ownerId !== 'all') q.set('ownerId', options.ownerId);
  if (options.search?.trim()) q.set('search', options.search.trim());
  if (options.sortKey) q.set('sortKey', options.sortKey);
  if (options.sortDirection) q.set('sortDirection', options.sortDirection);

  const raw = await apiClient.get<Record<string, unknown>>(
    `/reports/service-charges-deduction?${q.toString()}`
  );
  return {
    startDate: String(raw.startDate ?? options.startDate),
    endDate: String(raw.endDate ?? options.endDate),
    buildingId: String(raw.buildingId ?? 'all'),
    ownerId: String(raw.ownerId ?? 'all'),
    rows:
      (raw.rows as ServiceChargesDeductionReportApiResult['rows']) ?? [],
    totalAmount: Number(raw.totalAmount ?? 0),
  };
}

export type RentalReceivableReportApiResult = {
  propertyReceivables: import('../../components/reports/rentalReceivableReportEngine').PropertyReceivable[];
};

export async function fetchRentalReceivableReport(options: {
  buildingId?: string;
}): Promise<RentalReceivableReportApiResult> {
  const q = new URLSearchParams();
  if (options.buildingId && options.buildingId !== 'all') q.set('buildingId', options.buildingId);
  const suffix = q.toString() ? `?${q.toString()}` : '';
  const raw = await apiClient.get<Record<string, unknown>>(`/reports/rental-receivable${suffix}`);
  return {
    propertyReceivables:
      (raw.propertyReceivables as RentalReceivableReportApiResult['propertyReceivables']) ?? [],
  };
}

export type OwnerIncomeSummaryReportApiResult = {
  summaries: import('../../components/reports/ownerIncomeSummaryReportEngine').OwnerSummary[];
};

export async function fetchOwnerIncomeSummaryReport(options: {
  startDate: string;
  endDate: string;
  buildingId?: string;
  ownerId?: string;
  search?: string;
}): Promise<OwnerIncomeSummaryReportApiResult> {
  const q = new URLSearchParams({
    startDate: options.startDate,
    endDate: options.endDate,
  });
  if (options.buildingId && options.buildingId !== 'all') q.set('buildingId', options.buildingId);
  if (options.ownerId && options.ownerId !== 'all') q.set('ownerId', options.ownerId);
  if (options.search?.trim()) q.set('search', options.search.trim());
  const raw = await apiClient.get<Record<string, unknown>>(`/reports/owner-income-summary?${q.toString()}`);
  return {
    summaries: (raw.summaries as OwnerIncomeSummaryReportApiResult['summaries']) ?? [],
  };
}

export type OwnerSecurityDepositReportApiResult = {
  rows: import('../../components/reports/ownerSecurityDepositReportEngine').SecurityDepositReportRow[];
};

export async function fetchOwnerSecurityDepositReport(options: {
  startDate: string;
  endDate: string;
  buildingId?: string;
  ownerId?: string;
  propertyId?: string;
  search?: string;
  sortKey?: string;
  sortDirection?: 'asc' | 'desc';
}): Promise<OwnerSecurityDepositReportApiResult> {
  const q = new URLSearchParams({
    startDate: options.startDate,
    endDate: options.endDate,
  });
  if (options.buildingId && options.buildingId !== 'all') q.set('buildingId', options.buildingId);
  if (options.ownerId && options.ownerId !== 'all') q.set('ownerId', options.ownerId);
  if (options.propertyId && options.propertyId !== 'all') q.set('propertyId', options.propertyId);
  if (options.search?.trim()) q.set('search', options.search.trim());
  if (options.sortKey) q.set('sortKey', options.sortKey);
  if (options.sortDirection) q.set('sortDirection', options.sortDirection);
  const raw = await apiClient.get<Record<string, unknown>>(`/reports/owner-security-deposit?${q.toString()}`);
  return {
    rows: (raw.rows as OwnerSecurityDepositReportApiResult['rows']) ?? [],
  };
}
