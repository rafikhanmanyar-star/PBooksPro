
import React, { useState, useMemo, useEffect } from 'react';
import { RentalAgreement, RentalAgreementStatus, TransactionType, AccountType, InvoiceStatus } from '../../types';
import { useAppContext } from '../../context/AppContext';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import { CURRENCY, ICONS } from '../../constants';
import { useNotification } from '../../context/NotificationContext';
import { formatDate } from '../../utils/dateUtils';

interface RentalAgreementTerminationModalProps {
    isOpen: boolean;
    onClose: () => void;
    agreement: RentalAgreement | null;
}

const RentalAgreementTerminationModal: React.FC<RentalAgreementTerminationModalProps> = ({ isOpen, onClose, agreement }) => {
    const { state, dispatch } = useAppContext();
    const { showToast, showAlert, showConfirm } = useNotification();

    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [status, setStatus] = useState<RentalAgreementStatus>(RentalAgreementStatus.TERMINATED);
    const [refundAmount, setRefundAmount] = useState('');
    const [refundAccountId, setRefundAccountId] = useState('');
    const [notes, setNotes] = useState('');
    const [refundAction, setRefundAction] = useState<'COMPANY_REFUND' | 'OWNER_DIRECT' | 'NONE'>('NONE');

    const userSelectableAccounts = useMemo(() =>
        state.accounts.filter(a => a.type === AccountType.BANK && a.name !== 'Internal Clearing'), [state.accounts]);

    const openInvoices = useMemo(() => {
        if (!agreement) return [];
        return state.invoices.filter(inv =>
            inv.agreementId === agreement.id && inv.status !== InvoiceStatus.PAID
        );
    }, [agreement, state.invoices]);
    const hasOpenInvoices = openInvoices.length > 0;

    useEffect(() => {
        if (isOpen && agreement) {
            setEndDate(new Date().toISOString().split('T')[0]);
            setRefundAmount(agreement.securityDeposit ? agreement.securityDeposit.toString() : '0');
            setRefundAction(agreement.securityDeposit && agreement.securityDeposit > 0 ? 'COMPANY_REFUND' : 'NONE');
            setRefundAccountId('');
            setStatus(RentalAgreementStatus.TERMINATED);
            setNotes('');
        }
    }, [isOpen, agreement]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!agreement) return;

        if (hasOpenInvoices) {
            await showAlert(`Cannot terminate. ${openInvoices.length} open invoice(s). All must be paid first.`, { title: 'Open Invoices' });
            return;
        }

        // Check recurring templates
        const activeTemplates = state.recurringInvoiceTemplates.filter(t => t.agreementId === agreement.id && t.active);
        if (activeTemplates.length > 0) {
            const ok = await showConfirm(
                `${activeTemplates.length} active recurring invoice(s) will be stopped. Proceed?`,
                { title: "Stop Recurring Invoices", confirmLabel: "Stop & Terminate", cancelLabel: "Cancel" }
            );
            if (!ok) return;
        }

        // Process refund
        if (refundAction === 'COMPANY_REFUND') {
            const amount = parseFloat(refundAmount);
            if (isNaN(amount) || amount <= 0) { await showAlert("Enter a valid refund amount."); return; }
            if (!refundAccountId) { await showAlert("Select an account for the refund."); return; }

            const refundCategory = state.categories.find(c => c.name === 'Security Deposit Refund');
            if (!refundCategory) { await showAlert("'Security Deposit Refund' category missing."); return; }

            dispatch({
                type: 'ADD_TRANSACTION',
                payload: {
                    id: Date.now().toString(), type: TransactionType.EXPENSE, amount,
                    date: endDate,
                    description: `Security Deposit Refund - Agreement #${agreement.agreementNumber} (${notes || status})`,
                    accountId: refundAccountId, categoryId: refundCategory.id,
                    contactId: agreement.contactId, propertyId: agreement.propertyId,
                    agreementId: agreement.id
                }
            });
        }

        // Update agreement
        let desc = agreement.description || '';
        if (refundAction === 'OWNER_DIRECT') {
            desc += ` | Terminated on ${endDate}. Security refunded directly by Owner.`;
        } else {
            desc += ` | ${status} on ${endDate}`;
        }
        if (notes) desc += ` | Notes: ${notes}`;

        dispatch({
            type: 'UPDATE_RENTAL_AGREEMENT',
            payload: { ...agreement, status, endDate: new Date(endDate).toISOString(), description: desc }
        });

        // Deactivate recurring templates
        activeTemplates.forEach(t => dispatch({ type: 'UPDATE_RECURRING_TEMPLATE', payload: { ...t, active: false } }));

        showToast(`Agreement marked as ${status}.`);
        onClose();
    };

    if (!agreement) return null;

    const tenantName = state.contacts.find(c => c.id === agreement.contactId)?.name || 'Unknown';
    const propertyName = state.properties.find(p => p.id === agreement.propertyId)?.name || 'Unknown';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`End Agreement #${agreement.agreementNumber}`}>
            <form onSubmit={handleSubmit} className="space-y-4 p-1">
                {/* Open invoices warning */}
                {hasOpenInvoices && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg">
                        <div className="flex items-start gap-2">
                            <div className="text-rose-500 flex-shrink-0 mt-0.5"><div className="w-4 h-4">{ICONS.alertTriangle}</div></div>
                            <div>
                                <h4 className="text-xs font-bold text-rose-800">Cannot Terminate - Open Invoices</h4>
                                <p className="text-[10px] text-rose-600 mt-0.5">
                                    {openInvoices.length} unpaid invoice(s). All must be paid first.
                                </p>
                                <div className="mt-1.5 space-y-0.5">
                                    {openInvoices.slice(0, 3).map(inv => (
                                        <div key={inv.id} className="text-[10px] text-rose-700 flex justify-between">
                                            <span>{inv.invoiceNumber}</span>
                                            <span className="font-medium">{CURRENCY} {(inv.amount - inv.paidAmount).toLocaleString()} due</span>
                                        </div>
                                    ))}
                                    {openInvoices.length > 3 && <div className="text-[10px] text-rose-500 italic">...and {openInvoices.length - 3} more</div>}
                                </div>
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
                        <div className="flex justify-between"><span className="text-slate-500">Security Held</span><span className="font-bold text-slate-800">{CURRENCY} {(agreement.securityDeposit || 0).toLocaleString()}</span></div>
                    </div>
                </div>

                {/* Termination Details */}
                <div className="grid grid-cols-2 gap-3">
                    <Select label="Status" value={status} onChange={e => setStatus(e.target.value as RentalAgreementStatus)}>
                        <option value={RentalAgreementStatus.TERMINATED}>Terminated</option>
                        <option value={RentalAgreementStatus.EXPIRED}>Expired</option>
                    </Select>
                    <DatePicker label="Effective Date" value={endDate} onChange={d => setEndDate(d.toISOString().split('T')[0])} required />
                </div>

                {/* Security Deposit Handling */}
                <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-700">Security Deposit Handling</label>
                    {([
                        { key: 'COMPANY_REFUND' as const, label: 'Refund from Company', desc: 'Records expense transaction' },
                        { key: 'OWNER_DIRECT' as const, label: 'Refunded by Owner Directly', desc: 'No transaction recorded' },
                        { key: 'NONE' as const, label: 'No Refund / Forfeit', desc: 'Deposit forfeited or carried over' },
                    ]).map(opt => (
                        <label key={opt.key} className={`flex items-start gap-3 p-2.5 border rounded-lg cursor-pointer transition-all ${
                            refundAction === opt.key ? 'border-orange-300 bg-orange-50/50 ring-1 ring-orange-200' : 'border-slate-200 hover:bg-slate-50'
                        }`}>
                            <input type="radio" name="refundAction" checked={refundAction === opt.key} onChange={() => setRefundAction(opt.key)} className="mt-0.5 text-accent focus:ring-accent" />
                            <div>
                                <span className="text-xs font-medium text-slate-800">{opt.label}</span>
                                <span className="block text-[10px] text-slate-500">{opt.desc}</span>
                            </div>
                        </label>
                    ))}

                    {refundAction === 'COMPANY_REFUND' && (
                        <div className="pl-4 border-l-2 border-orange-200 space-y-3 pt-2 animate-fade-in">
                            <Input label="Refund Amount" type="number" value={refundAmount} onChange={e => setRefundAmount(e.target.value)} required />
                            <ComboBox label="Pay From Account" items={userSelectableAccounts} selectedId={refundAccountId} onSelect={item => setRefundAccountId(item?.id || '')} placeholder="Select account" required />
                        </div>
                    )}
                </div>

                {/* Notes */}
                <Input label="Notes (Optional)" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Reason for termination, deductions..." />

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="secondary" onClick={onClose} className="!text-xs !py-1.5 !px-3">Cancel</Button>
                    <Button type="submit" variant="danger" disabled={hasOpenInvoices} className="!text-xs !py-1.5 !px-4">
                        {hasOpenInvoices ? 'Clear Invoices First' : `Confirm ${status}`}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};

export default RentalAgreementTerminationModal;
