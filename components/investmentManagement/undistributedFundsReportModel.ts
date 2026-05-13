import type { AppState } from '../../types';
import { InvoiceType, TransactionType } from '../../types';
import { computeProjectBillAccruedExpenseTotal } from '../reports/projectProfitLossComputation';
import { isTransactionFromVoidedOrCancelledInvoice } from '../reports/reportUtils';
import { accumulateInvestorMapForProject } from '../reports/investorEquityAccumulation';

export interface UndistributedFundsRow {
    projectId: string;
    projectName: string;
    totalExpense: number;
    totalRevenue: number;
    totalLiquidity: number;
    initialInvestment: number;
    totalProfitDistributed: number;
    currentEquity: number;
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
        r.totalProfitDistributed > 0.01 ||
        Math.abs(r.undistributedFund) > 0.01
    );
}

/**
 * @param endDateStr — inclusive calendar end date (YYYY-MM-DD); equity map uses end-of-day.
 */
export function buildUndistributedFundsRows(state: AppState, endDateStr: string): UndistributedFundsRow[] {
    const asOf = new Date(endDateStr);
    asOf.setHours(23, 59, 59, 999);
    const billStart = '1970-01-01';

    const rows: UndistributedFundsRow[] = state.projects.map((project) => {
        const totalExpense = computeProjectBillAccruedExpenseTotal(state, project.id, billStart, endDateStr);
        const totalRevenue = computeInstallmentIncomeReceivedUpTo(state, project.id, asOf);
        const totalLiquidity = totalRevenue - totalExpense;

        const investorMap = accumulateInvestorMapForProject(state, asOf, project.id);
        const initialInvestment = Object.values(investorMap).reduce((s, e) => s + e.invested, 0);
        const totalProfitDistributed = Object.values(investorMap).reduce((s, e) => s + e.profit, 0);

        const currentEquity = initialInvestment + totalProfitDistributed;
        const undistributedFund = totalRevenue + initialInvestment - currentEquity;

        return {
            projectId: project.id,
            projectName: project.name,
            totalExpense,
            totalRevenue,
            totalLiquidity,
            initialInvestment,
            totalProfitDistributed,
            currentEquity,
            undistributedFund,
        };
    });

    const visible = rows.filter(rowHasActivity);
    visible.sort((a, b) => (a.projectName || '').localeCompare(b.projectName || '', undefined, { sensitivity: 'base' }));
    return visible;
}
