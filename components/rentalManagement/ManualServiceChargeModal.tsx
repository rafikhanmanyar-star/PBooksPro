
import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { useNotification } from '../../context/NotificationContext';
import { Transaction, TransactionType, Category, RentalAgreementStatus } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import ComboBox from '../ui/ComboBox';
import { CURRENCY } from '../../constants';
import { getOwnerIdForPropertyOnDate } from '../../services/ownershipHistoryUtils';
import { getOwnershipSharesForPropertyOnDate } from '../../services/propertyOwnershipService';
import { currentMonthYyyyMm, firstDayOfMonthFromYyyyMm } from '../../utils/dateUtils';

interface ManualServiceChargeModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** When opening from Visual Layout card, pre-select this property and amount. */
    initialPropertyId?: string | null;
}

const ManualServiceChargeModal: React.FC<ManualServiceChargeModalProps> = ({
    isOpen,
    onClose,
    initialPropertyId = null,
}) => {
    const { state, dispatch } = useAppContext();
    const { showToast, showAlert } = useNotification();

    const [month, setMonth] = useState(currentMonthYyyyMm()); // YYYY-MM
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

    // Reset on open (optionally pre-fill from Visual Layout card)
    useEffect(() => {
        if (isOpen) {
            setMonth(currentMonthYyyyMm());
            if (initialPropertyId) {
                setPropertyId(initialPropertyId);
                const p = state.properties.find(x => x.id === initialPropertyId);
                setAmount(p?.monthlyServiceCharge?.toString() || '0');
            } else {
                setPropertyId('');
                setAmount('');
            }
        }
    }, [isOpen, initialPropertyId, state.properties]);

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
        let rentalIncomeCategory = state.categories.find(c => c.id === 'sys-cat-rent-inc' || c.name === 'Rental Income');
        let serviceIncomeCategory = state.categories.find(c => c.id === 'sys-cat-svc-inc' || c.name === 'Service Charge Income');

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

        // 4. Create Transactions — first day of selected month only (validated YYYY-MM-DD)
        const dateStr = firstDayOfMonthFromYyyyMm(month);
        if (!dateStr) {
            await showAlert('Invalid month selected.');
            return;
        }
        
        const baseTimestamp = Date.now();
        const isRented = getPropertyStatus(propertyId) === 'Rented';
        const statusLabel = isRented ? 'Rented' : 'Vacant';
        const shares = getOwnershipSharesForPropertyOnDate(state, property.id, dateStr);
        const round2 = (n: number) => Math.round(n * 100) / 100;
        const newTxs: Transaction[] = [];

        if (shares.length <= 1) {
            const ownerId = getOwnerIdForPropertyOnDate(
                property.id,
                dateStr,
                state.propertyOwnershipHistory || [],
                property.ownerId
            );

            newTxs.push({
                id: `bm-debit-man-${baseTimestamp}`,
                type: TransactionType.INCOME,
                amount: -numAmount,
                date: dateStr,
                description: `Service Charge Deduction for ${property.name} (Manual, ${statusLabel})`,
                accountId: cashAccount.id,
                categoryId: rentalIncomeCategory.id,
                propertyId: property.id,
                buildingId: property.buildingId,
                contactId: property.ownerId,
                ownerId,
                isSystem: true,
            });

            newTxs.push({
                id: `bm-credit-man-${baseTimestamp}`,
                type: TransactionType.INCOME,
                amount: numAmount,
                date: dateStr,
                description: `Service Charge Allocation for ${property.name} (Manual, ${statusLabel})`,
                accountId: cashAccount.id,
                categoryId: serviceIncomeCategory.id,
                propertyId: property.id,
                buildingId: property.buildingId,
                ownerId,
                isSystem: true,
            });
        } else {
            let allocated = 0;
            shares.forEach((s, si) => {
                const isLast = si === shares.length - 1;
                const portion = isLast ? round2(numAmount - allocated) : round2((numAmount * s.percentage) / 100);
                if (!isLast) allocated += portion;
                if (Math.abs(portion) < 0.001 && !isLast) return;
                const oid = s.ownerId;
                newTxs.push({
                    id: `bm-debit-man-${baseTimestamp}-${si}`,
                    type: TransactionType.INCOME,
                    amount: -portion,
                    date: dateStr,
                    description: `Service Charge Deduction for ${property.name} (Manual, ${statusLabel}) [${s.percentage.toFixed(2)}%]`,
                    accountId: cashAccount.id,
                    categoryId: rentalIncomeCategory.id,
                    propertyId: property.id,
                    buildingId: property.buildingId,
                    contactId: oid,
                    ownerId: oid,
                    isSystem: true,
                });
                newTxs.push({
                    id: `bm-credit-man-${baseTimestamp}-${si}`,
                    type: TransactionType.INCOME,
                    amount: portion,
                    date: dateStr,
                    description: `Service Charge Allocation for ${property.name} (Manual, ${statusLabel}) [${s.percentage.toFixed(2)}%]`,
                    accountId: cashAccount.id,
                    categoryId: serviceIncomeCategory.id,
                    propertyId: property.id,
                    buildingId: property.buildingId,
                    ownerId: oid,
                    isSystem: true,
                });
            });
        }

        dispatch({ type: 'BATCH_ADD_TRANSACTIONS', payload: newTxs });
        dispatch({ type: 'SET_LAST_SERVICE_CHARGE_RUN', payload: new Date().toISOString() });

        showToast(`Service charge of ${CURRENCY} ${numAmount} applied to ${property.name}.`, 'success');
        // Persist to DB immediately so data is not lost on logout/close/switch
        setTimeout(() => {
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('save-state-before-logout'));
            }
        }, 150);
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
