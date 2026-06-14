/**
 * Project Financial Position — construction-focused snapshot (not a GAAP balance sheet).
 * Uses operational data: invoices, bills, contracts, units, investor equity.
 */

import type { AppState, Bill, Contract, Invoice, ProjectAgreement, Unit } from '../../types';
import { InvoiceStatus, InvoiceType, normalizeProjectAgreementStatus, ProjectAgreementStatus } from '../../types';
import { computeProjectProfitLossTotals } from './projectProfitLossComputation';
import {
  billMatchesFinancialEntityScope,
  invoiceMatchesFinancialEntityScope,
  scopeIsConsolidated,
  scopeTargetsBuilding,
  scopeTargetsProject,
  type FinancialEntityScope,
} from './financialEntityScope';
import type { ReportStateSlice } from './reportUtils';
import { getInvestorCapital } from '../../modules/project-profitability/services/projectProfitability.service';
import {
  buildContractRetentionSummary,
  getContractPaidFromTransactions,
} from '../../utils/contractRetention';

const PL_START = '2000-01-01';

export interface PositionLine {
  key: string;
  label: string;
  amount: number;
}

export interface ProjectFinancialPositionKpis {
  contractValue: number;
  billingValue: number;
  collectionValue: number;
  retentionHeld: number;
  retentionReleased: number;
  profitToDate: number;
  profitPct: number | null;
}

export interface ProjectFinancialPositionDashboard {
  netPosition: number;
  cashInvested: number;
  receivables: number;
  payables: number;
  profit: number;
}

export interface ProjectFinancialPositionResult {
  asOfDate: string;
  selectedProjectId: string;
  selectedBuildingId: string;
  assets: PositionLine[];
  liabilities: PositionLine[];
  totalAssets: number;
  totalLiabilities: number;
  netPosition: number;
  kpis: ProjectFinancialPositionKpis;
  dashboard: ProjectFinancialPositionDashboard;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function invoiceAsOf(inv: Invoice, asOfDate: string, slice: ReportStateSlice, scope: FinancialEntityScope): boolean {
  if (inv.deletedAt) return false;
  if (inv.status === InvoiceStatus.DRAFT) return false;
  if (!invoiceMatchesFinancialEntityScope(inv, slice, scope)) return false;
  const issue = new Date(inv.issueDate);
  if (issue > endOfDay(new Date(asOfDate))) return false;
  return true;
}

/** Project-selling installments: count full schedule once invoices exist (PM view), not only past issue dates. */
function isScheduledProjectReceivable(inv: Invoice): boolean {
  if (!inv.projectId) return false;
  if (inv.agreementId) return true;
  return inv.invoiceType === InvoiceType.INSTALLMENT;
}

function invoiceInPositionScope(
  inv: Invoice,
  asOfDate: string,
  slice: ReportStateSlice,
  scope: FinancialEntityScope
): boolean {
  if (inv.deletedAt) return false;
  if (inv.status === InvoiceStatus.DRAFT) return false;
  if (!invoiceMatchesFinancialEntityScope(inv, slice, scope)) return false;
  if (isScheduledProjectReceivable(inv)) return true;
  return invoiceAsOf(inv, asOfDate, slice, scope);
}

function unitIdsUnderActiveAgreement(state: AppState, projectId: string): Set<string> {
  const ids = new Set<string>();
  for (const ag of state.projectAgreements ?? []) {
    if (ag.projectId !== projectId) continue;
    if (normalizeProjectAgreementStatus(ag.status) === ProjectAgreementStatus.CANCELLED) continue;
    for (const uid of ag.unitIds ?? []) ids.add(uid);
  }
  return ids;
}

function bestUnitMarketPrice(state: AppState, unit: Unit, agreements: ProjectAgreement[]): number {
  const sp = Number(unit.salePrice) || 0;
  if (sp > 0) return sp;
  for (const ag of agreements) {
    if (!ag.unitIds?.includes(unit.id)) continue;
    if (normalizeProjectAgreementStatus(ag.status) === ProjectAgreementStatus.CANCELLED) continue;
    const sell = Number(ag.sellingPrice) || 0;
    if (sell > 0) return sell;
    const list = Number(ag.listPrice) || 0;
    const disc = Number(ag.customerDiscount) || 0;
    const net = Math.max(0, list - disc);
    if (net > 0) return net;
  }
  return 0;
}

function billAsOf(b: Bill, asOfDate: string, slice: ReportStateSlice, scope: FinancialEntityScope): boolean {
  if (b.status === InvoiceStatus.DRAFT) return false;
  if (!billMatchesFinancialEntityScope(b, slice, scope)) return false;
  const issue = new Date(b.issueDate);
  if (issue > endOfDay(new Date(asOfDate))) return false;
  return true;
}

function contractInScope(
  contract: Contract,
  scope: FinancialEntityScope,
  slice: ReportStateSlice,
  bills: Bill[]
): boolean {
  if (scopeTargetsProject(scope)) {
    return contract.projectId === scope.projectId;
  }
  if (scopeTargetsBuilding(scope)) {
    if (contract.projectId) {
      const linked = bills.some(
        (b) =>
          b.contractId === contract.id &&
          billMatchesFinancialEntityScope(b, slice, scope)
      );
      if (linked) return true;
    }
    return false;
  }
  return true;
}

function projectIdsForScope(state: AppState, scope: FinancialEntityScope, slice: ReportStateSlice): string[] {
  if (scopeTargetsProject(scope)) return [scope.projectId];
  if (scopeTargetsBuilding(scope)) {
    const ids = new Set<string>();
    for (const inv of state.invoices) {
      if (inv.projectId && invoiceMatchesFinancialEntityScope(inv, slice, scope)) ids.add(inv.projectId);
    }
    for (const b of state.bills) {
      if (b.projectId && billMatchesFinancialEntityScope(b, slice, scope)) ids.add(b.projectId);
    }
    for (const c of state.contracts ?? []) {
      if (c.projectId && contractInScope(c, scope, slice, state.bills)) ids.add(c.projectId);
    }
    return ids.size > 0 ? [...ids] : [];
  }
  return state.projects.map((p) => p.id);
}

function unitSold(u: Unit): boolean {
  return u.status === 'sold';
}

function sumReceivable(state: AppState, asOfDate: string, slice: ReportStateSlice, scope: FinancialEntityScope): number {
  let s = 0;
  for (const inv of state.invoices) {
    if (!invoiceInPositionScope(inv, asOfDate, slice, scope)) continue;
    s += Math.max(0, (Number(inv.amount) || 0) - (Number(inv.paidAmount) || 0));
  }
  return roundMoney(s);
}

function sumCollections(state: AppState, asOfDate: string, slice: ReportStateSlice, scope: FinancialEntityScope): number {
  let s = 0;
  for (const inv of state.invoices) {
    if (!invoiceInPositionScope(inv, asOfDate, slice, scope)) continue;
    s += Number(inv.paidAmount) || 0;
  }
  return roundMoney(s);
}

function sumBillingValue(state: AppState, asOfDate: string, slice: ReportStateSlice, scope: FinancialEntityScope): number {
  let s = 0;
  for (const inv of state.invoices) {
    if (!invoiceInPositionScope(inv, asOfDate, slice, scope)) continue;
    s += Number(inv.amount) || 0;
  }
  return roundMoney(s);
}

function sumPayablesSplit(
  state: AppState,
  asOfDate: string,
  slice: ReportStateSlice,
  scope: FinancialEntityScope
): { contractor: number; vendor: number; total: number } {
  let contractor = 0;
  let vendor = 0;
  for (const b of state.bills) {
    if (!billAsOf(b, asOfDate, slice, scope)) continue;
    const due = Math.max(0, (Number(b.amount) || 0) - (Number(b.paidAmount) || 0));
    if (b.contractId) contractor += due;
    else vendor += due;
  }
  return { contractor: roundMoney(contractor), vendor: roundMoney(vendor), total: roundMoney(contractor + vendor) };
}

function sumCustomerAdvances(
  state: AppState,
  asOfDate: string,
  slice: ReportStateSlice,
  scope: FinancialEntityScope
): number {
  const unitById = new Map(state.units.map((u) => [u.id, u]));
  let s = 0;
  for (const inv of state.invoices) {
    if (!invoiceInPositionScope(inv, asOfDate, slice, scope)) continue;
    const paid = Number(inv.paidAmount) || 0;
    if (paid <= 0) continue;
    if (inv.unitId) {
      const u = unitById.get(inv.unitId);
      if (u && !unitSold(u)) s += paid;
      continue;
    }
    if (inv.agreementId) {
      const ag = state.projectAgreements?.find((a) => a.id === inv.agreementId);
      if (ag && normalizeProjectAgreementStatus(ag.status) === ProjectAgreementStatus.ACTIVE) {
        s += paid;
      }
    }
  }
  return roundMoney(s);
}

function sumInventory(state: AppState, _asOfDate: string, projectIds: string[]): number {
  let s = 0;
  for (const pid of projectIds) {
    const committed = unitIdsUnderActiveAgreement(state, pid);
    const agreements = (state.projectAgreements ?? []).filter((a) => a.projectId === pid);
    for (const u of state.units) {
      if (u.projectId !== pid) continue;
      if (unitSold(u)) continue;
      if (committed.has(u.id)) continue;
      s += bestUnitMarketPrice(state, u, agreements);
    }
  }
  return roundMoney(s);
}

function sumCashInvested(state: AppState, asOfDate: string, projectIds: string[]): number {
  let s = 0;
  for (const pid of projectIds) {
    s += Math.max(0, getInvestorCapital(state, pid, asOfDate));
  }
  return roundMoney(s);
}

function sumWorkInProgress(state: AppState, asOfDate: string, projectIds: string[], buildingId: string): number {
  let s = 0;
  for (const pid of projectIds) {
    const pl = computeProjectProfitLossTotals(state, pid, PL_START, asOfDate, undefined, buildingId);
    const units = state.units.filter((u) => u.projectId === pid);
    const sold = units.filter(unitSold).length;
    const n = Math.max(units.length, 1);
    s += roundMoney(pl.totalExpense * (1 - sold / n));
  }
  return roundMoney(s);
}

function sumContractRetention(
  state: AppState,
  slice: ReportStateSlice,
  scope: FinancialEntityScope
): { held: number; released: number; payable: number } {
  let held = 0;
  let released = 0;
  let payable = 0;
  for (const contract of state.contracts ?? []) {
    if (!contractInScope(contract, scope, slice, state.bills)) continue;
    if ((contract.retentionType ?? 'NONE') === 'NONE') continue;
    const paid = getContractPaidFromTransactions(state.transactions ?? [], contract.id);
    const summary = buildContractRetentionSummary(contract, paid);
    held += summary.retentionAmount;
    released += summary.retentionReleased;
    payable += summary.remainingRetention;
  }
  return {
    held: roundMoney(held),
    released: roundMoney(released),
    payable: roundMoney(payable),
  };
}

function sumContractValue(state: AppState, slice: ReportStateSlice, scope: FinancialEntityScope): number {
  let s = 0;
  for (const c of state.contracts ?? []) {
    if (!contractInScope(c, scope, slice, state.bills)) continue;
    s += Number(c.totalAmount) || 0;
  }
  return roundMoney(s);
}

function profitForScope(
  state: AppState,
  asOfDate: string,
  scope: FinancialEntityScope
): number {
  const projectId = scopeTargetsProject(scope) ? scope.projectId : 'all';
  const buildingId = scopeTargetsBuilding(scope) ? scope.buildingId : 'all';
  return computeProjectProfitLossTotals(state, projectId, PL_START, asOfDate, undefined, buildingId).netProfit;
}

export function computeProjectFinancialPosition(
  state: AppState,
  options: {
    asOfDate: string;
    selectedProjectId: string;
    selectedBuildingId?: string;
  }
): ProjectFinancialPositionResult {
  const asOfDate = options.asOfDate;
  const selectedProjectId = options.selectedProjectId;
  const selectedBuildingId = options.selectedBuildingId ?? 'all';
  const scope: FinancialEntityScope = { projectId: selectedProjectId, buildingId: selectedBuildingId };
  const slice: ReportStateSlice = {
    invoices: state.invoices,
    bills: state.bills,
    projectAgreements: state.projectAgreements,
    properties: state.properties,
  };

  const projectIds = projectIdsForScope(state, scope, slice);
  const buildingIdForPl = scopeTargetsBuilding(scope) ? scope.buildingId : 'all';

  const cashInvested = scopeIsConsolidated(scope)
    ? sumCashInvested(state, asOfDate, state.projects.map((p) => p.id))
    : sumCashInvested(state, asOfDate, projectIds.length ? projectIds : state.projects.map((p) => p.id));

  const accountsReceivable = sumReceivable(state, asOfDate, slice, scope);
  const inventoryUnits = sumInventory(
    state,
    asOfDate,
    projectIds.length ? projectIds : state.projects.map((p) => p.id)
  );
  const retention = sumContractRetention(state, slice, scope);
  const workInProgress = sumWorkInProgress(
    state,
    asOfDate,
    projectIds.length ? projectIds : state.projects.map((p) => p.id),
    buildingIdForPl
  );

  const payables = sumPayablesSplit(state, asOfDate, slice, scope);
  const customerAdvances = sumCustomerAdvances(state, asOfDate, slice, scope);

  const assets: PositionLine[] = [
    { key: 'cash_invested', label: 'Cash Invested', amount: cashInvested },
    { key: 'accounts_receivable', label: 'Accounts Receivable', amount: accountsReceivable },
    { key: 'inventory_units', label: 'Inventory Units', amount: inventoryUnits },
    { key: 'retention_receivable', label: 'Retention Receivable', amount: 0 },
    { key: 'work_in_progress', label: 'Work in Progress', amount: workInProgress },
  ];

  const liabilities: PositionLine[] = [
    { key: 'contractor_payables', label: 'Contractor Payables', amount: payables.contractor },
    { key: 'vendor_payables', label: 'Vendor Payables', amount: payables.vendor },
    { key: 'customer_advances', label: 'Customer Advances', amount: customerAdvances },
    { key: 'retention_payable', label: 'Retention Payable', amount: retention.payable },
  ];

  const totalAssets = roundMoney(assets.reduce((s, l) => s + l.amount, 0));
  const totalLiabilities = roundMoney(liabilities.reduce((s, l) => s + l.amount, 0));
  const netPosition = roundMoney(totalAssets - totalLiabilities);

  const billingValue = sumBillingValue(state, asOfDate, slice, scope);
  const collectionValue = sumCollections(state, asOfDate, slice, scope);
  const contractValue = sumContractValue(state, slice, scope);
  const profitToDate = roundMoney(profitForScope(state, asOfDate, scope));
  const profitPct =
    contractValue > 0.01 ? roundMoney((profitToDate / contractValue) * 100) : null;

  const kpis: ProjectFinancialPositionKpis = {
    contractValue,
    billingValue,
    collectionValue,
    retentionHeld: retention.held,
    retentionReleased: retention.released,
    profitToDate,
    profitPct,
  };

  const dashboard: ProjectFinancialPositionDashboard = {
    netPosition,
    cashInvested,
    receivables: accountsReceivable,
    payables: payables.total,
    profit: profitToDate,
  };

  return {
    asOfDate,
    selectedProjectId,
    selectedBuildingId,
    assets,
    liabilities,
    totalAssets,
    totalLiabilities,
    netPosition,
    kpis,
    dashboard,
  };
}
