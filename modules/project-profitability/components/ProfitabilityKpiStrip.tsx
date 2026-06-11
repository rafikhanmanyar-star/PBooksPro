import React from 'react';
import { motion } from 'framer-motion';
import {
    Activity,
    ArrowDownRight,
    ArrowUpRight,
    Building2,
    Gem,
    Scale,
    Target,
    TrendingUp,
    Warehouse,
} from 'lucide-react';
import type { PortfolioProfitabilitySummary } from '../types/profitability.types';
import { formatCompactMoney, formatRoi } from '../utils/financialFormat';

interface KpiStripProps {
    summary: PortfolioProfitabilitySummary;
    isFetching: boolean;
}

const cardBase =
    'relative overflow-hidden rounded-2xl border border-app-border bg-app-card shadow-ds-card p-4 transition-all duration-200 hover:shadow-ds-modal hover:border-app-border';

export const ProfitabilityKpiStrip: React.FC<KpiStripProps> = ({ summary, isFetching }) => {
    const s = summary;
    const items = [
        {
            label: 'Total revenue',
            value: formatCompactMoney(s.totalRevenue),
            sub: 'P&L income (inception → as of)',
            icon: TrendingUp,
            accent: 'from-emerald-500/20 to-transparent',
            iconWrap: 'bg-app-highlight text-ds-success',
        },
        {
            label: 'Total expense',
            value: formatCompactMoney(s.totalExpense),
            sub: 'Accrued + posted costs',
            icon: Scale,
            accent: 'from-rose-500/15 to-transparent',
            iconWrap: 'bg-app-highlight text-ds-danger',
        },
        {
            label: 'Net profit',
            value: formatCompactMoney(s.netProfit),
            sub: 'Revenue − expense',
            icon: Gem,
            accent: 'from-indigo-500/15 to-transparent',
            iconWrap: s.netProfit >= 0 ? 'bg-app-highlight text-ds-success' : 'bg-app-highlight text-ds-danger',
        },
        {
            label: 'Adjusted profit',
            value: formatCompactMoney(s.adjustedProfit),
            sub: 'Incl. unsold inventory value',
            icon: Activity,
            accent: 'from-violet-500/15 to-transparent',
            iconWrap: s.adjustedProfit >= 0 ? 'bg-app-highlight text-ds-success' : 'bg-app-highlight text-ds-danger',
        },
        {
            label: 'ROI %',
            value: formatRoi(s.roiPctAggregate),
            sub: 'On aggregate investor capital',
            icon: Target,
            accent: 'from-sky-500/15 to-transparent',
            iconWrap: (s.roiPctAggregate ?? 0) >= 0 ? 'bg-app-highlight text-ds-primary' : 'bg-app-highlight text-app-muted',
        },
        {
            label: 'Active projects',
            value: String(s.activeProjects),
            sub: 'Not completed',
            icon: Building2,
            accent: 'from-slate-500/10 to-transparent',
            iconWrap: 'bg-app-highlight text-app-muted',
        },
        {
            label: 'Profitable',
            value: String(s.profitableProjects),
            sub: 'Net profit > 0',
            icon: ArrowUpRight,
            accent: 'from-emerald-500/15 to-transparent',
            iconWrap: 'bg-app-highlight text-ds-success',
        },
        {
            label: 'Loss projects',
            value: String(s.lossProjects),
            sub: 'Net profit < 0',
            icon: ArrowDownRight,
            accent: 'from-rose-500/15 to-transparent',
            iconWrap: 'bg-app-highlight text-ds-danger',
        },
        {
            label: 'Unsold inventory',
            value: formatCompactMoney(s.totalUnsoldInventoryValue),
            sub: 'Units × market price',
            icon: Warehouse,
            accent: 'from-amber-500/15 to-transparent',
            iconWrap: 'bg-app-highlight text-ds-warning',
        },
    ];

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
            {items.map((it, idx) => (
                <motion.div
                    key={it.label}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className={`${cardBase} ${isFetching ? 'opacity-70' : ''}`}
                >
                    <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${it.accent}`} />
                    <div className="relative flex items-start justify-between gap-2">
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-app-muted">{it.label}</p>
                            <p className="mt-1.5 text-xl font-bold tabular-nums tracking-tight text-app-text">{it.value}</p>
                            <p className="mt-1 text-xs text-app-muted leading-snug">{it.sub}</p>
                        </div>
                        <div className={`rounded-xl p-2.5 ${it.iconWrap}`}>
                            <it.icon className="h-5 w-5" strokeWidth={1.75} />
                        </div>
                    </div>
                </motion.div>
            ))}
        </div>
    );
};
