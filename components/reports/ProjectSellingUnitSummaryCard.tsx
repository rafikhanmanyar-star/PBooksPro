import React, { useMemo } from 'react';
import {
    Home,
    User,
    Calendar,
    Banknote,
    Wallet,
    HandCoins,
} from 'lucide-react';
import { formatDate } from '../../utils/dateUtils';

function formatCompactK(n: number): string {
    if (n <= 0 || Number.isNaN(n)) return '0';
    if (n >= 1000) {
        const k = n / 1000;
        const s = k >= 100 ? k.toFixed(0) : k.toFixed(1).replace(/\.0$/, '');
        return `${s}k`;
    }
    return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

/** Data for project selling visual layout card (2×2 quadrants, aligned with rental visual cards). */
export interface ProjectSellingUnitCardModel {
    id: string;
    name: string;
    type: string;
    clientName: string;
    status: 'Sold' | 'Available';
    listPrice: number;
    sellingPrice: number;
    agreementIssueDate: string | null;
    invoiceDue: number;
    brokerRebateDue: number;
    totalReceived: number;
}

export interface ProjectSellingUnitSummaryCardProps {
    unit: ProjectSellingUnitCardModel;
    className: string;
    style?: React.CSSProperties;
    onClick?: () => void;
}

const ProjectSellingUnitSummaryCardInner: React.FC<ProjectSellingUnitSummaryCardProps> = ({
    unit,
    className,
    style,
    onClick,
}) => {
    const listFmt = useMemo(() => formatCompactK(unit.listPrice), [unit.listPrice]);
    const sellFmt = useMemo(() => formatCompactK(unit.sellingPrice), [unit.sellingPrice]);
    const invDueFmt = useMemo(() => formatCompactK(unit.invoiceDue), [unit.invoiceDue]);
    const brkDueFmt = useMemo(() => formatCompactK(unit.brokerRebateDue), [unit.brokerRebateDue]);
    const recvFmt = useMemo(() => formatCompactK(unit.totalReceived), [unit.totalReceived]);

    const issueDisplay = unit.agreementIssueDate
        ? formatDate(unit.agreementIssueDate.split('T')[0])
        : '—';

    const showPaidWatermark =
        unit.status === 'Sold' &&
        (unit.invoiceDue ?? 0) <= 0.01 &&
        (unit.brokerRebateDue ?? 0) <= 0.01 &&
        (unit.totalReceived + unit.invoiceDue) > 0.01;

    return (
        <div
            className={`relative rounded-xl border-2 shadow-sm p-1.5 flex flex-col min-h-[12rem] transition-all cursor-pointer hover:shadow-md hover:ring-2 hover:ring-primary/30 ${className}`}
            style={style}
            onClick={onClick}
            role="button"
            tabIndex={0}
            onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') onClick?.();
            }}
        >
            {showPaidWatermark && (
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 opacity-20 pointer-events-none select-none z-0">
                    <div className="border-4 border-ds-success text-ds-success font-black text-2xl px-2 py-1 rounded rotate-[-15deg] tracking-widest">
                        PAID
                    </div>
                </div>
            )}

            <div className="relative z-10 grid grid-cols-2 grid-rows-2 gap-1 flex-1 min-h-0 min-w-0">
                {/* Top-left: unit & buyer */}
                <div className="flex flex-col gap-0.5 min-w-0 border-r border-b border-app-border/60 pr-1 pb-1">
                    <div className="flex items-center gap-0.5 min-w-0" title="Unit">
                        <Home className="w-3 h-3 flex-shrink-0 text-app-muted" aria-hidden />
                        <span className="truncate font-bold text-[10px] text-app-text">{unit.name}</span>
                    </div>
                    <div className="text-[8px] font-semibold text-app-muted uppercase tracking-tight">{unit.type}</div>
                    <div className="flex items-center gap-0.5 min-w-0" title="Buyer / client">
                        <User className="w-3 h-3 flex-shrink-0 text-app-muted" aria-hidden />
                        <span
                            className={`truncate text-[9px] ${
                                unit.status === 'Available' ? 'text-app-muted italic' : 'text-app-text'
                            }`}
                        >
                            {unit.clientName}
                        </span>
                    </div>
                    <div className="flex items-center gap-0.5 min-w-0" title="Agreement issue date">
                        <Calendar className="w-3 h-3 flex-shrink-0 text-app-muted" aria-hidden />
                        <span className="truncate text-[9px] text-app-text tabular-nums">{issueDisplay}</span>
                    </div>
                </div>

                {/* Top-right: agreement figures */}
                <div className="flex flex-col gap-0.5 min-w-0 border-b border-app-border/60 pl-1 pb-1">
                    <div
                        className="flex items-center justify-between gap-0.5"
                        title="List price (agreement)"
                    >
                        <span className="text-[8px] text-app-muted uppercase shrink-0">List</span>
                        <span className="text-[9px] font-bold text-slate-900 dark:text-slate-100 tabular-nums truncate">
                            {listFmt}
                        </span>
                    </div>
                    <div
                        className="flex items-center justify-between gap-0.5"
                        title="Selling price (agreement)"
                    >
                        <Banknote className="w-3 h-3 flex-shrink-0 text-app-muted" aria-hidden />
                        <span className="text-[9px] font-bold text-slate-900 dark:text-slate-100 tabular-nums truncate">
                            {sellFmt}
                        </span>
                    </div>
                    {unit.status === 'Sold' && (
                        <div className="flex items-center justify-end mt-auto">
                            <span className="inline-block w-2 h-2 rounded-full bg-ds-success flex-shrink-0" title="Sold" />
                        </div>
                    )}
                </div>

                {/* Bottom-left: invoice due + broker/rebate due */}
                <div className="flex flex-col gap-0.5 min-w-0 border-r border-app-border/60 pr-1 pt-0.5">
                    <div className="flex items-center justify-between gap-0.5" title="Invoices amount due">
                        <Wallet className="w-3 h-3 flex-shrink-0 text-app-muted" aria-hidden />
                        <span
                            className={`text-[9px] font-bold tabular-nums truncate ${
                                (unit.invoiceDue ?? 0) > 0.01 ? 'text-ds-danger' : 'text-slate-900 dark:text-slate-100'
                            }`}
                        >
                            {invDueFmt}
                        </span>
                    </div>
                    <div className="flex items-center justify-between gap-0.5" title="Rebate / broker due (project agreement)">
                        <HandCoins className="w-3 h-3 flex-shrink-0 text-app-muted" aria-hidden />
                        <span
                            className={`text-[9px] font-bold tabular-nums truncate ${
                                (unit.brokerRebateDue ?? 0) > 0.01 ? 'text-ds-danger' : 'text-slate-900 dark:text-slate-100'
                            }`}
                        >
                            {brkDueFmt}
                        </span>
                    </div>
                </div>

                {/* Bottom-right: total received + status */}
                <div className="flex flex-col gap-0.5 min-w-0 pl-1 pt-0.5 h-full">
                    <div className="flex items-center justify-between gap-0.5" title="Total amount received">
                        <span className="text-[8px] text-app-muted uppercase shrink-0">Recv</span>
                        <span className="text-[9px] font-bold text-ds-success tabular-nums truncate">{recvFmt}</span>
                    </div>
                    <div className="flex items-center justify-center mt-auto">
                        <span
                            className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${
                                unit.status === 'Sold'
                                    ? 'border-ds-success/30 bg-[color:var(--badge-paid-bg)] text-ds-success'
                                    : 'border-app-border bg-app-toolbar text-app-muted'
                            }`}
                        >
                            {unit.status}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

const ProjectSellingUnitSummaryCard = React.memo(ProjectSellingUnitSummaryCardInner);

export default ProjectSellingUnitSummaryCard;
