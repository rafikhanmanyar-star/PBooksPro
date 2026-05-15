import type { AppState } from '../../types';
import { InvoiceType, TransactionType } from '../../types';
import { isTransactionFromVoidedOrCancelledInvoice } from '../reports/reportUtils';
import { accumulateInvestorMapForProject } from '../reports/investorEquityAccumulation';
import { sumProjectBillAmounts } from './invMgmtProfitReportModel';

export interface UndistributedFundsRow {
    projectId: string;
    projectName: string;
    initialInvestment: number;
    /** Construction: sum of vendor bill amounts (paid + payable), same scope as Profit report bills. */
    totalExpense: number;
    /** Realized selling: installment-linked income received through as-of. */
    totalRevenue: number;
    currentProfit: number;
    totalEquity: number;
    /** Same as Investor Distribution profit realized (map `profit`). */
    profitDistributed: number;
    /** Same as Investor Distribution Withdrawals (map `withdrawn`). */
    totalWithdrawal: number;
    /** Total equity − total withdrawal (formal column 10). */
    undistributedFund: number;
}

/**
 * Realized unit-selling cash: sum of INCOME transactions linked to installment invoices for this project,
 * through the as-of date (matches typical payment recording).
 */
function computeInstallmentIncomeReceivedUpTo(state: AppState, projectId: string, asOf: Date): number {
    const invById = new Map(state.invoices.map((i) => [i.id, i]));
    let sum = 0;
    for (const tx of state.transactions) {
        if (tx.type !== TransactionType.INCOME || !tx.invoiceId) continue;
        const inv = invById.get(tx.invoiceId);
        if (!inv || inv.invoiceType !== InvoiceType.INSTALLMENT) continue;
        const pid = inv.projectId || tx.projectId;
        if (pid !== projectId) continue;
        if (new Date(tx.date) > asOf) continue;
        if (isTransactionFromVoidedOrCancelledInvoice(tx, state)) continue;
        sum += Number(tx.amount) || 0;
    }
    return sum;
}

function rowHasActivity(r: UndistributedFundsRow): boolean {
    return (
        r.totalExpense > 0.01 ||
        r.totalRevenue > 0.01 ||
        r.initialInvestment > 0.01 ||
        r.totalWithdrawal > 0.01 ||
        r.profitDistributed > 0.01 ||
        Math.abs(r.currentProfit) > 0.01 ||
        Math.abs(r.totalEquity) > 0.01 ||
        Math.abs(r.undistributedFund) > 0.01
    );
}

/**
 * @param endDateStr — inclusive calendar end date (YYYY-MM-DD); equity and revenue use end-of-day as-of; bills by issue date.
 */
export function buildUndistributedFundsRows(state: AppState, endDateStr: string): UndistributedFundsRow[] {
    const asOf = new Date(endDateStr);
    asOf.setHours(23, 59, 59, 999);

    const rows: UndistributedFundsRow[] = state.projects.map((project) => {
        const investorMap = accumulateInvestorMapForProject(state, asOf, project.id);
        const initialInvestment = Object.values(investorMap).reduce((s, e) => s + e.invested, 0);
        const profitDistributed = Object.values(investorMap).reduce((s, e) => s + e.profit, 0);
        const totalWithdrawal = Object.values(investorMap).reduce((s, e) => s + e.withdrawn, 0);

        const totalExpense = sumProjectBillAmounts(state, project.id, endDateStr);
        const totalRevenue = computeInstallmentIncomeReceivedUpTo(state, project.id, asOf);
        const currentProfit = totalRevenue - totalExpense;
        const totalEquity = initialInvestment + currentProfit;

        const undistributedFund = totalEquity - totalWithdrawal;

        return {
            projectId: project.id,
            projectName: project.name,
            initialInvestment,
            totalExpense,
            totalRevenue,
            currentProfit,
            totalEquity,
            profitDistributed,
            totalWithdrawal,
            undistributedFund,
        };
    });

    const visible = rows.filter(rowHasActivity);
    visible.sort((a, b) => (a.projectName || '').localeCompare(b.projectName || '', undefined, { sensitivity: 'base' }));
    return visible;
}
