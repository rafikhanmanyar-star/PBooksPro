import { useFinancialReportAppState } from '../../../hooks/useSelectiveState';
import React, { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Download, FileText, Printer, RefreshCw, ShieldCheck } from 'lucide-react';
import { usePrintReport } from '../../../hooks/usePrintReport';
import { useAuth } from '../../../context/AuthContext';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import ComboBox from '../../../components/ui/ComboBox';
import { toLocalDateString } from '../../../utils/dateUtils';
import ReportHeader from '../../../components/reports/ReportHeader';
import ReportFooter from '../../../components/reports/ReportFooter';
import { useFundAvailabilityFiltersStore } from '../store/fundAvailabilityFiltersStore';
import {
    useFilteredFundRows,
    useFundAvailabilityPermissions,
    useFundAvailabilitySummaryQuery,
    usePortfolioCashFlowTrendQuery,
    usePortfolioDistributableTrendQuery,
    usePortfolioWithdrawalsTrendQuery,
} from '../hooks/useInvestorFundAvailability';
import { FundAvailabilityKpiStrip } from './FundAvailabilityKpiStrip';
import { FundAvailabilityFilterBar } from './FundAvailabilityFilterBar';
import {
    CashFlowTrendChart,
    EquityVsCashChart,
    LiquidityHealthDonut,
    MonthlyDistributableChart,
    WithdrawalHistoryChart,
} from '../charts/FundAvailabilityCharts';
import { FundAvailabilityDataTable } from './FundAvailabilityDataTable';
import { FundAvailabilityDrawer } from './FundAvailabilityDrawer';
import { exportFundAvailabilityCsv, exportFundAvailabilityExcel, exportFundAvailabilityPdf } from './exportFundAvailability';
import { validateWithdrawal } from '../utils/validateWithdrawal';
import type { WithdrawalValidationResult } from '../types/fundAvailability.types';
import { WithdrawalValidationModal } from './WithdrawalValidationModal';
import { formatCompactMoney } from '../utils/financialFormat';

export const FundAvailabilityPage: React.FC = () => {
    const state = useFinancialReportAppState();
    const { projects } = state;
    const { user } = useAuth();
    const qc = useQueryClient();
    const [endDate, setEndDate] = useState(() => toLocalDateString(new Date()));
    const { filters, reservePolicy } = useFundAvailabilityFiltersStore();
    const perm = useFundAvailabilityPermissions(user?.role);

    const summaryQ = useFundAvailabilitySummaryQuery(state, endDate, reservePolicy);
    const distTrendQ = usePortfolioDistributableTrendQuery(state, endDate, reservePolicy);
    const cfTrendQ = usePortfolioCashFlowTrendQuery(state, endDate);
    const wTrendQ = usePortfolioWithdrawalsTrendQuery(state, endDate);

    const rows = useFilteredFundRows(summaryQ.data, state, endDate, filters);

    const [drawerId, setDrawerId] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const printReport = usePrintReport();

    const [valOpen, setValOpen] = useState(false);
    const [valResult, setValResult] = useState<WithdrawalValidationResult | null>(null);
    const [valAmount, setValAmount] = useState('');
    const [valProjectId, setValProjectId] = useState('');

    const projectItems = useMemo(() => projects.map((p) => ({ id: p.id, name: p.name })), [projects]);

    const onRefresh = () => {
        void qc.invalidateQueries({ queryKey: ['investor-fund-availability'] });
    };

    const runValidation = () => {
        const amt = Number(valAmount);
        if (!valProjectId || !Number.isFinite(amt) || amt <= 0) {
            setValResult({
                ok: false,
                distributableFunds: 0,
                requestedAmount: amt,
                shortfall: 0,
                messages: ['Select a project and enter a valid positive amount.'],
                reservePolicy,
            });
            setValOpen(true);
            return;
        }
        const r = validateWithdrawal(state, valProjectId, amt, endDate, reservePolicy);
        setValResult(r);
        setValOpen(true);
    };

    const exportRows = useMemo(() => {
        if (!selectedIds.length) return rows;
        const set = new Set(selectedIds);
        return rows.filter((r) => set.has(r.projectId));
    }, [rows, selectedIds]);

    return (
        <div className="flex flex-col h-full min-h-0 overflow-hidden bg-app-bg">
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 space-y-4">
                <header className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-app-text">Investor Fund Availability</h1>
                        <p className="mt-1 text-ds-body text-app-muted max-w-3xl">
                            Track distributable funds, investor equity, liquidity, withdrawals, and payout-safe balances across projects. Withdrawals must clear: cash − operating reserve − payables.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <Button
                            variant="secondary"
                            type="button"
                            className="gap-2"
                            disabled={!perm.exportFundAvailability}
                            onClick={() => exportFundAvailabilityExcel(exportRows)}
                        >
                            <Download className="h-4 w-4" /> Excel
                        </Button>
                        <Button variant="secondary" type="button" className="gap-2" disabled={!perm.exportFundAvailability} onClick={() => exportFundAvailabilityCsv(exportRows)}>
                            <FileText className="h-4 w-4" /> CSV
                        </Button>
                        <Button
                            variant="secondary"
                            type="button"
                            className="gap-2"
                            disabled={!perm.exportFundAvailability}
                            onClick={() => exportFundAvailabilityPdf(exportRows, `Investor Fund Availability — ${endDate}`)}
                        >
                            <FileText className="h-4 w-4" /> PDF
                        </Button>
                        <Button variant="secondary" type="button" className="gap-2" onClick={() => printReport({ elementId: 'fund-availability-print' })}>
                            <Printer className="h-4 w-4" /> Print
                        </Button>
                        <Button variant="secondary" type="button" className="gap-2" onClick={() => void onRefresh()}>
                            <RefreshCw className="h-4 w-4" /> Refresh
                        </Button>
                    </div>
                </header>

                {summaryQ.data && <div className="no-print"><FundAvailabilityKpiStrip summary={summaryQ.data} isFetching={summaryQ.isFetching} /></div>}

                <div className="no-print">
                <FundAvailabilityFilterBar state={state} endDate={endDate} onEndDateChange={setEndDate} allRows={summaryQ.data?.rows ?? []} canManageFilters={perm.viewFundAvailability} />
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 no-print">
                    <section className="rounded-2xl border border-app-border bg-app-card p-4 shadow-ds-card">
                        <h3 className="text-sm font-semibold text-app-text mb-2">Equity vs available cash</h3>
                        <EquityVsCashChart rows={rows} />
                    </section>
                    <section className="rounded-2xl border border-app-border bg-app-card p-4 shadow-ds-card">
                        <h3 className="text-sm font-semibold text-app-text mb-2">Portfolio distributable trend</h3>
                        <MonthlyDistributableChart points={distTrendQ.data ?? []} />
                    </section>
                    <section className="rounded-2xl border border-app-border bg-app-card p-4 shadow-ds-card">
                        <h3 className="text-sm font-semibold text-app-text mb-2">Cash flow trend (all projects)</h3>
                        <CashFlowTrendChart points={cfTrendQ.data ?? []} />
                    </section>
                    <section className="rounded-2xl border border-app-border bg-app-card p-4 shadow-ds-card">
                        <h3 className="text-sm font-semibold text-app-text mb-2">Liquidity health mix</h3>
                        <LiquidityHealthDonut rows={rows} />
                    </section>
                    <section className="rounded-2xl border border-app-border bg-app-card p-4 shadow-ds-card xl:col-span-2">
                        <h3 className="text-sm font-semibold text-app-text mb-2">Withdrawal history (portfolio)</h3>
                        <WithdrawalHistoryChart points={wTrendQ.data ?? []} />
                    </section>
                </div>

                <section className="rounded-2xl border border-app-border bg-app-highlight/40 p-4 no-print">
                    <div className="flex flex-col md:flex-row md:items-end gap-3">
                        <div className="flex items-center gap-2 text-ds-primary font-semibold text-sm">
                            <ShieldCheck className="h-5 w-5" />
                            Withdrawal validation
                        </div>
                        <div className="flex-1 flex flex-wrap items-end gap-2">
                            <div className="w-52 min-w-[12rem]">
                                <ComboBox label="Project" items={projectItems} selectedId={valProjectId} onSelect={(i) => setValProjectId(i?.id || '')} allowAddNew={false} />
                            </div>
                            <div className="w-36">
                                <Input label="Amount" type="number" value={valAmount} onChange={(e) => setValAmount(e.target.value)} placeholder="0" />
                            </div>
                            <Button type="button" onClick={runValidation}>
                                Check against distributable
                            </Button>
                        </div>
                    </div>
                </section>

                <section
                    id="fund-availability-print"
                    className="rounded-2xl border border-app-border bg-app-card p-4 shadow-ds-card"
                    data-print-scroll-container
                >
                    <ReportHeader reportTitle="Investor Fund Availability" />
                    <p className="text-center text-sm text-app-muted mb-3">As of {endDate}</p>
                    {summaryQ.data && (
                        <div className="report-print-only mb-4">
                            <table className="w-full text-xs border-collapse border border-slate-300">
                                <tbody>
                                    <tr className="border-b border-slate-200">
                                        <td className="px-2 py-1.5 font-medium text-slate-700">Total investor equity</td>
                                        <td className="px-2 py-1.5 text-right tabular-nums">{formatCompactMoney(summaryQ.data.totals.investorEquity)}</td>
                                    </tr>
                                    <tr className="border-b border-slate-200">
                                        <td className="px-2 py-1.5 font-medium text-slate-700">Available cash</td>
                                        <td className="px-2 py-1.5 text-right tabular-nums">{formatCompactMoney(summaryQ.data.totals.availableCash)}</td>
                                    </tr>
                                    <tr className="border-b border-slate-200">
                                        <td className="px-2 py-1.5 font-medium text-slate-700">Distributable funds</td>
                                        <td className="px-2 py-1.5 text-right tabular-nums">{formatCompactMoney(summaryQ.data.totals.distributableFunds)}</td>
                                    </tr>
                                    <tr className="border-b border-slate-200">
                                        <td className="px-2 py-1.5 font-medium text-slate-700">Reserved (ops)</td>
                                        <td className="px-2 py-1.5 text-right tabular-nums">{formatCompactMoney(summaryQ.data.totals.reservedFunds)}</td>
                                    </tr>
                                    <tr>
                                        <td className="px-2 py-1.5 font-medium text-slate-700">Pending payables</td>
                                        <td className="px-2 py-1.5 text-right tabular-nums">{formatCompactMoney(summaryQ.data.totals.pendingPayables)}</td>
                                    </tr>
                                </tbody>
                            </table>
                            <p className="mt-2 text-[10px] text-slate-500 text-center">Charts omitted from print — see portfolio table below.</p>
                        </div>
                    )}
                    <FundAvailabilityDataTable
                        rows={rows}
                        isLoading={summaryQ.isLoading}
                        onRowOpen={setDrawerId}
                        selectedIds={selectedIds}
                        onSelectionChange={setSelectedIds}
                    />
                    <ReportFooter />
                </section>
            </div>

            <FundAvailabilityDrawer state={state} projectId={drawerId} endDate={endDate} reservePolicy={reservePolicy} onClose={() => setDrawerId(null)} />
            <WithdrawalValidationModal open={valOpen} result={valResult} onClose={() => setValOpen(false)} />
        </div>
    );
};

export default FundAvailabilityPage;
