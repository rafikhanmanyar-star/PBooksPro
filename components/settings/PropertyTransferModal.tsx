import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import { AppAction, Property, Contact, ContactType, RentalAgreement, RentalAgreementStatus } from '../../types';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { getAppStateApiService } from '../../services/api/appStateApi';
import { apiClient } from '../../services/api/client';
import { applyLegacySingleOwnerTransfer } from '../../services/propertyOwnershipService';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import { CURRENCY, ICONS } from '../../constants';
import { toLocalDateString } from '../../utils/dateUtils';
import { parseApiEntityVersion } from '../../utils/parseApiVersion';

function is409Conflict(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const e = err as { status?: number; code?: string; message?: string };
    if (e.status === 409) return true;
    if (e.code === 'CONFLICT') return true;
    const m = typeof e.message === 'string' ? e.message : '';
    return /modified by another user|409|conflict/i.test(m);
}

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
    const { isAuthenticated } = useAuth();

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
    const [transferDate, setTransferDate] = useState(toLocalDateString(new Date()));
    const [transferReason, setTransferReason] = useState('Property Sale');
    const [transferReference, setTransferReference] = useState('');
    const [notes, setNotes] = useState('');
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


    // Current ownership from history (for validation)
    const currentOwnershipRow = useMemo(() => 
        (state.propertyOwnershipHistory || []).find(
            h => h.propertyId === property.id && h.ownershipEndDate == null
        ),
        [state.propertyOwnershipHistory, property.id]
    );
    const lastOwnershipStartDate = currentOwnershipRow?.ownershipStartDate ?? '2000-01-01';

    // Reset form when modal opens
    useEffect(() => {
        if (isOpen) {
            setNewOwnerId('');
            setTransferDate(toLocalDateString(new Date()));
            setTransferReason('Property Sale');
            setTransferReference('');
            setNotes('');
            setShouldRenewAgreements(activeAgreements.length > 0);
            setError('');
        }
    }, [isOpen, activeAgreements.length]);

    // Validation: new owner required; transfer date after last ownership start; cannot transfer to same owner
    useEffect(() => {
        if (!isOpen) return;
        if (!newOwnerId) {
            setError('Please select a new owner');
            return;
        }
        if (newOwnerId === property.ownerId) {
            setError('Cannot transfer to the same owner');
            return;
        }
        if (transferDate <= lastOwnershipStartDate) {
            setError(`Transfer date must be after ${lastOwnershipStartDate}`);
            return;
        }
        setError('');
    }, [isOpen, newOwnerId, property.ownerId, transferDate, lastOwnershipStartDate]);

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
            const oldOwnerId = property.ownerId;
            const useApi = !isLocalOnlyMode() && isAuthenticated;
            let persistedPropertyVersion: number | undefined;

            if (useApi) {
                const api = getAppStateApiService();

                const tenantId = apiClient.getTenantId() || 'local';
                const afterOwnership = applyLegacySingleOwnerTransfer(state, {
                    propertyId: property.id,
                    newOwnerId,
                    transferDate,
                    transferReference: transferReference.trim() || undefined,
                    notes: notes.trim() || undefined,
                    tenantId,
                });
                const transferredProp = afterOwnership.properties.find((p) => p.id === property.id);
                if (!transferredProp) {
                    throw new Error('Property not found after transfer transform');
                }
                const updatedPropForStore: Property = {
                    ...transferredProp,
                    description: property.description
                        ? `${property.description}\n\n[TRANSFERRED] Previously owned by ${currentOwner?.name || 'Unknown'} until ${transferDate}. Reason: ${transferReason}`
                        : `[TRANSFERRED] Previously owned by ${currentOwner?.name || 'Unknown'} until ${transferDate}. Reason: ${transferReason}`,
                };
                const ownershipRows = (afterOwnership.propertyOwnership || [])
                    .filter((r) => String(r.propertyId) === String(property.id))
                    .map((r) => ({
                        id: r.id,
                        ownerId: r.ownerId,
                        ownershipPercentage: r.ownershipPercentage,
                        startDate: r.startDate,
                        endDate: r.endDate ?? null,
                        isActive: r.isActive,
                    }));

                await api.syncPropertyOwnership(property.id, ownershipRows);

                const bodyBase = {
                    name: updatedPropForStore.name,
                    ownerId: updatedPropForStore.ownerId,
                    buildingId: updatedPropForStore.buildingId,
                    description: updatedPropForStore.description,
                    monthlyServiceCharge: updatedPropForStore.monthlyServiceCharge,
                };

                let savedAfterPersist: Awaited<ReturnType<typeof api.updateProperty>> | undefined;
                let lastErr: unknown;
                const maxAttempts = 5;
                for (let attempt = 0; attempt < maxAttempts; attempt++) {
                    try {
                        if (attempt > 0) {
                            await new Promise((r) => setTimeout(r, 60 * attempt));
                        }
                        const fresh = await api.fetchPropertyFromApi(property.id);
                        const live = state.properties.find((p) => String(p.id) === String(property.id));
                        const propVersionForLock =
                            parseApiEntityVersion(fresh?.version) ??
                            parseApiEntityVersion((live as { version?: unknown } | undefined)?.version) ??
                            parseApiEntityVersion((property as { version?: unknown }).version);

                        savedAfterPersist = await api.updateProperty(
                            property.id,
                            {
                                ...bodyBase,
                                ...(propVersionForLock !== undefined ? { version: propVersionForLock } : {}),
                            },
                            { skipConflictNotification: true }
                        );
                        break;
                    } catch (err: unknown) {
                        lastErr = err;
                        if (attempt < maxAttempts - 1 && is409Conflict(err)) {
                            continue;
                        }
                        if (is409Conflict(err)) {
                            try {
                                savedAfterPersist = await api.updateProperty(
                                    property.id,
                                    { ...bodyBase },
                                    { skipConflictNotification: true }
                                );
                                lastErr = undefined;
                                break;
                            } catch (e2) {
                                throw e2;
                            }
                        }
                        throw err;
                    }
                }
                if (savedAfterPersist === undefined) {
                    throw lastErr instanceof Error ? lastErr : new Error('Could not save property after transfer.');
                }
                if (typeof (savedAfterPersist as { version?: number }).version === 'number') {
                    persistedPropertyVersion = (savedAfterPersist as { version: number }).version;
                }

                for (const agreementInfo of oldAgreements) {
                    const oldAgreement = agreementInfo.agreement;
                    if (!oldAgreement.ownerId) {
                        await api.updateRentalAgreement(oldAgreement.id, {
                            ...oldAgreement,
                            ownerId: oldOwnerId,
                            description: oldAgreement.description
                                ? `${oldAgreement.description}\n\n[OWNERSHIP] Property ownership changed on ${transferDate}. This agreement was with ${currentOwner?.name || 'previous owner'} when active.`
                                : `[OWNERSHIP] Property ownership changed on ${transferDate}. This agreement was with ${currentOwner?.name || 'previous owner'} when active.`,
                            ...(oldAgreement.version !== undefined ? { version: oldAgreement.version } : {}),
                        });
                    }
                }

                if (shouldRenewAgreements && activeAgreements.length > 0) {
                    for (const agreementInfo of activeAgreements) {
                        const oldAgreement = agreementInfo.agreement;
                        await api.updateRentalAgreement(oldAgreement.id, {
                            ...oldAgreement,
                            status: RentalAgreementStatus.RENEWED,
                            ownerId: oldOwnerId,
                            description: oldAgreement.description
                                ? `${oldAgreement.description}\n\n[TRANSFERRED] Agreement ended due to property transfer on ${transferDate}. Property was transferred from ${currentOwner?.name || 'previous owner'} to ${newOwner.name}.`
                                : `[TRANSFERRED] Agreement ended due to property transfer on ${transferDate}. Property was transferred from ${currentOwner?.name || 'previous owner'} to ${newOwner.name}.`,
                            ...(oldAgreement.version !== undefined ? { version: oldAgreement.version } : {}),
                        });

                        const oldTemplates = state.recurringInvoiceTemplates.filter(
                            (t) => t.agreementId === oldAgreement.id
                        );
                        for (const template of oldTemplates) {
                            await api.deleteRecurringTemplate(template.id);
                        }

                        const newAgreementId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
                        const newAgreementNumber = getNextAgreementNumber();
                        const newAgreement: RentalAgreement = {
                            id: newAgreementId,
                            agreementNumber: newAgreementNumber,
                            contactId: oldAgreement.contactId,
                            propertyId: property.id,
                            startDate: transferDate,
                            endDate: oldAgreement.endDate,
                            monthlyRent: oldAgreement.monthlyRent,
                            rentDueDate: oldAgreement.rentDueDate,
                            status: RentalAgreementStatus.ACTIVE,
                            securityDeposit: oldAgreement.securityDeposit,
                            brokerId: oldAgreement.brokerId,
                            brokerFee: oldAgreement.brokerFee,
                            ownerId: newOwnerId,
                            previousAgreementId: oldAgreement.id,
                            description: `Renewed due to property transfer to ${newOwner.name} on ${transferDate}. Previous agreement: ${oldAgreement.agreementNumber}`,
                        };
                        await api.saveRentalAgreement(newAgreement);

                        const nextSeq =
                            parseInt(newAgreementNumber.slice(state.agreementSettings.prefix.length), 10) + 1;
                        await api.flushTenantSettingsNow({
                            ...state,
                            agreementSettings: { ...state.agreementSettings, nextNumber: nextSeq },
                        });
                    }
                }
            }

            // 1. Ownership history + current owner (closes current row, adds new row, updates property.ownerId)
            dispatch({
                type: 'TRANSFER_PROPERTY_OWNERSHIP',
                payload: {
                    propertyId: property.id,
                    newOwnerId,
                    transferDate,
                    transferReference: transferReference.trim() || undefined,
                    notes: notes.trim() || undefined,
                },
            });

            // 2. Update property description for display (keep server version after API persist so later edits do not 409)
            const updatedProperty = {
                ...property,
                ownerId: newOwnerId,
                description: property.description
                    ? `${property.description}\n\n[TRANSFERRED] Previously owned by ${currentOwner?.name || 'Unknown'} until ${transferDate}. Reason: ${transferReason}`
                    : `[TRANSFERRED] Previously owned by ${currentOwner?.name || 'Unknown'} until ${transferDate}. Reason: ${transferReason}`,
                ...(persistedPropertyVersion !== undefined
                    ? { version: persistedPropertyVersion }
                    : {}),
            } as Property;
            dispatch({ type: 'UPDATE_PROPERTY', payload: updatedProperty });

            // 3. Update old agreements (RENEWED, EXPIRED, TERMINATED) to preserve old owner ID
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
                        },
                        ...(useApi ? { _isRemote: true } : {}),
                    } as AppAction);
                }
            });

            // 4. Renew Active Agreements (if requested and available)
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
                        },
                        ...(useApi ? { _isRemote: true } : {}),
                    } as AppAction);

                    // Remove old recurring templates for this agreement (so only active agreement templates remain)
                    const oldTemplates = state.recurringInvoiceTemplates.filter(
                        t => t.agreementId === oldAgreement.id
                    );
                    oldTemplates.forEach(template => {
                        dispatch({ type: 'DELETE_RECURRING_TEMPLATE', payload: template.id });
                    });

                    // Create new agreement
                    const newAgreementId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
                    const newAgreementNumber = getNextAgreementNumber();

                    const newAgreement: RentalAgreement = {
                        id: newAgreementId,
                        agreementNumber: newAgreementNumber,
                        contactId: oldAgreement.contactId,
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
                        previousAgreementId: oldAgreement.id,
                        description: `Renewed due to property transfer to ${newOwner.name} on ${transferDate}. Previous agreement: ${oldAgreement.agreementNumber}`
                    };

                    dispatch({
                        type: 'ADD_RENTAL_AGREEMENT',
                        payload: newAgreement,
                        ...(useApi ? { _isRemote: true } : {}),
                    } as AppAction);

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

                {/* Ownership History Timeline */}
                {(() => {
                    const historyRows = (state.propertyOwnershipHistory || [])
                        .filter(h => h.propertyId === property.id)
                        .sort((a, b) => a.ownershipStartDate.localeCompare(b.ownershipStartDate));
                    if (historyRows.length === 0) return null;
                    return (
                        <div className="border border-slate-200 rounded-lg p-4 bg-white">
                            <h3 className="text-sm font-bold text-slate-700 mb-3">Ownership History</h3>
                            <div className="space-y-2">
                                {historyRows.map((h) => {
                                    const owner = state.contacts.find(c => c.id === h.ownerId);
                                    const endLabel = h.ownershipEndDate ? h.ownershipEndDate : 'Present';
                                    return (
                                        <div key={h.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                                            <span className="font-medium text-slate-700">{owner?.name || 'Unknown'}</span>
                                            <span className="text-sm text-slate-500">
                                                {h.ownershipStartDate} → {endLabel}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })()}

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
                    onChange={(date) => setTransferDate(toLocalDateString(date))}
                    required
                />

                {/* Transfer Reason */}
                <Input
                    label="Transfer Reason"
                    value={transferReason}
                    onChange={(e) => setTransferReason(e.target.value)}
                    placeholder="e.g., Property Sale, Gift, etc."
                />

                {/* Reference */}
                <Input
                    label="Reference"
                    value={transferReference}
                    onChange={(e) => setTransferReference(e.target.value)}
                    placeholder="e.g., Sale deed number, contract ref"
                />

                {/* Notes */}
                <Input
                    label="Notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional notes for this transfer"
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

