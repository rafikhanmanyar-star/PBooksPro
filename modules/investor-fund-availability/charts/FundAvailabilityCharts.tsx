import React, { useMemo } from 'react';
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    ComposedChart,
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
import type { FundAvailabilityRow } from '../types/fundAvailability.types';
import { useChartTheme } from '../../../components/analytics/chartTheme';
import { formatCompactMoney } from '../utils/financialFormat';

const COL = {
    equity: '#6366f1',
    cash: '#10b981',
    dist: '#0ea5e9',
    inflow: '#22c55e',
    outflow: '#f43f5e',
    net: '#a855f7',
    withdraw: '#fb7185',
};

function ChartTooltip({
    active,
    payload,
    label,
}: {
    active?: boolean;
    payload?: { value: number; name: string; color?: string }[];
    label?: string;
}) {
    const theme = useChartTheme();
    if (!active || !payload?.length) return null;
    return (
        <div
            className="rounded-lg border px-3 py-2 text-xs shadow-lg"
            style={{
                borderColor: theme.tooltipBorder,
                backgroundColor: theme.tooltipBg,
                color: theme.tooltipText,
            }}
        >
            {label != null && <div className="font-semibold mb-1">{label}</div>}
            {payload.map((p) => (
                <div key={p.name} className="tabular-nums flex justify-between gap-4">
                    <span style={{ color: p.color }}>{p.name}</span>
                    <span>{formatCompactMoney(Number(p.value))}</span>
                </div>
            ))}
        </div>
    );
}

function EmptyChart({ label }: { label: string }) {
    return (
        <div className="flex h-64 min-h-[256px] items-center justify-center rounded-ds-lg border border-dashed border-app-border bg-app-surface-2 text-ds-body text-app-muted px-6 text-center">
            {label}
        </div>
    );
}

export const EquityVsCashChart: React.FC<{ rows: FundAvailabilityRow[] }> = ({ rows }) => {
    const theme = useChartTheme();
    const data = useMemo(() => {
        const sorted = [...rows].sort((a, b) => b.investorEquity - a.investorEquity).slice(0, 12);
        return sorted.map((r) => ({
            name: r.projectName.length > 16 ? `${r.projectName.slice(0, 14)}…` : r.projectName,
            Equity: Math.max(0, r.investorEquity),
            'Available cash': Math.max(0, r.availableCash),
        }));
    }, [rows]);
    if (data.length === 0) return <EmptyChart label="No projects to compare book equity vs liquid cash." />;
    return (
        <div className="h-72 w-full min-h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 32 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: theme.tick, fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={52} />
                    <YAxis tick={{ fill: theme.tick, fontSize: 11 }} tickFormatter={(v) => formatCompactMoney(Number(v))} width={76} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend />
                    <Bar dataKey="Equity" fill={COL.equity} radius={[4, 4, 0, 0]} maxBarSize={36} />
                    <Bar dataKey="Available cash" fill={COL.cash} radius={[4, 4, 0, 0]} maxBarSize={36} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export const MonthlyDistributableChart: React.FC<{
    points: { label: string; distributable: number }[];
}> = ({ points }) => {
    const theme = useChartTheme();
    if (!points.length) return <EmptyChart label="No distribution trend for this range." />;
    return (
        <div className="h-64 w-full min-h-[256px]">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="distFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={COL.dist} stopOpacity={0.35} />
                            <stop offset="100%" stopColor={COL.dist} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
                    <XAxis dataKey="label" tick={{ fill: theme.tick, fontSize: 11 }} />
                    <YAxis tick={{ fill: theme.tick, fontSize: 11 }} tickFormatter={(v) => formatCompactMoney(Number(v))} width={76} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="distributable" name="Distributable" stroke={COL.dist} fill="url(#distFill)" strokeWidth={2} />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
};

export const CashFlowTrendChart: React.FC<{
    points: { label: string; inflow: number; outflow: number; net: number }[];
}> = ({ points }) => {
    const theme = useChartTheme();
    if (!points.length) return <EmptyChart label="No cash movement in this window." />;
    return (
        <div className="h-64 w-full min-h-[256px]">
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
                    <XAxis dataKey="label" tick={{ fill: theme.tick, fontSize: 11 }} />
                    <YAxis tick={{ fill: theme.tick, fontSize: 11 }} tickFormatter={(v) => formatCompactMoney(Number(v))} width={76} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend />
                    <Bar dataKey="inflow" name="Inflow" fill={COL.inflow} radius={[3, 3, 0, 0]} maxBarSize={28} />
                    <Bar dataKey="outflow" name="Outflow" fill={COL.outflow} radius={[3, 3, 0, 0]} maxBarSize={28} />
                    <Line type="monotone" dataKey="net" name="Net" stroke={COL.net} strokeWidth={2} dot={false} />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
};

export const LiquidityHealthDonut: React.FC<{ rows: FundAvailabilityRow[] }> = ({ rows }) => {
    const theme = useChartTheme();
    const data = useMemo(() => {
        let h = 0,
            w = 0,
            b = 0,
            o = 0;
        for (const r of rows) {
            if (r.fundHealth === 'Healthy') h++;
            else if (r.fundHealth === 'Warning') w++;
            else if (r.fundHealth === 'Blocked') b++;
            else o++;
        }
        const out = [
            { name: 'Healthy', value: h, color: '#10b981' },
            { name: 'Warning', value: w, color: '#f59e0b' },
            { name: 'Blocked', value: b, color: '#ef4444' },
            { name: 'Overdrawn', value: o, color: '#fb7185' },
        ].filter((x) => x.value > 0);
        return out;
    }, [rows]);
    if (!data.length) return <EmptyChart label="No fund health breakdown yet." />;
    return (
        <div className="h-64 w-full min-h-[256px] flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie data={data} dataKey="value" nameKey="name" innerRadius={56} outerRadius={86} paddingAngle={2}>
                        {data.map((e, i) => (
                            <Cell key={i} fill={e.color} />
                        ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                    <Legend />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
};

export const WithdrawalHistoryChart: React.FC<{
    points: { label: string; amount: number }[];
}> = ({ points }) => {
    const theme = useChartTheme();
    const any = points.some((p) => p.amount > 0);
    if (!any) return <EmptyChart label="No investor withdrawals recorded in this period." />;
    return (
        <div className="h-64 w-full min-h-[256px]">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
                    <XAxis dataKey="label" tick={{ fill: theme.tick, fontSize: 11 }} />
                    <YAxis tick={{ fill: theme.tick, fontSize: 11 }} tickFormatter={(v) => formatCompactMoney(Number(v))} width={76} />
                    <Tooltip content={<ChartTooltip />} />
                    <Line type="monotone" dataKey="amount" name="Withdrawals" stroke={COL.withdraw} strokeWidth={2} dot />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};
