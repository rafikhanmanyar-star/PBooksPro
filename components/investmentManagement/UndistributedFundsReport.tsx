import React, { useMemo, useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { CURRENCY } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from '../reports/ReportHeader';
import ReportFooter from '../reports/ReportFooter';
import ReportToolbar, { ReportDateRange } from '../reports/ReportToolbar';
import { formatDate, toLocalDateString } from '../../utils/dateUtils';
import { usePrintContext } from '../../context/PrintContext';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';
import { buildUndistributedFundsRows } from './undistributedFundsReportModel';

const UndistributedFundsReport: React.FC = () => {
    const { state } = useAppContext();
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
                totalExpense: acc.totalExpense + r.totalExpense,
                totalRevenue: acc.totalRevenue + r.totalRevenue,
                totalLiquidity: acc.totalLiquidity + r.totalLiquidity,
                initialInvestment: acc.initialInvestment + r.initialInvestment,
                totalProfitDistributed: acc.totalProfitDistributed + r.totalProfitDistributed,
                currentEquity: acc.currentEquity + r.currentEquity,
                undistributedFund: acc.undistributedFund + r.undistributedFund,
            }),
            {
                totalExpense: 0,
                totalRevenue: 0,
                totalLiquidity: 0,
                initialInvestment: 0,
                totalProfitDistributed: 0,
                currentEquity: 0,
                undistributedFund: 0,
            }
        );
    }, [rows]);

    const handleExport = () => {
        const data = rows.map((r) => ({
            'Project Name': r.projectName,
            'Total expense (construction bills)': r.totalExpense,
            'Total revenue (installment payments received)': r.totalRevenue,
            'Total liquidity': r.totalLiquidity,
            'Initial investment': r.initialInvestment,
            'Total profit distributed': r.totalProfitDistributed,
            'Current equity': r.currentEquity,
            'Undistributed fund': r.undistributedFund,
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
                        Per project: construction expense from accrued bills; selling revenue from installment payment
                        income through the as-of date; initial investment and profit distributed from the equity ledger
                        (same basis as Investor Distribution). Undistributed fund = total revenue + initial investment −
                        current equity (where current equity = initial investment + total profit distributed). Use this
                        as a guide for how much can be distributed in a cycle without exceeding available funds.
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
                    <div className="hidden print:block">
                        <ReportHeader />
                        <p className="text-center text-sm text-slate-600 mt-2">As of {formatDate(endDate)}</p>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 z-10">
                                <tr className="text-left text-slate-600 dark:text-slate-300">
                                    <th className="px-3 py-2 font-semibold whitespace-nowrap">Project name</th>
                                    <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">Total expense</th>
                                    <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">Total revenue</th>
                                    <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">Total liquidity</th>
                                    <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">Initial investment</th>
                                    <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">Total profit distributed</th>
                                    <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">Current equity</th>
                                    <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">Undistributed fund</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {rows.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="px-3 py-10 text-center text-slate-500">
                                            No projects with bill expense, selling receipts, or equity activity in scope.
                                        </td>
                                    </tr>
                                ) : (
                                    rows.map((r) => (
                                        <tr key={r.projectId} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                                            <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                                                {r.projectName}
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums">
                                                {CURRENCY} {r.totalExpense.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                                                {CURRENCY} {r.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums">
                                                {CURRENCY} {r.totalLiquidity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums">
                                                {CURRENCY} {r.initialInvestment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums">
                                                {CURRENCY} {r.totalProfitDistributed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums font-medium">
                                                {CURRENCY} {r.currentEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums font-semibold text-indigo-700 dark:text-indigo-300">
                                                {CURRENCY} {r.undistributedFund.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                    ))
                                )}
                                {rows.length > 0 && (
                                    <tr className="bg-slate-100/90 dark:bg-slate-800/90 font-semibold border-t-2 border-slate-200 dark:border-slate-600">
                                        <td className="px-3 py-2">Totals</td>
                                        <td className="px-3 py-2 text-right tabular-nums">
                                            {CURRENCY} {totals.totalExpense.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums">
                                            {CURRENCY} {totals.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums">
                                            {CURRENCY} {totals.totalLiquidity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums">
                                            {CURRENCY} {totals.initialInvestment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums">
                                            {CURRENCY} {totals.totalProfitDistributed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums">
                                            {CURRENCY} {totals.currentEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums text-indigo-800 dark:text-indigo-200">
                                            {CURRENCY} {totals.undistributedFund.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="hidden print:block mt-6">
                        <ReportFooter />
                    </div>
                </div>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 shrink-0">
                {CURRENCY} · Construction expense uses bill accrual through invoice dates up to the as-of date. Revenue sums
                installment-linked income transactions through the as-of date.
            </p>
        </div>
    );
};

export default UndistributedFundsReport;
