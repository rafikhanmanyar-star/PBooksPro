import React, { useEffect, useMemo, useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import type { Property } from '../../types';
import { ContactType } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import ComboBox from '../ui/ComboBox';
import Input from '../ui/Input';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { getAppStateApiService } from '../../services/api/appStateApi';
import { apiClient } from '../../services/api/client';
import { applyOwnershipTransferToState } from '../../services/propertyOwnershipService';
import { getCurrentTenantId } from '../../services/database/tenantUtils';
import { toLocalDateString } from '../../utils/dateUtils';

interface Row {
    ownerId: string;
    percentage: string;
}

interface MultiOwnerOwnershipModalProps {
    isOpen: boolean;
    onClose: () => void;
    property: Property;
}

const MultiOwnerOwnershipModal: React.FC<MultiOwnerOwnershipModalProps> = ({ isOpen, onClose, property }) => {
    const { state, dispatch } = useAppContext();
    const { showAlert } = useNotification();
    const { isAuthenticated } = useAuth();
    const [rows, setRows] = useState<Row[]>([{ ownerId: '', percentage: '' }]);

    const owners = useMemo(
        () => state.contacts.filter((c) => c.type === ContactType.OWNER || c.type === ContactType.CLIENT),
        [state.contacts]
    );

    useEffect(() => {
        if (!isOpen) return;
        const active = (state.propertyOwnership || []).filter(
            (r) =>
                r.propertyId === property.id &&
                r.isActive &&
                (r.endDate == null || String(r.endDate).trim() === '')
        );
        if (active.length > 0) {
            setRows(
                active.map((r) => ({
                    ownerId: r.ownerId,
                    percentage: String(r.ownershipPercentage),
                }))
            );
        } else {
            setRows([
                { ownerId: property.ownerId, percentage: '100' },
            ]);
        }
    }, [isOpen, property.id, property.ownerId, state.propertyOwnership]);

    const totalPct = useMemo(() => {
        return rows.reduce((s, r) => s + (parseFloat(r.percentage) || 0), 0);
    }, [rows]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const newOwners = rows
            .filter((r) => r.ownerId && String(r.percentage).trim() !== '')
            .map((r) => ({
                ownerId: r.ownerId,
                percentage: parseFloat(r.percentage) || 0,
            }));
        if (newOwners.length === 0) {
            await showAlert('Add at least one owner with a percentage.');
            return;
        }
        if (Math.abs(totalPct - 100) > 0.01) {
            await showAlert(`Percentages must total 100% (currently ${totalPct.toFixed(2)}%).`);
            return;
        }
        try {
            const tenantId = apiClient.getTenantId() || getCurrentTenantId();
            const next = applyOwnershipTransferToState(state, {
                propertyId: property.id,
                transferDate: toLocalDateString(new Date()),
                newOwners,
                tenantId,
            });

            const useApi = !isLocalOnlyMode() && isAuthenticated;
            if (useApi) {
                const api = getAppStateApiService();
                const updatedProp = next.properties.find((p) => p.id === property.id);
                if (!updatedProp) {
                    throw new Error('Property not found after ownership update.');
                }
                const propVersion = (property as { version?: number }).version;
                await api.updateProperty(property.id, {
                    name: updatedProp.name,
                    ownerId: updatedProp.ownerId,
                    buildingId: updatedProp.buildingId,
                    description: updatedProp.description,
                    monthlyServiceCharge: updatedProp.monthlyServiceCharge,
                    ...(propVersion !== undefined ? { version: propVersion } : {}),
                });
                const ownershipSyncRows = (next.propertyOwnership || [])
                    .filter((r) => r.propertyId === property.id)
                    .map((r) => ({
                        id: r.id,
                        ownerId: r.ownerId,
                        ownershipPercentage: r.ownershipPercentage,
                        startDate: r.startDate,
                        endDate: r.endDate ?? null,
                        isActive: r.isActive,
                    }));
                await api.syncPropertyOwnership(property.id, ownershipSyncRows);
            }

            dispatch({
                type: 'SET_STATE',
                payload: {
                    properties: next.properties,
                    propertyOwnership: next.propertyOwnership,
                    propertyOwnershipHistory: next.propertyOwnershipHistory,
                },
            });
            onClose();
        } catch (err: unknown) {
            await showAlert(err instanceof Error ? err.message : 'Could not update ownership.');
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Set co-owners / percentages" size="lg">
            <form onSubmit={handleSubmit} className="space-y-4">
                <p className="text-sm text-slate-600">
                    Closes current active ownership slices and opens new rows effective today. Historical transactions are not modified.
                </p>
                {rows.map((row, idx) => (
                    <div key={idx} className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end">
                        <ComboBox
                            label={`Owner ${idx + 1}`}
                            items={owners}
                            selectedId={row.ownerId}
                            onSelect={(item) => {
                                const next = [...rows];
                                next[idx] = { ...next[idx], ownerId: item?.id || '' };
                                setRows(next);
                            }}
                            placeholder="Select owner"
                        />
                        <Input
                            label="%"
                            type="text"
                            inputMode="decimal"
                            value={row.percentage}
                            onChange={(e) => {
                                const next = [...rows];
                                next[idx] = { ...next[idx], percentage: e.target.value };
                                setRows(next);
                            }}
                        />
                    </div>
                ))}
                <div className="flex gap-2">
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setRows((r) => [...r, { ownerId: '', percentage: '' }])}
                    >
                        Add owner
                    </Button>
                    <span className="text-sm text-slate-600 self-center">Total: {totalPct.toFixed(2)}%</span>
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t">
                    <Button type="button" variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="submit">Save</Button>
                </div>
            </form>
        </Modal>
    );
};

export default MultiOwnerOwnershipModal;
