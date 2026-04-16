import React, { useEffect, useMemo, useState, useCallback } from 'react';
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
import { apiClient, formatApiErrorMessage } from '../../services/api/client';
import {
    applyOwnershipTransferToState,
    redistributeCoOwnerPercentages,
    type CoOwnerFormRow,
} from '../../services/propertyOwnershipService';
import { getCurrentTenantId } from '../../services/database/tenantUtils';
import { toLocalDateString } from '../../utils/dateUtils';
import { parseApiEntityVersion } from '../../utils/parseApiVersion';

interface MultiOwnerOwnershipModalProps {
    isOpen: boolean;
    onClose: () => void;
    property: Property;
}

function is409Conflict(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const e = err as { status?: number; code?: string; message?: string };
    if (e.status === 409) return true;
    if (e.code === 'CONFLICT') return true;
    const m = typeof e.message === 'string' ? e.message : '';
    return /modified by another user|409|conflict/i.test(m);
}

const MultiOwnerOwnershipModal: React.FC<MultiOwnerOwnershipModalProps> = ({ isOpen, onClose, property }) => {
    const { state, dispatch } = useAppContext();
    const { showAlert } = useNotification();
    const { isAuthenticated } = useAuth();
    const [rows, setRows] = useState<CoOwnerFormRow[]>([{ ownerId: '', percentage: '' }]);

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
            setRows([{ ownerId: property.ownerId, percentage: '100' }]);
        }
    }, [isOpen, property.id, property.ownerId, state.propertyOwnership]);

    const totalPct = useMemo(() => {
        return rows.reduce((s, r) => s + (parseFloat(r.percentage) || 0), 0);
    }, [rows]);

    const totalOver100 = totalPct > 100.01;

    const handlePctChange = useCallback((idx: number, raw: string) => {
        setRows((prev) => redistributeCoOwnerPercentages(prev, idx, raw));
    }, []);

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
            let next = applyOwnershipTransferToState(state, {
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

                const bodyBase = {
                    name: updatedProp.name,
                    ownerId: updatedProp.ownerId,
                    buildingId: updatedProp.buildingId,
                    description: updatedProp.description,
                    monthlyServiceCharge: updatedProp.monthlyServiceCharge,
                };

                const ownershipSyncRows = (next.propertyOwnership || [])
                    .filter((r) => String(r.propertyId) === String(property.id))
                    .map((r) => ({
                        id: r.id,
                        ownerId: r.ownerId,
                        ownershipPercentage: r.ownershipPercentage,
                        startDate: r.startDate,
                        endDate: r.endDate ?? null,
                        isActive: r.isActive,
                    }));

                // 1) Persist ownership rows first. If property PUT conflicts (409), co-ownership was previously never saved.
                await api.syncPropertyOwnership(property.id, ownershipSyncRows);

                let savedProp: Awaited<ReturnType<typeof api.updateProperty>> | undefined;
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

                        savedProp = await api.updateProperty(
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
                                savedProp = await api.updateProperty(
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
                if (savedProp === undefined) {
                    throw lastErr instanceof Error ? lastErr : new Error('Could not save property.');
                }
                next = {
                    ...next,
                    properties: next.properties.map((p) =>
                        p.id === property.id ? { ...p, ...savedProp } : p
                    ),
                };
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
            await showAlert(formatApiErrorMessage(err) || 'Could not update ownership.');
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Set co-owners / percentages" size="lg">
            <form onSubmit={handleSubmit} className="space-y-4">
                <p className="text-sm text-slate-600">
                    Closes current active ownership slices and opens new rows effective today. Historical transactions are
                    not modified.
                </p>
                <p className="text-xs text-slate-500">
                    Editing one owner&apos;s % splits the remainder equally among the other owners already selected (totals
                    stay at 100%).
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
                            onChange={(e) => handlePctChange(idx, e.target.value)}
                        />
                    </div>
                ))}
                <div className="flex gap-2 flex-wrap items-center">
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setRows((r) => [...r, { ownerId: '', percentage: '' }])}
                    >
                        Add owner
                    </Button>
                    <span
                        className={`text-sm self-center ${totalOver100 ? 'text-red-600 font-medium' : 'text-slate-600'}`}
                    >
                        Total: {totalPct.toFixed(2)}%{totalOver100 ? ' (cannot exceed 100%)' : ''}
                    </span>
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
