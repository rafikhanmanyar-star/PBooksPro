
import React, { useState, useMemo, useEffect } from 'react';
import { ProjectAgreement, InvoiceStatus, SalesReturn, SalesReturnStatus, SalesReturnReason } from '../../types';
import { useAppContext } from '../../context/AppContext';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { CURRENCY } from '../../constants';
import ComboBox from '../ui/ComboBox';

interface SalesReturnModalProps {
    isOpen: boolean;
    onClose: () => void;
    agreementId?: string | null; // Optional: pre-select an agreement
}

const SalesReturnModal: React.FC<SalesReturnModalProps> = ({ isOpen, onClose, agreementId }) => {
    const { state, dispatch } = useAppContext();
    const [selectedAgreementId, setSelectedAgreementId] = useState<string>(agreementId || '');
    const [returnReason, setReturnReason] = useState<SalesReturnReason>(SalesReturnReason.CUSTOMER_REQUEST);
    const [reasonNotes, setReasonNotes] = useState('');
    const [penaltyPercentage, setPenaltyPercentage] = useState('0');
    const [notes, setNotes] = useState('');

    // Get selected agreement
    const agreement = useMemo(() => {
        return state.projectAgreements.find(pa => pa.id === selectedAgreementId);
    }, [selectedAgreementId, state.projectAgreements]);

    // Get available agreements (only Active ones)
    const availableAgreements = useMemo(() => {
        return state.projectAgreements
            .filter(pa => pa.status === 'Active')
            .map(pa => {
                const client = state.contacts.find(c => c.id === pa.clientId);
                return {
                    id: pa.id,
                    name: `${pa.agreementNumber} - ${client?.name || 'Unknown'} (${CURRENCY} ${pa.sellingPrice.toLocaleString()})`,
                };
            });
    }, [state.projectAgreements, state.contacts]);

    const agreementInvoices = useMemo(() => {
        if (!agreement) return [];
        return state.invoices.filter(inv => inv.agreementId === agreement.id);
    }, [agreement, state.invoices]);

    const totalPaid = useMemo(() => {
        return agreementInvoices.reduce((sum, inv) => sum + (inv.paidAmount || 0), 0);
    }, [agreementInvoices]);

    const pendingInvoices = useMemo(() => {
        return agreementInvoices.filter(inv => 
            inv.status === InvoiceStatus.UNPAID || inv.status === InvoiceStatus.PARTIALLY_PAID
        );
    }, [agreementInvoices]);

    const pendingInvoiceAmount = useMemo(() => {
        return pendingInvoices.reduce((sum, inv) => sum + (inv.amount - (inv.paidAmount || 0)), 0);
    }, [pendingInvoices]);

    const { penaltyAmount, refundAmount } = useMemo(() => {
        if (!agreement) return { penaltyAmount: 0, refundAmount: 0 };
        const pct = parseFloat(penaltyPercentage) || 0;
        const penalty = Math.round(agreement.sellingPrice * (pct / 100));
        const refund = Math.round(Math.max(0, totalPaid - penalty)); // Round to whole number
        return { penaltyAmount: penalty, refundAmount: refund };
    }, [agreement, totalPaid, penaltyPercentage]);

    // Generate return number
    const returnNumber = useMemo(() => {
        const existingReturns = state.salesReturns || [];
        const lastNumber = existingReturns.length > 0 
            ? existingReturns[existingReturns.length - 1].returnNumber 
            : 'SR-0000';
        const match = lastNumber.match(/SR-(\d+)/);
        const nextNum = match ? parseInt(match[1]) + 1 : 1;
        return `SR-${String(nextNum).padStart(4, '0')}`;
    }, [state.salesReturns]);

    useEffect(() => {
        if (isOpen) {
            if (agreementId) {
                setSelectedAgreementId(agreementId);
            } else {
                setSelectedAgreementId('');
            }
            setReturnReason(SalesReturnReason.CUSTOMER_REQUEST);
            setReasonNotes('');
            setPenaltyPercentage('0');
            setNotes('');
        }
    }, [isOpen, agreementId]);

    const handleConfirm = () => {
        if (!agreement) {
            return;
        }

        // Create Sales Return record
        const salesReturn: SalesReturn = {
            id: Date.now().toString(),
            returnNumber,
            agreementId: agreement.id,
            returnDate: new Date().toISOString().split('T')[0],
            reason: returnReason,
            reasonNotes: reasonNotes || undefined,
            penaltyPercentage: parseFloat(penaltyPercentage) || 0,
            penaltyAmount: penaltyAmount,
            refundAmount: refundAmount,
            status: SalesReturnStatus.PENDING,
            notes: notes || undefined,
            createdBy: state.currentUser?.id,
        };

        // Add Sales Return to state
        dispatch({ type: 'ADD_SALES_RETURN', payload: salesReturn });

        // Process cancellation (this will update the return status to PROCESSED)
        dispatch({
            type: 'CANCEL_PROJECT_AGREEMENT',
            payload: {
                agreementId: agreement.id,
                penaltyPercentage: parseFloat(penaltyPercentage) || 0,
                penaltyAmount: penaltyAmount,
                refundAmount: refundAmount,
                salesReturnId: salesReturn.id,
            }
        });

        // Update return status to PROCESSED
        dispatch({
            type: 'UPDATE_SALES_RETURN',
            payload: {
                ...salesReturn,
                status: SalesReturnStatus.PROCESSED,
                processedDate: new Date().toISOString(),
            }
        });

        onClose();
    };

    const reasonOptions = [
        { id: SalesReturnReason.CUSTOMER_REQUEST, name: SalesReturnReason.CUSTOMER_REQUEST },
        { id: SalesReturnReason.DEFECT_QUALITY, name: SalesReturnReason.DEFECT_QUALITY },
        { id: SalesReturnReason.CONTRACT_BREACH, name: SalesReturnReason.CONTRACT_BREACH },
        { id: SalesReturnReason.MUTUAL_AGREEMENT, name: SalesReturnReason.MUTUAL_AGREEMENT },
        { id: SalesReturnReason.OTHER, name: SalesReturnReason.OTHER },
    ];

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create Sales Return">
            <div className="space-y-6">
                {/* Agreement Selection */}
                <ComboBox
                    label="Select Agreement"
                    items={availableAgreements}
                    selectedId={selectedAgreementId}
                    onSelect={(item) => setSelectedAgreementId(item?.id || '')}
                    placeholder="Select an agreement to return..."
                    required
                />

                {!agreement && (
                    <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-sm text-amber-700">
                        Please select an agreement to proceed with the return.
                    </div>
                )}

                {agreement && (
                    <>
                        {/* Agreement Details */}
                        <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
                            <div className="flex justify-between text-sm text-slate-600">
                                <span>Agreement Number:</span>
                                <span className="font-semibold">{agreement.agreementNumber}</span>
                            </div>
                            <div className="flex justify-between text-sm text-slate-600">
                                <span>Selling Price:</span>
                                <span>{CURRENCY} {agreement.sellingPrice.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm text-slate-600">
                                <span>Total Paid by Client:</span>
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

                        {/* Return Reason */}
                        <div className="space-y-2">
                            <ComboBox
                                label="Return Reason"
                                items={reasonOptions}
                                selectedId={returnReason}
                                onSelect={(item) => setReturnReason(item?.id as SalesReturnReason || SalesReturnReason.CUSTOMER_REQUEST)}
                                required
                            />
                            {(returnReason === SalesReturnReason.OTHER || returnReason === SalesReturnReason.CONTRACT_BREACH) && (
                                <Input
                                    label="Reason Details"
                                    value={reasonNotes}
                                    onChange={e => setReasonNotes(e.target.value)}
                                    placeholder="Please provide details..."
                                />
                            )}
                        </div>

                        {/* Penalty Calculation */}
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
                        
                        {/* Accounting Note */}
                        <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                            <p className="text-xs text-amber-700 font-semibold mb-2">Accounting Note:</p>
                            <p className="text-xs text-amber-600">
                                Both penalty amount ({CURRENCY} {penaltyAmount.toLocaleString()}) and refundable amount ({CURRENCY} {refundAmount.toLocaleString()}) will be deducted from <strong>Unit Selling Income</strong> to reduce realized revenue.
                            </p>
                        </div>
                        
                        {/* Refund Amount */}
                        <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-100 text-center">
                            <div className="text-xs text-emerald-600 font-bold uppercase mb-1">Net Refund Amount</div>
                            <div className="text-3xl font-bold text-emerald-700">{CURRENCY} {refundAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                            {refundAmount > 0 && (
                                <p className="text-xs text-slate-500 mt-2">This amount will be moved to Accounts Payable and can be paid through the payout option.</p>
                            )}
                        </div>

                        {/* Return Number Preview */}
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <p className="text-xs text-slate-500">Return Number</p>
                            <p className="font-semibold text-slate-800">{returnNumber}</p>
                        </div>

                        {/* Notes */}
                        <Input
                            label="Additional Notes (Optional)"
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="Any additional information about this return..."
                        />
                    </>
                )}
                
                <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button 
                        variant="danger" 
                        onClick={handleConfirm}
                        disabled={!agreement || !selectedAgreementId}
                    >
                        Process Return
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default SalesReturnModal;

