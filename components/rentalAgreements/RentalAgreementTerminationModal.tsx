
import React, { useState, useMemo, useEffect } from 'react';
import { RentalAgreement, RentalAgreementStatus, TransactionType, AccountType } from '../../types';
import { useAppContext } from '../../context/AppContext';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import { CURRENCY } from '../../constants';
import { useNotification } from '../../context/NotificationContext';

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
    
    // Refund Mode State
    const [refundAction, setRefundAction] = useState<'COMPANY_REFUND' | 'OWNER_DIRECT' | 'NONE'>('NONE');

    // Filter for Bank Accounts (exclude Internal Clearing)
    const userSelectableAccounts = useMemo(() => state.accounts.filter(a => a.type === AccountType.BANK && a.name !== 'Internal Clearing'), [state.accounts]);

    useEffect(() => {
        if (isOpen && agreement) {
            setEndDate(new Date().toISOString().split('T')[0]);
            // Default refund to security deposit if exists
            setRefundAmount(agreement.securityDeposit ? agreement.securityDeposit.toString() : '0');
            
            // Determine default action based on deposit existence
            if (agreement.securityDeposit && agreement.securityDeposit > 0) {
                setRefundAction('COMPANY_REFUND');
            } else {
                setRefundAction('NONE');
            }
            
            setRefundAccountId(''); 
            setStatus(RentalAgreementStatus.TERMINATED);
            setNotes('');
        }
    }, [isOpen, agreement]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!agreement) return;

        // Check for active recurring templates
        const activeTemplates = state.recurringInvoiceTemplates.filter(t => t.agreementId === agreement.id && t.active);
        
        if (activeTemplates.length > 0) {
            const confirmStop = await showConfirm(
                `This agreement has ${activeTemplates.length} active recurring invoice setup(s). Terminating the agreement will automatically STOP these recurring invoices. Proceed?`,
                { title: "Stop Recurring Invoices", confirmLabel: "Stop & Terminate", cancelLabel: "Cancel" }
            );
            if (!confirmStop) return;
        }

        // 1. Process Refund if selected
        if (refundAction === 'COMPANY_REFUND') {
            const amount = parseFloat(refundAmount);
            if (isNaN(amount) || amount <= 0) {
                await showAlert("Please enter a valid refund amount.");
                return;
            }
            if (!refundAccountId) {
                await showAlert("Please select an account for the refund.");
                return;
            }

            const refundCategory = state.categories.find(c => c.name === 'Security Deposit Refund');
            if (!refundCategory) {
                await showAlert("System Error: 'Security Deposit Refund' category missing.");
                return;
            }

            dispatch({
                type: 'ADD_TRANSACTION',
                payload: {
                    id: Date.now().toString(),
                    type: TransactionType.EXPENSE,
                    amount: amount,
                    date: endDate,
                    description: `Security Deposit Refund - Agreement #${agreement.agreementNumber} (${notes || status})`,
                    accountId: refundAccountId,
                    categoryId: refundCategory.id,
                    contactId: agreement.contactId,
                    propertyId: agreement.propertyId,
                    agreementId: agreement.id
                }
            });
        }

        // 2. Update Agreement
        let description = agreement.description || '';
        if (refundAction === 'OWNER_DIRECT') {
            description += ` | Terminated on ${endDate}. Security refunded directly by Owner.`;
        } else {
            description += ` | ${status} on ${endDate}`;
        }

        dispatch({
            type: 'UPDATE_RENTAL_AGREEMENT',
            payload: {
                ...agreement,
                status: status,
                endDate: new Date(endDate).toISOString(),
                description
            }
        });

        // 3. Deactivate Recurring Templates linked to this agreement
        if (activeTemplates.length > 0) {
            activeTemplates.forEach(t => {
                dispatch({
                    type: 'UPDATE_RECURRING_TEMPLATE',
                    payload: { ...t, active: false }
                });
            });
        }

        showToast(`Agreement marked as ${status} and recurring invoices stopped.`);
        onClose();
    };

    if (!agreement) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`End Agreement #${agreement.agreementNumber}`}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="p-3 bg-slate-50 rounded border border-slate-200 text-sm mb-2">
                    <div className="flex justify-between">
                        <span className="text-slate-500">Security Deposit Held:</span>
                        <span className="font-semibold">{CURRENCY} {(agreement.securityDeposit || 0).toLocaleString()}</span>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <Select label="Status" value={status} onChange={e => setStatus(e.target.value as RentalAgreementStatus)}>
                        <option value={RentalAgreementStatus.TERMINATED}>Terminated</option>
                        <option value={RentalAgreementStatus.EXPIRED}>Expired</option>
                    </Select>
                    <DatePicker 
                        label="End Date" 
                        value={endDate} 
                        onChange={d => setEndDate(d.toISOString().split('T')[0])} 
                        required 
                    />
                </div>

                <div className="border-t pt-4 mt-4 space-y-3">
                    <label className="block text-sm font-medium text-slate-700 mb-2">Security Deposit Handling</label>
                    
                    <div className="space-y-2">
                        <label className="flex items-start gap-3 cursor-pointer p-2 border rounded-lg hover:bg-slate-50 transition-colors">
                            <input 
                                type="radio" 
                                name="refundAction"
                                checked={refundAction === 'COMPANY_REFUND'} 
                                onChange={() => setRefundAction('COMPANY_REFUND')}
                                className="mt-1 text-accent focus:ring-accent"
                            />
                            <div>
                                <span className="block text-sm font-medium text-slate-800">Refund from Company Account</span>
                                <span className="block text-xs text-slate-500">Records a 'Security Deposit Refund' expense transaction.</span>
                            </div>
                        </label>
                        
                        <label className="flex items-start gap-3 cursor-pointer p-2 border rounded-lg hover:bg-slate-50 transition-colors">
                            <input 
                                type="radio" 
                                name="refundAction"
                                checked={refundAction === 'OWNER_DIRECT'} 
                                onChange={() => setRefundAction('OWNER_DIRECT')}
                                className="mt-1 text-accent focus:ring-accent"
                            />
                            <div>
                                <span className="block text-sm font-medium text-slate-800">Refunded Directly by Owner</span>
                                <span className="block text-xs text-slate-500">No transaction recorded. Use this if funds were already paid out to owner.</span>
                            </div>
                        </label>
                        
                        <label className="flex items-start gap-3 cursor-pointer p-2 border rounded-lg hover:bg-slate-50 transition-colors">
                            <input 
                                type="radio" 
                                name="refundAction"
                                checked={refundAction === 'NONE'} 
                                onChange={() => setRefundAction('NONE')}
                                className="mt-1 text-accent focus:ring-accent"
                            />
                            <div>
                                <span className="block text-sm font-medium text-slate-800">No Refund / Forfeit</span>
                                <span className="block text-xs text-slate-500">Deposit is forfeited or carried over.</span>
                            </div>
                        </label>
                    </div>

                    {refundAction === 'COMPANY_REFUND' && (
                        <div className="space-y-4 pl-4 border-l-2 border-slate-200 animate-fade-in mt-3">
                            <Input 
                                label="Refund Amount" 
                                type="number" 
                                value={refundAmount} 
                                onChange={e => setRefundAmount(e.target.value)} 
                                required={refundAction === 'COMPANY_REFUND'}
                            />
                            <ComboBox 
                                label="Pay From Account"
                                items={userSelectableAccounts}
                                selectedId={refundAccountId}
                                onSelect={item => setRefundAccountId(item?.id || '')}
                                placeholder="Select account"
                                required={refundAction === 'COMPANY_REFUND'}
                            />
                        </div>
                    )}
                </div>

                <Input 
                    label="Notes (Optional)" 
                    value={notes} 
                    onChange={e => setNotes(e.target.value)} 
                    placeholder="Reason for termination, deductions, etc."
                />

                <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button type="submit" variant="danger">Confirm {status}</Button>
                </div>
            </form>
        </Modal>
    );
};

export default RentalAgreementTerminationModal;
