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
import { buildUndistributedFundsRows } from './undistributedFundsReportModel';

/** Whole numbers for display (no decimal places). */
function fmtWhole(n: number): string {
    return `${CURRENCY} ${Math.round(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

const UndistributedFundsReport: React.FC = () => {
    const state = useProjectReportAppState();
    const { projects, transactions, bills } = state;
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

    const rows = useMemo(() => buildUndistributedFundsRows(state, endDate), [state, endDate]);

    const totals = useMemo(() => {
        return rows.reduce(
            (acc, r) => ({
                initialInvestment: acc.initialInvestment + r.initialInvestment,
                totalExpense: acc.totalExpense + r.totalExpense,
                totalRevenue: acc.totalRevenue + r.totalRevenue,
                currentProfit: acc.currentProfit + r.currentProfit,
                totalEquity: acc.totalEquity + r.totalEquity,
                profitDistributed: acc.profitDistributed + r.profitDistributed,
                totalWithdrawal: acc.totalWithdrawal + r.totalWithdrawal,
                undistributedFund: acc.undistributedFund + r.undistributedFund,
            }),
            {
                initialInvestment: 0,
                totalExpense: 0,
                totalRevenue: 0,
                currentProfit: 0,
                totalEquity: 0,
                profitDistributed: 0,
                totalWithdrawal: 0,
                undistributedFund: 0,
            }
        );
    }, [rows]);

    const handleExport = () => {
        const data = rows.map((r, i) => ({
            'S. No': i + 1,
            'Project name': r.projectName,
            'Initial investment': Math.round(r.initialInvestment),
            'Total expense': Math.round(r.totalExpense),
            'Total revenue': Math.round(r.totalRevenue),
            'Current profit': Math.round(r.currentProfit),
            'Total equity': Math.round(r.totalEquity),
            'Profit distributed': Math.round(r.profitDistributed),
            'Total withdrawal': Math.round(r.totalWithdrawal),
            'Undistributed fund (current equity)': Math.round(r.undistributedFund),
        }));
        exportJsonToExcel(data, 'undistributed-funds.xlsx', 'Undistributed funds');
    };

    return (
        <div className="flex flex-col h-full space-y-4 min-h-0">
            <style>{STANDARD_PRINT_STYLES}</style>
            <div className="flex flex-col gap-3 shrink-0">
                <div>
                    <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">Undistributed funds</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-3xl">
                        Columns follow construction bills (paid + payable), realized installment receipts, and Inv.
                        Mgmt equity: current profit is revenue minus expense; total equity is initial investment plus
                        current profit; profit distributed and total withdrawal match Investor Distribution (profit
                        realized and withdrawals). Column 10 — Undistributed fund (current equity): total equity − total
                        withdrawal. Amounts are shown as whole numbers. As-of applies to equity and receipt
                        transactions; bill totals use issue dates through the same date.
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
                    onPrint={() => triggerPrint('REPORT', { elementId: 'undistributed-funds-print' })}
                    hideGroup
                    hideSearch
                    showDateFilterPills
                    activeDateRange={dateRange}
                    onRangeChange={handleRangeChange}
                    singleDateMode
                    showDatePickersWithPills
                />
            </div>

            <div className="flex-1 min-h-0 overflow-auto border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900/40">
                <div id="undistributed-funds-print" className="printable-area min-w-0">
                    <div className="report-print-only">
                        <ReportHeader />
                        <p className="text-center text-sm text-slate-600 mt-2">As of {formatDate(endDate)}</p>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 z-10">
                                <tr className="text-left text-slate-600 dark:text-slate-300">
                                    <th className="px-2 py-2 font-semibold text-right whitespace-nowrap w-12">S. No</th>
                                    <th className="px-3 py-2 font-semibold whitespace-nowrap">Project name</th>
                                    <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">Initial investment</th>
                                    <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">Total expense</th>
                                    <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">Total revenue</th>
                                    <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">Current profit</th>
                                    <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">Total equity</th>
                                    <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">Profit distributed</th>
                                    <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">Total withdrawal</th>
                                    <th className="px-3 py-2 font-semibold text-right whitespace-nowrap min-w-[11rem]">
                                        <span className="block">Undistributed fund (current equity)</span>
                                        <span className="block text-[10px] font-normal text-slate-500 dark:text-slate-400 tracking-normal">
                                            Total equity − Total withdrawal
                                        </span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {rows.length === 0 ? (
                                    <tr>
                                        <td colSpan={10} className="px-3 py-10 text-center text-slate-500">
                                            No projects with bills, receipts, or equity activity in scope.
                                        </td>
                                    </tr>
                                ) : (
                                    rows.map((r, idx) => (
                                        <tr key={r.projectId} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                                            <td className="px-2 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                                                {idx + 1}
                                            </td>
                                            <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                                                {r.projectName}
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums">{fmtWhole(r.initialInvestment)}</td>
                                            <td className="px-3 py-2 text-right tabular-nums">{fmtWhole(r.totalExpense)}</td>
                                            <td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                                                {fmtWhole(r.totalRevenue)}
                                            </td>
                                            <td
                                                className={`px-3 py-2 text-right tabular-nums ${
                                                    r.currentProfit >= 0
                                                        ? 'text-slate-900 dark:text-slate-100'
                                                        : 'text-rose-700 dark:text-rose-400'
                                                }`}
                                            >
                                                {fmtWhole(r.currentProfit)}
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums font-medium">
                                                {fmtWhole(r.totalEquity)}
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                                                {fmtWhole(r.profitDistributed)}
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums text-rose-700 dark:text-rose-400">
                                                {fmtWhole(r.totalWithdrawal)}
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums font-semibold text-indigo-700 dark:text-indigo-300">
                                                {fmtWhole(r.undistributedFund)}
                                            </td>
                                        </tr>
                                    ))
                                )}
                                {rows.length > 0 && (
                                    <tr className="bg-slate-100/90 dark:bg-slate-800/90 font-semibold border-t-2 border-slate-200 dark:border-slate-600">
                                        <td className="px-2 py-2 text-right text-slate-500">—</td>
                                        <td className="px-3 py-2">Totals</td>
                                        <td className="px-3 py-2 text-right tabular-nums">{fmtWhole(totals.initialInvestment)}</td>
                                        <td className="px-3 py-2 text-right tabular-nums">{fmtWhole(totals.totalExpense)}</td>
                                        <td className="px-3 py-2 text-right tabular-nums">{fmtWhole(totals.totalRevenue)}</td>
                                        <td className="px-3 py-2 text-right tabular-nums">{fmtWhole(totals.currentProfit)}</td>
                                        <td className="px-3 py-2 text-right tabular-nums">{fmtWhole(totals.totalEquity)}</td>
                                        <td className="px-3 py-2 text-right tabular-nums">{fmtWhole(totals.profitDistributed)}</td>
                                        <td className="px-3 py-2 text-right tabular-nums">{fmtWhole(totals.totalWithdrawal)}</td>
                                        <td className="px-3 py-2 text-right tabular-nums text-indigo-800 dark:text-indigo-200">
                                            {fmtWhole(totals.undistributedFund)}
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

            <p className="text-xs text-slate-500 dark:text-slate-400 shrink-0">
                Amounts rounded to whole {CURRENCY} for display and export.
            </p>
        </div>
    );
};

export default UndistributedFundsReport;
