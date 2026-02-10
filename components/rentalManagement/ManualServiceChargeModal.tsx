
import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { useNotification } from '../../context/NotificationContext';
import { Transaction, TransactionType, Category, RentalAgreementStatus } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import ComboBox from '../ui/ComboBox';
import { CURRENCY } from '../../constants';

interface ManualServiceChargeModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const ManualServiceChargeModal: React.FC<ManualServiceChargeModalProps> = ({ isOpen, onClose }) => {
    const { state, dispatch } = useAppContext();
    const { showToast, showAlert } = useNotification();

    const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    const [propertyId, setPropertyId] = useState('');
    const [amount, setAmount] = useState('');

    // Helper to check rental status
    const getPropertyStatus = (propId: string): 'Rented' | 'Vacant' => {
        return state.rentalAgreements.some(
            a => a.propertyId === propId && a.status === RentalAgreementStatus.ACTIVE
        ) ? 'Rented' : 'Vacant';
    };

    // Filter properties - show status and owner
    const propertyItems = useMemo(() => state.properties.map(p => {
        const owner = state.contacts.find(c => c.id === p.ownerId)?.name || 'Unknown';
        const status = getPropertyStatus(p.id);
        return { 
            id: p.id, 
            name: `${p.name} [${status}] (Owner: ${owner})` 
        };
    }), [state.properties, state.contacts, state.rentalAgreements]);

    // Auto-fill amount when property changes
    useEffect(() => {
        if (propertyId) {
            const property = state.properties.find(p => p.id === propertyId);
            if (property) {
                setAmount(property.monthlyServiceCharge?.toString() || '0');
            }
        }
    }, [propertyId, state.properties]);

    // Reset on open
    useEffect(() => {
        if (isOpen) {
            setMonth(new Date().toISOString().slice(0, 7));
            setPropertyId('');
            setAmount('');
        }
    }, [isOpen]);

    const handleSubmit = async () => {
        if (!month) {
            await showAlert('Please select a valid month.');
            return;
        }
        
        if (!propertyId) {
            await showAlert('Please select a Unit/Property.');
            return;
        }
        
        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            await showAlert('Please enter a valid positive amount.');
            return;
        }

        const property = state.properties.find(p => p.id === propertyId);
        if (!property || !property.ownerId) {
            await showAlert('Selected property does not have a valid owner assigned.');
            return;
        }

        // 1. Identify Categories
        let rentalIncomeCategory = state.categories.find(c => c.name === 'Rental Income');
        let serviceIncomeCategory = state.categories.find(c => c.name === 'Service Charge Income');

        // Ensure categories exist (similar to bulk run)
        if (!rentalIncomeCategory || !serviceIncomeCategory) {
             await showAlert("Critical Error: Required categories ('Rental Income' or 'Service Charge Income') missing. Please check settings.");
             return;
        }

        // 2. Find System Account (Cash)
        let cashAccount = state.accounts.find(a => a.name === 'Cash');
        if (!cashAccount) cashAccount = state.accounts[0];
        if (!cashAccount) {
            await showAlert("No accounts found to record transaction.");
            return;
        }

        // 3. DUPLICATE CHECK
        // Check if a 'Service Charge Income' transaction exists for this property in this month
        const alreadyExists = state.transactions.some(tx => 
            tx.propertyId === propertyId &&
            tx.categoryId === serviceIncomeCategory!.id &&
            tx.date.startsWith(month)
        );

        if (alreadyExists) {
            await showAlert(`Service charges for ${month} have already been deducted for this unit.`);
            return;
        }

        // 4. Create Transactions
        const dateStr = `${month}-01`; // Default to 1st of selected month
        const dateObj = new Date(dateStr);
        
        if (isNaN(dateObj.getTime())) {
            await showAlert('Invalid month selected.');
            return;
        }
        
        const baseTimestamp = Date.now();

        const debitTx: Transaction = {
            id: `bm-debit-man-${baseTimestamp}`,
            type: TransactionType.INCOME, 
            amount: -numAmount, 
            date: dateStr,
            description: `Service Charge Deduction for ${property.name} (Manual)`,
            accountId: cashAccount.id, 
            categoryId: rentalIncomeCategory.id, 
            propertyId: property.id,
            buildingId: property.buildingId,
            contactId: property.ownerId,
            isSystem: true,
        };

        const creditTx: Transaction = {
            id: `bm-credit-man-${baseTimestamp}`,
            type: TransactionType.INCOME,
            amount: numAmount, 
            date: dateStr,
            description: `Service Charge Allocation for ${property.name} (Manual)`,
            accountId: cashAccount.id,
            categoryId: serviceIncomeCategory.id, 
            propertyId: property.id,
            buildingId: property.buildingId,
            isSystem: true,
        };

        dispatch({ type: 'BATCH_ADD_TRANSACTIONS', payload: [debitTx, creditTx] });
        dispatch({ type: 'SET_LAST_SERVICE_CHARGE_RUN', payload: new Date().toISOString() });

        showToast(`Service charge of ${CURRENCY} ${numAmount} applied to ${property.name}.`, 'success');
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Manual Service Charges Deduction">
            <div className="space-y-4">
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-sm text-blue-800">
                    This will deduct the service charge from the Owner's balance and add it to the Building Service Fund, regardless of whether the property is rented or vacant.
                </div>

                <Input 
                    label="Month" 
                    type="month" 
                    value={month} 
                    onChange={e => setMonth(e.target.value)} 
                    required 
                />

                <ComboBox 
                    label="Unit / Property" 
                    items={propertyItems} 
                    selectedId={propertyId} 
                    onSelect={(item) => setPropertyId(item?.id || '')}
                    placeholder="Select Unit"
                    required
                    allowAddNew={false}
                />

                {propertyId && (() => {
                    const status = getPropertyStatus(propertyId);
                    return (
                        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                            status === 'Rented' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                            <span className={`inline-block w-2 h-2 rounded-full ${status === 'Rented' ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                            Property is <strong>{status}</strong>
                            {status === 'Vacant' && ' — owner will be charged with no rental income offset'}
                        </div>
                    );
                })()}

                <Input 
                    label="Charges Amount" 
                    type="text" 
                    inputMode="decimal" 
                    value={amount} 
                    onChange={e => setAmount(e.target.value)} 
                    required 
                />

                <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSubmit}>Apply Charges</Button>
                </div>
            </div>
        </Modal>
    );
};

export default ManualServiceChargeModal;
