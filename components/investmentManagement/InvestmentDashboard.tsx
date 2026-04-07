
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

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];

const InvestmentDashboard: React.FC = () => {
    const state = useStateSelector((s) => s);

    const { totalCapital, investorCount, cycleCount, allocationData, trendData, recentRows } = useMemo(() => {
        const balances = computeEquityBalances(state);
        const investors = getInvestorEquityAccounts(state);
        let total = 0;
        investors.forEach((inv) => {
            total += balances.invTotalBal[inv.id] || 0;
        });
        total = roundEquityBalance(total);

        const distBatches = new Set<string>();
        state.transactions.forEach((tx) => {
            if (tx.batchId && String(tx.batchId).startsWith('dist-cycle')) distBatches.add(tx.batchId);
            else if (tx.description?.includes('Profit Distribution:')) {
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

    const summaryStats = [
        {
            label: 'Total investor equity',
            value: `${CURRENCY} ${formatCurrency(totalCapital)}`,
            sub: `${investorCount} investor account(s)`,
            status: 'up' as const,
            icon: DollarSign,
            color: 'text-blue-600',
            bg: 'bg-blue-50',
        },
        {
            label: 'Distribution cycles',
            value: String(cycleCount),
            sub: 'Recorded profit-distribution batches',
            status: 'up' as const,
            icon: Activity,
            color: 'text-green-600',
            bg: 'bg-green-50',
        },
        {
            label: 'Investor accounts',
            value: String(investorCount),
            sub: 'Excluding template Owner Equity',
            status: 'up' as const,
            icon: Users,
            color: 'text-purple-600',
            bg: 'bg-purple-50',
        },
        {
            label: 'Activity (6 mo.)',
            value: trendData.length
                ? `${CURRENCY} ${formatCurrency(trendData.reduce((s, x) => s + x.activity, 0))}`
                : '—',
            sub: 'Sum of equity-tied transfer volume',
            status: 'up' as const,
            icon: TrendingUp,
            color: 'text-amber-600',
            bg: 'bg-amber-50',
        },
    ];

    return (
        <div className="p-4 space-y-6 overflow-y-auto h-full pb-20">
            <div>
                <h2 className="text-xl font-bold text-gray-800">Investment overview</h2>
                <p className="text-sm text-gray-500">
                    Live figures from chart of accounts and journal (PostgreSQL when signed in; same data as Equity &amp; ledger).
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {summaryStats.map((stat, index) => (
                    <div key={index} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-4">
                            <div className={`${stat.bg} p-2 rounded-lg`}>
                                <stat.icon className={`w-5 h-5 ${stat.color}`} />
                            </div>
                            <div className="flex items-center text-xs font-medium text-green-600">
                                <ArrowUpRight className="w-3 h-3 ml-1" />
                            </div>
                        </div>
                        <div>
                            <p className="text-sm text-slate-500 font-medium">{stat.label}</p>
                            <h3 className="text-2xl font-bold text-slate-900 mt-1">{stat.value}</h3>
                            <p className="text-xs text-slate-400 mt-1">{stat.sub}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <Activity className="w-4 h-4 text-green-600" />
                            Equity-related activity by month
                        </h3>
                    </div>
                    {trendData.length === 0 ? (
                        <div className="h-[300px] flex items-center justify-center bg-slate-50 rounded-lg border border-dashed border-slate-300">
                            <p className="text-slate-400 text-sm">No equity transactions yet</p>
                        </div>
                    ) : (
                        <div className="h-[300px] w-full min-w-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#64748b" />
                                    <YAxis tick={{ fontSize: 11 }} stroke="#64748b" />
                                    <Tooltip formatter={(v: number) => `${CURRENCY} ${formatCurrency(v)}`} />
                                    <Bar dataKey="activity" fill="#6366f1" radius={[4, 4, 0, 0]} name="Volume" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>

                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <PieChartIcon className="w-4 h-4 text-purple-600" />
                            Investor allocation (positive balances)
                        </h3>
                    </div>
                    {allocationData.length === 0 ? (
                        <div className="h-[300px] flex items-center justify-center bg-slate-50 rounded-lg border border-dashed border-slate-300">
                            <p className="text-slate-400 text-sm">No positive balances to chart</p>
                        </div>
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
                                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(v: number) => `${CURRENCY} ${formatCurrency(v)}`} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="font-bold text-slate-800">Recent equity activity</h3>
                </div>
                {recentRows.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50/50">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 text-slate-400 mb-3">
                            <Briefcase className="w-6 h-6" />
                        </div>
                        <p className="text-slate-500 text-sm">No equity movements yet. Record investments under Equity &amp; ledger.</p>
                    </div>
                ) : (
                    <ul className="divide-y divide-slate-100">
                        {recentRows.map((row) => (
                            <li key={row.id} className="px-6 py-3 flex justify-between gap-4 text-sm">
                                <span className="text-slate-600 truncate">{row.description}</span>
                                <span className="text-slate-500 shrink-0">{formatDate(row.date)}</span>
                                <span className="font-mono text-slate-800 shrink-0">
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
