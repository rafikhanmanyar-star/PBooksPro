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
    'relative overflow-hidden rounded-2xl border border-app-border bg-app-card shadow-ds-card p-4 transition-all duration-200 hover:shadow-ds-modal hover:border-app-border';

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
            iconWrap: 'bg-app-highlight text-ds-primary',
        },
        {
            label: 'Available cash',
            value: formatCompactMoney(s.totals.availableCash),
            sub: 'Project-scoped liquid balances',
            icon: Banknote,
            accent: 'from-emerald-500/15 to-transparent',
            iconWrap: 'bg-app-highlight text-ds-success',
        },
        {
            label: 'Distributable funds',
            value: formatCompactMoney(s.totals.distributableFunds),
            sub: 'Cash − reserves − payables',
            icon: Wallet,
            accent: 'from-sky-500/15 to-transparent',
            iconWrap: 'bg-app-highlight text-ds-primary',
        },
        {
            label: 'Total withdrawn',
            value: formatCompactMoney(s.totals.totalWithdrawn),
            sub: 'Cash returned to investors',
            icon: TrendingDown,
            accent: 'from-rose-500/10 to-transparent',
            iconWrap: 'bg-app-highlight text-ds-danger',
        },
        {
            label: 'Reserved (ops)',
            value: formatCompactMoney(s.totals.reservedFunds),
            sub: 'Policy holdback on liquidity',
            icon: PiggyBank,
            accent: 'from-amber-500/10 to-transparent',
            iconWrap: 'bg-app-highlight text-ds-warning',
        },
        {
            label: 'Pending payables',
            value: formatCompactMoney(s.totals.pendingPayables),
            sub: 'Protected before distributions',
            icon: ShieldAlert,
            accent: 'from-orange-500/10 to-transparent',
            iconWrap: 'bg-app-highlight text-ds-warning',
        },
        {
            label: 'Healthy projects',
            value: String(s.healthyProjects),
            sub: 'Adequate distributable liquidity',
            icon: CircleDollarSign,
            accent: 'from-emerald-500/10 to-transparent',
            iconWrap: 'bg-app-highlight text-ds-success',
        },
        {
            label: 'Warning',
            value: String(s.warningProjects),
            sub: 'Tight liquidity vs equity',
            icon: AlertTriangle,
            accent: 'from-amber-500/10 to-transparent',
            iconWrap: 'bg-app-highlight text-ds-warning',
        },
        {
            label: 'Blocked / overdrawn',
            value: String(s.blockedProjects + s.overdrawnProjects),
            sub: 'No / unsafe payout',
            icon: AlertTriangle,
            accent: 'from-red-500/10 to-transparent',
            iconWrap: 'bg-app-highlight text-ds-danger',
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
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-app-muted">{it.label}</p>
                            <p className="mt-1 text-lg font-bold tabular-nums text-app-text">{it.value}</p>
                            <p className="mt-0.5 text-[11px] text-app-muted leading-snug">{it.sub}</p>
                        </div>
                    </div>
                </motion.div>
            ))}
        </div>
    );
};
