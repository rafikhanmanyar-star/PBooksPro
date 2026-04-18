import React, { useMemo } from 'react';
import {
    X,
    FileMinus,
    FileText,
    ArrowDownToLine,
    Wallet,
    MapPin,
    Calendar,
    Banknote,
    TrendingUp,
    ChevronRight,
    Shield,
    Users,
    User,
} from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import {
    Contact,
    TransactionType,
    InvoiceType,
    InvoiceStatus,
    RentalAgreementStatus,
} from '../../types';
import { CURRENCY } from '../../constants';
import { formatDate, currentMonthYyyyMm } from '../../utils/dateUtils';

interface PropertyQuickManagementPanelProps {
    isOpen: boolean;
    onClose: () => void;
    propertyId: string;
    onDeductCharges: (propertyId: string) => void;
    onCreateInvoice: (propertyId: string) => void;
    onReceivePayment: (propertyId: string, propertyName: string) => void;
    onPayoutToOwner: (
        owner: Contact,
        balanceDue: number,
        payoutType: 'Rent' | 'Security',
        breakdown: { propertyId: string; propertyName: string; balanceDue: number }[]
    ) => void;
    onPayoutToBroker: (broker: Contact, balanceDue: number) => void;
    onPayoutSecurity: (
        owner: Contact,
        balanceDue: number,
        breakdown: { propertyId: string; propertyName: string; balanceDue: number }[]
    ) => void;
}

const PropertyQuickManagementPanel: React.FC<PropertyQuickManagementPanelProps> = ({
    isOpen,
    onClose,
    propertyId,
    onDeductCharges,
    onCreateInvoice,
    onReceivePayment,
    onPayoutToOwner,
    onPayoutToBroker,
    onPayoutSecurity,
}) => {
    const { state } = useAppContext();

    const property = useMemo(
        () => state.properties.find(p => p.id === propertyId),
        [propertyId, state.properties]
    );

    const building = useMemo(
        () => (property ? state.buildings.find(b => b.id === property.buildingId) : null),
        [property, state.buildings]
    );

    const activeAgreement = useMemo(
        () =>
            state.rentalAgreements.find(
                ra => ra.propertyId === propertyId && ra.status === RentalAgreementStatus.ACTIVE
            ),
        [propertyId, state.rentalAgreements]
    );

    const tenant = useMemo(
        () => (activeAgreement ? state.contacts.find(c => c.id === activeAgreement.contactId) : null),
        [activeAgreement, state.contacts]
    );

    const owner = useMemo(() => {
        const ownerId = activeAgreement?.ownerId || property?.ownerId;
        return ownerId ? state.contacts.find(c => c.id === ownerId) : null;
    }, [activeAgreement, property, state.contacts]);

    const broker = useMemo(
        () => (activeAgreement?.brokerId ? state.contacts.find(c => c.id === activeAgreement.brokerId) : null),
        [activeAgreement, state.contacts]
    );

    const financials = useMemo(() => {
        const propertyInvoices = state.invoices.filter(inv => inv.propertyId === propertyId);

        const totalCollected = propertyInvoices.reduce((sum, inv) => sum + (inv.paidAmount || 0), 0);

        const securityInvoices = propertyInvoices.filter(
            inv => inv.invoiceType === InvoiceType.SECURITY_DEPOSIT
        );
        const securityDeposit = securityInvoices.reduce((sum, inv) => sum + (inv.paidAmount || 0), 0);

        const unpaidBalance = propertyInvoices
            .filter(inv => inv.status !== InvoiceStatus.PAID)
            .reduce((sum, inv) => sum + Math.max(0, inv.amount - (inv.paidAmount || 0)), 0);

        const propIncome = state.transactions
            .filter(tx => tx.propertyId === propertyId && tx.type === TransactionType.INCOME)
            .reduce((sum, tx) => sum + tx.amount, 0);
        const propExpense = state.transactions
            .filter(tx => tx.propertyId === propertyId && tx.type === TransactionType.EXPENSE)
            .reduce((sum, tx) => sum + tx.amount, 0);
        const payoutDue = Math.max(0, propIncome - propExpense);

        const svcIncomeCategory = state.categories.find(
            c => c.id === 'sys-cat-svc-inc' || c.name === 'Service Charge Income'
        );
        const today = new Date();
        const monthPrefix = currentMonthYyyyMm(today);
        const serviceChargeDeductedThisMonth =
            !!svcIncomeCategory &&
            state.transactions.some(
                tx =>
                    tx.propertyId === propertyId &&
                    tx.categoryId === svcIncomeCategory.id &&
                    tx.date.startsWith(monthPrefix)
            );
        const monthlyServiceCharge = property?.monthlyServiceCharge || 0;
        const canDeductServiceCharges = !serviceChargeDeductedThisMonth && monthlyServiceCharge > 0;

        const hasUnpaidRental = propertyInvoices.some(
            inv =>
                inv.invoiceType === InvoiceType.RENTAL &&
                inv.status !== InvoiceStatus.PAID &&
                inv.status !== InvoiceStatus.DRAFT &&
                inv.amount - (inv.paidAmount || 0) > 0.01
        );

        const monthlyRent = activeAgreement?.monthlyRent ?? 0;
        const annualYield = monthlyRent > 0 && totalCollected > 0
            ? ((monthlyRent * 12) / (totalCollected || 1) * 100)
            : 0;

        return {
            totalCollected,
            securityDeposit,
            unpaidBalance,
            payoutDue,
            canDeductServiceCharges,
            hasUnpaidRental,
            monthlyRent,
            annualYield: annualYield > 0 ? annualYield.toFixed(1) : '0',
            monthlyServiceCharge,
        };
    }, [propertyId, state.invoices, state.transactions, state.categories, property, activeAgreement]);

    const recentTransactions = useMemo(() => {
        const txs = state.transactions
            .filter(tx => tx.propertyId === propertyId)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 10);

        return txs.map(tx => {
            const contact = state.contacts.find(c => c.id === tx.contactId);
            const category = state.categories.find(c => c.id === tx.categoryId);
            const invoice = tx.invoiceId ? state.invoices.find(i => i.id === tx.invoiceId) : null;

            let label = tx.description || category?.name || 'Transaction';
            let categoryLabel = category?.name || '—';
            let statusLabel = 'COMPLETED';
            let statusClass = 'text-ds-success';

            if (invoice) {
                const isSecDep = invoice.invoiceType === InvoiceType.SECURITY_DEPOSIT
                    || (invoice.securityDepositCharge || 0) >= invoice.amount
                    || (invoice.description || '').toLowerCase().includes('security');
                if (isSecDep) {
                    categoryLabel = 'DEPOSIT';
                } else {
                    categoryLabel = 'RENT';
                }
                statusLabel = invoice.status === InvoiceStatus.PAID ? 'COMPLETED' : 'HELD';
                statusClass = invoice.status === InvoiceStatus.PAID ? 'text-ds-success' : 'text-ds-warning';
            } else if (category?.name?.toLowerCase().includes('service charge')) {
                categoryLabel = 'EXPENSE';
                statusLabel = 'DEDUCTED';
                statusClass = 'text-ds-danger';
            } else if (tx.type === TransactionType.EXPENSE) {
                categoryLabel = 'EXPENSE';
                statusLabel = 'DEDUCTED';
                statusClass = 'text-ds-danger';
            }

            return {
                id: tx.id,
                date: tx.date,
                label,
                contactName: contact?.name || '—',
                categoryLabel,
                amount: tx.type === TransactionType.EXPENSE ? -tx.amount : tx.amount,
                statusLabel,
                statusClass,
            };
        });
    }, [propertyId, state.transactions, state.contacts, state.categories, state.invoices]);

    const agreementDuration = useMemo(() => {
        if (!activeAgreement) return '—';
        const start = new Date(activeAgreement.startDate);
        const end = new Date(activeAgreement.endDate);
        const months = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30));
        return `${months} Months`;
    }, [activeAgreement]);

    const handlePayoutToOwner = (type: 'Rent' | 'Security') => {
        if (!owner) return;

        const propIncome = state.transactions
            .filter(tx => tx.propertyId === propertyId && tx.type === TransactionType.INCOME)
            .reduce((sum, tx) => sum + tx.amount, 0);
        const propExpense = state.transactions
            .filter(tx => tx.propertyId === propertyId && tx.type === TransactionType.EXPENSE)
            .reduce((sum, tx) => sum + tx.amount, 0);
        const balance = Math.max(0, propIncome - propExpense);

        const breakdown = [
            {
                propertyId: propertyId,
                propertyName: property?.name || 'Unknown',
                balanceDue: balance,
            },
        ];

        if (type === 'Security') {
            onPayoutSecurity(owner, balance, breakdown);
        } else {
            onPayoutToOwner(owner, balance, 'Rent', breakdown);
        }
    };

    if (!isOpen || !property) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-stretch justify-center bg-black/30" onClick={onClose}>
            <div
                className="relative w-full max-w-2xl mx-4 my-6 bg-app-card rounded-2xl shadow-xl flex flex-col overflow-hidden animate-fade-in"
                onClick={e => e.stopPropagation()}
            >
                {/* Close button */}
                <button
                    type="button"
                    onClick={onClose}
                    title="Close panel"
                    aria-label="Close property management panel"
                    className="absolute top-4 right-4 z-10 p-1.5 rounded-full bg-app-toolbar/80 hover:bg-app-toolbar text-app-muted hover:text-app-text transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>

                <div className="flex-1 overflow-y-auto">
                    {/* Top Section: Property Hero + Financial Summary */}
                    <div className="p-6 pb-4">
                        <div className="flex gap-6">
                            {/* Left: Property Info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                        activeAgreement ? 'bg-[color:var(--badge-paid-bg)] text-ds-success border border-ds-success/30' : 'bg-app-toolbar text-app-muted border border-app-border'
                                    }`}>
                                        {activeAgreement ? 'OCCUPIED' : 'VACANT'}
                                    </span>
                                </div>

                                <div className="mt-3">
                                    <span className="text-[10px] uppercase font-bold text-app-muted tracking-wider">Unit Reference</span>
                                    <h2 className="text-xl font-bold text-app-text">{property.name}</h2>
                                    <div className="flex items-center gap-1 text-xs text-app-muted mt-0.5">
                                        <MapPin className="w-3 h-3" />
                                        <span>{building?.name || 'Unknown Building'}</span>
                                    </div>
                                </div>

                                {activeAgreement && (
                                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-4 text-xs">
                                        <div>
                                            <span className="text-[10px] uppercase font-bold text-app-muted tracking-wider">Tenant</span>
                                            <div className="font-semibold text-app-text flex items-center gap-1">
                                                <Users className="w-3 h-3 text-app-muted" />
                                                {tenant?.name || '—'}
                                            </div>
                                        </div>
                                        <div>
                                            <span className="text-[10px] uppercase font-bold text-app-muted tracking-wider">Lease Date</span>
                                            <div className="font-semibold text-app-text flex items-center gap-1">
                                                <Calendar className="w-3 h-3 text-app-muted" />
                                                {formatDate(activeAgreement.startDate)}
                                            </div>
                                        </div>
                                        <div>
                                            <span className="text-[10px] uppercase font-bold text-app-muted tracking-wider">Owner</span>
                                            <div className="font-semibold text-app-text flex items-center gap-1">
                                                <User className="w-3 h-3 text-app-muted" />
                                                {owner?.name || '—'}
                                            </div>
                                        </div>
                                        <div>
                                            <span className="text-[10px] uppercase font-bold text-app-muted tracking-wider">Contract</span>
                                            <div className="font-semibold text-app-text">{agreementDuration}</div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Right: Financial Summary Cards */}
                            <div className="flex-shrink-0 space-y-2 w-52">
                                <div className="bg-app-toolbar/50 border border-app-border rounded-xl p-3 text-center">
                                    <span className="text-[10px] uppercase font-bold text-app-muted tracking-wider block">Total Collected</span>
                                    <span className="text-lg font-bold text-app-text tabular-nums">
                                        {financials.totalCollected.toLocaleString()}
                                    </span>
                                    <span className="text-[10px] text-app-muted ml-1">{CURRENCY}</span>
                                </div>
                                <div className="bg-app-toolbar/50 border border-app-border rounded-xl p-3 text-center">
                                    <span className="text-[10px] uppercase font-bold text-app-muted tracking-wider block">Security Deposit</span>
                                    <span className="text-lg font-bold text-app-text tabular-nums">
                                        {financials.securityDeposit.toLocaleString()}
                                    </span>
                                    <span className="text-[10px] text-app-muted ml-1">{CURRENCY}</span>
                                </div>
                                <div className={`rounded-xl p-3 text-center border ${
                                    financials.unpaidBalance > 0
                                        ? 'bg-[color:var(--badge-unpaid-bg)] border-ds-danger/20'
                                        : 'bg-[color:var(--badge-paid-bg)] border-ds-success/20'
                                }`}>
                                    <span className="text-[10px] uppercase font-bold text-app-muted tracking-wider block">Unpaid Balance</span>
                                    <span className={`text-xl font-bold tabular-nums ${financials.unpaidBalance > 0 ? 'text-ds-danger' : 'text-ds-success'}`}>
                                        {financials.unpaidBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                    <span className="text-[10px] text-app-muted ml-1">{CURRENCY}</span>
                                    {financials.unpaidBalance <= 0.01 && (
                                        <div className="mt-1">
                                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-[color:var(--badge-paid-bg)] text-ds-success border border-ds-success/30 uppercase tracking-wider">
                                                All Cleared
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Monthly Rent & Annual Yield Row */}
                        {activeAgreement && (
                            <div className="flex gap-3 mt-4">
                                <div className="flex-1 bg-app-toolbar/40 border border-app-border rounded-xl p-3 flex items-center gap-3">
                                    <Banknote className="w-5 h-5 text-app-muted" />
                                    <div>
                                        <span className="text-[10px] uppercase font-bold text-app-muted tracking-wider block">Monthly Rent</span>
                                        <span className="text-sm font-bold text-app-text tabular-nums">{financials.monthlyRent.toLocaleString()}</span>
                                    </div>
                                </div>
                                <div className="flex-1 bg-app-toolbar/40 border border-app-border rounded-xl p-3 flex items-center gap-3">
                                    <TrendingUp className="w-5 h-5 text-app-muted" />
                                    <div>
                                        <span className="text-[10px] uppercase font-bold text-app-muted tracking-wider block">Annual Yield</span>
                                        <span className="text-sm font-bold text-app-text tabular-nums">{financials.annualYield}%</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Quick Management Actions */}
                    <div className="px-6 pb-4">
                        <h3 className="text-xs font-bold text-app-muted uppercase tracking-wider mb-3">Quick Management</h3>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => onDeductCharges(propertyId)}
                                disabled={!financials.canDeductServiceCharges}
                                className="flex items-center gap-3 p-3 rounded-xl border border-app-border bg-app-card hover:bg-app-toolbar/50 transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed group"
                            >
                                <div className="w-8 h-8 rounded-lg bg-app-toolbar flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10 transition-colors">
                                    <FileMinus className="w-4 h-4 text-app-text" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <span className="text-xs font-semibold text-app-text block">Deduct Charges</span>
                                    <span className="text-[10px] text-app-muted">Monthly service charges</span>
                                </div>
                                <ChevronRight className="w-4 h-4 text-app-muted flex-shrink-0" />
                            </button>

                            <button
                                type="button"
                                onClick={() => onCreateInvoice(propertyId)}
                                disabled={!activeAgreement}
                                className="flex items-center gap-3 p-3 rounded-xl border border-app-border bg-app-card hover:bg-app-toolbar/50 transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed group"
                            >
                                <div className="w-8 h-8 rounded-lg bg-app-toolbar flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10 transition-colors">
                                    <FileText className="w-4 h-4 text-app-text" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <span className="text-xs font-semibold text-app-text block">Create Invoice</span>
                                    <span className="text-[10px] text-app-muted">New rental invoice</span>
                                </div>
                                <ChevronRight className="w-4 h-4 text-app-muted flex-shrink-0" />
                            </button>

                            <button
                                type="button"
                                onClick={() => onReceivePayment(propertyId, property?.name || '')}
                                disabled={!financials.hasUnpaidRental}
                                className="flex items-center gap-3 p-3 rounded-xl border border-app-border bg-app-card hover:bg-app-toolbar/50 transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed group"
                            >
                                <div className="w-8 h-8 rounded-lg bg-app-toolbar flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10 transition-colors">
                                    <ArrowDownToLine className="w-4 h-4 text-app-text" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <span className="text-xs font-semibold text-app-text block">Receive Unpaid</span>
                                    <span className="text-[10px] text-app-muted">Record tenant payment</span>
                                </div>
                                <ChevronRight className="w-4 h-4 text-app-muted flex-shrink-0" />
                            </button>

                            <button
                                type="button"
                                onClick={() => handlePayoutToOwner('Rent')}
                                disabled={!owner || financials.payoutDue <= 0}
                                className="flex items-center gap-3 p-3 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed disabled:border-app-border disabled:bg-app-card group"
                            >
                                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                                    <Wallet className="w-4 h-4 text-primary" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <span className="text-xs font-semibold text-app-text block">Payout to Owner</span>
                                    <span className="text-[10px] text-app-muted">Owner / Broker / Security</span>
                                </div>
                                <ChevronRight className="w-4 h-4 text-app-muted flex-shrink-0" />
                            </button>
                        </div>

                        {/* Sub-payout options row when owner payout is available */}
                        {owner && financials.payoutDue > 0 && (
                            <div className="flex gap-2 mt-2 ml-11">
                                {broker && (
                                    <button
                                        type="button"
                                        onClick={() => onPayoutToBroker(broker, 0)}
                                        className="px-3 py-1.5 text-[10px] font-medium text-primary bg-primary/5 hover:bg-primary/10 border border-primary/20 rounded-lg transition-colors"
                                    >
                                        Pay Broker ({broker.name})
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => handlePayoutToOwner('Security')}
                                    className="px-3 py-1.5 text-[10px] font-medium text-primary bg-primary/5 hover:bg-primary/10 border border-primary/20 rounded-lg transition-colors"
                                >
                                    <Shield className="w-3 h-3 inline mr-1" />
                                    Return Security
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Recent Transactions */}
                    <div className="px-6 pb-6">
                        <div className="flex items-center justify-between mb-3">
                            <div>
                                <h3 className="text-sm font-bold text-app-text">Recent Transactions</h3>
                                <span className="text-[10px] text-app-muted">Historical ledger of property financials</span>
                            </div>
                        </div>

                        {recentTransactions.length > 0 ? (
                            <div className="border border-app-border rounded-xl overflow-hidden">
                                {/* Table Header */}
                                <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-app-toolbar/50 border-b border-app-border text-[10px] font-bold uppercase text-app-muted tracking-wider">
                                    <div className="col-span-2">Transaction ID</div>
                                    <div className="col-span-3">Description</div>
                                    <div className="col-span-2">Category</div>
                                    <div className="col-span-2">Date</div>
                                    <div className="col-span-1">Status</div>
                                    <div className="col-span-2 text-right">Amount</div>
                                </div>
                                {/* Transaction Rows */}
                                {recentTransactions.map(tx => (
                                    <div
                                        key={tx.id}
                                        className="grid grid-cols-12 gap-2 px-3 py-2.5 border-b border-app-border last:border-b-0 hover:bg-app-toolbar/30 transition-colors text-xs"
                                    >
                                        <div className="col-span-2 font-mono text-[10px] text-app-muted truncate" title={tx.id}>
                                            #TXN-{tx.id.slice(-5).toUpperCase()}
                                        </div>
                                        <div className="col-span-3 min-w-0">
                                            <div className="font-medium text-app-text truncate" title={tx.label}>{tx.label}</div>
                                            <div className="text-[10px] text-app-muted truncate">{tx.contactName}</div>
                                        </div>
                                        <div className="col-span-2">
                                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                                                tx.categoryLabel === 'RENT' ? 'bg-primary/10 text-primary' :
                                                tx.categoryLabel === 'DEPOSIT' ? 'bg-app-toolbar text-app-muted border border-app-border' :
                                                'bg-ds-danger/10 text-ds-danger'
                                            }`}>
                                                {tx.categoryLabel}
                                            </span>
                                        </div>
                                        <div className="col-span-2 text-app-muted tabular-nums">
                                            {formatDate(tx.date)}
                                        </div>
                                        <div className="col-span-1">
                                            <span className={`text-[10px] font-semibold ${tx.statusClass}`}>
                                                {tx.statusLabel}
                                            </span>
                                        </div>
                                        <div className={`col-span-2 text-right font-bold tabular-nums ${tx.amount >= 0 ? 'text-ds-success' : 'text-ds-danger'}`}>
                                            {tx.amount >= 0 ? '+' : ''}{CURRENCY} {Math.abs(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-8 text-app-muted text-sm border border-app-border rounded-xl bg-app-toolbar/20">
                                No transactions recorded for this property yet.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PropertyQuickManagementPanel;
