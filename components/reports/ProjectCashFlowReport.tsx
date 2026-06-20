import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
    useBills,
    useInvoices,
    useProjects,
    useBuildings,
    useStateSelector,
    useTransactions,
} from '../../hooks/useSelectiveState';
import { _getAppState } from '../../context/appStateStore';
import Card from '../ui/Card';
import { CURRENCY } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import ReportToolbar, { ReportDateRange } from './ReportToolbar';
import FinancialEntityFilterCombo from './FinancialEntityFilterCombo';
import {
    entityScopeFromFilterId,
    financialEntityFilterLabel,
    FINANCIAL_ENTITY_FILTER_ALL,
    scopeTargetsProject,
} from './financialEntityScope';
import {
    endOfMonthYyyyMmDd,
    formatDate,
    startOfMonthYyyyMmDd,
    todayLocalYyyyMmDd,
} from '../../utils/dateUtils';
import { usePrintContext } from '../../context/PrintContext';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';
import {
    partitionFinancingEquityTransferPayout,
    type CashFlowLine,
    type CashFlowSectionResult,
    type CashFlowAuditRow,
    type CashFlowReportResult,
} from './cashFlowEngine';
import type { Transaction } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import type { ReportStateSlice } from './reportUtils';
import { resolveProjectIdForTransaction } from './reportUtils';
import { fetchCashFlowReportUnified } from '../../services/financialEngine/cashFlowJournalReports';
import { useReportTenantId } from '../../hooks/useReportTenantId';

/**
 * Drill-down rows for cash flow lines. When a single project is selected, batch-linked transfers
 * (inter-project MOVE_OUT + MOVE_IN) only show the leg that belongs to that project — not the mirror leg.
 */
function buildCashFlowDrillRows(
    lines: CashFlowLine[],
    transactionsById: Map<string, Transaction>,
    allTransactions: Transaction[],
    reportState: ReportStateSlice,
    selectedProjectId: string
): { tx: Transaction; lineLabel: string }[] {
    const byBatch = new Map<string, Transaction[]>();
    for (const t of allTransactions) {
        if (!t.batchId) continue;
        const arr = byBatch.get(t.batchId) ?? [];
        arr.push(t);
        byBatch.set(t.batchId, arr);
    }
    const projectScope = selectedProjectId !== 'all' ? selectedProjectId : null;

    const mateBelongsToScope = (m: Transaction): boolean => {
        if (!projectScope) return true;
        const pid = resolveProjectIdForTransaction(m, reportState);
        return pid === projectScope;
    };

    const seen = new Set<string>();
    const out: { tx: Transaction; lineLabel: string }[] = [];
    for (const line of lines) {
        for (const id of line.transactionIds) {
            const tx = transactionsById.get(id);
            if (!tx) continue;
            if (tx.batchId) {
                const mates = byBatch.get(tx.batchId);
                if (mates && mates.length > 0) {
                    const filtered = projectScope ? mates.filter(mateBelongsToScope) : mates;
                    for (const m of [...filtered].sort(
                        (a, b) =>
                            String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id))
                    )) {
                        if (seen.has(m.id)) continue;
                        seen.add(m.id);
                        out.push({ tx: m, lineLabel: line.label });
                    }
                }
            } else {
                if (seen.has(tx.id)) continue;
                seen.add(tx.id);
                out.push({ tx, lineLabel: line.label });
            }
        }
    }
    out.sort(
        (a, b) =>
            String(a.tx.date).localeCompare(String(b.tx.date)) || String(a.tx.id).localeCompare(String(b.tx.id))
    );
    return out;
}

function CashFlowDrillModal({
    open,
    onClose,
    title,
    lines,
    transactionsById,
    allTransactions,
    reportStateSlice,
    selectedProjectId,
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    lines: CashFlowLine[];
    transactionsById: Map<string, Transaction>;
    /** When set, batch-related transactions (e.g. equity transfers) are expanded in the detail list. */
    allTransactions: Transaction[];
    reportStateSlice: ReportStateSlice;
    selectedProjectId: string;
}) {
    const rows = useMemo(() => {
        if (allTransactions.length > 0) {
            return buildCashFlowDrillRows(
                lines,
                transactionsById,
                allTransactions,
                reportStateSlice,
                selectedProjectId
            );
        }
        const out: { tx: Transaction; lineLabel: string }[] = [];
        for (const line of lines) {
            for (const id of line.transactionIds) {
                const tx = transactionsById.get(id);
                if (tx) out.push({ tx, lineLabel: line.label });
            }
        }
        out.sort((a, b) => String(a.tx.date).localeCompare(String(b.tx.date)));
        return out;
    }, [lines, transactionsById, allTransactions, reportStateSlice, selectedProjectId]);

    return (
        <Modal isOpen={open} onClose={onClose} title={title} size="xl">
            <div className="max-h-[60vh] overflow-y-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-app-border text-left text-app-muted">
                            <th className="py-2 pr-2">Date</th>
                            <th className="py-2 pr-2">Subtype</th>
                            <th className="py-2 pr-2">Line</th>
                            <th className="py-2 pr-2">Description</th>
                            <th className="py-2 text-right">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(({ tx, lineLabel }) => (
                            <tr key={tx.id} className="border-b border-app-border">
                                <td className="py-2 pr-2 tabular-nums text-app-text">{formatDate(tx.date)}</td>
                                <td className="py-2 pr-2 text-xs text-app-muted font-mono">
                                    {tx.subtype != null ? String(tx.subtype) : '—'}
                                </td>
                                <td className="py-2 pr-2 text-app-muted">{lineLabel}</td>
                                <td className="py-2 pr-2 text-app-text">{tx.description || tx.type}</td>
                                <td className="py-2 text-right tabular-nums font-medium text-app-text">
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
                    <p className="text-sm text-app-muted py-4">No linked transactions found in the current view.</p>
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
    const projects = useProjects();
    const buildings = useBuildings();
    const transactions = useTransactions();
    const invoices = useInvoices();
    const bills = useBills();
    const projectAgreements = useStateSelector((s) => s.projectAgreements);
    const reportState = useMemo<ReportStateSlice>(
        () => ({ invoices, bills, projectAgreements }),
        [invoices, bills, projectAgreements]
    );
    const { print: triggerPrint } = usePrintContext();

    const [dateRange, setDateRange] = useState<ReportDateRange>('all');
    const [startDate, setStartDate] = useState('2000-01-01');
    const [endDate, setEndDate] = useState(() => todayLocalYyyyMmDd());

    const [entityFilterId, setEntityFilterId] = useState<string>(
        () => _getAppState().defaultProjectId ? `project:${_getAppState().defaultProjectId}` : FINANCIAL_ENTITY_FILTER_ALL
    );
    const entityScope = useMemo(() => entityScopeFromFilterId(entityFilterId), [entityFilterId]);
    const entityLabel = useMemo(
        () => financialEntityFilterLabel(entityFilterId, projects, buildings),
        [entityFilterId, projects, buildings]
    );
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

    const [auditOpen, setAuditOpen] = useState(false);

    const tenantId = useReportTenantId();
    const [report, setReport] = useState<CashFlowReportResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);

    /** Refetch when another user posts equity / journal-backed cash movements (API cash flow is journal-sourced). */
    const journalRefreshKey = useMemo(
        () => `${transactions.length}:${transactions[transactions.length - 1]?.id ?? ''}`,
        [transactions]
    );

    useEffect(() => {
        if (!tenantId) {
            setReport(null);
            setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setFetchError(null);
        void fetchCashFlowReportUnified({
            tenantId,
            from: startDate,
            to: endDate,
            projectId: entityScope.projectId,
            buildingId: entityScope.buildingId,
        })
            .then((r) => {
                if (!cancelled) setReport(r);
            })
            .catch((e) => {
                if (!cancelled) setFetchError(e instanceof Error ? e.message : String(e));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [tenantId, startDate, endDate, entityScope, journalRefreshKey]);

    const transactionsById = useMemo(
        () => new Map(transactions.map((t) => [t.id, t])),
        [transactions]
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

    const sections: { title: string; data: CashFlowSectionResult }[] = useMemo(
        () =>
            report
                ? [
                      { title: 'Operating Activities', data: report.operating },
                      { title: 'Investing Activities', data: report.investing },
                      { title: 'Financing Activities', data: report.financing },
                  ]
                : [],
        [report]
    );

    const financingDisplay = useMemo(
        () => (report ? partitionFinancingEquityTransferPayout(report.financing.items) : null),
        [report]
    );

    const handleExport = () => {
        if (!report) return;
        const exportData: { Category: string; Amount: number | string }[] = [];

        for (const { title, data } of sections) {
            exportData.push({ Category: title.toUpperCase(), Amount: '' });
            if (title === 'Financing Activities') {
                const { mainLines, equityTransferPayoutSummary } = partitionFinancingEquityTransferPayout(data.items);
                for (const item of mainLines) {
                    exportData.push({ Category: item.label, Amount: item.amount });
                }
                if (equityTransferPayoutSummary) {
                    exportData.push({
                        Category: 'Equity transfers & payouts (summary)',
                        Amount: equityTransferPayoutSummary.total,
                    });
                }
            } else {
                for (const item of data.items) {
                    exportData.push({ Category: item.label, Amount: item.amount });
                }
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
                    <span className="text-xs font-normal normal-case text-app-muted">{isCollapsed ? 'Show' : 'Hide'}</span>
                </button>
                {!isCollapsed && (
                    <table className="w-full text-sm">
                        <tbody>
                            {section.items.map((item, index) => (
                                <tr
                                    key={`${item.label}-${index}`}
                                    className="cursor-pointer hover:bg-app-table-header"
                                    onClick={() =>
                                        setDrilldown({
                                            sectionTitle: `${title}: ${item.label}`,
                                            lines: [item],
                                        })
                                    }
                                >
                                    <td className="py-2 px-2 text-app-text pl-4">
                                        {item.label}
                                        {item.isNonCash && (
                                            <span className="block text-xs font-normal text-app-muted mt-0.5">
                                                {title === 'Financing Activities'
                                                    ? 'Non-cash equity movement (included in net financing total)'
                                                    : 'Non-cash (excluded from this section total)'}
                                            </span>
                                        )}
                                    </td>
                                    <td
                                        className={`py-2 px-2 text-right font-medium tabular-nums ${
                                            item.isNonCash
                                                ? 'text-app-muted'
                                                : item.amount >= 0
                                                  ? 'text-emerald-700'
                                                  : 'text-red-600'
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
                            <tr className="bg-app-table-header font-bold border-t border-app-border">
                                <td className="py-3 px-2 text-app-text">
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

    const renderFinancingSection = () => {
        if (!report || !financingDisplay) return null;
        const title = 'Financing Activities';
        const section = report.financing;
        const { mainLines, equityTransferPayoutSummary } = financingDisplay;
        const isCollapsed = collapsed['financing'];
        const borderColor = 'border-indigo-100 text-indigo-800';

        return (
            <div className="mb-6">
                <button
                    type="button"
                    className={`flex w-full items-center justify-between text-left text-lg font-bold uppercase tracking-wide pb-2 mb-2 border-b-2 ${borderColor}`}
                    onClick={() => toggleSection('financing')}
                >
                    <span>{title}</span>
                    <span className="text-xs font-normal normal-case text-app-muted">{isCollapsed ? 'Show' : 'Hide'}</span>
                </button>
                {!isCollapsed && (
                    <table className="w-full text-sm">
                        <tbody>
                            {mainLines.map((item, index) => (
                                <tr
                                    key={`${item.key}-${item.label}-${index}`}
                                    className="cursor-pointer hover:bg-app-table-header"
                                    onClick={() =>
                                        setDrilldown({
                                            sectionTitle: `${title}: ${item.label}`,
                                            lines: [item],
                                        })
                                    }
                                >
                                    <td className="py-2 px-2 text-app-text pl-4">
                                        {item.label}
                                        {item.isNonCash && (
                                            <span className="block text-xs font-normal text-app-muted mt-0.5">
                                                Non-cash equity movement (included in net financing total)
                                            </span>
                                        )}
                                    </td>
                                    <td
                                        className={`py-2 px-2 text-right font-medium tabular-nums ${
                                            item.isNonCash
                                                ? 'text-app-muted'
                                                : item.amount >= 0
                                                  ? 'text-emerald-700'
                                                  : 'text-red-600'
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
                            {equityTransferPayoutSummary && (
                                <tr
                                    className="cursor-pointer hover:bg-indigo-50 border-t border-indigo-100 bg-indigo-50/40"
                                    onClick={() =>
                                        setDrilldown({
                                            sectionTitle: `${title}: Equity transfers & payouts (detail)`,
                                            lines: equityTransferPayoutSummary.lines,
                                        })
                                    }
                                >
                                    <td className="py-2 px-2 text-app-text pl-4 font-medium">
                                        Equity transfers & payouts
                                        <span className="block text-xs font-normal text-app-muted mt-0.5">
                                            Includes inter-project and capital payout lines for this project. Net financing
                                            below sums all financing rows (single-project view) so operating + financing
                                            matches project cash movement; compare closing cash to the balance sheet.
                                        </span>
                                    </td>
                                    <td
                                        className={`py-2 px-2 text-right font-semibold tabular-nums ${
                                            equityTransferPayoutSummary.total >= 0 ? 'text-emerald-800' : 'text-red-700'
                                        }`}
                                    >
                                        {CURRENCY}{' '}
                                        {equityTransferPayoutSummary.total.toLocaleString(undefined, {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                        })}
                                    </td>
                                </tr>
                            )}
                            <tr className="bg-app-table-header font-bold border-t border-app-border">
                                <td className="py-3 px-2 text-app-text">
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
                        <FinancialEntityFilterCombo
                            className="w-44 sm:w-52 flex-shrink-0"
                            selectedId={entityFilterId}
                            onSelect={setEntityFilterId}
                        />
                        <label className="flex items-center gap-2 text-sm text-app-muted ml-2 whitespace-nowrap opacity-60" title="Journal-based cash flow classifies interest from GL account types">
                            <input
                                type="checkbox"
                                checked={interestPaidAsOperating}
                                disabled
                                readOnly
                            />
                            Interest as operating (journal GL)
                        </label>
                        <Button
                            type="button"
                            variant="secondary"
                            className="ml-2 text-sm"
                            onClick={() => setAuditOpen(true)}
                        >
                            Cash flow audit
                        </Button>
                    </ReportToolbar>
                </div>

                <div className="flex-grow overflow-y-auto min-h-0 bg-app-bg" id="printable-area">
                    <Card className="min-h-full">
                        <ReportHeader />
                        <div className="text-center mb-6">
                            <h3 className="text-2xl font-bold text-app-text uppercase tracking-wide">
                                Cash Flow Statement
                            </h3>
                            <p className="text-sm text-app-muted font-medium mt-1">
                                {entityLabel}
                            </p>
                            <p className="text-xs text-app-muted">
                                {report?.flags.source === 'transactions'
                                    ? 'Direct method (operational transactions)'
                                    : 'Direct method (journal GL)'}{' '}
                                — For the period from {formatDate(startDate)} to {formatDate(endDate)}
                            </p>
                            {loading && (
                                <p className="text-xs text-app-muted mt-1">Loading cash flow from journal…</p>
                            )}
                            {fetchError && (
                                <p className="text-xs text-rose-600 mt-1">{fetchError}</p>
                            )}
                        </div>

                        {!report ? (
                            <p className="text-center text-sm text-app-muted py-8">
                                {loading
                                    ? 'Loading cash flow statement…'
                                    : fetchError ?? 'Could not load cash flow statement.'}
                            </p>
                        ) : (
                        <div className="max-w-4xl mx-auto bg-app-card p-4 md:p-8 rounded-xl border border-app-border shadow-ds-card">
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
                            {renderFinancingSection()}

                            <div className="mt-8 space-y-3 border-t-2 border-app-border pt-6">
                                <div className="flex justify-between items-center py-2">
                                    <span className="text-sm font-bold text-app-text uppercase tracking-wide">
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
                                    <span className="text-sm text-app-text">Opening cash balance</span>
                                    <span className="text-sm font-medium text-app-text tabular-nums">
                                        {CURRENCY}{' '}
                                        {report.summary.opening_cash.toLocaleString(undefined, {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                        })}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center py-3 border-t-2 border-app-border pt-3">
                                    <span className="text-base font-bold text-app-text uppercase tracking-wide">
                                        Closing cash balance (balance sheet)
                                    </span>
                                    <span className="text-base font-bold text-app-text tabular-nums">
                                        {CURRENCY}{' '}
                                        {report.summary.closing_cash.toLocaleString(undefined, {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                        })}
                                    </span>
                                </div>
                            </div>
                        </div>
                        )}

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
                allTransactions={transactions}
                reportStateSlice={{
                    invoices,
                    bills,
                    projectAgreements,
                }}
                selectedProjectId={scopeTargetsProject(entityScope) ? entityScope.projectId : 'all'}
            />

            <CashFlowAuditModal
                open={auditOpen && !!report}
                onClose={() => setAuditOpen(false)}
                rows={report?.audit ?? []}
            />
        </>
    );
};

function CashFlowAuditModal({
    open,
    onClose,
    rows,
}: {
    open: boolean;
    onClose: () => void;
    rows: CashFlowAuditRow[];
}) {
    return (
        <Modal isOpen={open} onClose={onClose} title="Cash flow audit" size="xl">
            <p className="text-sm text-app-muted mb-3">
                Cash in/out reflect bank/cash legs only (IAS 7). Non-cash rows show notional equity amounts for
                inter-project moves.
            </p>
            <div className="max-h-[65vh] overflow-auto border border-app-border rounded-lg">
                <table className="w-full text-xs md:text-sm">
                    <thead className="bg-app-table-header sticky top-0 text-left text-app-muted">
                        <tr>
                            <th className="p-2">Date</th>
                            <th className="p-2">Tx ID</th>
                            <th className="p-2">Type / subtype</th>
                            <th className="p-2">Section</th>
                            <th className="p-2">Line</th>
                            <th className="p-2 text-right">Cash in</th>
                            <th className="p-2 text-right">Cash out</th>
                            <th className="p-2 text-right">Notional</th>
                            <th className="p-2">Source</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => (
                            <tr
                                key={`${r.transactionId}-${r.lineLabel ?? ''}-${r.date}`}
                                className="border-t border-app-border"
                            >
                                <td className="p-2 tabular-nums whitespace-nowrap">{formatDate(r.date)}</td>
                                <td className="p-2 font-mono text-[10px] break-all max-w-[120px]">{r.transactionId}</td>
                                <td className="p-2">
                                    {r.transactionType}
                                    {r.subtype ? (
                                        <span className="block text-app-muted">{r.subtype}</span>
                                    ) : null}
                                </td>
                                <td className="p-2 capitalize">{r.section}</td>
                                <td className="p-2 text-app-text">{r.lineLabel ?? '—'}</td>
                                <td className="p-2 text-right tabular-nums">
                                    {r.cashIn > 0 ? `${CURRENCY} ${r.cashIn.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}
                                </td>
                                <td className="p-2 text-right tabular-nums">
                                    {r.cashOut > 0 ? `${CURRENCY} ${r.cashOut.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}
                                </td>
                                <td className="p-2 text-right tabular-nums text-app-muted">
                                    {r.notionalAmount != null
                                        ? `${CURRENCY} ${r.notionalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                                        : '—'}
                                </td>
                                <td className="p-2 text-app-muted max-w-[140px]">{r.sourceModule}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {rows.length === 0 && (
                    <p className="p-4 text-sm text-app-muted">No classified movements in this period.</p>
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

export default ProjectCashFlowReport;
