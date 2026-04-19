import React, { useMemo } from 'react';
import {
    X,
    FileText,
    Wallet,
    Calendar,
    Banknote,
    User,
    Minus,
    Building2,
    Handshake,
    ArrowLeft,
    Lock,
    Check,
} from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { usePrintContext } from '../../context/PrintContext';
import {
    Contact,
    TransactionType,
    InvoiceType,
    InvoiceStatus,
    RentalAgreementStatus,
} from '../../types';
import { CURRENCY } from '../../constants';
import { formatDate, currentMonthYyyyMm } from '../../utils/dateUtils';
import { resolveOwnerForPropertyOnDate } from '../../services/propertyOwnershipService';

function contactInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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
        breakdown: { propertyId: string; propertyName: string; balanceDue: number }[],
        tenant?: Contact | null,
        tenantUnpaidAmount?: number,
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
    const { state, dispatch } = useAppContext();
    const { print: triggerPrint } = usePrintContext();

    const property = useMemo(
        () => state.properties.find(p => p.id === propertyId),
        [propertyId, state.properties]
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

    const brokerPendingFee = useMemo(() => {
        if (!broker || !activeAgreement || !activeAgreement.brokerFee) return 0;
        if (activeAgreement.previousAgreementId) return 0;

        const brokerFeeCategory = state.categories.find(c => c.name === 'Broker Fee');
        const rebateCategory = state.categories.find(c => c.name === 'Rebate Amount');
        const feeCatId = brokerFeeCategory?.id;
        const rebateCatId = rebateCategory?.id;

        const paidAlready = state.transactions
            .filter(tx =>
                tx.type === TransactionType.EXPENSE &&
                tx.contactId === broker.id &&
                (tx.categoryId === feeCatId || tx.categoryId === rebateCatId) &&
                (tx.agreementId === activeAgreement.id || tx.propertyId === propertyId)
            )
            .reduce((sum, tx) => sum + tx.amount, 0);

        return Math.max(0, (activeAgreement.brokerFee || 0) - paidAlready);
    }, [broker, activeAgreement, propertyId, state.transactions, state.categories]);

    const financials = useMemo(() => {
        const propertyInvoices = state.invoices.filter(inv => inv.propertyId === propertyId);
        const propIdStr = String(propertyId);

        const totalCollected = state.transactions
            .filter(tx => tx.type === TransactionType.INCOME && String(tx.propertyId) === propIdStr)
            .reduce((sum, tx) => {
                const amt = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                return sum + (isNaN(amt) ? 0 : amt);
            }, 0);

        const secDepCategory = state.categories.find(c => c.name === 'Security Deposit');
        const secRefCategory = state.categories.find(c => c.name === 'Security Deposit Refund');
        const ownerSecPayoutCategory = state.categories.find(c => c.name === 'Owner Security Payout');

        let securityCollectedForStat = 0;
        let securityPaidForStat = 0;
        if (secDepCategory) {
            state.transactions
                .filter(tx => tx.type === TransactionType.INCOME && tx.categoryId === secDepCategory.id && String(tx.propertyId) === propIdStr)
                .forEach(tx => {
                    const amt = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                    if (!isNaN(amt) && amt > 0) securityCollectedForStat += amt;
                });
            state.transactions
                .filter(tx => tx.type === TransactionType.EXPENSE && String(tx.propertyId) === propIdStr)
                .forEach(tx => {
                    const amt = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                    if (isNaN(amt) || amt <= 0) return;
                    if (secRefCategory && tx.categoryId === secRefCategory.id) { securityPaidForStat += amt; return; }
                    if (ownerSecPayoutCategory && tx.categoryId === ownerSecPayoutCategory.id) { securityPaidForStat += amt; return; }
                    const category = state.categories.find(c => c.id === tx.categoryId);
                    if (category?.name?.includes('(Tenant)')) securityPaidForStat += amt;
                });
        }
        const securityDeposit = Math.max(0, securityCollectedForStat - securityPaidForStat);

        const unpaidBalance = propertyInvoices
            .filter(inv => inv.status !== InvoiceStatus.PAID && inv.status !== InvoiceStatus.DRAFT)
            .reduce((sum, inv) => sum + Math.max(0, inv.amount - (inv.paidAmount || 0)), 0);

        // --- Owner Rental Income (aligned with OwnerPayoutsReport / OwnerPayoutsPage) ---
        const rentalIncomeCategory = state.categories.find(c => c.name === 'Rental Income');
        const ownerPayoutCategory = state.categories.find(c => c.name === 'Owner Payout');
        const ownerSvcPayCategory = state.categories.find(c => c.name === 'Owner Service Charge Payment');
        const brokerFeeCategory = state.categories.find(c => c.name === 'Broker Fee');
        const ownerId = activeAgreement?.ownerId || property?.ownerId || '';

        const brokerFeeTxIds = new Set<string>();
        if (brokerFeeCategory) {
            state.transactions.forEach(tx => {
                if (tx.type === TransactionType.EXPENSE && tx.categoryId === brokerFeeCategory.id) brokerFeeTxIds.add(tx.id);
            });
        }
        const ownerBillIds = new Set(state.bills.filter(b => b.propertyId && !b.projectId).map(b => b.id));
        const billPaymentTxIds = new Set<string>();
        state.transactions.forEach(tx => {
            if (tx.type === TransactionType.EXPENSE && tx.billId && ownerBillIds.has(tx.billId)) billPaymentTxIds.add(tx.id);
        });

        let rentalCollected = 0;
        let rentalPaid = 0;

        if (rentalIncomeCategory) {
            state.transactions
                .filter(tx => tx.type === TransactionType.INCOME && tx.categoryId === rentalIncomeCategory.id && String(tx.propertyId) === propIdStr)
                .forEach(tx => {
                    const amt = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                    if (!isNaN(amt)) {
                        if (amt > 0) rentalCollected += amt;
                        else rentalPaid += Math.abs(amt);
                    }
                });
        }
        if (ownerSvcPayCategory) {
            state.transactions
                .filter(tx => tx.type === TransactionType.INCOME && tx.categoryId === ownerSvcPayCategory.id && tx.contactId === ownerId)
                .forEach(tx => {
                    const amt = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                    if (!isNaN(amt) && amt > 0) {
                        if (String(tx.propertyId) === propIdStr || !tx.propertyId) rentalCollected += amt;
                    }
                });
        }
        state.transactions
            .filter(tx => tx.type === TransactionType.EXPENSE && String(tx.propertyId) === propIdStr && !brokerFeeTxIds.has(tx.id) && !billPaymentTxIds.has(tx.id))
            .forEach(tx => {
                const amt = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                if (isNaN(amt) || amt <= 0) return;
                if (tx.categoryId === ownerPayoutCategory?.id) {
                    if (tx.contactId === ownerId) rentalPaid += amt;
                    return;
                }
                const category = state.categories.find(c => c.id === tx.categoryId);
                const catName = category?.name || '';
                if (catName === 'Security Deposit Refund' || catName === 'Owner Security Payout' || catName.includes('(Tenant)')) return;
                if (secDepCategory && tx.categoryId === secDepCategory.id) return;
                const txDate = (tx.date || '').slice(0, 10);
                const txOwnerId = (tx as any).ownerId ?? (txDate ? resolveOwnerForPropertyOnDate(state, propIdStr, txDate) : property?.ownerId);
                if (txOwnerId === ownerId) rentalPaid += amt;
            });

        state.rentalAgreements
            .filter(ra => {
                if (ra.previousAgreementId) return false;
                const raPropId = ra.propertyId ?? (ra as any).property_id;
                const fee = typeof ra.brokerFee === 'number' ? ra.brokerFee : parseFloat(String(ra.brokerFee ?? 0));
                return raPropId && String(raPropId) === propIdStr && ra.brokerId && !isNaN(fee) && fee > 0;
            })
            .forEach(ra => {
                const raDateStr = (ra.startDate || '').slice(0, 10);
                const raOwnerId = ra.ownerId ?? (raDateStr ? resolveOwnerForPropertyOnDate(state, propertyId, raDateStr) : property?.ownerId);
                if (raOwnerId === ownerId) {
                    const fee = typeof ra.brokerFee === 'number' ? ra.brokerFee : parseFloat(String(ra.brokerFee ?? 0));
                    if (!isNaN(fee)) rentalPaid += fee;
                }
            });

        state.bills
            .filter(b => String(b.propertyId) === propIdStr && !b.projectId)
            .forEach(b => {
                const billDate = (b.issueDate || '').slice(0, 10);
                const billOwnerId = billDate ? resolveOwnerForPropertyOnDate(state, propIdStr, billDate) : property?.ownerId;
                if (billOwnerId !== ownerId) return;
                const amt = typeof b.amount === 'number' ? b.amount : parseFloat(String(b.amount ?? 0));
                if (!isNaN(amt) && amt > 0) rentalPaid += amt;
            });

        const ownerRentalIncome = Math.max(0, rentalCollected - rentalPaid);
        const ownerSecurityBalance = securityDeposit;

        // --- Tenant unpaid invoices (for security adjustment option) ---
        const tenantUnpaidAmount = tenant
            ? propertyInvoices
                .filter(inv =>
                    inv.invoiceType === InvoiceType.RENTAL &&
                    !(inv.securityDepositCharge && inv.securityDepositCharge > 0) &&
                    inv.status !== InvoiceStatus.PAID &&
                    inv.status !== InvoiceStatus.DRAFT &&
                    inv.amount - (inv.paidAmount || 0) > 0.01
                )
                .reduce((sum, inv) => sum + Math.max(0, inv.amount - (inv.paidAmount || 0)), 0)
            : 0;

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

        const hasUnpaidInvoice = propertyInvoices.some(
            inv =>
                (inv.invoiceType === InvoiceType.RENTAL || inv.invoiceType === InvoiceType.SECURITY_DEPOSIT) &&
                inv.status !== InvoiceStatus.PAID &&
                inv.status !== InvoiceStatus.DRAFT &&
                inv.amount - (inv.paidAmount || 0) > 0.01
        );

        const monthlyRent = activeAgreement?.monthlyRent ?? 0;

        /** Income in a calendar quarter (for trend subtitle on Total Collected card). */
        const sumIncomeInQuarter = (year: number, quarterIndex: number) => {
            const start = new Date(year, quarterIndex * 3, 1);
            const end = new Date(year, quarterIndex * 3 + 3, 0, 23, 59, 59, 999);
            return state.transactions
                .filter(tx => {
                    if (tx.type !== TransactionType.INCOME || String(tx.propertyId) !== propIdStr) return false;
                    const d = new Date((tx.date || '').slice(0, 10));
                    return !Number.isNaN(d.getTime()) && d >= start && d <= end;
                })
                .reduce((sum, tx) => {
                    const amt = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                    return sum + (isNaN(amt) ? 0 : amt);
                }, 0);
        };

        const cq = Math.floor(today.getMonth() / 3);
        const cy = today.getFullYear();
        let pq = cq - 1;
        let py = cy;
        if (pq < 0) {
            pq = 3;
            py = cy - 1;
        }
        const incomeThisQuarter = sumIncomeInQuarter(cy, cq);
        const incomePrevQuarter = sumIncomeInQuarter(py, pq);
        let quarterTrendLabel: string | null = null;
        if (incomePrevQuarter > 0.01) {
            const pct = ((incomeThisQuarter - incomePrevQuarter) / incomePrevQuarter) * 100;
            quarterTrendLabel = `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}% from last quarter`;
        } else if (incomeThisQuarter > 0.01) {
            quarterTrendLabel = 'New activity this quarter';
        }

        return {
            totalCollected,
            securityDeposit,
            unpaidBalance,
            ownerRentalIncome,
            ownerSecurityBalance,
            tenantUnpaidAmount,
            canDeductServiceCharges,
            hasUnpaidInvoice,
            monthlyRent,
            monthlyServiceCharge,
            quarterTrendLabel,
        };
    }, [propertyId, state.invoices, state.transactions, state.categories, state.rentalAgreements, state.bills, property, activeAgreement, tenant]);

    const recentTransactions = useMemo(() => {
        const txs = state.transactions
            .filter(tx => tx.propertyId === propertyId)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 10);

        return txs.map(tx => {
            const contact = state.contacts.find(c => c.id === tx.contactId);
            const category = state.categories.find(c => c.id === tx.categoryId);
            const invoice = tx.invoiceId ? state.invoices.find(i => i.id === tx.invoiceId) : null;

            const label = tx.description || category?.name || 'Transaction';
            let categoryDisplay = category?.name || 'General';
            let statusPill: 'PAID' | 'SETTLED' | 'OPEN' = 'OPEN';

            if (invoice) {
                const isSecDep = invoice.invoiceType === InvoiceType.SECURITY_DEPOSIT
                    || (invoice.securityDepositCharge || 0) >= invoice.amount
                    || (invoice.description || '').toLowerCase().includes('security');
                categoryDisplay = isSecDep ? 'Security Deposit' : 'Rental Income';
                statusPill = invoice.status === InvoiceStatus.PAID ? 'PAID' : 'OPEN';
            } else if (tx.type === TransactionType.EXPENSE) {
                const cn = category?.name || '';
                if (cn.toLowerCase().includes('service charge')) categoryDisplay = 'Service Charge';
                else if (cn.toLowerCase().includes('maintenance') || cn.toLowerCase().includes('repair')) categoryDisplay = 'Maintenance';
                else categoryDisplay = cn || 'Expense';
                statusPill = 'SETTLED';
            } else {
                categoryDisplay = category?.name || 'Income';
                statusPill = 'PAID';
            }

            return {
                id: tx.id,
                date: tx.date,
                label,
                contactName: contact?.name || '—',
                categoryDisplay,
                amount: tx.type === TransactionType.EXPENSE ? -Math.abs(Number(tx.amount) || 0) : Math.abs(Number(tx.amount) || 0),
                statusPill,
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

    const handlePayoutToOwner = () => {
        if (!owner) return;
        const breakdown = [{
            propertyId,
            propertyName: property?.name || 'Unknown',
            balanceDue: financials.ownerRentalIncome,
        }];
        onPayoutToOwner(owner, financials.ownerRentalIncome, 'Rent', breakdown);
    };

    const handlePayoutSecurity = () => {
        if (!owner) return;
        const breakdown = [{
            propertyId,
            propertyName: property?.name || 'Unknown',
            balanceDue: financials.ownerSecurityBalance,
        }];
        onPayoutSecurity(owner, financials.ownerSecurityBalance, breakdown, tenant, financials.tenantUnpaidAmount);
    };

    const escrowRef = useMemo(() => {
        const raw = activeAgreement?.agreementNumber || propertyId;
        const digits = String(raw).replace(/\D/g, '');
        return digits.slice(-4) || String(raw).slice(0, 4).toUpperCase();
    }, [activeAgreement?.agreementNumber, propertyId]);

    const contractLengthLabel = agreementDuration === '—' ? '—' : `${agreementDuration} (Fixed)`;

    const handlePrintLedger = () => {
        triggerPrint('REPORT', { elementId: 'property-unit-detail-print' });
    };

    const handleEditUnitDetails = () => {
        dispatch({ type: 'SET_INITIAL_TABS', payload: ['Rental setup'] });
        onClose();
    };

    const handleViewAllHistory = () => {
        dispatch({ type: 'SET_INITIAL_TABS', payload: ['Reports', 'Tenant Ledger'] });
        onClose();
    };

    const fmtMoney = (n: number) =>
        n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    if (!isOpen || !property) return null;

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-[1px] overflow-y-auto p-4"
            onClick={onClose}
        >
            <div
                className="relative w-full max-w-4xl my-4 bg-white dark:bg-app-card rounded-2xl shadow-2xl border border-slate-200/80 dark:border-app-border flex flex-col overflow-hidden max-h-[calc(100vh-2rem)] animate-fade-in text-slate-900 dark:text-app-text"
                onClick={e => e.stopPropagation()}
            >
                <div id="property-unit-detail-print" className="flex flex-col min-h-0 flex-1 overflow-y-auto">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4 border-b border-slate-100 dark:border-app-border">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-app-text truncate">
                                <span className="text-slate-500 dark:text-app-muted font-semibold text-base">Unit Reference: </span>
                                {property.name}
                            </h2>
                            <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide shrink-0 ${
                                    activeAgreement
                                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                                        : 'bg-slate-100 text-slate-600 dark:bg-app-toolbar dark:text-app-muted'
                                }`}
                            >
                                {activeAgreement ? 'OCCUPIED' : 'VACANT'}
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            title="Close"
                            aria-label="Close property management panel"
                            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-app-toolbar transition-colors shrink-0"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Info bar — four columns */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 px-6 py-4 bg-slate-50/90 dark:bg-app-toolbar/40 border-b border-slate-100 dark:border-app-border">
                        <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-app-muted mb-1.5">
                                Tenant
                            </div>
                            <div className="flex items-center gap-2 min-w-0">
                                <div
                                    className="w-9 h-9 rounded-full bg-slate-200 dark:bg-app-border flex items-center justify-center text-[11px] font-bold text-slate-700 dark:text-app-text shrink-0"
                                    aria-hidden
                                >
                                    {tenant?.name ? contactInitials(tenant.name) : '—'}
                                </div>
                                <span className="text-sm font-semibold text-slate-900 dark:text-app-text truncate">
                                    {tenant?.name || '—'}
                                </span>
                            </div>
                        </div>
                        <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-app-muted mb-1.5">
                                Lease date
                            </div>
                            <div className="text-sm font-semibold text-slate-900 dark:text-app-text">
                                {activeAgreement ? formatDate(activeAgreement.startDate) : '—'}
                            </div>
                        </div>
                        <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-app-muted mb-1.5">
                                Owner
                            </div>
                            <div className="flex items-center gap-1.5 min-w-0">
                                <User className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden />
                                <span className="text-sm font-semibold text-slate-900 dark:text-app-text truncate">
                                    {owner?.name || '—'}
                                </span>
                            </div>
                        </div>
                        <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-app-muted mb-1.5">
                                Contract length
                            </div>
                            <div className="text-sm font-semibold text-slate-900 dark:text-app-text">{contractLengthLabel}</div>
                        </div>
                    </div>

                    {/* Summary cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-6 py-5">
                        <div className="relative rounded-xl bg-[#1e293b] text-white p-4 shadow-md overflow-hidden">
                            <Wallet className="absolute top-3 right-3 w-5 h-5 text-emerald-400/90" aria-hidden />
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 pr-8">Total collected</div>
                            <div className="text-2xl font-bold tabular-nums">
                                {CURRENCY} {fmtMoney(financials.totalCollected)}
                            </div>
                            {financials.quarterTrendLabel && (
                                <div
                                    className={`text-xs mt-2 font-medium ${
                                        financials.quarterTrendLabel.startsWith('-') ? 'text-rose-300' : 'text-emerald-300'
                                    }`}
                                >
                                    {financials.quarterTrendLabel.startsWith('+') || financials.quarterTrendLabel.startsWith('-')
                                        ? financials.quarterTrendLabel
                                        : financials.quarterTrendLabel}
                                </div>
                            )}
                        </div>
                        <div className="relative rounded-xl bg-white dark:bg-app-card border border-slate-200 dark:border-app-border p-4 shadow-sm">
                            <Lock className="absolute top-3 right-3 w-5 h-5 text-slate-400" aria-hidden />
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-app-muted mb-1 pr-8">
                                Security deposit
                            </div>
                            <div className="text-2xl font-bold text-slate-900 dark:text-app-text tabular-nums">
                                {CURRENCY} {fmtMoney(financials.securityDeposit)}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-app-muted mt-2">
                                Held in Escrow #{escrowRef}
                            </div>
                        </div>
                        <div className="relative rounded-xl bg-white dark:bg-app-card border border-slate-200 dark:border-app-border p-4 shadow-sm">
                            {financials.unpaidBalance <= 0.01 ? (
                                <div
                                    className="absolute top-3 right-3 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center"
                                    aria-hidden
                                >
                                    <Check className="w-3.5 h-3.5 text-white stroke-[3]" />
                                </div>
                            ) : (
                                <Calendar className="absolute top-3 right-3 w-5 h-5 text-amber-500" aria-hidden />
                            )}
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-app-muted mb-1 pr-10">
                                Unpaid balance
                            </div>
                            <div
                                className={`text-2xl font-bold tabular-nums ${
                                    financials.unpaidBalance > 0.01 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                                }`}
                            >
                                {CURRENCY} {fmtMoney(financials.unpaidBalance)}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-app-muted mt-2">
                                {financials.unpaidBalance <= 0.01 ? 'Account up to date' : 'Outstanding invoices'}
                            </div>
                        </div>
                    </div>

                    {/* Quick Management */}
                    <div className="px-6 pb-5">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-app-text mb-3">Quick Management</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                            <button
                                type="button"
                                onClick={() => onDeductCharges(propertyId)}
                                disabled={!financials.canDeductServiceCharges}
                                className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl border border-slate-200 dark:border-app-border bg-white dark:bg-app-card hover:bg-slate-50 dark:hover:bg-app-toolbar/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-h-[5.5rem]"
                            >
                                <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-app-toolbar flex items-center justify-center">
                                    <Minus className="w-4 h-4 text-slate-500 dark:text-app-muted" />
                                </div>
                                <span className="text-[9px] font-bold text-slate-600 dark:text-app-text uppercase tracking-wide text-center leading-tight">
                                    Deduct charges
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => onCreateInvoice(propertyId)}
                                disabled={!activeAgreement}
                                className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl border border-slate-200 dark:border-app-border bg-white dark:bg-app-card hover:bg-slate-50 dark:hover:bg-app-toolbar/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-h-[5.5rem]"
                            >
                                <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-app-toolbar flex items-center justify-center">
                                    <FileText className="w-4 h-4 text-slate-500 dark:text-app-muted" />
                                </div>
                                <span className="text-[9px] font-bold text-slate-600 dark:text-app-text uppercase tracking-wide text-center leading-tight">
                                    Create invoice
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => onReceivePayment(propertyId, property?.name || '')}
                                disabled={!financials.hasUnpaidInvoice}
                                className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl border border-slate-200 dark:border-app-border bg-white dark:bg-app-card hover:bg-slate-50 dark:hover:bg-app-toolbar/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-h-[5.5rem]"
                            >
                                <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-app-toolbar flex items-center justify-center">
                                    <Banknote className="w-4 h-4 text-slate-500 dark:text-app-muted" />
                                </div>
                                <span className="text-[9px] font-bold text-slate-600 dark:text-app-text uppercase tracking-wide text-center leading-tight">
                                    Receive unpaid
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={handlePayoutToOwner}
                                disabled={!owner || financials.ownerRentalIncome <= 0}
                                className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl border border-slate-200 dark:border-app-border bg-white dark:bg-app-card hover:bg-slate-50 dark:hover:bg-app-toolbar/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-h-[5.5rem]"
                            >
                                <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-app-toolbar flex items-center justify-center">
                                    <Building2 className="w-4 h-4 text-slate-500 dark:text-app-muted" />
                                </div>
                                <span className="text-[9px] font-bold text-slate-600 dark:text-app-text uppercase tracking-wide text-center leading-tight">
                                    Payout to owner
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => broker && onPayoutToBroker(broker, brokerPendingFee)}
                                disabled={!broker || brokerPendingFee <= 0}
                                className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl border border-slate-200 dark:border-app-border bg-white dark:bg-app-card hover:bg-slate-50 dark:hover:bg-app-toolbar/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-h-[5.5rem]"
                            >
                                <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-app-toolbar flex items-center justify-center">
                                    <Handshake className="w-4 h-4 text-slate-500 dark:text-app-muted" />
                                </div>
                                <span className="text-[9px] font-bold text-slate-600 dark:text-app-text uppercase tracking-wide text-center leading-tight">
                                    Pay broker
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={handlePayoutSecurity}
                                disabled={!owner || financials.ownerSecurityBalance <= 0}
                                className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl border border-slate-200 dark:border-app-border bg-white dark:bg-app-card hover:bg-slate-50 dark:hover:bg-app-toolbar/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-h-[5.5rem]"
                            >
                                <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-app-toolbar flex items-center justify-center">
                                    <ArrowLeft className="w-4 h-4 text-slate-500 dark:text-app-muted" />
                                </div>
                                <span className="text-[9px] font-bold text-slate-600 dark:text-app-text uppercase tracking-wide text-center leading-tight">
                                    Return security
                                </span>
                            </button>
                        </div>
                    </div>

                    {/* Recent Transactions */}
                    <div className="px-6 pb-4">
                        <div className="flex items-center justify-between gap-3 mb-3">
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-app-text">Recent Transactions</h3>
                            <button
                                type="button"
                                onClick={handleViewAllHistory}
                                className="text-xs font-medium text-primary hover:underline shrink-0"
                            >
                                View all history
                            </button>
                        </div>

                        {recentTransactions.length > 0 ? (
                            <div className="border border-slate-200 dark:border-app-border rounded-xl overflow-hidden overflow-x-auto">
                                <div className="min-w-[640px]">
                                    <div className="grid grid-cols-12 gap-2 px-3 py-2.5 bg-slate-50 dark:bg-app-toolbar/50 border-b border-slate-200 dark:border-app-border text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-app-muted">
                                        <div className="col-span-2">ID</div>
                                        <div className="col-span-3">Description</div>
                                        <div className="col-span-2">Category</div>
                                        <div className="col-span-2">Date</div>
                                        <div className="col-span-1">Status</div>
                                        <div className="col-span-2 text-right">Amount</div>
                                    </div>
                                    {recentTransactions.map(tx => {
                                        const isNeg = tx.amount < 0;
                                        return (
                                            <div
                                                key={tx.id}
                                                className="grid grid-cols-12 gap-2 px-3 py-2.5 border-b border-slate-100 dark:border-app-border last:border-b-0 hover:bg-slate-50/80 dark:hover:bg-app-toolbar/30 transition-colors text-xs"
                                            >
                                                <div className="col-span-2 font-mono text-[10px] text-slate-500 dark:text-app-muted truncate" title={tx.id}>
                                                    #TXN-{tx.id.slice(-5).toUpperCase()}
                                                </div>
                                                <div className="col-span-3 min-w-0 text-slate-900 dark:text-app-text font-medium truncate" title={tx.label}>
                                                    {tx.label}
                                                </div>
                                                <div className="col-span-2 text-slate-700 dark:text-app-text truncate" title={tx.categoryDisplay}>
                                                    {tx.categoryDisplay}
                                                </div>
                                                <div className="col-span-2 text-slate-600 dark:text-app-muted tabular-nums">
                                                    {formatDate(tx.date)}
                                                </div>
                                                <div className="col-span-1">
                                                    <span
                                                        className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                                                            tx.statusPill === 'OPEN'
                                                                ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200'
                                                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200'
                                                        }`}
                                                    >
                                                        {tx.statusPill}
                                                    </span>
                                                </div>
                                                <div
                                                    className={`col-span-2 text-right font-semibold tabular-nums ${
                                                        isNeg ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-500'
                                                    }`}
                                                >
                                                    {isNeg
                                                        ? `(${CURRENCY} ${fmtMoney(Math.abs(tx.amount))})`
                                                        : `${CURRENCY} ${fmtMoney(tx.amount)}`}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-8 text-app-muted text-sm border border-slate-200 dark:border-app-border rounded-xl bg-slate-50/50 dark:bg-app-toolbar/20">
                                No transactions recorded for this property yet.
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-app-border bg-white dark:bg-app-card shrink-0">
                    <button
                        type="button"
                        onClick={handlePrintLedger}
                        className="text-sm font-medium text-slate-500 hover:text-slate-800 dark:text-app-muted dark:hover:text-app-text px-2 py-1.5"
                    >
                        Print ledger
                    </button>
                    <button
                        type="button"
                        onClick={handleEditUnitDetails}
                        className="rounded-lg bg-[#1e293b] hover:bg-[#0f172a] text-white text-sm font-semibold px-4 py-2 shadow-sm transition-colors"
                    >
                        Edit unit details
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PropertyQuickManagementPanel;
