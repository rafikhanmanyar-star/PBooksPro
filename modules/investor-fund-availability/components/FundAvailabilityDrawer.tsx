import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import type { AppState } from '../../../types';
import { useFundAvailabilityDetailsQuery } from '../hooks/useInvestorFundAvailability';
import type { ReservePolicy } from '../types/fundAvailability.types';
import { formatCompactMoney, formatFullMoney, formatRatio } from '../utils/financialFormat';

function HealthBadge({ label }: { label: string }) {
    const c =
        label === 'Healthy'
            ? 'text-ds-success'
            : label === 'Warning'
              ? 'text-ds-warning'
              : label === 'Blocked'
                ? 'text-ds-danger'
                : 'text-ds-danger';
    return <span className={`font-semibold ${c}`}>{label}</span>;
}

export interface FundAvailabilityDrawerProps {
    state: AppState;
    projectId: string | null;
    endDate: string;
    reservePolicy: ReservePolicy;
    onClose: () => void;
}

export const FundAvailabilityDrawer: React.FC<FundAvailabilityDrawerProps> = ({ state, projectId, endDate, reservePolicy, onClose }) => {
    const q = useFundAvailabilityDetailsQuery(state, projectId, endDate, reservePolicy, !!projectId);
    const d = q.data;

    if (typeof document === 'undefined') return null;

    return createPortal(
        <AnimatePresence>
            {projectId && (
                <motion.div key="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60]">
                    <button type="button" className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" aria-label="Close drawer" onClick={onClose} />
                    <motion.aside
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                        className="absolute top-0 right-0 h-full w-full max-w-xl bg-app-card shadow-2xl border-l border-app-border flex flex-col text-app-text"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-4 py-3 border-b border-app-border shrink-0">
                            <div>
                                <h2 className="text-lg font-bold text-app-text">Fund availability</h2>
                                <p className="text-xs text-app-muted">{d?.projectName ?? 'Loading…'}</p>
                            </div>
                            <button type="button" className="p-2 rounded-lg hover:bg-app-table-hover text-app-text" onClick={onClose} aria-label="Close">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6 text-sm">
                            {q.isLoading && <p className="text-app-muted">Loading analytics…</p>}
                            {q.isError && <p className="text-ds-danger">Could not load project details.</p>}
                            {d && (
                                <>
                                    <section>
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-app-muted mb-2">Project summary</h3>
                                        <div className="grid grid-cols-2 gap-2">
                                            <M label="Status" v={d.projectStatus} />
                                            <M label="Completion" v={`${d.completionPct.toFixed(1)}%`} />
                                            <M label="Fund health" v={<HealthBadge label={d.analytics.fundHealth} />} />
                                            <M
                                                label="Investors"
                                                v={d.investorNames.length ? d.investorNames.slice(0, 3).join(', ') + (d.investorNames.length > 3 ? '…' : '') : '—'}
                                            />
                                        </div>
                                    </section>
                                    <section>
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-app-muted mb-2">Equity breakdown</h3>
                                        <ul className="space-y-1 text-app-text">
                                            <R label="Capital (deposits)" n={d.equity.capital} />
                                            <R label="Allocated profit" n={d.equity.allocatedProfit} />
                                            <R label="Withdrawals" n={d.equity.withdrawals} />
                                            <R label="Investor equity (book)" n={d.equity.investorEquity} bold />
                                        </ul>
                                    </section>
                                    <section>
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-app-muted mb-2">Cash & liabilities</h3>
                                        <ul className="space-y-1 text-app-text">
                                            <R label="Cash inflow (bank, all-time)" n={d.cashFlow.cashInflow} />
                                            <R label="Cash outflow (bank, all-time)" n={d.cashFlow.cashOutflow} />
                                            <R label="Available cash (running balances)" n={d.cashFlow.availableCash} bold />
                                            <R label="Reserved (policy)" n={d.cashFlow.reservedFunds} />
                                            <R label="Pending payables" n={d.cashFlow.pendingPayables} />
                                            <R label="Distributable funds" n={d.cashFlow.distributableFunds} bold />
                                        </ul>
                                    </section>
                                    <section>
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-app-muted mb-2">Realized revenue (cash) vs expense</h3>
                                        <ul className="space-y-1 text-app-text">
                                            <R label="Invoice payments received" n={d.realizedRevenueCash} />
                                            <R label="Accrued total expense (P/L)" n={d.totalExpense} />
                                            <R label="Cash-based profit (received − expense)" n={d.realizedProfitCash} bold />
                                        </ul>
                                        <p className="text-[11px] text-app-muted mt-2">
                                            Accrued receivables are intentionally excluded from “realized revenue” here — only cleared customer payments count.
                                        </p>
                                    </section>
                                    <section>
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-app-muted mb-2">Distribution history</h3>
                                        <div className="max-h-40 overflow-y-auto space-y-1">
                                            {d.distributionHistory.length === 0 && <p className="text-app-muted">No profit allocations recorded.</p>}
                                            {d.distributionHistory.slice(-25).map((x) => (
                                                <div key={x.id} className="flex justify-between gap-2 text-app-text text-xs">
                                                    <span className="truncate">{x.date} — {x.label}</span>
                                                    <span className="tabular-nums shrink-0">{formatCompactMoney(x.amount)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                    <section>
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-app-muted mb-2">Withdrawal history</h3>
                                        <div className="max-h-40 overflow-y-auto space-y-1">
                                            {d.withdrawalHistory.length === 0 && <p className="text-app-muted">No tagged withdrawals.</p>}
                                            {d.withdrawalHistory.slice(0, 25).map((x) => (
                                                <div key={x.id} className="flex justify-between gap-2 text-app-text text-xs">
                                                    <span className="truncate">
                                                        {x.date} — {x.investorName}
                                                    </span>
                                                    <span className="tabular-nums shrink-0">{formatCompactMoney(x.amount)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                    <section>
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-app-muted mb-2">Liquidity analytics</h3>
                                        <ul className="space-y-1 text-app-text">
                                            <li className="flex justify-between gap-2">
                                                <span>Liquidity ratio (distributable / equity)</span>
                                                <span>{formatRatio(d.analytics.liquidityRatio)}</span>
                                            </li>
                                            <li className="flex justify-between gap-2">
                                                <span>Distributable as % of equity</span>
                                                <span>{formatRatio(d.analytics.distributionPctOfEquity)}</span>
                                            </li>
                                            <li className="flex justify-between gap-2">
                                                <span>Safe withdrawal ceiling</span>
                                                <span className="font-semibold">{formatFullMoney(d.analytics.safeWithdrawalMax)}</span>
                                            </li>
                                        </ul>
                                    </section>
                                </>
                            )}
                        </div>
                    </motion.aside>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
};

function M({ label, v }: { label: string; v: React.ReactNode }) {
    return (
        <div className="rounded-lg border border-app-border p-2 bg-app-surface-2">
            <div className="text-[10px] uppercase tracking-wide text-app-muted">{label}</div>
            <div className="text-sm font-semibold text-app-text mt-0.5 break-words">{v}</div>
        </div>
    );
}

function R({ label, n, bold, plain }: { label: string; n: number; bold?: boolean; plain?: boolean }) {
    return (
        <li className="flex justify-between gap-2">
            <span>{label}</span>
            <span className={`tabular-nums ${bold ? 'font-bold text-ds-primary' : ''}`}>
                {plain ? String(n) : formatFullMoney(n)}
            </span>
        </li>
    );
}
