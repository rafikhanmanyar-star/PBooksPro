/**
 * Project profitability — accrual-aligned revenue & expense from {@link computeProjectProfitLossTotals},
 * investor capital from equity ledger, inventory valuation from unsold units × market price.
 */

import type { AppState, Bill, Category, Invoice, Project, ProjectAgreement, Unit } from '../../../types';
import {
    InvoiceStatus,
    InvoiceType,
    normalizeProjectAgreementStatus,
    ProjectAgreementStatus,
    TransactionType,
} from '../../../types';
import { computeProjectProfitLossTotals } from '../../../components/reports/projectProfitLossComputation';
import { accumulateInvestorMapForProject } from '../../../components/reports/investorEquityAccumulation';
import type {
    ExpenseBreakdownBucket,
    InvestorLedgerBreakdown,
    InventoryAnalytics,
    MonthlyProfitPoint,
    PortfolioProfitabilitySummary,
    ProjectProfitabilityDetails,
    ProjectProfitabilityRow,
    ProfitabilityRowStatus,
    RevenueBreakdown,
} from '../types/profitability.types';

const PL_START = '2000-01-01';

function endOfDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
}

function invoiceInScope(inv: Invoice, projectId: string, endYmd: string): boolean {
    if (inv.deletedAt) return false;
    if (inv.status === InvoiceStatus.DRAFT) return false;
    if (inv.projectId !== projectId) return false;
    const issue = new Date(inv.issueDate);
    if (issue > endOfDay(new Date(endYmd))) return false;
    return true;
}

function billInScope(b: Bill, projectId: string, endYmd: string): boolean {
    if (b.status === InvoiceStatus.DRAFT) return false;
    if (b.projectId !== projectId) return false;
    const issue = new Date(b.issueDate);
    if (issue > endOfDay(new Date(endYmd))) return false;
    return true;
}

function isSoldUnit(u: Unit): boolean {
    return u.status === 'sold';
}

function agreementsForProject(state: AppState, projectId: string): ProjectAgreement[] {
    return (state.projectAgreements ?? []).filter((a) => a.projectId === projectId);
}

function bestPriceForUnit(state: AppState, unit: Unit, agreements: ProjectAgreement[]): number {
    const sp = Number(unit.salePrice) || 0;
    if (sp > 0) return sp;
    for (const ag of agreements) {
        if (!ag.unitIds?.includes(unit.id)) continue;
        const st = normalizeProjectAgreementStatus(ag.status);
        if (st === ProjectAgreementStatus.CANCELLED) continue;
        const sell = Number(ag.sellingPrice) || 0;
        if (sell > 0) return sell;
        const list = Number(ag.listPrice) || 0;
        const disc = Number(ag.customerDiscount) || 0;
        const net = Math.max(0, list - disc);
        if (net > 0) return net;
    }
    return 0;
}

function sumQualifyingInvoices(
    state: AppState,
    projectId: string,
    endYmd: string,
    pred: (inv: Invoice) => boolean
): number {
    let s = 0;
    for (const inv of state.invoices) {
        if (!invoiceInScope(inv, projectId, endYmd)) continue;
        if (!pred(inv)) continue;
        s += Number(inv.amount) || 0;
    }
    return s;
}

function sumInvoiceCollections(state: AppState, projectId: string, endYmd: string): { receivable: number; cashReceived: number } {
    let receivable = 0;
    let cash = 0;
    for (const inv of state.invoices) {
        if (!invoiceInScope(inv, projectId, endYmd)) continue;
        const amt = Number(inv.amount) || 0;
        const paid = Number(inv.paidAmount) || 0;
        receivable += Math.max(0, amt - paid);
        cash += paid;
    }
    return { receivable, cashReceived: cash };
}

function sumBillPayables(state: AppState, projectId: string, endYmd: string): number {
    let pay = 0;
    for (const b of state.bills) {
        if (!billInScope(b, projectId, endYmd)) continue;
        const amt = Number(b.amount) || 0;
        const paid = Number(b.paidAmount) || 0;
        pay += Math.max(0, amt - paid);
    }
    return pay;
}

function bucketExpenseLabel(cat: Category | undefined, amount: number): string {
    if (!cat || cat.type !== TransactionType.EXPENSE) return 'Other expense';
    const n = (cat.name || '').toLowerCase();
    const st = cat.plSubType;
    if (st === 'finance_cost') return 'Finance charges';
    if (st === 'cost_of_sales') {
        if (n.includes('material')) return 'Materials';
        if (n.includes('contract') || n.includes('vendor')) return 'Contractor';
        if (n.includes('land')) return 'Land purchase';
        return 'Cost of sales';
    }
    if (n.includes('labor') || n.includes('payroll') || n.includes('salary')) return 'Labor & salaries';
    if (n.includes('util')) return 'Utilities';
    if (n.includes('broker') || n.includes('commission')) return 'Brokerage & commission';
    if (n.includes('approval') || n.includes('legal')) return 'Approvals & legal';
    if (n.includes('maint')) return 'Maintenance';
    if (n.includes('invent')) return 'Project inventory';
    return 'Operating expense';
}

function rollupExpenseBreakdown(state: AppState, pl: { categoryAmounts: Record<string, number> }): ExpenseBreakdownBucket[] {
    const map = new Map<string, number>();
    const catById = new Map(state.categories.map((c) => [c.id, c]));
    for (const [cid, raw] of Object.entries(pl.categoryAmounts)) {
        if (cid.startsWith('uncategorized')) continue;
        const cat = catById.get(cid);
        if (!cat || cat.type !== TransactionType.EXPENSE) continue;
        if (raw <= 0) continue;
        const label = bucketExpenseLabel(cat, raw);
        map.set(label, (map.get(label) || 0) + raw);
    }
    return [...map.entries()]
        .map(([label, amount]) => ({ key: label, label, amount }))
        .sort((a, b) => b.amount - a.amount);
}

function revenueFromInvoices(state: AppState, projectId: string, endYmd: string): RevenueBreakdown {
    let installment = 0;
    let serviceCharge = 0;
    let rental = 0;
    let securityDeposit = 0;
    for (const inv of state.invoices) {
        if (!invoiceInScope(inv, projectId, endYmd)) continue;
        const a = Number(inv.amount) || 0;
        switch (inv.invoiceType) {
            case InvoiceType.INSTALLMENT:
                installment += a;
                break;
            case InvoiceType.SERVICE_CHARGE:
                serviceCharge += a;
                break;
            case InvoiceType.RENTAL:
                rental += a;
                break;
            case InvoiceType.SECURITY_DEPOSIT:
                securityDeposit += a;
                break;
            default:
                break;
        }
    }
    const invSum = installment + serviceCharge + rental + securityDeposit;
    const pl = computeProjectProfitLossTotals(state, projectId, PL_START, endYmd);
    const otherIncomeFromPl = Math.max(0, pl.totalIncome - invSum);
    return { installment, serviceCharge, rental, securityDeposit, otherIncomeFromPl };
}

function investorLedgerForProject(state: AppState, projectId: string, endYmd: string): InvestorLedgerBreakdown {
    const asOf = endOfDay(new Date(endYmd));
    const m = accumulateInvestorMapForProject(state, asOf, projectId);
    let deposits = 0;
    let withdrawals = 0;
    let profitAllocations = 0;
    for (const e of Object.values(m)) {
        deposits += e.invested;
        withdrawals += e.withdrawn;
        profitAllocations += e.profit;
    }
    return { deposits, withdrawals, profitAllocations };
}

function buildMonthlyTrend(
    state: AppState,
    endYmd: string,
    maxMonths: number,
    projectIds: readonly string[] | null
): MonthlyProfitPoint[] {
    const end = new Date(endYmd);
    const out: MonthlyProfitPoint[] = [];
    for (let i = 0; i < maxMonths; i++) {
        const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
        const start = new Date(d.getFullYear(), d.getMonth(), 1);
        const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        const s = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`;
        const e = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
        const pl =
            projectIds == null
                ? computeProjectProfitLossTotals(state, 'all', s, e)
                : projectIds.reduce(
                      (acc, projectId) => {
                          const projectPl = computeProjectProfitLossTotals(state, projectId, s, e);
                          acc.totalIncome += projectPl.totalIncome;
                          acc.totalExpense += projectPl.totalExpense;
                          acc.netProfit += projectPl.netProfit;
                          return acc;
                      },
                      { totalIncome: 0, totalExpense: 0, netProfit: 0 }
                  );
        const monthKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
        const label = start.toLocaleString(undefined, { month: 'short', year: 'numeric' });
        out.push({ monthKey, label, revenue: pl.totalIncome, expense: pl.totalExpense, netProfit: pl.netProfit });
    }
    return out.reverse();
}

function monthlyTrendForProject(state: AppState, projectId: string, endYmd: string, maxMonths = 12): MonthlyProfitPoint[] {
    return buildMonthlyTrend(state, endYmd, maxMonths, [projectId]);
}

function plCategoryTrace(state: AppState, projectId: string, endYmd: string): ProjectProfitabilityDetails['plCategoryRollup'] {
    const pl = computeProjectProfitLossTotals(state, projectId, PL_START, endYmd);
    const catById = new Map(state.categories.map((c) => [c.id, c]));
    const rows: ProjectProfitabilityDetails['plCategoryRollup'] = [];
    for (const [cid, amt] of Object.entries(pl.categoryAmounts)) {
        if (Math.abs(amt) < 1e-6) continue;
        if (cid.startsWith('uncategorized')) {
            const type = cid === 'uncategorized_income' ? 'income' : 'expense';
            rows.push({ categoryId: cid, name: type === 'income' ? 'Uncategorized income' : 'Uncategorized expense', amount: Math.abs(amt), type });
            continue;
        }
        const cat = catById.get(cid);
        if (!cat) continue;
        const type = cat.type === TransactionType.INCOME ? 'income' : 'expense';
        rows.push({
            categoryId: cid,
            name: cat.name,
            plSubType: cat.plSubType,
            amount: type === 'income' ? amt : amt,
            type,
        });
    }
    rows.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    return rows.slice(0, 80);
}

function lastUpdatedForProject(state: AppState, projectId: string, endYmd: string): string | null {
    const end = endOfDay(new Date(endYmd));
    let max: number | null = null;
    const touch = (iso: string | undefined) => {
        if (!iso) return;
        const t = new Date(iso).getTime();
        if (t > end.getTime()) return;
        if (max == null || t > max) max = t;
    };
    for (const tx of state.transactions) {
        if (tx.projectId !== projectId) continue;
        touch(tx.date);
    }
    for (const inv of state.invoices) {
        if (inv.projectId !== projectId || inv.deletedAt) continue;
        touch(inv.issueDate);
    }
    for (const b of state.bills) {
        if (b.projectId !== projectId) continue;
        touch(b.issueDate);
    }
    if (max == null) return null;
    return new Date(max).toISOString().slice(0, 10);
}

function resolveRowStatus(project: Project, netProfit: number): ProfitabilityRowStatus {
    const st = project.status;
    if (st === 'Completed') return 'Completed';
    if (netProfit > 0.01) return 'Profitable';
    if (netProfit < -0.01) return 'Loss';
    return 'Ongoing';
}

function projectHasInvestor(state: AppState, projectId: string, investorAccountId: string, endYmd: string): boolean {
    const asOf = endOfDay(new Date(endYmd));
    const m = accumulateInvestorMapForProject(state, asOf, projectId);
    const e = m[investorAccountId];
    if (!e) return false;
    return e.invested > 0.01 || e.withdrawn > 0.01 || e.profit > 0.01;
}

function brokerNamesForProject(state: AppState, projectId: string): string[] {
    const names = new Set<string>();
    for (const ag of state.projectAgreements ?? []) {
        if (ag.projectId !== projectId || !ag.rebateBrokerId) continue;
        const c = state.contacts.find((x) => x.id === ag.rebateBrokerId);
        if (c?.name) names.add(c.name);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
}

function soldRevenueFromInvoices(state: AppState, projectId: string, units: Unit[], endYmd: string): number {
    const unitById = new Map(units.map((u) => [u.id, u]));
    let direct = 0;
    for (const inv of state.invoices) {
        if (!invoiceInScope(inv, projectId, endYmd)) continue;
        if (inv.invoiceType !== InvoiceType.INSTALLMENT && inv.invoiceType !== InvoiceType.SERVICE_CHARGE) continue;
        if (!inv.unitId) continue;
        const u = unitById.get(inv.unitId);
        if (!u || !isSoldUnit(u)) continue;
        direct += Number(inv.amount) || 0;
    }
    const totalInv = sumQualifyingInvoices(state, projectId, endYmd, () => true);
    const soldCount = units.filter(isSoldUnit).length;
    const n = units.length;
    if (direct > 0.01) return direct;
    if (n === 0) return 0;
    return totalInv * (soldCount / n);
}

function inventoryAnalytics(state: AppState, project: Project, units: Unit[], agreements: ProjectAgreement[], endYmd: string): InventoryAnalytics {
    const soldUnits = units.filter(isSoldUnit).length;
    const unsoldUnits = units.length - soldUnits;
    let marketValueUnsold = 0;
    let oldest: number | null = null;
    const now = endOfDay(new Date(endYmd)).getTime();
    for (const u of units) {
        if (isSoldUnit(u)) continue;
        marketValueUnsold += bestPriceForUnit(state, u, agreements);
        for (const ag of agreements) {
            if (!ag.unitIds?.includes(u.id)) continue;
            const t = new Date(ag.issueDate).getTime();
            if (!Number.isFinite(t)) continue;
            const ageDays = Math.floor((now - t) / 86400000);
            if (oldest == null || ageDays > oldest) oldest = ageDays;
        }
    }
    return { soldUnits, unsoldUnits, marketValueUnsold, oldestUnsoldDays: oldest };
}

export function getProjectRevenue(state: AppState, projectId: string, endYmd: string): number {
    return computeProjectProfitLossTotals(state, projectId, PL_START, endYmd).totalIncome;
}

export function getProjectExpense(state: AppState, projectId: string, endYmd: string): number {
    return computeProjectProfitLossTotals(state, projectId, PL_START, endYmd).totalExpense;
}

export function getInvestorCapital(state: AppState, projectId: string, endYmd: string): number {
    const asOf = endOfDay(new Date(endYmd));
    const m = accumulateInvestorMapForProject(state, asOf, projectId);
    return Object.values(m).reduce((s, e) => s + e.invested - e.withdrawn, 0);
}

export function getUnsoldInventoryValue(state: AppState, projectId: string, endYmd: string): number {
    const project = state.projects.find((p) => p.id === projectId);
    if (!project) return 0;
    const units = state.units.filter((u) => u.projectId === projectId);
    const agreements = agreementsForProject(state, projectId);
    return inventoryAnalytics(state, project, units, agreements, endYmd).marketValueUnsold;
}

export function getRealizedProfit(state: AppState, projectId: string, endYmd: string): number {
    const units = state.units.filter((u) => u.projectId === projectId);
    const expense = getProjectExpense(state, projectId, endYmd);
    const sold = units.filter(isSoldUnit).length;
    const n = Math.max(units.length, 1);
    const soldCost = expense * (sold / n);
    const soldRev = soldRevenueFromInvoices(state, projectId, units, endYmd);
    return soldRev - soldCost;
}

export function getAdjustedProfit(state: AppState, projectId: string, endYmd: string): number {
    const rev = getProjectRevenue(state, projectId, endYmd);
    const inv = getUnsoldInventoryValue(state, projectId, endYmd);
    const exp = getProjectExpense(state, projectId, endYmd);
    return rev + inv - exp;
}

export function getROI(state: AppState, projectId: string, endYmd: string): number | null {
    const cap = getInvestorCapital(state, projectId, endYmd);
    if (cap <= 0.01) return null;
    const net = getProjectRevenue(state, projectId, endYmd) - getProjectExpense(state, projectId, endYmd);
    return (net / cap) * 100;
}

export function getNetProfit(state: AppState, projectId: string, endYmd: string): number {
    const pl = computeProjectProfitLossTotals(state, projectId, PL_START, endYmd);
    return pl.netProfit;
}

export function buildProjectProfitabilityRow(state: AppState, project: Project, endYmd: string): ProjectProfitabilityRow {
    const pl = computeProjectProfitLossTotals(state, project.id, PL_START, endYmd);
    const units = state.units.filter((u) => u.projectId === project.id);
    const agreements = agreementsForProject(state, project.id);
    const sold = units.filter(isSoldUnit).length;
    const n = units.length;
    const completionPct = n === 0 ? 0 : (sold / n) * 100;
    const revenue = pl.totalIncome;
    const expense = pl.totalExpense;
    const netProfit = pl.netProfit;
    const unsoldInventoryValue = inventoryAnalytics(state, project, units, agreements, endYmd).marketValueUnsold;
    const adjustedProfit = revenue + unsoldInventoryValue - expense;
    const soldRatio = n === 0 ? 1 : sold / n;
    const grossProfit = revenue - expense * soldRatio;
    const realizedProfit = getRealizedProfit(state, project.id, endYmd);
    const { receivable, cashReceived } = sumInvoiceCollections(state, project.id, endYmd);
    const payables = sumBillPayables(state, project.id, endYmd);
    const investorCapital = getInvestorCapital(state, project.id, endYmd);
    const roiPct = getROI(state, project.id, endYmd);
    return {
        projectId: project.id,
        projectName: project.name,
        projectStatus: project.status,
        projectType: project.projectType,
        city: project.location,
        completionPct,
        unitsSold: sold,
        unitsRemaining: Math.max(0, n - sold),
        unitsTotal: n,
        revenue,
        expense,
        grossProfit,
        netProfit,
        adjustedProfit,
        realizedProfit,
        unsoldInventoryValue,
        receivable,
        cashReceived,
        payables,
        investorCapital,
        roiPct,
        lastUpdated: lastUpdatedForProject(state, project.id, endYmd),
        brokerNames: brokerNamesForProject(state, project.id),
        rowStatus: resolveRowStatus(project, netProfit),
    };
}

/** Aggregate KPIs for a set of profitability rows (portfolio or filtered subset). */
export function derivePortfolioSummaryFromRows(rows: ProjectProfitabilityRow[], endYmd: string): PortfolioProfitabilitySummary {
    const active = rows.filter((r) => r.rowStatus !== 'Completed').length;
    const profitable = rows.filter((r) => r.netProfit > 0.01).length;
    const loss = rows.filter((r) => r.netProfit < -0.01).length;
    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
    const totalExpense = rows.reduce((s, r) => s + r.expense, 0);
    const netProfit = totalRevenue - totalExpense;
    const totalUnsoldInventoryValue = rows.reduce((s, r) => s + r.unsoldInventoryValue, 0);
    const adjustedProfit = totalRevenue + totalUnsoldInventoryValue - totalExpense;
    const totalInvestorCapital = rows.reduce((s, r) => s + Math.max(0, r.investorCapital), 0);
    const roiPctAggregate = totalInvestorCapital > 0.01 ? (netProfit / totalInvestorCapital) * 100 : null;
    return {
        asOfDate: endYmd,
        totalRevenue,
        totalExpense,
        netProfit,
        adjustedProfit,
        totalUnsoldInventoryValue,
        roiPctAggregate,
        activeProjects: active,
        profitableProjects: profitable,
        lossProjects: loss,
        totalInvestorCapital,
        rows,
    };
}

export function getProjectProfitabilitySummary(state: AppState, endYmd: string): PortfolioProfitabilitySummary {
    const rows = state.projects.map((p) => buildProjectProfitabilityRow(state, p, endYmd));
    return derivePortfolioSummaryFromRows(rows, endYmd);
}

export function getProjectProfitabilityDetails(state: AppState, projectId: string, endYmd: string): ProjectProfitabilityDetails | null {
    const project = state.projects.find((p) => p.id === projectId);
    if (!project) return null;
    const row = buildProjectProfitabilityRow(state, project, endYmd);
    const pl = computeProjectProfitLossTotals(state, projectId, PL_START, endYmd);
    const units = state.units.filter((u) => u.projectId === projectId);
    const agreements = agreementsForProject(state, projectId);
    const inv = inventoryAnalytics(state, project, units, agreements, endYmd);
    const led = investorLedgerForProject(state, projectId, endYmd);
    return {
        projectId,
        projectName: row.projectName,
        projectStatus: row.projectStatus,
        completionPct: row.completionPct,
        revenue: row.revenue,
        expense: row.expense,
        netProfit: row.netProfit,
        adjustedProfit: row.adjustedProfit,
        realizedProfit: row.realizedProfit,
        unsoldInventoryValue: row.unsoldInventoryValue,
        investorCapital: row.investorCapital,
        roiPct: row.roiPct,
        revenueBreakdown: revenueFromInvoices(state, projectId, endYmd),
        expenseBreakdown: rollupExpenseBreakdown(state, pl),
        investorLedger: led,
        inventory: inv,
        monthlyTrend: monthlyTrendForProject(state, projectId, endYmd),
        plCategoryRollup: plCategoryTrace(state, projectId, endYmd),
    };
}

export function filterProfitabilityRows(
    rows: ProjectProfitabilityRow[],
    state: AppState,
    endYmd: string,
    f: {
        projectId: string;
        search: string;
        projectStatus: string;
        investorId: string;
        projectType: string;
        city: string;
        completionMin: string;
        completionMax: string;
        profitability: 'all' | 'profitable' | 'loss' | 'breakeven';
        brokerId: string;
        tag: string;
    }
): ProjectProfitabilityRow[] {
    const q = f.search.trim().toLowerCase();
    return rows.filter((r) => {
        if (f.projectId !== 'all' && r.projectId !== f.projectId) return false;
        if (q && !r.projectName.toLowerCase().includes(q)) return false;
        if (f.projectStatus !== 'all' && (r.projectStatus || 'Active') !== f.projectStatus) return false;
        if (f.investorId !== 'all' && !projectHasInvestor(state, r.projectId, f.investorId, endYmd)) return false;
        if (f.projectType !== 'all' && (r.projectType || '').toLowerCase() !== f.projectType.toLowerCase()) return false;
        if (f.city !== 'all' && (r.city || '').trim().toLowerCase() !== f.city.trim().toLowerCase()) return false;
        const cmin = parseFloat(f.completionMin);
        if (Number.isFinite(cmin) && r.completionPct < cmin) return false;
        const cmax = parseFloat(f.completionMax);
        if (Number.isFinite(cmax) && r.completionPct > cmax) return false;
        if (f.profitability === 'profitable' && !(r.netProfit > 0.01)) return false;
        if (f.profitability === 'loss' && !(r.netProfit < -0.01)) return false;
        if (f.profitability === 'breakeven' && Math.abs(r.netProfit) > 0.01) return false;
        if (f.brokerId !== 'all') {
            const ags = (state.projectAgreements ?? []).filter((a) => a.projectId === r.projectId && a.rebateBrokerId === f.brokerId);
            if (ags.length === 0) return false;
        }
        if (f.tag.trim()) {
            const p = state.projects.find((x) => x.id === r.projectId);
            const blob = `${p?.description ?? ''} ${p?.name ?? ''}`.toLowerCase();
            if (!blob.includes(f.tag.trim().toLowerCase())) return false;
        }
        return true;
    });
}

export function portfolioMonthlyTrend(state: AppState, endYmd: string, maxMonths = 12): MonthlyProfitPoint[] {
    return buildMonthlyTrend(state, endYmd, maxMonths, null);
}

export function portfolioMonthlyTrendForProjectIds(
    state: AppState,
    endYmd: string,
    projectIds: readonly string[],
    maxMonths = 12
): MonthlyProfitPoint[] {
    return buildMonthlyTrend(state, endYmd, maxMonths, projectIds);
}

export function uniqueProjectTypes(rows: ProjectProfitabilityRow[]): string[] {
    const s = new Set<string>();
    for (const r of rows) {
        if (r.projectType?.trim()) s.add(r.projectType.trim());
    }
    return [...s].sort((a, b) => a.localeCompare(b));
}

export function uniqueCities(rows: ProjectProfitabilityRow[]): string[] {
    const s = new Set<string>();
    for (const r of rows) {
        if (r.city?.trim()) s.add(r.city.trim());
    }
    return [...s].sort((a, b) => a.localeCompare(b));
}
