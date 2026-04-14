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
    ArrowDownToLine,
    ShieldCheck,
    FileMinus,
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
    onReceiveRent: () => void;
    onReceiveSecurity: () => void;
    onDeductCharges: () => void;
}

const RentalPropertySummaryCardInner: React.FC<RentalPropertySummaryCardProps> = ({
    unit,
    className,
    style,
    plainWhiteBackground = false,
    onReceiveRent,
    onReceiveSecurity,
    onDeductCharges,
}) => {
    const rentContractFmt = useMemo(() => formatCompactK(unit.monthlyRent), [unit.monthlyRent]);
    const secContractFmt = useMemo(() => formatCompactK(unit.securityDepositAmount), [unit.securityDepositAmount]);
    const rentRecvFmt = useMemo(() => formatCompactK(unit.receivable), [unit.receivable]);
    const secRecvFmt = useMemo(() => formatCompactK(unit.securityDue), [unit.securityDue]);
    const svcFmt = useMemo(() => formatCompactK(unit.monthlyServiceCharge), [unit.monthlyServiceCharge]);

    const expiryLabel = useMemo(() => {
        if (unit.daysUntilExpiry === null) return '—';
        if (unit.daysUntilExpiry < 0) return `${Math.abs(unit.daysUntilExpiry)}d`;
        return `${unit.daysUntilExpiry}d`;
    }, [unit.daysUntilExpiry]);

    const expiryClass =
        unit.daysUntilExpiry === null
            ? 'text-app-muted'
            : unit.daysUntilExpiry < 0
              ? 'text-ds-danger'
              : unit.daysUntilExpiry <= 30
                ? 'text-ds-warning'
                : 'text-app-muted';

    /** Pulse clock when agreement ends within 30 days or already expired (active agreement only) */
    const expiryBlink =
        unit.agreementEndDate != null &&
        unit.daysUntilExpiry !== null &&
        ((unit.daysUntilExpiry > 0 && unit.daysUntilExpiry <= 30) || unit.daysUntilExpiry < 0);

    const agreementDateDisplay = unit.agreementStartDate
        ? formatDate(unit.agreementStartDate.split('T')[0])
        : '—';

    const showPaidWatermark =
        unit.status === 'Occupied' && (unit.receivable ?? 0) <= 0.01 && (unit.securityDue ?? 0) <= 0.01;

    return (
        <div
            className={`relative rounded-xl border shadow-sm p-1.5 flex flex-col min-h-[12rem] transition-all ${plainWhiteBackground ? 'bg-white' : ''} ${className}`}
            style={plainWhiteBackground ? undefined : style}
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
                                className={`w-3 h-3 flex-shrink-0 ${expiryBlink ? 'animate-pulse text-ds-warning' : 'text-app-muted'}`}
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
                </div>

                {/* Bottom-left: receivables */}
                <div className="flex flex-col gap-0.5 min-w-0 border-r border-app-border/60 pr-1 pt-0.5">
                    <div className="flex items-center justify-between gap-0.5" title="Rental receivable">
                        <Wallet className="w-3 h-3 flex-shrink-0 text-app-muted" aria-hidden />
                        <span className="text-[9px] font-bold text-slate-900 tabular-nums truncate">{rentRecvFmt}</span>
                    </div>
                    <div className="flex items-center justify-between gap-0.5" title="Security receivable">
                        <Shield className="w-3 h-3 flex-shrink-0 text-app-muted" aria-hidden />
                        <span className="text-[9px] font-bold text-slate-900 tabular-nums truncate">{secRecvFmt}</span>
                    </div>
                    <div className="flex items-center justify-between gap-0.5" title="Monthly service charge">
                        <Settings className="w-3 h-3 flex-shrink-0 text-app-muted" aria-hidden />
                        <span className="text-[9px] font-bold text-slate-900 tabular-nums truncate">{svcFmt}</span>
                    </div>
                </div>

                {/* Bottom-right: actions */}
                <div className="flex flex-col items-stretch justify-center gap-0.5 pl-1 pt-0.5 min-w-0">
                    <button
                        type="button"
                        title="Receive rent — unpaid rental invoices"
                        aria-label="Receive rent"
                        disabled={!unit.hasUnpaidRental}
                        onClick={e => {
                            e.stopPropagation();
                            onReceiveRent();
                        }}
                        className={`inline-flex items-center justify-center rounded-md border p-1 disabled:opacity-40 disabled:pointer-events-none ${
                            unit.hasUnpaidRental
                                ? 'border-red-300 bg-red-100 hover:bg-red-200'
                                : 'border-app-border bg-app-toolbar/50 hover:bg-app-toolbar'
                        }`}
                    >
                        <ArrowDownToLine className="w-3.5 h-3.5 text-slate-800" aria-hidden />
                    </button>
                    <button
                        type="button"
                        title="Receive security — unpaid security deposit invoices"
                        aria-label="Receive security deposit"
                        disabled={!unit.hasUnpaidSecurity}
                        onClick={e => {
                            e.stopPropagation();
                            onReceiveSecurity();
                        }}
                        className={`inline-flex items-center justify-center rounded-md border p-1 disabled:opacity-40 disabled:pointer-events-none ${
                            unit.hasUnpaidSecurity
                                ? 'border-red-300 bg-red-100 hover:bg-red-200'
                                : 'border-app-border bg-app-toolbar/50 hover:bg-app-toolbar'
                        }`}
                    >
                        <ShieldCheck className="w-3.5 h-3.5 text-slate-800" aria-hidden />
                    </button>
                    <button
                        type="button"
                        title="Deduct service charges (manual)"
                        aria-label="Deduct service charges"
                        disabled={!unit.canDeductServiceCharges}
                        onClick={e => {
                            e.stopPropagation();
                            onDeductCharges();
                        }}
                        className={`inline-flex items-center justify-center rounded-md border p-1 disabled:opacity-40 disabled:pointer-events-none ${
                            unit.canDeductServiceCharges
                                ? 'border-red-300 bg-red-100 hover:bg-red-200'
                                : 'border-app-border bg-app-toolbar/50 hover:bg-app-toolbar'
                        }`}
                    >
                        <FileMinus className="w-3.5 h-3.5 text-slate-800" aria-hidden />
                    </button>
                </div>
            </div>
        </div>
    );
};

const RentalPropertySummaryCard = React.memo(RentalPropertySummaryCardInner);

export default RentalPropertySummaryCard;
