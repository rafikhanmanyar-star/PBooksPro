
import React, { useMemo } from 'react';
import {
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    BarChart, Bar, PieChart, Pie, Cell
} from 'recharts';
import {
    TrendingUp, ArrowUpRight, Users,
    Briefcase, PieChart as PieChartIcon, Activity, DollarSign
} from 'lucide-react';
import { useStateSelector } from '../../hooks/useSelectiveState';
import { TransactionType } from '../../types';
import { CURRENCY } from '../../constants';
import { formatCurrency } from '../../utils/numberUtils';
import { formatDate } from '../../utils/dateUtils';
import { computeEquityBalances, getInvestorEquityAccounts, roundEquityBalance } from './equityMetrics';
import { resolveProfitDistributionExpenseCategory } from '../../constants/profitDistributionCategory';
import { CHART_COLORS, useChartTheme } from '../analytics/chartTheme';

const InvestmentDashboard: React.FC = () => {
    const state = useStateSelector((s) => s);
    const chartTheme = useChartTheme();

    const { totalCapital, investorCount, cycleCount, allocationData, trendData, recentRows } = useMemo(() => {
        const balances = computeEquityBalances(state);
        const investors = getInvestorEquityAccounts(state);
        let total = 0;
        investors.forEach((inv) => {
            total += balances.invTotalBal[inv.id] || 0;
        });
        total = roundEquityBalance(total);

        const distBatches = new Set<string>();
        const profitDistExpenseCatIds = new Set<string>();
        const canonicalPd = resolveProfitDistributionExpenseCategory(state.categories);
        if (canonicalPd) profitDistExpenseCatIds.add(canonicalPd.id);
        state.categories.forEach((c) => {
            if (c.type !== TransactionType.EXPENSE) return;
            if (c.name === 'Profit Share' || c.name === 'Dividend') profitDistExpenseCatIds.add(c.id);
        });
        state.transactions.forEach((tx) => {
            if (tx.batchId && String(tx.batchId).startsWith('dist-cycle')) {
                distBatches.add(tx.batchId);
                return;
            }
            if (
                tx.type === TransactionType.EXPENSE &&
                tx.description?.includes('Profit Distribution:') &&
                tx.categoryId &&
                profitDistExpenseCatIds.has(tx.categoryId)
            ) {
                distBatches.add(tx.batchId || tx.id);
                return;
            }
            if (tx.description?.includes('Profit Distribution:')) {
                distBatches.add(tx.batchId || tx.id);
            }
        });

        const equityIds = new Set(investors.map((i) => i.id));
        const byMonth: Record<string, number> = {};
        state.transactions.forEach((tx) => {
            if (tx.type !== TransactionType.TRANSFER && tx.type !== TransactionType.INCOME) return;
            const touches =
                (tx.fromAccountId && equityIds.has(tx.fromAccountId)) ||
                (tx.toAccountId && equityIds.has(tx.toAccountId)) ||
                (tx.accountId && equityIds.has(tx.accountId));
            if (!touches) return;
            const m = (tx.date || '').slice(0, 7);
            if (!m) return;
            byMonth[m] = (byMonth[m] || 0) + Math.abs(Number(tx.amount) || 0);
        });
        const months = Object.keys(byMonth).sort();
        const trend = months.slice(-6).map((m) => ({
            month: m,
            activity: roundEquityBalance(byMonth[m] || 0),
        }));

        const alloc = investors
            .map((inv) => {
                const v = Math.max(0, balances.invTotalBal[inv.id] || 0);
                return { name: inv.name, value: roundEquityBalance(v) };
            })
            .filter((x) => x.value > 0)
            .sort((a, b) => b.value - a.value)
            .slice(0, 8);

        const recent = [...state.transactions]
            .filter((tx) => {
                if (tx.type === TransactionType.TRANSFER) {
                    const fe = tx.fromAccountId && equityIds.has(tx.fromAccountId);
                    const te = tx.toAccountId && equityIds.has(tx.toAccountId);
                    return fe || te;
                }
                if (tx.type === TransactionType.INCOME && tx.accountId && equityIds.has(tx.accountId)) return true;
                return false;
            })
            .sort((a, b) => String(b.date).localeCompare(String(a.date)))
            .slice(0, 8)
            .map((tx) => ({
                id: tx.id,
                date: tx.date,
                description: tx.description || '—',
                amount: tx.amount,
            }));

        return {
            totalCapital: total,
            investorCount: investors.length,
            cycleCount: distBatches.size,
            allocationData: alloc,
            trendData: trend,
            recentRows: recent,
        };
    }, [state]);

    const tooltipStyle = {
        borderRadius: 12,
        border: `1px solid ${chartTheme.tooltipBorder}`,
        backgroundColor: chartTheme.tooltipBg,
        color: chartTheme.tooltipText,
    };

    const summaryStats = [
        {
            label: 'Total investor equity',
            value: `${CURRENCY} ${formatCurrency(totalCapital)}`,
            sub: `${investorCount} investor account(s)`,
            icon: DollarSign,
            iconClass: 'text-ds-primary',
            iconBg: 'bg-app-highlight',
        },
        {
            label: 'Distribution cycles',
            value: String(cycleCount),
            sub: 'Unique batches (dist-cycle* or Profit Distribution lines)',
            icon: Activity,
            iconClass: 'text-ds-success',
            iconBg: 'bg-app-highlight',
        },
        {
            label: 'Investor accounts',
            value: String(investorCount),
            sub: 'User-created investor equity accounts only',
            icon: Users,
            iconClass: 'text-ds-primary',
            iconBg: 'bg-app-highlight',
        },
        {
            label: 'Activity (6 mo.)',
            value: trendData.length
                ? `${CURRENCY} ${formatCurrency(trendData.reduce((s, x) => s + x.activity, 0))}`
                : '—',
            sub: 'Sum of equity-tied transfer volume',
            icon: TrendingUp,
            iconClass: 'text-ds-warning',
            iconBg: 'bg-app-highlight',
        },
    ];

    const chartEmpty = (message: string) => (
        <div className="h-[300px] flex items-center justify-center bg-app-surface-2 rounded-ds-lg border border-dashed border-app-border">
            <p className="text-app-muted text-ds-body">{message}</p>
        </div>
    );

    return (
        <div className="p-4 space-y-6 overflow-y-auto h-full pb-20 bg-app-bg">
            <div>
                <h2 className="text-xl font-bold text-app-text">Investment overview</h2>
                <p className="text-ds-body text-app-muted">
                    Live figures from chart of accounts and equity journal. Distribution cycles count profit-distribution batches (including legacy runs tagged by description).
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {summaryStats.map((stat, index) => (
                    <div key={index} className="ds-card p-5 hover:shadow-ds-modal transition-shadow">
                        <div className="flex justify-between items-start mb-4">
                            <div className={`${stat.iconBg} p-2 rounded-ds-md`}>
                                <stat.icon className={`w-5 h-5 ${stat.iconClass}`} />
                            </div>
                            <div className="flex items-center text-ds-small font-medium text-ds-success">
                                <ArrowUpRight className="w-3 h-3 ml-1" />
                            </div>
                        </div>
                        <div>
                            <p className="text-ds-body text-app-muted font-medium">{stat.label}</p>
                            <h3 className="text-2xl font-bold text-app-text mt-1">{stat.value}</h3>
                            <p className="text-ds-small text-app-muted mt-1">{stat.sub}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="ds-card p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold text-app-text flex items-center gap-2">
                            <Activity className="w-4 h-4 text-ds-success" />
                            Equity-related activity by month
                        </h3>
                    </div>
                    {trendData.length === 0 ? (
                        chartEmpty('No equity transactions yet')
                    ) : (
                        <div className="h-[300px] w-full min-w-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: chartTheme.tick }} stroke={chartTheme.grid} />
                                    <YAxis tick={{ fontSize: 11, fill: chartTheme.tick }} stroke={chartTheme.grid} />
                                    <Tooltip
                                        contentStyle={tooltipStyle}
                                        formatter={(v: number) => `${CURRENCY} ${formatCurrency(v)}`}
                                    />
                                    <Bar dataKey="activity" fill={CHART_COLORS.profit} radius={[4, 4, 0, 0]} name="Volume" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>

                <div className="ds-card p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold text-app-text flex items-center gap-2">
                            <PieChartIcon className="w-4 h-4 text-ds-primary" />
                            Investor allocation (positive balances)
                        </h3>
                    </div>
                    {allocationData.length === 0 ? (
                        chartEmpty('No positive balances to chart')
                    ) : (
                        <div className="h-[300px] w-full min-w-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={allocationData}
                                        dataKey="value"
                                        nameKey="name"
                                        cx="50%"
                                        cy="50%"
                                        outerRadius={100}
                                        label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                                    >
                                        {allocationData.map((_, i) => (
                                            <Cell key={i} fill={CHART_COLORS.donut[i % CHART_COLORS.donut.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={tooltipStyle}
                                        formatter={(v: number) => `${CURRENCY} ${formatCurrency(v)}`}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
            </div>

            <div className="ds-card overflow-hidden p-0">
                <div className="px-6 py-4 border-b border-app-border flex justify-between items-center">
                    <h3 className="font-bold text-app-text">Recent equity activity</h3>
                </div>
                {recentRows.length === 0 ? (
                    <div className="p-8 text-center bg-app-toolbar">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-app-surface-2 text-app-muted mb-3 border border-app-border">
                            <Briefcase className="w-6 h-6" />
                        </div>
                        <p className="text-app-muted text-ds-body">No equity movements yet. Record investments under Equity &amp; ledger.</p>
                    </div>
                ) : (
                    <ul className="divide-y divide-app-border">
                        {recentRows.map((row) => (
                            <li key={row.id} className="px-6 py-3 flex justify-between gap-4 text-ds-body hover:bg-app-table-hover transition-colors">
                                <span className="text-app-text truncate">{row.description}</span>
                                <span className="text-app-muted shrink-0">{formatDate(row.date)}</span>
                                <span className="font-mono text-app-text shrink-0 tabular-nums">
                                    {`${CURRENCY} ${formatCurrency(row.amount)}`}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default InvestmentDashboard;
