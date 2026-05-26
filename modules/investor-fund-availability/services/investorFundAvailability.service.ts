/**
 * Investor fund availability — liquidity vs book equity.
 * Calculations use the same persisted ledger as the rest of PBooks Pro (transactions, invoices, bills).
 */
import type { AppState, Account, Bill, Invoice, Project, Transaction } from '../../../types';
import {
    AccountType,
    EquityLedgerSubtype,
    InvoiceStatus,
    LoanSubtype,
    TransactionType,
} from '../../../types';
import { accumulateInvestorMapForProject } from '../../../components/reports/investorEquityAccumulation';
import { computeProjectScopedBankCashBalance } from '../../../services/accounting/accountingLedgerCore';
import { resolveProjectIdForTransaction } from '../../../components/reports/reportUtils';
import { computeProjectProfitLossTotals } from '../../../components/reports/projectProfitLossComputation';
import type {
    DistributionCycleEntry,
    FundAvailabilityDetails,
    FundAvailabilityRow,
    FundAvailabilitySummary,
    FundAvailabilityTotals,
    FundHealthStatus,
    MonthlyCashFlowPoint,
    MonthlyDistributionPoint,
    WithdrawalLedgerEntry,
} from '../types/fundAvailability.types';
import type { ReservePolicy } from '../types/fundAvailability.types';

const PL_START = '2000-01-01';
const EPS = 0.005;

interface DistributableFundsOptions {
    excludeTransactionId?: string;
}

function endOfDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
}

function bankCashAccountIds(state: AppState): string[] {
    return state.accounts
        .filter(
            (a) =>
                (a.type === AccountType.BANK || a.type === AccountType.CASH) && a.name !== 'Internal Clearing'
        )
        .map((a) => a.id);
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

function sumInvoiceCashReceived(state: AppState, projectId: string, endYmd: string): number {
    let cash = 0;
    for (const inv of state.invoices) {
        if (!invoiceInScope(inv, projectId, endYmd)) continue;
        cash += Number(inv.paidAmount) || 0;
    }
    return Math.round(cash * 100) / 100;
}

function sumBillPayables(state: AppState, projectId: string, endYmd: string): number {
    let pay = 0;
    for (const b of state.bills) {
        if (!billInScope(b, projectId, endYmd)) continue;
        const amt = Number(b.amount) || 0;
        const paid = Number(b.paidAmount) || 0;
        pay += Math.max(0, amt - paid);
    }
    return Math.round(pay * 100) / 100;
}

function reserveAmount(availableCash: number, policy: ReservePolicy): number {
    if (policy.mode === 'fixed') return Math.max(0, Math.round(policy.amount * 100) / 100);
    const p = Math.max(0, Math.min(100, policy.percent));
    return Math.round(availableCash * (p / 100) * 100) / 100;
}

export function getDistributableFundsBreakdown(
    state: AppState,
    projectId: string,
    endYmd: string,
    reservePolicy: ReservePolicy,
    options?: DistributableFundsOptions
): {
    availableCash: number;
    reservedFunds: number;
    pendingPayables: number;
    distributableFunds: number;
    reservePolicy: ReservePolicy;
} {
    const availableCash = getAvailableCashRaw(state, projectId, endYmd, options);
    const pendingPayables = getPendingPayables(state, projectId, endYmd);
    const reservedFunds = reserveAmount(availableCash, reservePolicy);
    const distributableFunds = Math.max(0, Math.round((availableCash - reservedFunds - pendingPayables) * 100) / 100);
    return { availableCash, reservedFunds, pendingPayables, distributableFunds, reservePolicy };
}

function aggregateInvestorTotals(state: AppState, projectId: string, endYmd: string) {
    const asOf = endOfDay(new Date(endYmd));
    const m = accumulateInvestorMapForProject(state, asOf, projectId);
    let invested = 0;
    let profit = 0;
    let withdrawn = 0;
    for (const e of Object.values(m)) {
        invested += e.invested;
        profit += e.profit;
        withdrawn += e.withdrawn;
    }
    return {
        investorCapital: Math.round(invested * 100) / 100,
        allocatedProfit: Math.round(profit * 100) / 100,
        totalWithdrawn: Math.round(withdrawn * 100) / 100,
        investorEquity: Math.round((invested + profit - withdrawn) * 100) / 100,
    };
}

function classifyHealth(distributable: number, investorEquity: number, totalWithdrawn: number, capitalPlusAllocated: number): FundHealthStatus {
    if (investorEquity < -EPS) return 'Overdrawn';
    if (distributable <= EPS) return 'Blocked';
    const ratio = investorEquity > EPS ? distributable / investorEquity : 1;
    if (ratio < 0.05 && investorEquity > EPS) return 'Warning';
    if (totalWithdrawn > capitalPlusAllocated + EPS) return 'Overdrawn';
    return 'Healthy';
}

function completionPct(state: AppState, projectId: string): number {
    const units = state.units.filter((u) => u.projectId === projectId);
    const sold = units.filter((u) => u.status === 'sold').length;
    if (units.length === 0) return 0;
    return Math.round((sold / units.length) * 1000) / 10;
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

function isBankCashAccount(
    acc: { id: string; type: AccountType } | undefined,
    clearingId: string | undefined,
    bankAccountId: string
): boolean {
    if (!acc || acc.id !== bankAccountId) return false;
    if (clearingId && acc.id === clearingId) return false;
    return acc.type === AccountType.BANK || acc.type === AccountType.CASH;
}

function getCashDeltaForAccount(
    tx: Transaction,
    bankAccountId: string,
    accountsById: Map<string, Account>,
    clearingId?: string
): number {
    const acc = (id: string | undefined) => (id ? accountsById.get(id) : undefined);
    if (tx.type === TransactionType.INCOME || tx.type === TransactionType.EXPENSE) {
        if (!isBankCashAccount(acc(tx.accountId), clearingId, bankAccountId)) return 0;
        return tx.type === TransactionType.INCOME ? tx.amount : -tx.amount;
    }
    if (tx.type === TransactionType.LOAN) {
        if (!isBankCashAccount(acc(tx.accountId), clearingId, bankAccountId)) return 0;
        const st = tx.subtype as LoanSubtype | undefined;
        if (st === LoanSubtype.RECEIVE || st === LoanSubtype.COLLECT) return tx.amount;
        if (st === LoanSubtype.GIVE || st === LoanSubtype.REPAY) return -tx.amount;
        return 0;
    }
    if (tx.type === TransactionType.TRANSFER) {
        let d = 0;
        if (tx.fromAccountId === bankAccountId && isBankCashAccount(acc(tx.fromAccountId), clearingId, bankAccountId)) {
            d -= tx.amount;
        }
        if (tx.toAccountId === bankAccountId && isBankCashAccount(acc(tx.toAccountId), clearingId, bankAccountId)) {
            d += tx.amount;
        }
        return d;
    }
    return 0;
}

function netBankDeltaForProjectTx(state: AppState, tx: Transaction, projectId: string): number {
    const pid = resolveProjectIdForTransaction(tx, state);
    if (pid !== projectId) return 0;
    const accountsById = new Map(state.accounts.map((a) => [a.id, a]));
    const clearingId = state.accounts.find((a) => a.name === 'Internal Clearing')?.id;
    let sum = 0;
    for (const bid of bankCashAccountIds(state)) {
        sum += getCashDeltaForAccount(tx, bid, accountsById, clearingId);
    }
    return Math.round(sum * 100) / 100;
}

export function getInvestorCapital(state: AppState, projectId: string, endYmd: string): number {
    return aggregateInvestorTotals(state, projectId, endYmd).investorCapital;
}

export function getAllocatedProfit(state: AppState, projectId: string, endYmd: string): number {
    return aggregateInvestorTotals(state, projectId, endYmd).allocatedProfit;
}

export function getRealizedRevenue(state: AppState, projectId: string, endYmd: string): number {
    return sumInvoiceCashReceived(state, projectId, endYmd);
}

export function getProjectExpenses(state: AppState, projectId: string, endYmd: string): number {
    const pl = computeProjectProfitLossTotals(state, projectId, PL_START, endYmd);
    return pl.totalExpense;
}

export function getRealizedProfit(state: AppState, projectId: string, endYmd: string): number {
    const rev = getRealizedRevenue(state, projectId, endYmd);
    const exp = getProjectExpenses(state, projectId, endYmd);
    return Math.round((rev - exp) * 100) / 100;
}

export function getInvestorEquity(state: AppState, projectId: string, endYmd: string): number {
    return aggregateInvestorTotals(state, projectId, endYmd).investorEquity;
}

export function getAvailableCash(state: AppState, projectId: string, endYmd: string): number {
    return getDistributableFundsBreakdown(state, projectId, endYmd, { mode: 'percent', percent: 0 }).availableCash;
}

/** Raw available cash without reserve policy (same as sum of bank balances). */
function getAvailableCashRaw(
    state: AppState,
    projectId: string,
    endYmd: string,
    options?: DistributableFundsOptions
): number {
    let sum = 0;
    for (const bid of bankCashAccountIds(state)) {
        sum += computeProjectScopedBankCashBalance(state, bid, projectId, endYmd, {
            excludeTransactionId: options?.excludeTransactionId,
        });
    }
    return Math.round(sum * 100) / 100;
}

export function getReservedFunds(state: AppState, projectId: string, endYmd: string, policy: ReservePolicy): number {
    const av = getAvailableCashRaw(state, projectId, endYmd);
    return reserveAmount(av, policy);
}

export function getPendingPayables(state: AppState, projectId: string, endYmd: string): number {
    return sumBillPayables(state, projectId, endYmd);
}

export function getDistributableFunds(
    state: AppState,
    projectId: string,
    endYmd: string,
    reservePolicy: ReservePolicy
): number {
    return getDistributableFundsBreakdown(state, projectId, endYmd, reservePolicy).distributableFunds;
}

export function validateWithdrawalAmount(
    state: AppState,
    projectId: string,
    amount: number,
    endYmd: string,
    reservePolicy: ReservePolicy
): { ok: boolean; distributableFunds: number } {
    const d = getDistributableFunds(state, projectId, endYmd, reservePolicy);
    return { ok: amount <= d + EPS, distributableFunds: d };
}

function buildRow(
    state: AppState,
    project: Project,
    endYmd: string,
    reservePolicy: ReservePolicy
): FundAvailabilityRow {
    const inv = aggregateInvestorTotals(state, project.id, endYmd);
    const { availableCash, reservedFunds, pendingPayables, distributableFunds } = getDistributableFundsBreakdown(
        state,
        project.id,
        endYmd,
        reservePolicy
    );
    const cashRev = sumInvoiceCashReceived(state, project.id, endYmd);
    const expense = getProjectExpenses(state, project.id, endYmd);
    const realizedProfitCash = Math.round((cashRev - expense) * 100) / 100;
    const capitalPlusAllocated = inv.investorCapital + inv.allocatedProfit;
    const liquidityRatio = inv.investorEquity > EPS ? distributableFunds / inv.investorEquity : null;
    const fundHealth = classifyHealth(distributableFunds, inv.investorEquity, inv.totalWithdrawn, capitalPlusAllocated);

    return {
        projectId: project.id,
        projectName: project.name,
        projectStatus: project.status || 'Active',
        city: project.location || null,
        completionPct: completionPct(state, project.id),
        investorCapital: inv.investorCapital,
        allocatedProfit: inv.allocatedProfit,
        investorEquity: inv.investorEquity,
        availableCash,
        reservedFunds,
        pendingPayables,
        distributableFunds,
        totalWithdrawn: inv.totalWithdrawn,
        remainingEquity: inv.investorEquity,
        liquidityRatio,
        fundHealth,
        lastDistributionDate: lastDistributionDate(state, project.id, endYmd),
        lastUpdated: lastUpdatedForProject(state, project.id, endYmd),
        realizedRevenueCash: cashRev,
        totalExpense: expense,
        realizedProfitCash,
    };
}

function lastDistributionDate(state: AppState, projectId: string, endYmd: string): string | null {
    const end = endOfDay(new Date(endYmd));
    let best: string | null = null;
    let bestT = 0;
    for (const tx of state.transactions) {
        if (tx.projectId !== projectId) continue;
        if (tx.type !== TransactionType.TRANSFER) continue;
        if (tx.subtype !== EquityLedgerSubtype.PROFIT_SHARE) continue;
        const t = new Date(tx.date).getTime();
        if (t > end.getTime()) continue;
        if (t >= bestT) {
            bestT = t;
            best = tx.date.slice(0, 10);
        }
    }
    return best;
}

export function getFundAvailabilitySummary(state: AppState, endYmd: string, reservePolicy: ReservePolicy): FundAvailabilitySummary {
    const rows = state.projects.map((p) => buildRow(state, p, endYmd, reservePolicy));
    const totals: FundAvailabilityTotals = rows.reduce(
        (acc, r) => ({
            investorEquity: acc.investorEquity + r.investorEquity,
            availableCash: acc.availableCash + r.availableCash,
            distributableFunds: acc.distributableFunds + r.distributableFunds,
            totalWithdrawn: acc.totalWithdrawn + r.totalWithdrawn,
            reservedFunds: acc.reservedFunds + r.reservedFunds,
            pendingPayables: acc.pendingPayables + r.pendingPayables,
            investorCapital: acc.investorCapital + r.investorCapital,
        }),
        {
            investorEquity: 0,
            availableCash: 0,
            distributableFunds: 0,
            totalWithdrawn: 0,
            reservedFunds: 0,
            pendingPayables: 0,
            investorCapital: 0,
        }
    );
    let healthyProjects = 0;
    let warningProjects = 0;
    let blockedProjects = 0;
    let overdrawnProjects = 0;
    for (const r of rows) {
        if (r.fundHealth === 'Healthy') healthyProjects += 1;
        else if (r.fundHealth === 'Warning') warningProjects += 1;
        else if (r.fundHealth === 'Blocked') blockedProjects += 1;
        else overdrawnProjects += 1;
    }
    return {
        asOfDate: endYmd,
        rows,
        totals,
        healthyProjects,
        warningProjects,
        blockedProjects,
        overdrawnProjects,
    };
}

function investorNamesForProject(state: AppState, projectId: string, endYmd: string): string[] {
    const asOf = endOfDay(new Date(endYmd));
    const m = accumulateInvestorMapForProject(state, asOf, projectId);
    return Object.entries(m)
        .filter(([, v]) => v.invested > EPS || v.profit > EPS || v.withdrawn > EPS)
        .map(([id, v]) => v.name || state.accounts.find((a) => a.id === id)?.name || id)
        .sort((a, b) => a.localeCompare(b));
}

function distributionHistory(state: AppState, projectId: string, endYmd: string): DistributionCycleEntry[] {
    const end = endOfDay(new Date(endYmd));
    const out: DistributionCycleEntry[] = [];
    for (const tx of state.transactions) {
        if (tx.projectId !== projectId) continue;
        if (tx.type !== TransactionType.TRANSFER) continue;
        if (tx.subtype !== EquityLedgerSubtype.PROFIT_SHARE) continue;
        const t = new Date(tx.date).getTime();
        if (t > end.getTime()) continue;
        out.push({
            id: tx.id,
            date: tx.date.slice(0, 10),
            label: tx.description || 'Profit allocation',
            amount: tx.amount,
            batchId: tx.batchId ?? null,
        });
    }
    out.sort((a, b) => a.date.localeCompare(b.date));
    return out;
}

function withdrawalHistory(state: AppState, projectId: string, endYmd: string): WithdrawalLedgerEntry[] {
    const end = endOfDay(new Date(endYmd));
    const equityIds = new Set(state.accounts.filter((a) => a.type === AccountType.EQUITY).map((a) => a.id));
    const out: WithdrawalLedgerEntry[] = [];
    for (const tx of state.transactions) {
        if (tx.projectId !== projectId) continue;
        if (tx.type !== TransactionType.TRANSFER) continue;
        if (tx.subtype !== EquityLedgerSubtype.WITHDRAWAL && tx.subtype !== EquityLedgerSubtype.CAPITAL_PAYOUT) continue;
        const t = new Date(tx.date).getTime();
        if (t > end.getTime()) continue;
        const investorId = tx.toAccountId && equityIds.has(tx.toAccountId) ? tx.toAccountId : tx.toAccountId || '';
        const bankId = tx.fromAccountId;
        out.push({
            id: tx.id,
            date: tx.date.slice(0, 10),
            amount: tx.amount,
            description: tx.description || 'Withdrawal',
            investorAccountId: investorId,
            investorName: state.accounts.find((a) => a.id === investorId)?.name || investorId,
            bankAccountId: bankId,
        });
    }
    out.sort((a, b) => b.date.localeCompare(a.date));
    return out;
}

export function getFundAvailabilityDetails(
    state: AppState,
    projectId: string,
    endYmd: string,
    reservePolicy: ReservePolicy
): FundAvailabilityDetails | null {
    const p = state.projects.find((x) => x.id === projectId);
    if (!p) return null;
    const row = buildRow(state, p, endYmd, reservePolicy);
    const inv = aggregateInvestorTotals(state, projectId, endYmd);
    const b = getDistributableFundsBreakdown(state, projectId, endYmd, reservePolicy);
    const cashRev = sumInvoiceCashReceived(state, projectId, endYmd);
    const expense = getProjectExpenses(state, projectId, endYmd);
    let cashIn = 0;
    let cashOut = 0;
    for (const tx of state.transactions) {
        const d = netBankDeltaForProjectTx(state, tx, projectId);
        if (d > 0) cashIn += d;
        else if (d < 0) cashOut += -d;
    }
    cashIn = Math.round(cashIn * 100) / 100;
    cashOut = Math.round(cashOut * 100) / 100;
    const distPct = row.investorEquity > EPS ? row.distributableFunds / row.investorEquity : null;

    return {
        projectId,
        projectName: p.name,
        projectStatus: p.status || 'Active',
        completionPct: row.completionPct,
        investorNames: investorNamesForProject(state, projectId, endYmd),
        equity: {
            capital: inv.investorCapital,
            allocatedProfit: inv.allocatedProfit,
            withdrawals: inv.totalWithdrawn,
            investorEquity: inv.investorEquity,
        },
        cashFlow: {
            cashInflow: cashIn,
            cashOutflow: cashOut,
            availableCash: b.availableCash,
            reservedFunds: b.reservedFunds,
            pendingPayables: b.pendingPayables,
            distributableFunds: b.distributableFunds,
        },
        realizedRevenueCash: cashRev,
        totalExpense: expense,
        realizedProfitCash: Math.round((cashRev - expense) * 100) / 100,
        distributionHistory: distributionHistory(state, projectId, endYmd),
        withdrawalHistory: withdrawalHistory(state, projectId, endYmd),
        analytics: {
            liquidityRatio: row.liquidityRatio,
            distributionPctOfEquity: distPct,
            safeWithdrawalMax: b.distributableFunds,
            fundHealth: row.fundHealth,
        },
    };
}

export function projectMonthlyCashFlow(state: AppState, projectId: string, endYmd: string, months = 12): MonthlyCashFlowPoint[] {
    const end = new Date(endYmd);
    const out: MonthlyCashFlowPoint[] = [];
    for (let i = 0; i < months; i++) {
        const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
        const start = new Date(d.getFullYear(), d.getMonth(), 1);
        const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        let inflow = 0;
        let outflow = 0;
        for (const tx of state.transactions) {
            const td = new Date(tx.date);
            if (td < start || td > last) continue;
            const delta = netBankDeltaForProjectTx(state, tx, projectId);
            if (delta > 0) inflow += delta;
            else if (delta < 0) outflow += -delta;
        }
        const monthKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
        const label = start.toLocaleString(undefined, { month: 'short', year: 'numeric' });
        out.push({
            monthKey,
            label,
            inflow: Math.round(inflow * 100) / 100,
            outflow: Math.round(outflow * 100) / 100,
            net: Math.round((inflow - outflow) * 100) / 100,
        });
    }
    return out.reverse();
}

export function portfolioMonthlyCashFlow(state: AppState, endYmd: string, months = 12): MonthlyCashFlowPoint[] {
    const end = new Date(endYmd);
    const pids = new Set(state.projects.map((p) => p.id));
    const out: MonthlyCashFlowPoint[] = [];
    for (let i = 0; i < months; i++) {
        const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
        const start = new Date(d.getFullYear(), d.getMonth(), 1);
        const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        let inflow = 0;
        let outflow = 0;
        for (const tx of state.transactions) {
            const pid = resolveProjectIdForTransaction(tx, state);
            if (!pid || !pids.has(pid)) continue;
            const td = new Date(tx.date);
            if (td < start || td > last) continue;
            const delta = netBankDeltaForProjectTx(state, tx, pid);
            if (delta > 0) inflow += delta;
            else if (delta < 0) outflow += -delta;
        }
        const monthKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
        const label = start.toLocaleString(undefined, { month: 'short', year: 'numeric' });
        out.push({
            monthKey,
            label,
            inflow: Math.round(inflow * 100) / 100,
            outflow: Math.round(outflow * 100) / 100,
            net: Math.round((inflow - outflow) * 100) / 100,
        });
    }
    return out.reverse();
}

export function portfolioWithdrawalsByMonth(
    state: AppState,
    endYmd: string,
    months = 12
): { monthKey: string; label: string; amount: number }[] {
    const end = endOfDay(new Date(endYmd));
    const tally = new Map<string, number>();
    for (const tx of state.transactions) {
        if (!tx.projectId) continue;
        if (tx.type !== TransactionType.TRANSFER) continue;
        if (tx.subtype !== EquityLedgerSubtype.WITHDRAWAL && tx.subtype !== EquityLedgerSubtype.CAPITAL_PAYOUT) continue;
        const t = new Date(tx.date);
        if (t > end.getTime()) continue;
        const k = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
        tally.set(k, (tally.get(k) || 0) + tx.amount);
    }
    const anchor = new Date(endYmd);
    const out: { monthKey: string; label: string; amount: number }[] = [];
    for (let i = 0; i < months; i++) {
        const d = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = d.toLocaleString(undefined, { month: 'short', year: 'numeric' });
        out.push({ monthKey, label, amount: Math.round((tally.get(monthKey) || 0) * 100) / 100 });
    }
    return out.reverse();
}

export function projectMonthlyDistributions(state: AppState, projectId: string, endYmd: string, months = 12): MonthlyDistributionPoint[] {
    const hist = distributionHistory(state, projectId, endYmd);
    const map = new Map<string, number>();
    for (const h of hist) {
        const k = h.date.slice(0, 7);
        map.set(k, (map.get(k) || 0) + h.amount);
    }
    const end = new Date(endYmd);
    const out: MonthlyDistributionPoint[] = [];
    for (let i = 0; i < months; i++) {
        const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = d.toLocaleString(undefined, { month: 'short', year: 'numeric' });
        out.push({ monthKey, label, amount: Math.round((map.get(monthKey) || 0) * 100) / 100 });
    }
    return out.reverse();
}

/** Sum of per-project distributable funds as-of date — avoids full P/L per project (used for trend chart only). */
export function getPortfolioDistributableFundsTotal(state: AppState, asOfYmd: string, reservePolicy: ReservePolicy): number {
    let sum = 0;
    for (const p of state.projects) {
        sum += getDistributableFundsBreakdown(state, p.id, asOfYmd, reservePolicy).distributableFunds;
    }
    return Math.round(sum * 100) / 100;
}

export function portfolioMonthlyDistributable(
    state: AppState,
    endYmd: string,
    reservePolicy: ReservePolicy,
    months = 12
): { monthKey: string; label: string; distributable: number }[] {
    const end = new Date(endYmd);
    const out: { monthKey: string; label: string; distributable: number }[] = [];
    for (let i = 0; i < months; i++) {
        const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
        const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        const sliceYmd = last.toISOString().slice(0, 10);
        const distributable = getPortfolioDistributableFundsTotal(state, sliceYmd, reservePolicy);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = d.toLocaleString(undefined, { month: 'short', year: 'numeric' });
        out.push({
            monthKey,
            label,
            distributable,
        });
    }
    return out.reverse();
}

export function uniqueDistributionCycleKeys(state: AppState, endYmd: string): string[] {
    const end = endOfDay(new Date(endYmd));
    const s = new Set<string>();
    for (const tx of state.transactions) {
        if (tx.type !== TransactionType.TRANSFER) continue;
        if (tx.subtype !== EquityLedgerSubtype.PROFIT_SHARE) continue;
        if (new Date(tx.date) > end) continue;
        if (tx.batchId) s.add(tx.batchId);
        else s.add(`${tx.date.slice(0, 10)}:${(tx.description || '').slice(0, 24)}`);
    }
    return [...s].sort((a, b) => a.localeCompare(b));
}

export function projectHasInvestor(state: AppState, projectId: string, investorEquityAccountId: string, endYmd: string): boolean {
    const asOf = endOfDay(new Date(endYmd));
    const m = accumulateInvestorMapForProject(state, asOf, projectId);
    const e = m[investorEquityAccountId];
    if (!e) return false;
    return e.invested > EPS || e.withdrawn > EPS || e.profit > EPS;
}

export function filterFundAvailabilityRows(
    rows: FundAvailabilityRow[],
    state: AppState,
    endYmd: string,
    f: {
        search: string;
        projectId: string;
        investorId: string;
        projectStatus: string;
        liquidityHealth: 'all' | FundHealthStatus;
        city: string;
        tag: string;
        distributionCycleKey: string;
        withdrawalStatus: 'all' | 'has_withdrawals' | 'none';
    }
): FundAvailabilityRow[] {
    const q = f.search.trim().toLowerCase();
    return rows.filter((r) => {
        if (q && !r.projectName.toLowerCase().includes(q)) return false;
        if (f.projectId !== 'all' && r.projectId !== f.projectId) return false;
        if (f.projectStatus !== 'all' && r.projectStatus !== f.projectStatus) return false;
        if (f.liquidityHealth !== 'all' && r.fundHealth !== f.liquidityHealth) return false;
        if (f.city !== 'all' && (r.city || '').trim().toLowerCase() !== f.city.trim().toLowerCase()) return false;
        if (f.tag.trim()) {
            const p = state.projects.find((x) => x.id === r.projectId);
            const blob = `${p?.description ?? ''} ${p?.name ?? ''}`.toLowerCase();
            if (!blob.includes(f.tag.trim().toLowerCase())) return false;
        }
        if (f.investorId !== 'all' && !projectHasInvestor(state, r.projectId, f.investorId, endYmd)) return false;
        if (f.withdrawalStatus === 'has_withdrawals' && r.totalWithdrawn <= EPS) return false;
        if (f.withdrawalStatus === 'none' && r.totalWithdrawn > EPS) return false;
        if (f.distributionCycleKey !== 'all') {
            const has = state.transactions.some(
                (tx) =>
                    tx.projectId === r.projectId &&
                    tx.batchId === f.distributionCycleKey &&
                    tx.subtype === EquityLedgerSubtype.PROFIT_SHARE
            );
            if (!has) return false;
        }
        return true;
    });
}

export function uniqueCities(rows: FundAvailabilityRow[]): string[] {
    const s = new Set<string>();
    for (const r of rows) {
        if (r.city?.trim()) s.add(r.city.trim());
    }
    return [...s].sort((a, b) => a.localeCompare(b));
}
