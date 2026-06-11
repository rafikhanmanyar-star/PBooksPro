import React from 'react';
import { motion } from 'framer-motion';
import {
    Banknote,
    Building2,
    CircleDollarSign,
    Home,
    Package,
    Receipt,
    TrendingUp,
} from 'lucide-react';
import type { PortfolioProfitabilitySummary } from '../types/profitability.types';
import { formatCompactMoney } from '../utils/financialFormat';

interface Props {
    summary: PortfolioProfitabilitySummary;
    isFetching: boolean;
}

const cardBase =
    'relative overflow-hidden rounded-2xl border border-app-border bg-app-card shadow-ds-card p-4 transition-all duration-200 hover:shadow-ds-modal';

export const ProjectSummaryKpiStrip: React.FC<Props> = ({ summary, isFetching }) => {
    const s = summary;
    const items = [
        { label: 'Total project value', value: formatCompactMoney(s.totalProjectValue), sub: 'Revenue + unsold inventory', icon: CircleDollarSign, wrap: 'bg-app-highlight text-ds-primary' },
        { label: 'Total units', value: String(s.totalUnits), sub: 'Across filtered projects', icon: Building2, wrap: 'bg-app-surface-2 text-app-muted' },
        { label: 'Sold units', value: String(s.soldUnits), sub: 'Units marked sold', icon: Home, wrap: 'bg-app-highlight text-ds-success' },
        { label: 'Available units', value: String(s.availableUnits), sub: 'Remaining inventory', icon: Package, wrap: 'bg-app-highlight text-ds-warning' },
        { label: 'Receivables', value: formatCompactMoney(s.totalReceivable), sub: 'Outstanding on invoices', icon: Receipt, wrap: 'bg-app-highlight text-ds-danger' },
        { label: 'Collections', value: formatCompactMoney(s.totalCollections), sub: 'Cash received on invoices', icon: Banknote, wrap: 'bg-app-highlight text-ds-primary' },
        { label: 'Profitability', value: formatCompactMoney(s.netProfit), sub: 'Net profit (portfolio)', icon: TrendingUp, wrap: s.netProfit >= 0 ? 'bg-app-highlight text-ds-success' : 'bg-app-highlight text-ds-danger' },
    ];

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7 gap-3">
            {items.map((it, idx) => (
                <motion.div
                    key={it.label}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.025 }}
                    className={`${cardBase} ${isFetching ? 'opacity-70' : ''}`}
                >
                    <div className="flex items-start justify-between gap-2">
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-app-muted">{it.label}</p>
                            <p className="mt-1.5 text-lg font-bold tabular-nums text-app-text">{it.value}</p>
                            <p className="mt-1 text-[11px] text-app-muted">{it.sub}</p>
                        </div>
                        <div className={`rounded-xl p-2 ${it.wrap}`}>
                            <it.icon className="h-4 w-4" strokeWidth={1.75} />
                        </div>
                    </div>
                </motion.div>
            ))}
        </div>
    );
};
