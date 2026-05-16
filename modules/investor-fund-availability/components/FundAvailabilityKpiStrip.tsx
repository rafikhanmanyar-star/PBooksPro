import React from 'react';
import { motion } from 'framer-motion';
import {
    AlertTriangle,
    Banknote,
    CircleDollarSign,
    PiggyBank,
    Scale,
    ShieldAlert,
    TrendingDown,
    Wallet,
} from 'lucide-react';
import type { FundAvailabilitySummary } from '../types/fundAvailability.types';
import { formatCompactMoney } from '../utils/financialFormat';

const cardBase =
    'relative overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-700/80 bg-white/90 dark:bg-slate-900/60 shadow-sm shadow-slate-200/40 dark:shadow-black/20 p-4 transition-all duration-200 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600';

export const FundAvailabilityKpiStrip: React.FC<{
    summary: FundAvailabilitySummary;
    isFetching: boolean;
}> = ({ summary, isFetching }) => {
    const s = summary;
    const items = [
        {
            label: 'Total investor equity',
            value: formatCompactMoney(s.totals.investorEquity),
            sub: 'Capital + allocated profit − withdrawals',
            icon: Scale,
            accent: 'from-indigo-500/15 to-transparent',
            iconWrap: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
        },
        {
            label: 'Available cash',
            value: formatCompactMoney(s.totals.availableCash),
            sub: 'Project-scoped liquid balances',
            icon: Banknote,
            accent: 'from-emerald-500/15 to-transparent',
            iconWrap: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        },
        {
            label: 'Distributable funds',
            value: formatCompactMoney(s.totals.distributableFunds),
            sub: 'Cash − reserves − payables',
            icon: Wallet,
            accent: 'from-sky-500/15 to-transparent',
            iconWrap: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
        },
        {
            label: 'Total withdrawn',
            value: formatCompactMoney(s.totals.totalWithdrawn),
            sub: 'Cash returned to investors',
            icon: TrendingDown,
            accent: 'from-rose-500/10 to-transparent',
            iconWrap: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
        },
        {
            label: 'Reserved (ops)',
            value: formatCompactMoney(s.totals.reservedFunds),
            sub: 'Policy holdback on liquidity',
            icon: PiggyBank,
            accent: 'from-amber-500/10 to-transparent',
            iconWrap: 'bg-amber-500/10 text-amber-800 dark:text-amber-400',
        },
        {
            label: 'Pending payables',
            value: formatCompactMoney(s.totals.pendingPayables),
            sub: 'Protected before distributions',
            icon: ShieldAlert,
            accent: 'from-orange-500/10 to-transparent',
            iconWrap: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
        },
        {
            label: 'Healthy projects',
            value: String(s.healthyProjects),
            sub: 'Adequate distributable liquidity',
            icon: CircleDollarSign,
            accent: 'from-emerald-500/10 to-transparent',
            iconWrap: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        },
        {
            label: 'Warning',
            value: String(s.warningProjects),
            sub: 'Tight liquidity vs equity',
            icon: AlertTriangle,
            accent: 'from-amber-500/10 to-transparent',
            iconWrap: 'bg-amber-500/10 text-amber-800 dark:text-amber-400',
        },
        {
            label: 'Blocked / overdrawn',
            value: String(s.blockedProjects + s.overdrawnProjects),
            sub: 'No / unsafe payout',
            icon: AlertTriangle,
            accent: 'from-red-500/10 to-transparent',
            iconWrap: 'bg-red-500/10 text-red-600 dark:text-red-400',
        },
    ];

    return (
        <div className={`grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3 ${isFetching ? 'opacity-80' : ''}`}>
            {items.map((it, idx) => (
                <motion.div
                    key={it.label}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: idx * 0.03 }}
                    className={cardBase}
                >
                    <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${it.accent}`} />
                    <div className="relative flex items-start gap-3">
                        <div className={`rounded-xl p-2.5 ${it.iconWrap}`}>
                            <it.icon className="h-5 w-5" strokeWidth={2} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{it.label}</p>
                            <p className="mt-1 text-lg font-bold tabular-nums text-slate-900 dark:text-slate-50">{it.value}</p>
                            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 leading-snug">{it.sub}</p>
                        </div>
                    </div>
                </motion.div>
            ))}
        </div>
    );
};
