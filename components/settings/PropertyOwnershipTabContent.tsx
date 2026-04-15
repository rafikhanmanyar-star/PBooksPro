import React, { useMemo, useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import type { Property } from '../../types';
import Button from '../ui/Button';
import PropertyTransferModal from './PropertyTransferModal';
import MultiOwnerOwnershipModal from './MultiOwnerOwnershipModal';

interface PropertyOwnershipTabContentProps {
    property: Property;
}

const PropertyOwnershipTabContent: React.FC<PropertyOwnershipTabContentProps> = ({ property }) => {
    const { state } = useAppContext();
    const [transferOpen, setTransferOpen] = useState(false);
    const [multiOpen, setMultiOpen] = useState(false);

    const rows = useMemo(
        () =>
            (state.propertyOwnership || [])
                .filter((r) => r.propertyId === property.id)
                .slice()
                .sort((a, b) => a.startDate.localeCompare(b.startDate)),
        [state.propertyOwnership, property.id]
    );

    const activeRows = useMemo(
        () => rows.filter((r) => r.isActive && (r.endDate == null || String(r.endDate).trim() === '')),
        [rows]
    );

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => setTransferOpen(true)}>
                    Transfer ownership
                </Button>
                <Button type="button" onClick={() => setMultiOpen(true)}>
                    Set co-owners / %
                </Button>
            </div>

            <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-2">Current owners</h4>
                {activeRows.length === 0 ? (
                    <p className="text-sm text-slate-500">No ownership rows — using legacy single owner from the property record.</p>
                ) : (
                    <ul className="text-sm space-y-1">
                        {activeRows.map((r) => {
                            const name = state.contacts.find((c) => c.id === r.ownerId)?.name || r.ownerId;
                            return (
                                <li key={r.id} className="flex justify-between border-b border-slate-100 py-1">
                                    <span>{name}</span>
                                    <span className="font-medium">{Number(r.ownershipPercentage).toFixed(2)}%</span>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-2">History</h4>
                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-md divide-y divide-slate-100">
                    {rows.length === 0 ? (
                        <div className="p-3 text-sm text-slate-500">No ownership history recorded yet.</div>
                    ) : (
                        rows.map((r) => {
                            const name = state.contacts.find((c) => c.id === r.ownerId)?.name || r.ownerId;
                            const end = r.endDate ? r.endDate : '—';
                            return (
                                <div key={r.id} className="p-2 text-xs flex flex-col sm:flex-row sm:justify-between gap-1">
                                    <span className="font-medium text-slate-700">{name}</span>
                                    <span className="text-slate-500">
                                        {Number(r.ownershipPercentage).toFixed(2)}% · {r.startDate} → {end}{' '}
                                        {r.isActive ? <span className="text-emerald-600">(active)</span> : null}
                                    </span>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            <PropertyTransferModal isOpen={transferOpen} onClose={() => setTransferOpen(false)} property={property} />
            <MultiOwnerOwnershipModal
                isOpen={multiOpen}
                onClose={() => setMultiOpen(false)}
                property={property}
            />
        </div>
    );
};

export default PropertyOwnershipTabContent;
