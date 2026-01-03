
import React, { useState, useMemo, useEffect } from 'react';
import { ProjectAgreement, AccountType, InvoiceStatus } from '../../types';
import { useAppContext } from '../../context/AppContext';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { CURRENCY } from '../../constants';

interface CancelAgreementModalProps {
    isOpen: boolean;
    onClose: () => void;
    agreement: ProjectAgreement | null;
}

const CancelAgreementModal: React.FC<CancelAgreementModalProps> = ({ isOpen, onClose, agreement }) => {
    const { state, dispatch } = useAppContext();
    const [penaltyPercentage, setPenaltyPercentage] = useState('0');

    const agreementInvoices = useMemo(() => {
        if (!agreement) return [];
        return state.invoices.filter(inv => inv.agreementId === agreement.id);
    }, [agreement, state.invoices]);

    const totalPaid = useMemo(() => {
        return agreementInvoices.reduce((sum, inv) => sum + inv.paidAmount, 0);
    }, [agreementInvoices]);

    const pendingInvoices = useMemo(() => {
        return agreementInvoices.filter(inv => 
            inv.status === InvoiceStatus.UNPAID || inv.status === InvoiceStatus.PARTIALLY_PAID
        );
    }, [agreementInvoices]);

    const pendingInvoiceAmount = useMemo(() => {
        return pendingInvoices.reduce((sum, inv) => sum + (inv.amount - inv.paidAmount), 0);
    }, [pendingInvoices]);

    const { penaltyAmount, refundAmount } = useMemo(() => {
        if (!agreement) return { penaltyAmount: 0, refundAmount: 0 };
        const pct = parseFloat(penaltyPercentage) || 0;
        // Penalty is calculated on contract amount (sellingPrice), not total paid
        const penalty = Math.round(agreement.sellingPrice * (pct / 100));
        // Refundable amount = total paid - penalty (rounded to whole number)
        const refund = Math.round(Math.max(0, totalPaid - penalty));
        return { penaltyAmount: penalty, refundAmount: refund };
    }, [agreement, totalPaid, penaltyPercentage]);

    useEffect(() => {
        if (isOpen) {
            setPenaltyPercentage('0');
        }
    }, [isOpen]);

    if (!agreement) return null;

    const handleConfirm = () => {
        dispatch({
            type: 'CANCEL_PROJECT_AGREEMENT',
            payload: {
                agreementId: agreement.id,
                penaltyPercentage: parseFloat(penaltyPercentage) || 0,
                penaltyAmount: penaltyAmount,
                refundAmount: refundAmount,
            }
        });
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Terminate Agreement #${agreement.agreementNumber}`}>
            <div className="space-y-6">
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
                    <div className="flex justify-between text-sm text-slate-600">
                        <span>Selling Price:</span>
                        <span>{CURRENCY} {agreement.sellingPrice.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm text-slate-600">
                        <span>Total Paid by Owner:</span>
                        <span className="font-semibold text-slate-800">{CURRENCY} {totalPaid.toLocaleString()}</span>
                    </div>
                    {pendingInvoices.length > 0 && (
                        <div className="flex justify-between text-sm text-amber-600 pt-2 border-t border-slate-200">
                            <span>Pending Invoices ({pendingInvoices.length}):</span>
                            <span className="font-semibold">{CURRENCY} {pendingInvoiceAmount.toLocaleString()}</span>
                        </div>
                    )}
                    <div className="text-xs text-slate-500 pt-2 border-t border-slate-200">
                        {pendingInvoices.length > 0 ? (
                            <span>⚠️ {pendingInvoices.length} pending invoice{pendingInvoices.length > 1 ? 's' : ''} will be voided. Units will be marked as unsold.</span>
                        ) : (
                            <span>✓ All invoices are paid. Units will be marked as unsold.</span>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                    <Input 
                        label="Penalty Percentage (%)" 
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        min="0"
                        max="100"
                        value={penaltyPercentage}
                        onChange={e => setPenaltyPercentage(e.target.value)}
                        autoFocus
                    />
                    <div className="p-3 bg-rose-50 rounded-lg border border-rose-100 text-right">
                        <span className="text-xs text-rose-600 font-bold uppercase block">Penalty Deduction</span>
                        <span className="text-lg font-bold text-rose-700">{CURRENCY} {penaltyAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                    </div>
                </div>
                
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                    <p className="text-xs text-amber-700 font-semibold mb-2">Accounting Note:</p>
                    <p className="text-xs text-amber-600">
                        Both penalty amount ({CURRENCY} {penaltyAmount.toLocaleString()}) and refundable amount ({CURRENCY} {refundAmount.toLocaleString()}) will be deducted from <strong>Unit Selling Income</strong> to reduce realized revenue.
                    </p>
                </div>
                
                <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-100 text-center">
                    <div className="text-xs text-emerald-600 font-bold uppercase mb-1">Net Refund Amount</div>
                    <div className="text-3xl font-bold text-emerald-700">{CURRENCY} {refundAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                    {refundAmount > 0 && (
                        <p className="text-xs text-slate-500 mt-2">This amount can be refunded to the owner through the Sales Returns page. The refund will reduce Unit Selling Income (revenue reduction, not an expense).</p>
                    )}
                </div>
                
                <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button variant="danger" onClick={handleConfirm}>
                        Terminate Agreement
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default CancelAgreementModal;
