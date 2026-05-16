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
    'relative overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-700/80 bg-white/90 dark:bg-slate-900/60 shadow-sm shadow-slate-200/40 dark:shadow-black/20 p-4 transition-all duration-200 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600';

export const ProfitabilityKpiStrip: React.FC<KpiStripProps> = ({ summary, isFetching }) => {
    const s = summary;
    const items = [
        {
            label: 'Total revenue',
            value: formatCompactMoney(s.totalRevenue),
            sub: 'P&L income (inception → as of)',
            icon: TrendingUp,
            accent: 'from-emerald-500/20 to-transparent',
            iconWrap: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        },
        {
            label: 'Total expense',
            value: formatCompactMoney(s.totalExpense),
            sub: 'Accrued + posted costs',
            icon: Scale,
            accent: 'from-rose-500/15 to-transparent',
            iconWrap: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
        },
        {
            label: 'Net profit',
            value: formatCompactMoney(s.netProfit),
            sub: 'Revenue − expense',
            icon: Gem,
            accent: 'from-indigo-500/15 to-transparent',
            iconWrap: s.netProfit >= 0 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
        },
        {
            label: 'Adjusted profit',
            value: formatCompactMoney(s.adjustedProfit),
            sub: 'Incl. unsold inventory value',
            icon: Activity,
            accent: 'from-violet-500/15 to-transparent',
            iconWrap: s.adjustedProfit >= 0 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
        },
        {
            label: 'ROI %',
            value: formatRoi(s.roiPctAggregate),
            sub: 'On aggregate investor capital',
            icon: Target,
            accent: 'from-sky-500/15 to-transparent',
            iconWrap: (s.roiPctAggregate ?? 0) >= 0 ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400' : 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
        },
        {
            label: 'Active projects',
            value: String(s.activeProjects),
            sub: 'Not completed',
            icon: Building2,
            accent: 'from-slate-500/10 to-transparent',
            iconWrap: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
        },
        {
            label: 'Profitable',
            value: String(s.profitableProjects),
            sub: 'Net profit > 0',
            icon: ArrowUpRight,
            accent: 'from-emerald-500/15 to-transparent',
            iconWrap: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        },
        {
            label: 'Loss projects',
            value: String(s.lossProjects),
            sub: 'Net profit < 0',
            icon: ArrowDownRight,
            accent: 'from-rose-500/15 to-transparent',
            iconWrap: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
        },
        {
            label: 'Unsold inventory',
            value: formatCompactMoney(s.totalUnsoldInventoryValue),
            sub: 'Units × market price',
            icon: Warehouse,
            accent: 'from-amber-500/15 to-transparent',
            iconWrap: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
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
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{it.label}</p>
                            <p className="mt-1.5 text-xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-slate-50">{it.value}</p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-snug">{it.sub}</p>
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
