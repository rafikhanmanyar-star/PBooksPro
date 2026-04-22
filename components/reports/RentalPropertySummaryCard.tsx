import React, { useMemo } from 'react';
import {
    Home,
    User,
    Users,
    Calendar,
    Clock,
    Banknote,
    Lock,
    Wallet,
    Shield,
    Settings,
    HandCoins,
} from 'lucide-react';
import { formatDate } from '../../utils/dateUtils';

export interface VisualLayoutPropertyBox {
    id: string;
    name: string;
    ownerName: string;
    tenantName: string;
    receivable: number;
    payoutDue: number;
    securityDue: number;
    lastUpdated: string;
    agreementEndDate: string | null;
    daysUntilExpiry: number | null;
    floorIndex: number;
    floorLabel: string;
    unitIndex: number;
    status: 'Occupied' | 'Vacant';
    type: string;
    isExpiringSoon: boolean;
    isCurrentMonthRentPaid: boolean;
    monthlyRent: number;
    securityDepositAmount: number;
    agreementStartDate: string | null;
    monthlyServiceCharge: number;
    serviceChargeDeductedThisMonth: boolean;
    hasUnpaidRental: boolean;
    hasUnpaidSecurity: boolean;
    canDeductServiceCharges: boolean;
    brokerPayoutPending: number;
}

function formatCompactK(n: number): string {
    if (n <= 0 || Number.isNaN(n)) return '0';
    if (n >= 1000) {
        const k = n / 1000;
        const s = k >= 100 ? k.toFixed(0) : k.toFixed(1).replace(/\.0$/, '');
        return `${s}k`;
    }
    return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export interface RentalPropertySummaryCardProps {
    unit: VisualLayoutPropertyBox;
    className: string;
    style?: React.CSSProperties;
    /** Vacant unit with no receivable and no owner/account payout due — solid white card */
    plainWhiteBackground?: boolean;
    onClick?: () => void;
}

const RentalPropertySummaryCardInner: React.FC<RentalPropertySummaryCardProps> = ({
    unit,
    className,
    style,
    plainWhiteBackground = false,
    onClick,
}) => {
    const rentContractFmt = useMemo(() => formatCompactK(unit.monthlyRent), [unit.monthlyRent]);
    const secContractFmt = useMemo(() => formatCompactK(unit.securityDepositAmount), [unit.securityDepositAmount]);
    const rentRecvFmt = useMemo(() => formatCompactK(unit.receivable), [unit.receivable]);
    const secRecvFmt = useMemo(() => formatCompactK(unit.securityDue), [unit.securityDue]);
    const svcFmt = useMemo(() => formatCompactK(unit.monthlyServiceCharge), [unit.monthlyServiceCharge]);
    const svcDueThisMonth = useMemo(() => {
        if (unit.serviceChargeDeductedThisMonth) return 0;
        return Math.max(0, unit.monthlyServiceCharge || 0);
    }, [unit.monthlyServiceCharge, unit.serviceChargeDeductedThisMonth]);
    const svcDueFmt = useMemo(() => formatCompactK(svcDueThisMonth), [svcDueThisMonth]);

    /** Coerce so API/SQLite never leaves string values that break `> 30` comparisons. */
    const daysRemaining = useMemo(() => {
        if (unit.daysUntilExpiry === null || unit.daysUntilExpiry === undefined) return null;
        const n = Number(unit.daysUntilExpiry);
        return Number.isFinite(n) ? n : null;
    }, [unit.daysUntilExpiry]);

    const expiryLabel = useMemo(() => {
        if (daysRemaining === null) return '—';
        if (daysRemaining < 0) return `${Math.abs(daysRemaining)}d`;
        return `${daysRemaining}d`;
    }, [daysRemaining]);

    /** Green when more than 30 calendar days left; red when 30 or fewer (including expired). */
    const expiryClass =
        daysRemaining === null
            ? 'text-app-muted'
            : daysRemaining > 30
              ? 'text-ds-success'
              : 'text-ds-danger';

    /** Blink only when strictly under 30 days remain (not when exactly 30). */
    const expiryBlink =
        unit.agreementEndDate != null && daysRemaining !== null && daysRemaining < 30;

    const agreementDateDisplay = unit.agreementStartDate
        ? formatDate(unit.agreementStartDate.split('T')[0])
        : '—';

    const showPaidWatermark =
        unit.status === 'Occupied' &&
        (unit.receivable ?? 0) <= 0.01 &&
        (unit.securityDue ?? 0) <= 0.01 &&
        svcDueThisMonth <= 0.01 &&
        (unit.brokerPayoutPending ?? 0) <= 0.01;

    return (
        <div
            className={`relative rounded-xl border shadow-sm p-1.5 flex flex-col min-h-[12rem] transition-all cursor-pointer hover:shadow-md hover:ring-2 hover:ring-primary/30 ${plainWhiteBackground ? 'bg-white' : ''} ${className}`}
            style={plainWhiteBackground ? undefined : style}
            onClick={onClick}
            role="button"
            tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onClick?.(); }}
        >
            {showPaidWatermark && (
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 opacity-20 pointer-events-none select-none z-0">
                    <div className="border-4 border-ds-success text-ds-success font-black text-2xl px-2 py-1 rounded rotate-[-15deg] tracking-widest">
                        PAID
                    </div>
                </div>
            )}

            <div className="relative z-10 grid grid-cols-2 grid-rows-2 gap-1 flex-1 min-h-0 min-w-0">
                {/* Top-left: property info */}
                <div className="flex flex-col gap-0.5 min-w-0 border-r border-b border-app-border/60 pr-1 pb-1">
                    <div className="flex items-center gap-0.5 min-w-0" title="Property / unit">
                        <Home className="w-3 h-3 flex-shrink-0 text-app-muted" aria-hidden />
                        <span className="truncate font-bold text-[10px] text-app-text">{unit.name}</span>
                    </div>
                    <div className="flex items-center gap-0.5 min-w-0" title="Owner">
                        <User className="w-3 h-3 flex-shrink-0 text-app-muted" aria-hidden />
                        <span className="truncate text-[9px] text-app-text">{unit.ownerName}</span>
                    </div>
                    <div className="flex items-center gap-0.5 min-w-0" title="Tenant">
                        <Users className="w-3 h-3 flex-shrink-0 text-app-muted" aria-hidden />
                        <span
                            className={`truncate text-[9px] font-medium ${
                                unit.status === 'Vacant' ? 'text-ds-danger' : 'text-slate-800'
                            }`}
                        >
                            {unit.tenantName}
                        </span>
                    </div>
                    <div className="flex items-center gap-0.5 min-w-0" title="Agreement start date">
                        <Calendar className="w-3 h-3 flex-shrink-0 text-app-muted" aria-hidden />
                        <span className="truncate text-[9px] text-app-text tabular-nums">{agreementDateDisplay}</span>
                    </div>
                </div>

                {/* Top-right: status + contract amounts */}
                <div className="flex flex-col gap-0.5 min-w-0 border-b border-app-border/60 pl-1 pb-1">
                    <div className="flex items-center justify-between gap-1" title={unit.status === 'Occupied' ? 'Rented' : 'Vacant'}>
                        <span className="sr-only">Rental status</span>
                        <span
                            className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                                unit.status === 'Occupied' ? 'bg-ds-success' : 'bg-ds-danger'
                            }`}
                            aria-hidden
                        />
                        <span className="flex items-center gap-0.5 min-w-0 justify-end flex-1">
                            <Clock
                                className={`w-3 h-3 flex-shrink-0 ${expiryBlink ? 'animate-pulse' : ''} ${daysRemaining !== null ? expiryClass : 'text-app-muted'}`}
                                aria-hidden
                            />
                            <span
                                className={`text-[9px] font-semibold tabular-nums truncate ${expiryClass}`}
                                title="Days until agreement ends"
                            >
                                {expiryLabel}
                            </span>
                        </span>
                    </div>
                    <div className="flex items-center justify-between gap-0.5" title="Monthly rent (agreement)">
                        <Banknote className="w-3 h-3 flex-shrink-0 text-app-muted" aria-hidden />
                        <span className="text-[9px] font-bold text-slate-900 tabular-nums truncate">{rentContractFmt}</span>
                    </div>
                    <div className="flex items-center justify-between gap-0.5" title="Security deposit (agreement)">
                        <Lock className="w-3 h-3 flex-shrink-0 text-app-muted" aria-hidden />
                        <span className="text-[9px] font-bold text-slate-900 tabular-nums truncate">{secContractFmt}</span>
                    </div>
                    <div className="flex items-center justify-between gap-0.5" title="Monthly service charge (property setting)">
                        <Settings className="w-3 h-3 flex-shrink-0 text-app-muted" aria-hidden />
                        <span className="text-[9px] font-bold text-slate-900 tabular-nums truncate">{svcFmt}</span>
                    </div>
                </div>

                {/* Bottom-left: receivables */}
                <div className="flex flex-col gap-0.5 min-w-0 border-r border-app-border/60 pr-1 pt-0.5">
                    <div className="flex items-center justify-between gap-0.5" title="Rental amount due">
                        <Wallet className="w-3 h-3 flex-shrink-0 text-app-muted" aria-hidden />
                        <span
                            className={`text-[9px] font-bold tabular-nums truncate ${
                                (unit.receivable ?? 0) > 0.01 ? 'text-ds-danger' : 'text-slate-900'
                            }`}
                        >
                            {rentRecvFmt}
                        </span>
                    </div>
                    <div className="flex items-center justify-between gap-0.5" title="Security amount due">
                        <Shield className="w-3 h-3 flex-shrink-0 text-app-muted" aria-hidden />
                        <span
                            className={`text-[9px] font-bold tabular-nums truncate ${
                                (unit.securityDue ?? 0) > 0.01 ? 'text-ds-danger' : 'text-slate-900'
                            }`}
                        >
                            {secRecvFmt}
                        </span>
                    </div>
                    <div
                        className="flex items-center justify-between gap-0.5"
                        title="Monthly service charges due (current month, after deductions)"
                    >
                        <Settings className="w-3 h-3 flex-shrink-0 text-app-muted" aria-hidden />
                        <span
                            className={`text-[9px] font-bold tabular-nums truncate ${
                                svcDueThisMonth > 0.01 ? 'text-ds-danger' : 'text-slate-900'
                            }`}
                        >
                            {svcDueFmt}
                        </span>
                    </div>
                </div>

                {/* Bottom-right: payout due */}
                <div className="flex flex-col gap-0.5 min-w-0 pl-1 pt-0.5 h-full">
                    <div className="flex items-center justify-between gap-0.5" title="Payout due to owner">
                        <Banknote className="w-3 h-3 flex-shrink-0 text-app-muted" aria-hidden />
                        <span className={`text-[9px] font-bold tabular-nums truncate ${unit.payoutDue > 0 ? 'text-ds-warning' : 'text-slate-900'}`}>
                            {formatCompactK(unit.payoutDue)}
                        </span>
                    </div>
                    {(unit.brokerPayoutPending ?? 0) > 0.01 && (
                        <div className="flex items-center justify-between gap-0.5" title="Payout due to broker (unpaid)">
                            <HandCoins className="w-3 h-3 flex-shrink-0 text-app-muted" aria-hidden />
                            <span className="text-[9px] font-bold text-ds-danger tabular-nums truncate">
                                {formatCompactK(unit.brokerPayoutPending)}
                            </span>
                        </div>
                    )}
                    <div className="flex items-center justify-center mt-auto">
                        <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${
                            unit.status === 'Occupied' ? 'border-ds-success/30 bg-[color:var(--badge-paid-bg)] text-ds-success' : 'border-app-border bg-app-toolbar text-app-muted'
                        }`}>
                            {unit.status}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

const RentalPropertySummaryCard = React.memo(RentalPropertySummaryCardInner);

export default RentalPropertySummaryCard;
