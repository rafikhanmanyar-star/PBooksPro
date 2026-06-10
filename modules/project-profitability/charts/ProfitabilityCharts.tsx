import React, { useMemo } from 'react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Line,
    LineChart,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import type { CollectionTrendPoint, MonthlyProfitPoint, ProjectProfitabilityRow } from '../types/profitability.types';
import { formatCompactMoney } from '../utils/financialFormat';

const CHART_COLORS = {
    revenue: '#10b981',
    expense: '#f43f5e',
    profit: '#6366f1',
    muted: '#94a3b8',
    donut: ['#10b981', '#f43f5e', '#f59e0b', '#3b82f6'],
};

function useDarkChart() {
    return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
}

function ChartTooltip({ active, payload, label, dark }: { active?: boolean; payload?: { value: number; name: string; color?: string }[]; label?: string; dark: boolean }) {
    if (!active || !payload?.length) return null;
    return (
        <div
            className={`rounded-lg border px-3 py-2 text-xs shadow-lg ${dark ? 'border-slate-600 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-800'}`}
        >
            {label != null && <div className="font-semibold mb-1">{label}</div>}
            {payload.map((p) => (
                <div key={p.name} className="tabular-nums flex justify-between gap-4">
                    <span style={{ color: p.color }}>{p.name}</span>
                    <span>{formatCompactMoney(p.value)}</span>
                </div>
            ))}
        </div>
    );
}

export const RevenueVsExpenseChart: React.FC<{ rows: ProjectProfitabilityRow[] }> = ({ rows }) => {
    const dark = useDarkChart();
    const data = useMemo(() => {
        const sorted = [...rows].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
        return sorted.map((r) => ({
            name: r.projectName.length > 18 ? `${r.projectName.slice(0, 16)}…` : r.projectName,
            Revenue: r.revenue,
            Expense: r.expense,
        }));
    }, [rows]);
    if (data.length === 0) return <EmptyChart label="Add project activity to see revenue vs expense." />;
    return (
        <div className="h-72 w-full min-h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 32 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={dark ? '#334155' : '#e2e8f0'} vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: dark ? '#94a3b8' : '#64748b', fontSize: 11 }} interval={0} angle={-18} textAnchor="end" height={56} />
                    <YAxis tick={{ fill: dark ? '#94a3b8' : '#64748b', fontSize: 11 }} tickFormatter={(v) => formatCompactMoney(Number(v))} width={72} />
                    <Tooltip content={<ChartTooltip dark={dark} />} />
                    <Legend />
                    <Bar dataKey="Revenue" stackId="a" fill={CHART_COLORS.revenue} radius={[4, 4, 0, 0]} maxBarSize={48} />
                    <Bar dataKey="Expense" stackId="a" fill={CHART_COLORS.expense} radius={[4, 4, 0, 0]} maxBarSize={48} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export const MonthlyProfitTrendChart: React.FC<{ points: MonthlyProfitPoint[] }> = ({ points }) => {
    const dark = useDarkChart();
    if (!points.length) return <EmptyChart label="No monthly trend for this period." />;
    return (
        <div className="h-64 w-full min-h-[256px]">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={dark ? '#334155' : '#e2e8f0'} />
                    <XAxis dataKey="label" tick={{ fill: dark ? '#94a3b8' : '#64748b', fontSize: 11 }} />
                    <YAxis tick={{ fill: dark ? '#94a3b8' : '#64748b', fontSize: 11 }} tickFormatter={(v) => formatCompactMoney(Number(v))} width={72} />
                    <Tooltip content={<ChartTooltip dark={dark} />} />
                    <Legend />
                    <Line type="monotone" dataKey="revenue" name="Revenue" stroke={CHART_COLORS.revenue} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="expense" name="Expense" stroke={CHART_COLORS.expense} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="netProfit" name="Net profit" stroke={CHART_COLORS.profit} strokeWidth={2} dot={false} />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};

export const TopProfitableProjectsChart: React.FC<{ rows: ProjectProfitabilityRow[] }> = ({ rows }) => {
    const dark = useDarkChart();
    const data = useMemo(() => {
        return [...rows]
            .sort((a, b) => b.netProfit - a.netProfit)
            .slice(0, 8)
            .map((r) => ({
                name: r.projectName.length > 22 ? `${r.projectName.slice(0, 20)}…` : r.projectName,
                net: r.netProfit,
            }));
    }, [rows]);
    if (!data.length) return <EmptyChart label="No profitability ranking yet." />;
    return (
        <div className="h-64 w-full min-h-[256px]">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={dark ? '#334155' : '#e2e8f0'} horizontal={false} />
                    <XAxis type="number" tick={{ fill: dark ? '#94a3b8' : '#64748b', fontSize: 11 }} tickFormatter={(v) => formatCompactMoney(Number(v))} />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fill: dark ? '#94a3b8' : '#64748b', fontSize: 10 }} />
                    <Tooltip content={<ChartTooltip dark={dark} />} />
                    <Bar dataKey="net" name="Net profit" radius={[0, 6, 6, 0]} maxBarSize={22}>
                        {data.map((entry) => (
                            <Cell key={entry.name} fill={entry.net >= 0 ? CHART_COLORS.revenue : CHART_COLORS.expense} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export const ProjectStatusDonutChart: React.FC<{ rows: ProjectProfitabilityRow[] }> = ({ rows }) => {
    const dark = useDarkChart();
    const data = useMemo(() => {
        const m: Record<string, number> = {};
        for (const r of rows) {
            m[r.rowStatus] = (m[r.rowStatus] || 0) + 1;
        }
        return Object.entries(m).map(([name, value]) => ({ name, value }));
    }, [rows]);
    if (!data.length) return <EmptyChart label="No projects in view." />;
    return (
        <div className="h-64 w-full min-h-[256px] flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={56} outerRadius={88} paddingAngle={2}>
                        {data.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS.donut[i % CHART_COLORS.donut.length]} />
                        ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip dark={dark} />} />
                    <Legend verticalAlign="bottom" height={28} />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
};

export const RoiComparisonChart: React.FC<{ rows: ProjectProfitabilityRow[] }> = ({ rows }) => {
    const dark = useDarkChart();
    const data = useMemo(() => {
        return [...rows]
            .filter((r) => r.roiPct != null && Number.isFinite(r.roiPct))
            .sort((a, b) => (b.roiPct ?? 0) - (a.roiPct ?? 0))
            .slice(0, 10)
            .map((r) => ({
                name: r.projectName.length > 14 ? `${r.projectName.slice(0, 12)}…` : r.projectName,
                roi: r.roiPct ?? 0,
            }));
    }, [rows]);
    if (!data.length) return <EmptyChart label="ROI compares net profit to investor capital (needs positive capital)." />;
    return (
        <div className="h-64 w-full min-h-[256px]">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={dark ? '#334155' : '#e2e8f0'} vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: dark ? '#94a3b8' : '#64748b', fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={48} />
                    <YAxis tick={{ fill: dark ? '#94a3b8' : '#64748b', fontSize: 11 }} tickFormatter={(v) => `${v}%`} width={48} />
                    <Tooltip content={<ChartTooltip dark={dark} />} formatter={(v: number) => [`${v.toFixed(1)}%`, 'ROI']} />
                    <Bar dataKey="roi" name="ROI %" fill={CHART_COLORS.profit} radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export const CollectionTrendChart: React.FC<{ points: CollectionTrendPoint[] }> = ({ points }) => {
    const dark = useDarkChart();
    if (!points.length) return <EmptyChart label="No collection activity in this period." />;
    return (
        <div className="h-64 w-full min-h-[256px]">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={dark ? '#334155' : '#e2e8f0'} vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: dark ? '#94a3b8' : '#64748b', fontSize: 11 }} />
                    <YAxis tick={{ fill: dark ? '#94a3b8' : '#64748b', fontSize: 11 }} tickFormatter={(v) => formatCompactMoney(Number(v))} width={72} />
                    <Tooltip content={<ChartTooltip dark={dark} />} />
                    <Legend />
                    <Bar dataKey="invoiced" name="Invoiced" fill={CHART_COLORS.muted} radius={[4, 4, 0, 0]} maxBarSize={32} />
                    <Bar dataKey="collected" name="Collected" fill={CHART_COLORS.revenue} radius={[4, 4, 0, 0]} maxBarSize={32} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export const UnitStatusDonutChart: React.FC<{ rows: ProjectProfitabilityRow[] }> = ({ rows }) => {
    const dark = useDarkChart();
    const sold = rows.reduce((s, r) => s + r.unitsSold, 0);
    const available = rows.reduce((s, r) => s + r.unitsRemaining, 0);
    const data = [
        { name: 'Sold', value: sold },
        { name: 'Available', value: available },
    ].filter((d) => d.value > 0);
    if (!data.length) return <EmptyChart label="No unit inventory in view." />;
    return (
        <div className="h-64 w-full min-h-[256px] flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={56} outerRadius={88} paddingAngle={2}>
                        {data.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS.donut[i % CHART_COLORS.donut.length]} />
                        ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip dark={dark} />} />
                    <Legend verticalAlign="bottom" height={28} />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
};

export const SalesTrendChart: React.FC<{ points: MonthlyProfitPoint[] }> = ({ points }) => {
    const dark = useDarkChart();
    if (!points.length) return <EmptyChart label="No sales trend for this period." />;
    return (
        <div className="h-64 w-full min-h-[256px]">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={dark ? '#334155' : '#e2e8f0'} />
                    <XAxis dataKey="label" tick={{ fill: dark ? '#94a3b8' : '#64748b', fontSize: 11 }} />
                    <YAxis tick={{ fill: dark ? '#94a3b8' : '#64748b', fontSize: 11 }} tickFormatter={(v) => formatCompactMoney(Number(v))} width={72} />
                    <Tooltip content={<ChartTooltip dark={dark} />} />
                    <Legend />
                    <Line type="monotone" dataKey="revenue" name="Sales (revenue)" stroke={CHART_COLORS.revenue} strokeWidth={2} dot={false} />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};

function EmptyChart({ label }: { label: string }) {
    return (
        <div className="h-64 flex items-center justify-center rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 text-sm text-slate-500 px-6 text-center">
            {label}
        </div>
    );
}
