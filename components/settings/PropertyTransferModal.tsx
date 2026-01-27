import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { useNotification } from '../../context/NotificationContext';
import { Property, Contact, ContactType, RentalAgreement, RentalAgreementStatus } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import { CURRENCY, ICONS } from '../../constants';

interface PropertyTransferModalProps {
    isOpen: boolean;
    onClose: () => void;
    property: Property;
}

interface AgreementInfo {
    agreement: RentalAgreement;
    tenantName: string;
    securityDeposit: number;
}

const PropertyTransferModal: React.FC<PropertyTransferModalProps> = ({ isOpen, onClose, property }) => {
    const { state, dispatch } = useAppContext();
    const { showAlert, showToast, showConfirm } = useNotification();

    // Find current owner
    const currentOwner = useMemo(() => 
        state.contacts.find(c => c.id === property.ownerId),
        [state.contacts, property.ownerId]
    );

    // Get active agreements for this property
    const activeAgreements = useMemo<AgreementInfo[]>(() => {
        return state.rentalAgreements
            .filter(ra => 
                ra.propertyId === property.id && 
                ra.status === RentalAgreementStatus.ACTIVE
            )
            .map(ra => {
                const tenant = state.contacts.find(c => c.id === ra.contactId);
                return {
                    agreement: ra,
                    tenantName: tenant?.name || 'Unknown Tenant',
                    securityDeposit: ra.securityDeposit || 0
                };
            });
    }, [state.rentalAgreements, state.contacts, property.id]);

    // Get old agreements (RENEWED, EXPIRED, TERMINATED) for this property
    const oldAgreements = useMemo<AgreementInfo[]>(() => {
        return state.rentalAgreements
            .filter(ra => 
                ra.propertyId === property.id && 
                (ra.status === RentalAgreementStatus.RENEWED || 
                 ra.status === RentalAgreementStatus.EXPIRED || 
                 ra.status === RentalAgreementStatus.TERMINATED)
            )
            .map(ra => {
                const tenant = state.contacts.find(c => c.id === ra.contactId);
                return {
                    agreement: ra,
                    tenantName: tenant?.name || 'Unknown Tenant',
                    securityDeposit: ra.securityDeposit || 0
                };
            });
    }, [state.rentalAgreements, state.contacts, property.id]);

    // Calculate total security deposit
    const totalSecurityDeposit = useMemo(() => {
        return activeAgreements.reduce((sum, info) => sum + info.securityDeposit, 0);
    }, [activeAgreements]);

    // State
    const [newOwnerId, setNewOwnerId] = useState('');
    const [transferDate, setTransferDate] = useState(new Date().toISOString().split('T')[0]);
    const [transferReason, setTransferReason] = useState('Property Sale');
    const [shouldRenewAgreements, setShouldRenewAgreements] = useState(true);
    const [error, setError] = useState('');

    // Available owners (exclude current owner)
    const availableOwners = useMemo(() => 
        state.contacts.filter(c => 
            (c.type === ContactType.OWNER || c.type === ContactType.CLIENT) && 
            c.id !== property.ownerId
        ),
        [state.contacts, property.ownerId]
    );


    // Reset form when modal opens
    useEffect(() => {
        if (isOpen) {
            setNewOwnerId('');
            setTransferDate(new Date().toISOString().split('T')[0]);
            setTransferReason('Property Sale');
            setShouldRenewAgreements(activeAgreements.length > 0); // Only enable if there are active agreements
            setError('');
        }
    }, [isOpen, activeAgreements.length]);

    // Validation
    useEffect(() => {
        if (!isOpen) return;
        
        if (!newOwnerId) {
            setError('Please select a new owner');
            return;
        }

        // Remove validation error - property can be transferred even without active agreements
        setError('');
    }, [isOpen, newOwnerId]);

    // Helper to get next agreement number
    const getNextAgreementNumber = () => {
        const settings = state.agreementSettings;
        const { prefix, padding, nextNumber } = settings;
        
        let maxNum = nextNumber;
        state.rentalAgreements.forEach(a => {
            if (a.agreementNumber && a.agreementNumber.startsWith(prefix)) {
                const numPart = parseInt(a.agreementNumber.slice(prefix.length), 10);
                if (!isNaN(numPart) && numPart >= maxNum) maxNum = numPart + 1;
            }
        });
        return `${prefix}${String(maxNum).padStart(padding, '0')}`;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (error) {
            await showAlert(error);
            return;
        }

        if (!newOwnerId) {
            await showAlert('Please select a new owner');
            return;
        }

        const newOwner = state.contacts.find(c => c.id === newOwnerId);
        if (!newOwner) {
            await showAlert('Selected owner not found');
            return;
        }

        // Confirmation message
        let confirmMessage = `Are you sure you want to transfer this property to ${newOwner.name}?\n\n`;
        confirmMessage += `Property: ${property.name}\n`;
        confirmMessage += `Current Owner: ${currentOwner?.name || 'Unknown'}\n`;
        confirmMessage += `New Owner: ${newOwner.name}\n`;
        confirmMessage += `Transfer Date: ${transferDate}\n\n`;

        if (shouldRenewAgreements && activeAgreements.length > 0) {
            confirmMessage += `This will renew ${activeAgreements.length} active agreement(s).\n\n`;
        }

        if (oldAgreements.length > 0) {
            confirmMessage += `${oldAgreements.length} historical agreement(s) will have their owner records preserved.\n\n`;
        }

        if (activeAgreements.length === 0 && oldAgreements.length === 0) {
            confirmMessage += `No agreements found for this property. Only property ownership will be transferred.\n\n`;
        }

        if (totalSecurityDeposit > 0) {
            confirmMessage += `⚠️ IMPORTANT: Security deposits (${CURRENCY} ${totalSecurityDeposit.toLocaleString()}) must be transferred manually:\n`;
            confirmMessage += `  1. Pay security deposit refund to tenant from old owner\n`;
            confirmMessage += `  2. Collect security deposit from tenant for new owner (new security invoice)\n\n`;
        }

        const confirmed = await showConfirm(confirmMessage, {
            title: 'Confirm Property Transfer',
            confirmLabel: 'Transfer Property',
            cancelLabel: 'Cancel'
        });

        if (!confirmed) return;

        try {
            // Preserve old owner ID before property transfer (needed for old agreements)
            const oldOwnerId = property.ownerId;

            // 1. Update Property Owner
            const updatedProperty: Property = {
                ...property,
                ownerId: newOwnerId,
                description: property.description 
                    ? `${property.description}\n\n[TRANSFERRED] Previously owned by ${currentOwner?.name || 'Unknown'} until ${transferDate}. Reason: ${transferReason}`
                    : `[TRANSFERRED] Previously owned by ${currentOwner?.name || 'Unknown'} until ${transferDate}. Reason: ${transferReason}`
            };

            dispatch({
                type: 'UPDATE_PROPERTY',
                payload: updatedProperty
            });

            // 2. Update old agreements (RENEWED, EXPIRED, TERMINATED) to preserve old owner ID
            // This ensures historical records show the correct owner at the time of the agreement
            oldAgreements.forEach(agreementInfo => {
                const oldAgreement = agreementInfo.agreement;
                // Only update if ownerId is not already set (to avoid overwriting previous transfers)
                if (!oldAgreement.ownerId) {
                    dispatch({
                        type: 'UPDATE_RENTAL_AGREEMENT',
                        payload: {
                            ...oldAgreement,
                            ownerId: oldOwnerId, // Preserve old owner ID for historical records
                            description: oldAgreement.description 
                                ? `${oldAgreement.description}\n\n[OWNERSHIP] Property ownership changed on ${transferDate}. This agreement was with ${currentOwner?.name || 'previous owner'} when active.`
                                : `[OWNERSHIP] Property ownership changed on ${transferDate}. This agreement was with ${currentOwner?.name || 'previous owner'} when active.`
                        }
                    });
                }
            });

            // 3. Renew Active Agreements (if requested and available)
            if (shouldRenewAgreements && activeAgreements.length > 0) {
                const secDepCategory = state.categories.find(c => c.name === 'Security Deposit');
                const buildingId = property.buildingId;

                for (const agreementInfo of activeAgreements) {
                    const oldAgreement = agreementInfo.agreement;

                    // Mark old agreement as RENEWED and preserve old owner ID for historical records
                    dispatch({
                        type: 'UPDATE_RENTAL_AGREEMENT',
                        payload: {
                            ...oldAgreement,
                            status: RentalAgreementStatus.RENEWED,
                            ownerId: oldOwnerId, // Preserve old owner ID before property transfer
                            description: oldAgreement.description 
                                ? `${oldAgreement.description}\n\n[TRANSFERRED] Agreement ended due to property transfer on ${transferDate}. Property was transferred from ${currentOwner?.name || 'previous owner'} to ${newOwner.name}.`
                                : `[TRANSFERRED] Agreement ended due to property transfer on ${transferDate}. Property was transferred from ${currentOwner?.name || 'previous owner'} to ${newOwner.name}.`
                        }
                    });

                    // Stop old recurring templates
                    const activeOldTemplates = state.recurringInvoiceTemplates.filter(
                        t => t.agreementId === oldAgreement.id && t.active
                    );
                    activeOldTemplates.forEach(template => {
                        dispatch({
                            type: 'UPDATE_RECURRING_TEMPLATE',
                            payload: { ...template, active: false }
                        });
                    });

                    // Create new agreement
                    const newAgreementId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
                    const newAgreementNumber = getNextAgreementNumber();

                    const newAgreement: RentalAgreement = {
                        id: newAgreementId,
                        agreementNumber: newAgreementNumber,
                        tenantId: oldAgreement.contactId,
                        propertyId: property.id,
                        startDate: transferDate,
                        endDate: oldAgreement.endDate, // Keep same end date or extend as needed
                        monthlyRent: oldAgreement.monthlyRent,
                        rentDueDate: oldAgreement.rentDueDate,
                        status: RentalAgreementStatus.ACTIVE,
                        securityDeposit: oldAgreement.securityDeposit,
                        brokerId: oldAgreement.brokerId,
                        brokerFee: oldAgreement.brokerFee,
                        ownerId: newOwnerId, // Store new owner ID for this agreement
                        description: `Renewed due to property transfer to ${newOwner.name} on ${transferDate}. Previous agreement: ${oldAgreement.agreementNumber}`
                    };

                    dispatch({
                        type: 'ADD_RENTAL_AGREEMENT',
                        payload: newAgreement
                    });

                    // Update agreement settings counter
                    const nextSeq = parseInt(newAgreementNumber.slice(state.agreementSettings.prefix.length)) + 1;
                    dispatch({
                        type: 'UPDATE_AGREEMENT_SETTINGS',
                        payload: { ...state.agreementSettings, nextNumber: nextSeq }
                    });
                }
            }


            showToast('Property transferred successfully!', 'success');
            onClose();

        } catch (err: any) {
            await showAlert(`Error transferring property: ${err.message || 'Unknown error'}`);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Transfer Property" size="lg">
            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Property Info */}
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Property</div>
                            <div className="font-semibold text-slate-700">{property.name}</div>
                        </div>
                        <div>
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Current Owner</div>
                            <div className="font-semibold text-slate-700">{currentOwner?.name || 'Unknown'}</div>
                        </div>
                    </div>
                </div>

                {/* Visual Transfer Flow */}
                <div className="flex items-center justify-between bg-gradient-to-r from-slate-50 to-indigo-50 p-4 rounded-xl border-2 border-slate-200">
                    <div className="text-center flex-1">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">From</div>
                        <div className="font-semibold text-slate-700 truncate" title={currentOwner?.name || 'Unknown'}>
                            {currentOwner?.name || 'Unknown Owner'}
                        </div>
                    </div>
                    
                    <div className="text-slate-400 mx-4">
                        {ICONS.arrowRight}
                    </div>

                    <div className="text-center flex-1">
                        <div className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2">To</div>
                        <div className="font-semibold text-indigo-700">
                            {newOwnerId 
                                ? (state.contacts.find(c => c.id === newOwnerId)?.name || 'New Owner')
                                : 'Select New Owner'}
                        </div>
                    </div>
                </div>

                {/* New Owner Selection */}
                <ComboBox
                    label="New Owner *"
                    items={availableOwners}
                    selectedId={newOwnerId}
                    onSelect={(item) => setNewOwnerId(item?.id || '')}
                    placeholder="Search and select new owner..."
                    required
                />

                {/* Transfer Date */}
                <DatePicker
                    label="Transfer Date *"
                    value={transferDate}
                    onChange={(date) => setTransferDate(date.toISOString().split('T')[0])}
                    required
                />

                {/* Transfer Reason */}
                <Input
                    label="Transfer Reason"
                    value={transferReason}
                    onChange={(e) => setTransferReason(e.target.value)}
                    placeholder="e.g., Property Sale, Gift, etc."
                />

                {/* Active Agreements Section */}
                {activeAgreements.length > 0 && (
                    <div className="border-t pt-4">
                        <div className="mb-4">
                            <h3 className="text-sm font-bold text-slate-700 mb-2">
                                Active Agreements ({activeAgreements.length})
                            </h3>
                            <div className="space-y-2">
                                {activeAgreements.map((info, idx) => (
                                    <div key={info.agreement.id} className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1">
                                                <div className="font-medium text-slate-700">
                                                    Agreement #{info.agreement.agreementNumber}
                                                </div>
                                                <div className="text-xs text-slate-500 mt-1">
                                                    Tenant: {info.tenantName}
                                                </div>
                                                <div className="text-xs text-slate-500">
                                                    Security Deposit: {CURRENCY} {info.securityDeposit.toLocaleString()}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-3">
                            <label className="flex items-start gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={shouldRenewAgreements}
                                    onChange={(e) => setShouldRenewAgreements(e.target.checked)}
                                    className="mt-1 w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                                />
                                <div className="flex-1">
                                    <div className="font-medium text-slate-700">
                                        Renew agreements with new owner
                                    </div>
                                    <div className="text-xs text-slate-500 mt-1">
                                        Creates new agreements linked to the new owner. Old agreements will be marked as "RENEWED".
                                    </div>
                                </div>
                            </label>
                        </div>
                    </div>
                )}

                {/* Old Agreements Section (for informational purposes) */}
                {oldAgreements.length > 0 && (
                    <div className="border-t pt-4">
                        <div className="mb-2">
                            <h3 className="text-sm font-bold text-slate-600 mb-2">
                                Historical Agreements ({oldAgreements.length})
                            </h3>
                            <div className="text-xs text-slate-500 mb-2">
                                These old agreements will have their owner records preserved for historical accuracy.
                            </div>
                            <div className="space-y-2 max-h-32 overflow-y-auto">
                                {oldAgreements.map((info, idx) => (
                                    <div key={info.agreement.id} className="bg-slate-50 p-2 rounded border border-slate-200">
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1">
                                                <div className="text-xs font-medium text-slate-600">
                                                    {info.agreement.agreementNumber} - {info.agreement.status}
                                                </div>
                                                <div className="text-xs text-slate-400 mt-0.5">
                                                    Tenant: {info.tenantName}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Security Deposit Manual Transfer Warning */}
                {totalSecurityDeposit > 0 && (
                    <div className="border-t pt-4">
                        <div className="bg-amber-50 border-2 border-amber-400 rounded-lg p-4">
                            <div className="flex items-start gap-3">
                                <div className="text-amber-600 mt-0.5 flex-shrink-0">{ICONS.alertTriangle}</div>
                                <div className="flex-1">
                                    <div className="font-bold text-amber-900 mb-2">
                                        Manual Security Deposit Transfer Required
                                    </div>
                                    <div className="text-sm text-amber-800 mb-3">
                                        Total Security Deposit: <span className="font-semibold">{CURRENCY} {totalSecurityDeposit.toLocaleString()}</span>
                                    </div>
                                    <div className="text-sm text-amber-900 space-y-2">
                                        <div className="font-semibold">You must manually transfer security deposits:</div>
                                        <ol className="list-decimal list-inside space-y-1 ml-2">
                                            <li>Pay security deposit refund to tenant from <strong>{currentOwner?.name || 'old owner'}'s ledger</strong></li>
                                            <li>Collect security deposit from tenant for <strong>new owner</strong> (create new security invoice after transfer)</li>
                                        </ol>
                                    </div>
                                    <div className="mt-3 pt-3 border-t border-amber-300 text-xs text-amber-700 italic">
                                        Note: The old owner's records will remain in the system for historical reference.
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Error Message */}
                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                        <div className="text-sm text-red-800">{error}</div>
                    </div>
                )}

                {/* Action Buttons */}
                <div className="flex justify-end gap-3 pt-4 border-t">
                    <Button type="button" variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button 
                        type="submit" 
                        disabled={!!error || !newOwnerId}
                    >
                        Transfer Property
                    </Button>
                </div>
            </form>
        </Modal>
    );
};

export default PropertyTransferModal;

