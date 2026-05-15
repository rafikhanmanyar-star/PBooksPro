import type { AppState } from '../../types';
import { InvoiceStatus, InvoiceType } from '../../types';
import { accumulateInvestorMapForProject } from '../reports/investorEquityAccumulation';

export interface InvMgmtProfitReportRow {
    projectId: string;
    projectName: string;
    initialInvestment: number;
    totalCost: number;
    totalRevenue: number;
    profit: number;
    /** Return on initial capital: (profit ÷ initial investment) × 100 when initial investment &gt; 0. */
    profitPercentage: number | null;
}

function rowHasActivity(r: InvMgmtProfitReportRow): boolean {
    return (
        r.initialInvestment > 0.01 ||
        r.totalCost > 0.01 ||
        r.totalRevenue > 0.01 ||
        Math.abs(r.profit) > 0.01
    );
}

/**
 * Total bills for the project: full bill amounts (paid + payable / AP), excluding drafts.
 * Scoped by bill issue date through `endDateStr` (inclusive).
 */
export function sumProjectBillAmounts(state: AppState, projectId: string, endDateStr: string): number {
    const end = new Date(endDateStr);
    end.setHours(23, 59, 59, 999);
    let sum = 0;
    for (const b of state.bills) {
        if (b.projectId !== projectId) continue;
        if (b.status === InvoiceStatus.DRAFT) continue;
        if (new Date(b.issueDate) > end) continue;
        sum += Number(b.amount) || 0;
    }
    return sum;
}

/**
 * Project selling: full installment invoice amounts (paid + receivable), excluding drafts and deleted.
 * Scoped by invoice issue date through `endDateStr` (inclusive).
 */
function sumProjectInstallmentInvoiceAmounts(state: AppState, projectId: string, endDateStr: string): number {
    const end = new Date(endDateStr);
    end.setHours(23, 59, 59, 999);
    let sum = 0;
    for (const inv of state.invoices) {
        if (inv.deletedAt) continue;
        if (inv.projectId !== projectId) continue;
        if (inv.invoiceType !== InvoiceType.INSTALLMENT) continue;
        if (inv.status === InvoiceStatus.DRAFT) continue;
        if (new Date(inv.issueDate) > end) continue;
        sum += Number(inv.amount) || 0;
    }
    return sum;
}

/**
 * @param endDateStr — inclusive; equity uses end-of-day as-of.
 */
export function buildInvMgmtProfitReportRows(state: AppState, endDateStr: string): InvMgmtProfitReportRow[] {
    const asOf = new Date(endDateStr);
    asOf.setHours(23, 59, 59, 999);

    const rows: InvMgmtProfitReportRow[] = state.projects.map((project) => {
        const investorMap = accumulateInvestorMapForProject(state, asOf, project.id);
        const initialInvestment = Object.values(investorMap).reduce((s, e) => s + e.invested, 0);

        const totalCost = sumProjectBillAmounts(state, project.id, endDateStr);
        const totalRevenue = sumProjectInstallmentInvoiceAmounts(state, project.id, endDateStr);
        const profit = totalRevenue - totalCost;

        const profitPercentage =
            initialInvestment > 0.01 ? (profit / initialInvestment) * 100 : null;

        return {
            projectId: project.id,
            projectName: project.name,
            initialInvestment,
            totalCost,
            totalRevenue,
            profit,
            profitPercentage,
        };
    });

    const visible = rows.filter(rowHasActivity);
    visible.sort((a, b) => (a.projectName || '').localeCompare(b.projectName || '', undefined, { sensitivity: 'base' }));
    return visible;
}
