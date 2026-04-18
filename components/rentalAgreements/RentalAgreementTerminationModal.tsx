
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { RentalAgreement, RentalAgreementStatus, InvoiceStatus, InvoiceType, Invoice } from '../../types';
import { useAppContext } from '../../context/AppContext';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import DatePicker from '../ui/DatePicker';
import { CURRENCY, ICONS } from '../../constants';
import { useNotification } from '../../context/NotificationContext';
import { formatDate, toLocalDateString } from '../../utils/dateUtils';

interface RentalAgreementTerminationModalProps {
    isOpen: boolean;
    onClose: () => void;
    agreement: RentalAgreement | null;
}

const RentalAgreementTerminationModal: React.FC<RentalAgreementTerminationModalProps> = ({ isOpen, onClose, agreement }) => {
    const { state, dispatch } = useAppContext();
    const { showToast, showConfirm } = useNotification();

    const [endDate, setEndDate] = useState(toLocalDateString(new Date()));
    const [status, setStatus] = useState<RentalAgreementStatus>(RentalAgreementStatus.TERMINATED);
    const [notes, setNotes] = useState('');

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

    const getInvoiceBalance = useCallback((inv: Invoice) => {
        return Math.max(0, (inv.amount || 0) - (inv.paidAmount || 0));
    }, []);

    useEffect(() => {
        if (isOpen && agreement) {
            setEndDate(toLocalDateString(new Date()));
            setStatus(RentalAgreementStatus.TERMINATED);
            setNotes('');
        }
    }, [isOpen, agreement]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!agreement) return;

        if (openNonSecurityInvoices.length > 0) {
            const totalDue = openNonSecurityInvoices.reduce((s, inv) => s + getInvoiceBalance(inv), 0);
            const proceed = await showConfirm(
                `${openNonSecurityInvoices.length} unpaid invoice(s) totalling ${CURRENCY} ${totalDue.toLocaleString()} will remain in the system.\n\nThe old tenant can pay them later. A new agreement can be created on this property with a different tenant.\n\nProceed with termination?`,
                { title: 'Unpaid Invoices Will Remain', confirmLabel: 'Yes, Terminate', cancelLabel: 'Cancel' }
            );
            if (!proceed) return;
        }

        if (openSecurityInvoices.length > 0) {
            for (const inv of openSecurityInvoices) {
                const paid = inv.paidAmount ?? 0;
                dispatch({
                    type: 'UPDATE_INVOICE',
                    payload: { ...inv, amount: paid, paidAmount: paid, status: InvoiceStatus.PAID }
                });
            }
        }

        let desc = agreement.description || '';
        desc += ` | ${status} on ${endDate}`;
        if (notes) desc += ` | Notes: ${notes}`;
        if (openNonSecurityInvoices.length > 0) {
            const remaining = openNonSecurityInvoices.reduce((s, inv) => s + getInvoiceBalance(inv), 0);
            desc += ` | ${openNonSecurityInvoices.length} unpaid invoice(s) (${CURRENCY} ${remaining.toLocaleString()}) remain with old tenant.`;
        }

        dispatch({
            type: 'UPDATE_RENTAL_AGREEMENT',
            payload: { ...agreement, status, endDate: new Date(endDate).toISOString(), description: desc }
        });

        const unpaidMsg = openNonSecurityInvoices.length > 0
            ? ` ${openNonSecurityInvoices.length} unpaid invoice(s) remain.`
            : '';
        showToast(`Agreement marked as ${status}.${unpaidMsg}`);
        onClose();
    };

    if (!agreement) return null;

    const tenantName = state.contacts.find(c => c.id === agreement.contactId)?.name || 'Unknown';
    const propertyName = state.properties.find(p => p.id === agreement.propertyId)?.name || 'Unknown';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`End Agreement #${agreement.agreementNumber}`} size="lg">
            <form onSubmit={handleSubmit} className="space-y-4 p-1 max-h-[80vh] overflow-y-auto">
                {openNonSecurityInvoices.length > 0 && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <div className="flex items-start gap-2">
                            <div className="text-amber-500 flex-shrink-0 mt-0.5"><div className="w-4 h-4">{ICONS.alertTriangle}</div></div>
                            <div className="flex-1">
                                <h4 className="text-xs font-bold text-amber-800">Unpaid Invoices ({openNonSecurityInvoices.length})</h4>
                                <p className="text-[10px] text-amber-700 mt-0.5">
                                    These invoices will remain in the system. The old tenant can pay them later.
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

                <div className="grid grid-cols-2 gap-3">
                    <Select label="Status" value={status} onChange={e => setStatus(e.target.value as RentalAgreementStatus)}>
                        <option value={RentalAgreementStatus.TERMINATED}>Terminated</option>
                        <option value={RentalAgreementStatus.EXPIRED}>Expired</option>
                    </Select>
                    <DatePicker label="Effective Date" value={endDate} onChange={d => setEndDate(toLocalDateString(d))} required />
                </div>

                {totalSecurityDeposit > 0 && totalSecurityPaid > 0 && (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-start gap-2">
                            <div className="text-blue-500 flex-shrink-0 mt-0.5"><div className="w-4 h-4">{ICONS.info}</div></div>
                            <div>
                                <h4 className="text-xs font-bold text-blue-800">Security Deposit Refund</h4>
                                <p className="text-[10px] text-blue-700 mt-0.5">
                                    Security deposit of <span className="font-semibold">{CURRENCY} {totalSecurityPaid.toLocaleString()}</span> has been collected.
                                    Please refund the security amount to the tenant manually after termination (e.g. record an expense transaction from the Transactions page).
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {totalSecurityDeposit <= 0 && (
                    <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg">
                        <span className="text-[10px] text-slate-500">No security deposit on this agreement.</span>
                    </div>
                )}

                <Input label="Notes (Optional)" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Reason for termination, deductions..." />

                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="secondary" onClick={onClose} className="!text-xs !py-1.5 !px-3">Cancel</Button>
                    <Button type="submit" variant="danger" className="!text-xs !py-1.5 !px-4">
                        {`Confirm ${status}`}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};

export default RentalAgreementTerminationModal;
