import React, { useMemo, useState, useCallback } from 'react';
import { useAppContext } from '../../context/AppContext';
import Card from '../ui/Card';
import { CURRENCY } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import ReportToolbar, { ReportDateRange } from './ReportToolbar';
import ComboBox from '../ui/ComboBox';
import {
    endOfMonthYyyyMmDd,
    formatDate,
    startOfMonthYyyyMmDd,
    todayLocalYyyyMmDd,
} from '../../utils/dateUtils';
import { usePrintContext } from '../../context/PrintContext';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';
import {
    computeCashFlowReport,
    cashFlowCategoryMapFromEntries,
    type CashFlowLine,
    type CashFlowSectionResult,
} from './cashFlowEngine';
import type { Transaction } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

function CashFlowDrillModal({
    open,
    onClose,
    title,
    lines,
    transactionsById,
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    lines: CashFlowLine[];
    transactionsById: Map<string, Transaction>;
}) {
    const rows = useMemo(() => {
        const out: { tx: Transaction; lineLabel: string }[] = [];
        for (const line of lines) {
            for (const id of line.transactionIds) {
                const tx = transactionsById.get(id);
                if (tx) out.push({ tx, lineLabel: line.label });
            }
        }
        out.sort((a, b) => String(a.tx.date).localeCompare(String(b.tx.date)));
        return out;
    }, [lines, transactionsById]);

    return (
        <Modal isOpen={open} onClose={onClose} title={title} size="xl">
            <div className="max-h-[60vh] overflow-y-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-slate-200 text-left text-slate-500">
                            <th className="py-2 pr-2">Date</th>
                            <th className="py-2 pr-2">Line</th>
                            <th className="py-2 pr-2">Description</th>
                            <th className="py-2 text-right">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(({ tx, lineLabel }) => (
                            <tr key={tx.id} className="border-b border-slate-100">
                                <td className="py-2 pr-2 tabular-nums text-slate-700">{formatDate(tx.date)}</td>
                                <td className="py-2 pr-2 text-slate-600">{lineLabel}</td>
                                <td className="py-2 pr-2 text-slate-800">{tx.description || tx.type}</td>
                                <td className="py-2 text-right tabular-nums font-medium text-slate-900">
                                    {CURRENCY}{' '}
                                    {tx.amount.toLocaleString(undefined, {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                    })}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {rows.length === 0 && (
                    <p className="text-sm text-slate-500 py-4">No linked transactions found in the current view.</p>
                )}
            </div>
            <div className="mt-4 flex justify-end">
                <Button variant="secondary" onClick={onClose}>
                    Close
                </Button>
            </div>
        </Modal>
    );
}

const SECTION_SHORT: Record<string, string> = {
    'Operating Activities': 'Operating',
    'Investing Activities': 'Investing',
    'Financing Activities': 'Financing',
};

const ProjectCashFlowReport: React.FC = () => {
    const { state } = useAppContext();
    const { print: triggerPrint } = usePrintContext();

    const [dateRange, setDateRange] = useState<ReportDateRange>('all');
    const [startDate, setStartDate] = useState('2000-01-01');
    const [endDate, setEndDate] = useState(() => todayLocalYyyyMmDd());

    const [selectedProjectId, setSelectedProjectId] = useState<string>(state.defaultProjectId || 'all');
    const [interestPaidAsOperating, setInterestPaidAsOperating] = useState(true);

    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
        operating: false,
        investing: false,
        financing: false,
    });

    const [drilldown, setDrilldown] = useState<{
        sectionTitle: string;
        lines: CashFlowLine[];
    } | null>(null);

    const projectItems = useMemo(() => [{ id: 'all', name: 'All Projects' }, ...state.projects], [state.projects]);

    const transactionsById = useMemo(
        () => new Map(state.transactions.map((t) => [t.id, t])),
        [state.transactions]
    );

    const handleRangeChange = (type: ReportDateRange) => {
        setDateRange(type);
        const now = new Date();

        if (type === 'all') {
            setStartDate('2000-01-01');
            setEndDate(todayLocalYyyyMmDd());
        } else if (type === 'thisMonth') {
            setStartDate(startOfMonthYyyyMmDd(now));
            setEndDate(endOfMonthYyyyMmDd(now));
        } else if (type === 'lastMonth') {
            const anchor = new Date(now.getFullYear(), now.getMonth() - 1, 15);
            setStartDate(startOfMonthYyyyMmDd(anchor));
            setEndDate(endOfMonthYyyyMmDd(anchor));
        }
    };

    const handleDateChange = (start: string, end: string) => {
        setStartDate(start);
        setEndDate(end);
        if (dateRange !== 'custom') {
            setDateRange('custom');
        }
    };

    const report = useMemo(() => {
        return computeCashFlowReport(state, {
            fromDate: startDate,
            toDate: endDate,
            selectedProjectId,
            interestPaidAsOperating,
            cashFlowCategoryByAccountId: cashFlowCategoryMapFromEntries(state.cashFlowCategoryMappings),
        });
    }, [
        state,
        startDate,
        endDate,
        selectedProjectId,
        interestPaidAsOperating,
    ]);

    const sections: { title: string; data: CashFlowSectionResult }[] = useMemo(
        () => [
            { title: 'Operating Activities', data: report.operating },
            { title: 'Investing Activities', data: report.investing },
            { title: 'Financing Activities', data: report.financing },
        ],
        [report]
    );

    const handleExport = () => {
        const exportData: { Category: string; Amount: number | string }[] = [];

        for (const { title, data } of sections) {
            exportData.push({ Category: title.toUpperCase(), Amount: '' });
            for (const item of data.items) {
                exportData.push({ Category: item.label, Amount: item.amount });
            }
            exportData.push({
                Category: `Net cash from ${SECTION_SHORT[title] ?? title}`,
                Amount: data.total,
            });
            exportData.push({ Category: '', Amount: '' });
        }

        exportData.push({
            Category: 'Net increase/(decrease) in cash',
            Amount: report.summary.net_change,
        });
        exportData.push({ Category: 'Opening cash balance', Amount: report.summary.opening_cash });
        exportData.push({ Category: 'Closing cash balance (balance sheet)', Amount: report.summary.closing_cash });

        exportJsonToExcel(exportData as any[], 'cash-flow-report.xlsx', 'Cash Flow Statement');
    };

    const toggleSection = useCallback((key: string) => {
        setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
    }, []);

    const renderSection = (title: string, section: CashFlowSectionResult, collapseKey: string) => {
        const isCollapsed = collapsed[collapseKey];
        const borderColor =
            title === 'Operating Activities'
                ? 'border-emerald-100 text-emerald-800'
                : title === 'Investing Activities'
                  ? 'border-blue-100 text-blue-800'
                  : 'border-indigo-100 text-indigo-800';

        return (
            <div className="mb-6">
                <button
                    type="button"
                    className={`flex w-full items-center justify-between text-left text-lg font-bold uppercase tracking-wide pb-2 mb-2 border-b-2 ${borderColor}`}
                    onClick={() => toggleSection(collapseKey)}
                >
                    <span>{title}</span>
                    <span className="text-xs font-normal normal-case text-slate-500">{isCollapsed ? 'Show' : 'Hide'}</span>
                </button>
                {!isCollapsed && (
                    <table className="w-full text-sm">
                        <tbody>
                            {section.items.map((item, index) => (
                                <tr
                                    key={`${item.label}-${index}`}
                                    className="cursor-pointer hover:bg-slate-50"
                                    onClick={() =>
                                        setDrilldown({
                                            sectionTitle: `${title}: ${item.label}`,
                                            lines: [item],
                                        })
                                    }
                                >
                                    <td className="py-2 px-2 text-slate-700 pl-4">{item.label}</td>
                                    <td
                                        className={`py-2 px-2 text-right font-medium tabular-nums ${
                                            item.amount >= 0 ? 'text-emerald-700' : 'text-red-600'
                                        }`}
                                    >
                                        {CURRENCY}{' '}
                                        {item.amount.toLocaleString(undefined, {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                        })}
                                    </td>
                                </tr>
                            ))}
                            <tr className="bg-slate-50 font-bold border-t border-slate-200">
                                <td className="py-3 px-2 text-slate-900">
                                    Net cash from {SECTION_SHORT[title] ?? title} activities
                                </td>
                                <td
                                    className={`py-3 px-2 text-right tabular-nums ${
                                        section.total >= 0 ? 'text-emerald-800' : 'text-red-700'
                                    }`}
                                >
                                    {CURRENCY}{' '}
                                    {section.total.toLocaleString(undefined, {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                    })}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                )}
            </div>
        );
    };

    return (
        <>
            <style>{STANDARD_PRINT_STYLES}</style>
            <div className="flex flex-col h-full space-y-4">
                <div className="flex-shrink-0">
                    <ReportToolbar
                        startDate={startDate}
                        endDate={endDate}
                        onDateChange={handleDateChange}
                        onExport={handleExport}
                        onPrint={() => triggerPrint('REPORT', { elementId: 'printable-area' })}
                        hideGroup={true}
                        showDateFilterPills={true}
                        activeDateRange={dateRange}
                        onRangeChange={handleRangeChange}
                    >
                        <ComboBox
                            label="Filter by Project"
                            items={projectItems}
                            selectedId={selectedProjectId}
                            onSelect={(item) => setSelectedProjectId(item?.id || 'all')}
                            allowAddNew={false}
                        />
                        <label className="flex items-center gap-2 text-sm text-slate-600 ml-2 whitespace-nowrap">
                            <input
                                type="checkbox"
                                checked={interestPaidAsOperating}
                                onChange={(e) => setInterestPaidAsOperating(e.target.checked)}
                            />
                            Interest paid as operating (IAS 7 default)
                        </label>
                    </ReportToolbar>
                </div>

                <div className="flex-grow overflow-y-auto printable-area min-h-0" id="printable-area">
                    <Card className="min-h-full">
                        <ReportHeader />
                        <div className="text-center mb-6">
                            <h3 className="text-2xl font-bold text-slate-800 uppercase tracking-wide">
                                Cash Flow Statement
                            </h3>
                            <p className="text-sm text-slate-500 font-medium mt-1">
                                {selectedProjectId === 'all'
                                    ? 'All Projects'
                                    : state.projects.find((p) => p.id === selectedProjectId)?.name}
                            </p>
                            <p className="text-xs text-slate-400">
                                Direct method — For the period from {formatDate(startDate)} to {formatDate(endDate)}
                            </p>
                        </div>

                        <div className="max-w-4xl mx-auto bg-white p-4 md:p-8 rounded-xl border border-slate-200 shadow-sm">
                            {report.flags.negative_opening_cash && (
                                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                                    Opening cash is negative — verify bank and cash ledger balances.
                                </div>
                            )}

                            {!report.validation.reconciled && (
                                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                                    <p className="font-semibold">Cash reconciliation mismatch</p>
                                    <p className="mt-1">
                                        Computed closing ({CURRENCY}{' '}
                                        {report.summary.computed_closing_cash.toLocaleString(undefined, {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                        })}
                                        ) does not match balance sheet cash ({CURRENCY}{' '}
                                        {report.summary.closing_cash.toLocaleString(undefined, {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                        })}
                                        ). Discrepancy: {CURRENCY}{' '}
                                        {report.validation.discrepancy.toLocaleString(undefined, {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                        })}
                                        .
                                    </p>
                                    {report.validation.messages.map((m) => (
                                        <p key={m} className="mt-1 text-xs opacity-90">
                                            {m}
                                        </p>
                                    ))}
                                </div>
                            )}

                            {renderSection('Operating Activities', report.operating, 'operating')}
                            {renderSection('Investing Activities', report.investing, 'investing')}
                            {renderSection('Financing Activities', report.financing, 'financing')}

                            <div className="mt-8 space-y-3 border-t-2 border-slate-400 pt-6">
                                <div className="flex justify-between items-center py-2">
                                    <span className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                                        Net increase/(decrease) in cash
                                    </span>
                                    <span
                                        className={`text-sm font-bold tabular-nums ${
                                            report.summary.net_change >= 0 ? 'text-emerald-700' : 'text-red-600'
                                        }`}
                                    >
                                        {CURRENCY}{' '}
                                        {report.summary.net_change.toLocaleString(undefined, {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                        })}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center py-2">
                                    <span className="text-sm text-slate-700">Opening cash balance</span>
                                    <span className="text-sm font-medium text-slate-800 tabular-nums">
                                        {CURRENCY}{' '}
                                        {report.summary.opening_cash.toLocaleString(undefined, {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                        })}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center py-3 border-t-2 border-slate-300 pt-3">
                                    <span className="text-base font-bold text-slate-900 uppercase tracking-wide">
                                        Closing cash balance (balance sheet)
                                    </span>
                                    <span className="text-base font-bold text-slate-900 tabular-nums">
                                        {CURRENCY}{' '}
                                        {report.summary.closing_cash.toLocaleString(undefined, {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                        })}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <ReportFooter />
                    </Card>
                </div>
            </div>

            <CashFlowDrillModal
                open={!!drilldown}
                onClose={() => setDrilldown(null)}
                title={drilldown?.sectionTitle ?? ''}
                lines={drilldown?.lines ?? []}
                transactionsById={transactionsById}
            />
        </>
    );
};

export default ProjectCashFlowReport;
