import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import type { AppState } from '../../../types';
import { CHART_COLORS, useChartTheme } from '../../../components/analytics/chartTheme';
import { useProjectProfitabilityDetailsQuery } from '../hooks/useProjectProfitabilityAnalytics';
import { formatCompactMoney, formatFullMoney, formatRoi } from '../utils/financialFormat';

export interface ProjectProfitabilityDrawerProps {
    state: AppState;
    projectId: string | null;
    endDate: string;
    onClose: () => void;
}

export const ProjectProfitabilityDrawer: React.FC<ProjectProfitabilityDrawerProps> = ({ state, projectId, endDate, onClose }) => {
    const q = useProjectProfitabilityDetailsQuery(state, projectId, endDate, !!projectId);
    const d = q.data;
    const chartTheme = useChartTheme();

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
                        className="absolute top-0 right-0 h-full w-full max-w-lg bg-app-card shadow-2xl border-l border-app-border flex flex-col text-app-text"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-4 py-3 border-b border-app-border shrink-0">
                            <div>
                                <h2 className="text-lg font-bold text-app-text">Project drilldown</h2>
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
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-app-muted mb-2">Summary</h3>
                                        <div className="grid grid-cols-2 gap-2">
                                            <Metric label="Status" value={d.projectStatus || '—'} />
                                            <Metric label="Completion" value={`${d.completionPct.toFixed(1)}%`} />
                                            <Metric label="Net profit" value={formatFullMoney(d.netProfit)} emphasize />
                                            <Metric label="Adjusted" value={formatFullMoney(d.adjustedProfit)} />
                                            <Metric label="Investor capital" value={formatFullMoney(d.investorCapital)} />
                                            <Metric label="ROI %" value={formatRoi(d.roiPct)} />
                                        </div>
                                    </section>
                                    <section>
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-app-muted mb-2">Revenue breakdown</h3>
                                        <ul className="space-y-1 text-app-text">
                                            <Row label="Installments" v={d.revenueBreakdown.installment} />
                                            <Row label="Service charges" v={d.revenueBreakdown.serviceCharge} />
                                            <Row label="Rental (invoices)" v={d.revenueBreakdown.rental} />
                                            <Row label="Security deposits" v={d.revenueBreakdown.securityDeposit} />
                                            <Row label="Other P/L income" v={d.revenueBreakdown.otherIncomeFromPl} />
                                        </ul>
                                    </section>
                                    <section>
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-app-muted mb-2">Expense breakdown</h3>
                                        <ul className="space-y-1 max-h-40 overflow-y-auto">
                                            {d.expenseBreakdown.map((b) => (
                                                <li key={b.key} className="flex justify-between gap-2 text-app-text">
                                                    <span>{b.label}</span>
                                                    <span className="tabular-nums">{formatCompactMoney(b.amount)}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </section>
                                    <section>
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-app-muted mb-2">Investor ledger</h3>
                                        <ul className="space-y-1">
                                            <Row label="Deposits" v={d.investorLedger.deposits} />
                                            <Row label="Withdrawals" v={d.investorLedger.withdrawals} />
                                            <Row label="Profit allocations" v={d.investorLedger.profitAllocations} />
                                        </ul>
                                    </section>
                                    <section>
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-app-muted mb-2">Inventory</h3>
                                        <ul className="space-y-1">
                                            <Row label="Sold units" v={d.inventory.soldUnits} plain />
                                            <Row label="Unsold units" v={d.inventory.unsoldUnits} plain />
                                            <Row label="Unsold market value" v={d.inventory.marketValueUnsold} />
                                            <li className="flex justify-between text-app-muted">
                                                <span>Oldest unsold (days)</span>
                                                <span>{d.inventory.oldestUnsoldDays ?? '—'}</span>
                                            </li>
                                        </ul>
                                    </section>
                                    <section>
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-app-muted mb-2">Monthly trend</h3>
                                        <div className="h-40 w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <LineChart data={d.monthlyTrend}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                                                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: chartTheme.tick }} />
                                                    <YAxis tick={{ fontSize: 9, fill: chartTheme.tick }} width={56} tickFormatter={(v) => formatCompactMoney(Number(v))} />
                                                    <Tooltip
                                                        formatter={(v: number) => formatFullMoney(Number(v))}
                                                        contentStyle={{
                                                            backgroundColor: chartTheme.tooltipBg,
                                                            borderColor: chartTheme.tooltipBorder,
                                                            color: chartTheme.tooltipText,
                                                        }}
                                                    />
                                                    <Line type="monotone" dataKey="revenue" stroke={CHART_COLORS.income} strokeWidth={2} dot={false} name="Revenue" />
                                                    <Line type="monotone" dataKey="expense" stroke={CHART_COLORS.expense} strokeWidth={2} dot={false} name="Expense" />
                                                    <Line type="monotone" dataKey="netProfit" stroke={CHART_COLORS.profit} strokeWidth={2} dot={false} name="Net" />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </section>
                                    <section>
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-app-muted mb-2">P/L category trace</h3>
                                        <p className="text-[11px] text-app-muted mb-2">Top lines contributing to totals (open Project P/L for full drilldown).</p>
                                        <ul className="space-y-1 max-h-48 overflow-y-auto text-xs">
                                            {d.plCategoryRollup.slice(0, 40).map((c) => (
                                                <li key={c.categoryId} className="flex justify-between gap-2 border-b border-app-border py-1">
                                                    <span className={c.type === 'income' ? 'text-ds-success' : 'text-ds-danger'}>
                                                        {c.name}
                                                    </span>
                                                    <span className="tabular-nums">{formatCompactMoney(c.amount)}</span>
                                                </li>
                                            ))}
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

function Metric({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
    return (
        <div className={`rounded-xl border border-app-border px-3 py-2 ${emphasize ? 'bg-app-highlight' : 'bg-app-surface-2'}`}>
            <div className="text-[10px] uppercase font-semibold text-app-muted">{label}</div>
            <div className={`mt-0.5 font-semibold tabular-nums ${emphasize ? 'text-ds-primary' : 'text-app-text'}`}>{value}</div>
        </div>
    );
}

function Row({ label, v, plain }: { label: string; v: number; plain?: boolean }) {
    return (
        <li className="flex justify-between gap-2">
            <span>{label}</span>
            <span className="tabular-nums font-medium">{plain ? String(v) : formatFullMoney(v)}</span>
        </li>
    );
}
