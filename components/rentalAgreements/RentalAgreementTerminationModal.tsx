
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { RentalAgreement, RentalAgreementStatus, TransactionType, AccountType, InvoiceStatus, InvoiceType, Invoice } from '../../types';
import { useAppContext } from '../../context/AppContext';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import { CURRENCY, ICONS } from '../../constants';
import { useNotification } from '../../context/NotificationContext';
import { formatDate, toLocalDateString } from '../../utils/dateUtils';

interface RentalAgreementTerminationModalProps {
    isOpen: boolean;
    onClose: () => void;
    agreement: RentalAgreement | null;
}

interface SecurityAdjustment {
    invoiceId: string;
    amount: number;
}

const RentalAgreementTerminationModal: React.FC<RentalAgreementTerminationModalProps> = ({ isOpen, onClose, agreement }) => {
    const { state, dispatch } = useAppContext();
    const { showToast, showAlert, showConfirm } = useNotification();

    const [endDate, setEndDate] = useState(toLocalDateString(new Date()));
    const [status, setStatus] = useState<RentalAgreementStatus>(RentalAgreementStatus.TERMINATED);
    const [refundAmount, setRefundAmount] = useState('');
    const [refundAccountId, setRefundAccountId] = useState('');
    const [notes, setNotes] = useState('');
    const [refundAction, setRefundAction] = useState<'COMPANY_REFUND' | 'OWNER_DIRECT' | 'NONE' | 'ADJUST_INVOICES'>('NONE');
    const [securityAdjustments, setSecurityAdjustments] = useState<SecurityAdjustment[]>([]);

    const userSelectableAccounts = useMemo(() =>
        state.accounts.filter(a => a.type === AccountType.BANK && a.name !== 'Internal Clearing'), [state.accounts]);

    const isSecurityInvoice = (inv: { invoiceType?: string; securityDepositCharge?: number; description?: string }) =>
        inv.invoiceType === InvoiceType.SECURITY_DEPOSIT ||
        (inv.securityDepositCharge || 0) > 0 ||
        (inv.description || '').toLowerCase().includes('security');

    const allInvoicesForAgreement = useMemo(() => {
        if (!agreement) return [];
        return state.invoices.filter(inv => inv.agreementId === agreement.id);
    }, [agreement, state.invoices]);

    const openInvoices = useMemo(() => {
        return allInvoicesForAgreement.filter(inv => inv.status !== InvoiceStatus.PAID);
    }, [allInvoicesForAgreement]);

    const openSecurityInvoices = useMemo(() => openInvoices.filter(isSecurityInvoice), [openInvoices]);
    const openNonSecurityInvoices = useMemo(() => openInvoices.filter(inv => !isSecurityInvoice(inv)), [openInvoices]);

    const totalSecurityPaid = useMemo(() =>
        allInvoicesForAgreement
            .filter(isSecurityInvoice)
            .reduce((sum, inv) => sum + (inv.paidAmount || 0), 0),
        [allInvoicesForAgreement]
    );

    const totalSecurityDeposit = agreement?.securityDeposit || 0;

    const availableSecurityForAdjustment = useMemo(() => {
        const refund = refundAction === 'COMPANY_REFUND' ? (parseFloat(refundAmount) || 0) : 0;
        return Math.max(0, totalSecurityPaid - refund);
    }, [totalSecurityPaid, refundAction, refundAmount]);

    const totalAdjusted = useMemo(() =>
        securityAdjustments.reduce((sum, adj) => sum + adj.amount, 0),
        [securityAdjustments]
    );

    const remainingSecurityAfterAdjustment = useMemo(() => {
        const refund = refundAction === 'COMPANY_REFUND' ? (parseFloat(refundAmount) || 0) : 0;
        return Math.max(0, totalSecurityPaid - refund - totalAdjusted);
    }, [totalSecurityPaid, refundAction, refundAmount, totalAdjusted]);

    const getInvoiceBalance = useCallback((inv: Invoice) => {
        return Math.max(0, (inv.amount || 0) - (inv.paidAmount || 0));
    }, []);

    useEffect(() => {
        if (isOpen && agreement) {
            setEndDate(toLocalDateString(new Date()));
            const defaultRefund = (totalSecurityDeposit > 0)
                ? (totalSecurityPaid > 0 ? totalSecurityPaid : totalSecurityDeposit)
                : 0;
            setRefundAmount(defaultRefund > 0 ? defaultRefund.toString() : '0');
            setRefundAction(totalSecurityDeposit > 0 ? 'COMPANY_REFUND' : 'NONE');
            setRefundAccountId('');
            setStatus(RentalAgreementStatus.TERMINATED);
            setNotes('');
            setSecurityAdjustments([]);
        }
    }, [isOpen, agreement, totalSecurityDeposit, totalSecurityPaid]);

    const handleAdjustmentChange = useCallback((invoiceId: string, value: string) => {
        const amount = parseFloat(value) || 0;
        setSecurityAdjustments(prev => {
            const existing = prev.findIndex(a => a.invoiceId === invoiceId);
            if (amount <= 0) {
                return existing >= 0 ? prev.filter((_, i) => i !== existing) : prev;
            }
            if (existing >= 0) {
                const updated = [...prev];
                updated[existing] = { invoiceId, amount };
                return updated;
            }
            return [...prev, { invoiceId, amount }];
        });
    }, []);

    const handleAutoDistribute = useCallback(() => {
        let remaining = availableSecurityForAdjustment;
        const adjustments: SecurityAdjustment[] = [];
        for (const inv of openNonSecurityInvoices) {
            if (remaining <= 0) break;
            const balance = getInvoiceBalance(inv);
            const adjust = Math.min(balance, remaining);
            if (adjust > 0) {
                adjustments.push({ invoiceId: inv.id, amount: adjust });
                remaining -= adjust;
            }
        }
        setSecurityAdjustments(adjustments);
    }, [availableSecurityForAdjustment, openNonSecurityInvoices, getInvoiceBalance]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!agreement) return;

        if (openNonSecurityInvoices.length > 0 && refundAction !== 'ADJUST_INVOICES') {
            const totalDue = openNonSecurityInvoices.reduce((s, inv) => s + getInvoiceBalance(inv), 0);
            const proceed = await showConfirm(
                `${openNonSecurityInvoices.length} unpaid invoice(s) totalling ${CURRENCY} ${totalDue.toLocaleString()} will remain in the system.\n\nThe old tenant can pay them later. A new agreement can be created on this property with a different tenant.\n\nProceed with termination?`,
                { title: 'Unpaid Invoices Will Remain', confirmLabel: 'Yes, Terminate', cancelLabel: 'Cancel' }
            );
            if (!proceed) return;
        }

        if (refundAction === 'ADJUST_INVOICES' && securityAdjustments.length > 0) {
            const unadjustedInvoices = openNonSecurityInvoices.filter(inv => !securityAdjustments.find(a => a.invoiceId === inv.id && a.amount > 0));
            const remainingDue = unadjustedInvoices.reduce((s, inv) => s + getInvoiceBalance(inv), 0);
            const partiallyAdjusted = securityAdjustments.filter(a => {
                const inv = openNonSecurityInvoices.find(i => i.id === a.invoiceId);
                return inv && a.amount < getInvoiceBalance(inv);
            });

            let confirmMsg = `Security ${CURRENCY} ${totalAdjusted.toLocaleString()} will be adjusted against ${securityAdjustments.length} invoice(s).`;
            if (unadjustedInvoices.length > 0) {
                confirmMsg += `\n\n${unadjustedInvoices.length} invoice(s) (${CURRENCY} ${remainingDue.toLocaleString()}) will remain fully unpaid.`;
            }
            if (partiallyAdjusted.length > 0) {
                confirmMsg += `\n${partiallyAdjusted.length} invoice(s) will be partially paid.`;
            }
            if (remainingSecurityAfterAdjustment > 0) {
                confirmMsg += `\n\nRemaining security ${CURRENCY} ${remainingSecurityAfterAdjustment.toLocaleString()} can be refunded later.`;
            }
            confirmMsg += '\n\nProceed?';
            const proceed = await showConfirm(confirmMsg, { title: 'Security Adjustment', confirmLabel: 'Yes, Adjust & Terminate', cancelLabel: 'Cancel' });
            if (!proceed) return;
        }

        // Close open security invoices (set amount = paidAmount, status = Paid)
        if (openSecurityInvoices.length > 0) {
            for (const inv of openSecurityInvoices) {
                const paid = inv.paidAmount ?? 0;
                dispatch({
                    type: 'UPDATE_INVOICE',
                    payload: { ...inv, amount: paid, paidAmount: paid, status: InvoiceStatus.PAID }
                });
            }
        }

        // Apply security adjustments to unpaid invoices
        if (refundAction === 'ADJUST_INVOICES' && securityAdjustments.length > 0) {
            for (const adj of securityAdjustments) {
                const inv = state.invoices.find(i => i.id === adj.invoiceId);
                if (!inv || adj.amount <= 0) continue;
                const newPaid = (inv.paidAmount || 0) + adj.amount;
                const newStatus = newPaid >= inv.amount ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;
                const adjNote = `${inv.description || ''} [Security adjusted: ${CURRENCY} ${adj.amount.toLocaleString()}]`;
                dispatch({
                    type: 'UPDATE_INVOICE',
                    payload: { ...inv, paidAmount: newPaid, status: newStatus, description: adjNote }
                });
            }

            const refundCategory = state.categories.find(c => c.name === 'Security Deposit Refund');
            const property = state.properties.find(p => p.id === agreement.propertyId);

            if (refundCategory) {
                dispatch({
                    type: 'ADD_TRANSACTION',
                    payload: {
                        id: `sec-adj-${Date.now()}`, type: TransactionType.EXPENSE, amount: totalAdjusted,
                        date: endDate,
                        description: `Security Deposit adjusted against ${securityAdjustments.length} unpaid invoice(s) - Agreement #${agreement.agreementNumber}`,
                        accountId: userSelectableAccounts[0]?.id || '',
                        categoryId: refundCategory.id,
                        contactId: agreement.contactId, propertyId: agreement.propertyId,
                        buildingId: property?.buildingId || undefined,
                        agreementId: agreement.id
                    }
                });
            }
        }

        /* Recurring template removal skipped — recurring auto-generation is disabled */

        // Process refund
        if (refundAction === 'COMPANY_REFUND') {
            let amount = parseFloat(refundAmount);
            if (isNaN(amount) || amount <= 0) { await showAlert("Enter a valid refund amount."); return; }
            if (amount > totalSecurityPaid) {
                amount = totalSecurityPaid;
            }
            if (!refundAccountId) { await showAlert("Select an account for the refund."); return; }

            const refundCategory = state.categories.find(c => c.name === 'Security Deposit Refund');
            if (!refundCategory) { await showAlert("'Security Deposit Refund' category missing."); return; }

            const property = state.properties.find(p => p.id === agreement.propertyId);
            const buildingId = property?.buildingId;

            dispatch({
                type: 'ADD_TRANSACTION',
                payload: {
                    id: Date.now().toString(), type: TransactionType.EXPENSE, amount,
                    date: endDate,
                    description: `Security Deposit Refund - Agreement #${agreement.agreementNumber} (${notes || status})`,
                    accountId: refundAccountId, categoryId: refundCategory.id,
                    contactId: agreement.contactId, propertyId: agreement.propertyId,
                    buildingId: buildingId || undefined,
                    agreementId: agreement.id
                }
            });
        }

        // Update agreement
        let desc = agreement.description || '';
        if (refundAction === 'OWNER_DIRECT') {
            desc += ` | Terminated on ${endDate}. Security refunded directly by Owner.`;
        } else if (refundAction === 'ADJUST_INVOICES' && totalAdjusted > 0) {
            desc += ` | ${status} on ${endDate}. Security ${CURRENCY} ${totalAdjusted.toLocaleString()} adjusted against unpaid invoices.`;
            if (remainingSecurityAfterAdjustment > 0) {
                desc += ` Remaining ${CURRENCY} ${remainingSecurityAfterAdjustment.toLocaleString()} to be refunded.`;
            }
        } else {
            desc += ` | ${status} on ${endDate}`;
        }
        if (notes) desc += ` | Notes: ${notes}`;
        if (openNonSecurityInvoices.length > 0 && refundAction !== 'ADJUST_INVOICES') {
            const remaining = openNonSecurityInvoices.reduce((s, inv) => s + getInvoiceBalance(inv), 0);
            desc += ` | ${openNonSecurityInvoices.length} unpaid invoice(s) (${CURRENCY} ${remaining.toLocaleString()}) remain with old tenant.`;
        }

        dispatch({
            type: 'UPDATE_RENTAL_AGREEMENT',
            payload: { ...agreement, status, endDate: new Date(endDate).toISOString(), description: desc }
        });

        const adjMsg = refundAction === 'ADJUST_INVOICES' && totalAdjusted > 0
            ? ` Security ${CURRENCY} ${totalAdjusted.toLocaleString()} adjusted against invoices.`
            : '';
        const unpaidMsg = openNonSecurityInvoices.length > 0 && refundAction !== 'ADJUST_INVOICES'
            ? ` ${openNonSecurityInvoices.length} unpaid invoice(s) remain.`
            : '';
        showToast(`Agreement marked as ${status}.${adjMsg}${unpaidMsg}`);
        onClose();
    };

    if (!agreement) return null;

    const tenantName = state.contacts.find(c => c.id === agreement.contactId)?.name || 'Unknown';
    const propertyName = state.properties.find(p => p.id === agreement.propertyId)?.name || 'Unknown';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`End Agreement #${agreement.agreementNumber}`} size="lg">
            <form onSubmit={handleSubmit} className="space-y-4 p-1 max-h-[80vh] overflow-y-auto">
                {/* Unpaid invoices: informational warning, no longer blocking */}
                {openNonSecurityInvoices.length > 0 && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <div className="flex items-start gap-2">
                            <div className="text-amber-500 flex-shrink-0 mt-0.5"><div className="w-4 h-4">{ICONS.alertTriangle}</div></div>
                            <div className="flex-1">
                                <h4 className="text-xs font-bold text-amber-800">Unpaid Invoices ({openNonSecurityInvoices.length})</h4>
                                <p className="text-[10px] text-amber-700 mt-0.5">
                                    These invoices will remain in the system. The old tenant can pay them later, or you can adjust the security deposit against them below.
                                </p>
                                <div className="mt-1.5 space-y-0.5">
                                    {openNonSecurityInvoices.slice(0, 5).map(inv => (
                                        <div key={inv.id} className="text-[10px] text-amber-700 flex justify-between">
                                            <span>{inv.invoiceNumber} - {inv.description?.slice(0, 30) || 'Rental'}</span>
                                            <span className="font-medium">{CURRENCY} {getInvoiceBalance(inv).toLocaleString()} due</span>
                                        </div>
                                    ))}
                                    {openNonSecurityInvoices.length > 5 && <div className="text-[10px] text-amber-500 italic">...and {openNonSecurityInvoices.length - 5} more</div>}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {openSecurityInvoices.length > 0 && (
                    <div className="p-3 bg-sky-50 border border-sky-200 rounded-lg">
                        <div className="flex items-start gap-2">
                            <div className="text-sky-600 flex-shrink-0 mt-0.5"><div className="w-4 h-4">{ICONS.alertTriangle}</div></div>
                            <div>
                                <h4 className="text-xs font-bold text-sky-800">Open security invoice(s)</h4>
                                <p className="text-[10px] text-sky-700 mt-0.5">
                                    {openSecurityInvoices.length} security invoice(s) not fully paid. On confirm, they will be closed (amount set to amount paid, status: Paid). Collected: {CURRENCY} {totalSecurityPaid.toLocaleString()}.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Agreement Summary */}
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <div className="flex justify-between"><span className="text-slate-500">Tenant</span><span className="font-medium text-slate-800">{tenantName}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Property</span><span className="font-medium text-slate-800">{propertyName}</span></div>
                        <div className="col-span-2 flex justify-between"><span className="text-slate-500">Period</span><span className="font-medium text-slate-800">{formatDate(agreement.startDate)} - {formatDate(agreement.endDate)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Rent</span><span className="font-medium">{CURRENCY} {(agreement.monthlyRent || 0).toLocaleString()}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Security Held</span><span className="font-bold text-slate-800">{CURRENCY} {totalSecurityDeposit.toLocaleString()}</span></div>
                        {totalSecurityPaid > 0 && totalSecurityPaid !== totalSecurityDeposit && (
                            <div className="col-span-2 flex justify-between"><span className="text-slate-500">Security Collected</span><span className="font-bold text-emerald-700">{CURRENCY} {totalSecurityPaid.toLocaleString()}</span></div>
                        )}
                    </div>
                </div>

                {/* Termination Details */}
                <div className="grid grid-cols-2 gap-3">
                    <Select label="Status" value={status} onChange={e => setStatus(e.target.value as RentalAgreementStatus)}>
                        <option value={RentalAgreementStatus.TERMINATED}>Terminated</option>
                        <option value={RentalAgreementStatus.EXPIRED}>Expired</option>
                    </Select>
                    <DatePicker label="Effective Date" value={endDate} onChange={d => setEndDate(toLocalDateString(d))} required />
                </div>

                {/* Security Deposit Handling */}
                {totalSecurityDeposit > 0 && (
                    <div className="space-y-2">
                        <label className="block text-xs font-semibold text-slate-700">Security Deposit Handling</label>
                        {([
                            { key: 'COMPANY_REFUND' as const, label: 'Refund from Company', desc: 'Records expense transaction for refund' },
                            { key: 'ADJUST_INVOICES' as const, label: 'Adjust Against Unpaid Invoices', desc: 'Deduct from security and mark invoices paid/partially paid', show: openNonSecurityInvoices.length > 0 },
                            { key: 'OWNER_DIRECT' as const, label: 'Refunded by Owner Directly', desc: 'No transaction recorded' },
                            { key: 'NONE' as const, label: 'No Refund / Forfeit', desc: 'Deposit forfeited or to be handled later' },
                        ]).filter(opt => opt.show !== false).map(opt => (
                            <label key={opt.key} className={`flex items-start gap-3 p-2.5 border rounded-lg cursor-pointer transition-all ${
                                refundAction === opt.key ? 'border-orange-300 bg-orange-50/50 ring-1 ring-orange-200' : 'border-slate-200 hover:bg-slate-50'
                            }`}>
                                <input type="radio" name="refundAction" checked={refundAction === opt.key} onChange={() => { setRefundAction(opt.key); if (opt.key !== 'ADJUST_INVOICES') setSecurityAdjustments([]); }} className="mt-0.5 text-accent focus:ring-accent" />
                                <div>
                                    <span className="text-xs font-medium text-slate-800">{opt.label}</span>
                                    <span className="block text-[10px] text-slate-500">{opt.desc}</span>
                                </div>
                            </label>
                        ))}

                        {/* Company Refund fields */}
                        {refundAction === 'COMPANY_REFUND' && (
                            <div className="pl-4 border-l-2 border-orange-200 space-y-3 pt-2 animate-fade-in">
                                <Input label="Refund Amount" type="number" value={refundAmount} onChange={e => setRefundAmount(e.target.value)} required />
                                <ComboBox label="Pay From Account" items={userSelectableAccounts} selectedId={refundAccountId} onSelect={item => setRefundAccountId(item?.id || '')} placeholder="Select account" required />
                            </div>
                        )}

                        {/* Security Adjustment Against Invoices */}
                        {refundAction === 'ADJUST_INVOICES' && openNonSecurityInvoices.length > 0 && (
                            <div className="pl-4 border-l-2 border-orange-200 space-y-3 pt-2 animate-fade-in">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <span className="text-xs font-semibold text-slate-700">Adjust Security Against Invoices</span>
                                        <span className="block text-[10px] text-slate-500">
                                            Available: {CURRENCY} {availableSecurityForAdjustment.toLocaleString()} | Used: {CURRENCY} {totalAdjusted.toLocaleString()} | Balance: {CURRENCY} {remainingSecurityAfterAdjustment.toLocaleString()}
                                        </span>
                                    </div>
                                    <Button type="button" variant="secondary" onClick={handleAutoDistribute} className="!text-[10px] !py-1 !px-2">
                                        Auto-Fill
                                    </Button>
                                </div>

                                {totalAdjusted > availableSecurityForAdjustment && (
                                    <div className="p-2 bg-rose-50 border border-rose-200 rounded text-[10px] text-rose-700 font-medium">
                                        Total adjustment ({CURRENCY} {totalAdjusted.toLocaleString()}) exceeds available security ({CURRENCY} {availableSecurityForAdjustment.toLocaleString()}).
                                    </div>
                                )}

                                <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                                    {openNonSecurityInvoices.map(inv => {
                                        const balance = getInvoiceBalance(inv);
                                        const adj = securityAdjustments.find(a => a.invoiceId === inv.id);
                                        return (
                                            <div key={inv.id} className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200">
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-[10px] font-mono text-slate-500">{inv.invoiceNumber}</div>
                                                    <div className="text-xs text-slate-700 truncate">{inv.description?.slice(0, 40) || 'Rental'}</div>
                                                    <div className="text-[10px] text-slate-500">
                                                        Due: {CURRENCY} {balance.toLocaleString()}
                                                        {inv.paidAmount ? ` (Paid: ${CURRENCY} ${inv.paidAmount.toLocaleString()})` : ''}
                                                    </div>
                                                </div>
                                                <div className="w-28 flex-shrink-0">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max={balance}
                                                        step="any"
                                                        value={adj?.amount || ''}
                                                        onChange={e => handleAdjustmentChange(inv.id, e.target.value)}
                                                        placeholder="0"
                                                        className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-orange-400 text-right"
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {remainingSecurityAfterAdjustment > 0 && (
                                    <div className="p-2 bg-emerald-50 border border-emerald-200 rounded text-[10px] text-emerald-700">
                                        Remaining {CURRENCY} {remainingSecurityAfterAdjustment.toLocaleString()} can be refunded to the tenant separately.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* No security deposit */}
                {totalSecurityDeposit <= 0 && (
                    <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg">
                        <span className="text-[10px] text-slate-500">No security deposit on this agreement.</span>
                    </div>
                )}

                {/* Notes */}
                <Input label="Notes (Optional)" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Reason for termination, deductions..." />

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="secondary" onClick={onClose} className="!text-xs !py-1.5 !px-3">Cancel</Button>
                    <Button
                        type="submit"
                        variant="danger"
                        disabled={refundAction === 'ADJUST_INVOICES' && totalAdjusted > availableSecurityForAdjustment}
                        className="!text-xs !py-1.5 !px-4"
                    >
                        {`Confirm ${status}`}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};

export default RentalAgreementTerminationModal;
