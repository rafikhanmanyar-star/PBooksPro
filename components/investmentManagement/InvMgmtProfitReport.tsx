import { useProjectReportAppState } from '../../hooks/useSelectiveState';
import React, { useMemo, useState } from 'react';
import { CURRENCY } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from '../reports/ReportHeader';
import ReportFooter from '../reports/ReportFooter';
import ReportToolbar, { ReportDateRange } from '../reports/ReportToolbar';
import { formatDate, toLocalDateString } from '../../utils/dateUtils';
import { usePrintContext } from '../../context/PrintContext';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';
import { buildInvMgmtProfitReportRows } from './invMgmtProfitReportModel';

function fmtMoney(n: number): string {
    return `${CURRENCY} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const InvMgmtProfitReport: React.FC = () => {
    const state = useProjectReportAppState();
    const { print: triggerPrint } = usePrintContext();
    const [dateRange, setDateRange] = useState<ReportDateRange>('all');
    const [endDate, setEndDate] = useState(toLocalDateString(new Date()));

    const handleRangeChange = (type: ReportDateRange) => {
        setDateRange(type);
        const now = new Date();
        if (type === 'all') {
            setEndDate('2100-12-31');
        } else if (type === 'thisMonth') {
            const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            setEndDate(toLocalDateString(lastDay));
        } else if (type === 'lastMonth') {
            const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
            setEndDate(toLocalDateString(lastDay));
        }
    };

    const rows = useMemo(() => buildInvMgmtProfitReportRows(state, endDate), [state, endDate]);

    const totals = useMemo(() => {
        const t = rows.reduce(
            (acc, r) => ({
                initialInvestment: acc.initialInvestment + r.initialInvestment,
                totalCost: acc.totalCost + r.totalCost,
                totalRevenue: acc.totalRevenue + r.totalRevenue,
                profit: acc.profit + r.profit,
            }),
            { initialInvestment: 0, totalCost: 0, totalRevenue: 0, profit: 0 }
        );
        const profitPct = t.initialInvestment > 0.01 ? (t.profit / t.initialInvestment) * 100 : null;
        return { ...t, profitPercentage: profitPct };
    }, [rows]);

    const handleExport = () => {
        const data = rows.map((r) => ({
            'Project name': r.projectName,
            'Initial investment': r.initialInvestment,
            'Total cost (bills: paid + payable)': r.totalCost,
            'Total revenue (installment invoices: paid + receivable)': r.totalRevenue,
            Profit: r.profit,
            'Profit % (profit ÷ initial × 100)': r.profitPercentage ?? '',
        }));
        exportJsonToExcel(data, 'inv-mgmt-profit.xlsx', 'Profit');
    };

    return (
        <div className="flex flex-col h-full space-y-4 min-h-0 bg-app-bg">
            <style>{STANDARD_PRINT_STYLES}</style>
            <div className="flex flex-col gap-3 shrink-0">
                <div>
                    <h3 className="text-xl font-bold text-app-text">Profit</h3>
                    <p className="text-sm text-app-muted mt-1 max-w-3xl">
                        Initial investment matches Inv. Mgmt / Investor Distribution (principal through the as-of date).
                        Total cost is the sum of vendor bill amounts for the project (expense recognized plus payables on
                        those bills). Total revenue is the sum of installment (unit selling) invoice amounts (cash
                        received plus receivable). Profit is revenue minus cost. Profit % is profit divided by initial
                        investment × 100 (return on capital) when initial investment is positive; drafts are excluded;
                        invoice rows respect soft-delete.
                    </p>
                </div>
                <ReportToolbar
                    startDate={endDate}
                    endDate={endDate}
                    onDateChange={(_, end) => {
                        setEndDate(end);
                        setDateRange('custom');
                    }}
                    onExport={handleExport}
                    onPrint={() => triggerPrint('REPORT', { elementId: 'inv-mgmt-profit-print' })}
                    hideGroup
                    hideSearch
                    showDateFilterPills
                    activeDateRange={dateRange}
                    onRangeChange={handleRangeChange}
                    singleDateMode
                    showDatePickersWithPills
                />
            </div>

            <div className="flex-1 min-h-0 overflow-auto border border-app-border rounded-lg bg-app-card">
                <div id="inv-mgmt-profit-print" className="min-w-0 p-4">
                    <div className="report-print-only">
                        <ReportHeader />
                        <p className="text-center text-sm text-app-muted mt-2">As of {formatDate(endDate)}</p>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead className="bg-app-table-header sticky top-0 z-10">
                                <tr className="text-left text-app-muted">
                                    <th className="px-3 py-2 font-semibold whitespace-nowrap">Project name</th>
                                    <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">Initial investment</th>
                                    <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">Total cost</th>
                                    <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">Total revenue</th>
                                    <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">Profit</th>
                                    <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">Profit %</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-app-border">
                                {rows.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-3 py-10 text-center text-app-muted">
                                            No projects with bills, installment invoices, or equity principal in scope.
                                        </td>
                                    </tr>
                                ) : (
                                    rows.map((r) => (
                                        <tr key={r.projectId} className="hover:bg-app-table-hover">
                                            <td className="px-3 py-2 font-medium text-app-text whitespace-nowrap">
                                                {r.projectName}
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums text-app-text">{fmtMoney(r.initialInvestment)}</td>
                                            <td className="px-3 py-2 text-right tabular-nums text-app-text">{fmtMoney(r.totalCost)}</td>
                                            <td className="px-3 py-2 text-right tabular-nums text-ds-success">
                                                {fmtMoney(r.totalRevenue)}
                                            </td>
                                            <td
                                                className={`px-3 py-2 text-right tabular-nums font-medium ${
                                                    r.profit >= 0 ? 'text-ds-success' : 'text-ds-danger'
                                                }`}
                                            >
                                                {fmtMoney(r.profit)}
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums text-primary">
                                                {r.profitPercentage != null ? `${r.profitPercentage.toFixed(1)}%` : '—'}
                                            </td>
                                        </tr>
                                    ))
                                )}
                                {rows.length > 0 && (
                                    <tr className="bg-app-table-header font-semibold border-t-2 border-app-border">
                                        <td className="px-3 py-2 text-app-text">Totals</td>
                                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(totals.initialInvestment)}</td>
                                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(totals.totalCost)}</td>
                                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(totals.totalRevenue)}</td>
                                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(totals.profit)}</td>
                                        <td className="px-3 py-2 text-right tabular-nums">
                                            {totals.profitPercentage != null ? `${totals.profitPercentage.toFixed(1)}%` : '—'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="report-print-only mt-6">
                        <ReportFooter />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InvMgmtProfitReport;
