import React, { useEffect, useMemo, useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { useNotification } from '../../context/NotificationContext';
import { AccountType, Contact, Property, Transaction, TransactionType } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import DatePicker from '../ui/DatePicker';
import ComboBox from '../ui/ComboBox';
import { CURRENCY } from '../../constants';
import { toLocalDateString } from '../../utils/dateUtils';

export interface OwnerRentalIncomePayModalProps {
    isOpen: boolean;
    onClose: () => void;
    owner: Contact | null;
    /** Selected unit in tree, or null when only an owner node is selected */
    property: Property | null;
    /** Closing balance from the report (opening + period movements), ignoring table search */
    reportPayableBalance: number;
    /** When `property` is set, used as default building */
    preSelectedBuildingId?: string;
}

const OwnerRentalIncomePayModal: React.FC<OwnerRentalIncomePayModalProps> = ({
    isOpen,
    onClose,
    owner,
    property,
    reportPayableBalance,
    preSelectedBuildingId,
}) => {
    const { state, dispatch } = useAppContext();
    const { showAlert, showToast } = useNotification();

    const [date, setDate] = useState(() => toLocalDateString(new Date()));
    const [accountId, setAccountId] = useState('');
    const [buildingId, setBuildingId] = useState('');
    const [amount, setAmount] = useState('');
    const [reference, setReference] = useState('');
    const [notes, setNotes] = useState('');
    const [error, setError] = useState('');

    const userSelectableAccounts = useMemo(
        () => state.accounts.filter((a) => a.type === AccountType.BANK && a.name !== 'Internal Clearing'),
        [state.accounts]
    );

    const buildingsForOwner = useMemo(() => {
        if (!owner) return [];
        const ownerPropertyBuildingIds = new Set(
            state.properties.filter((p) => p.ownerId === owner.id).map((p) => p.buildingId)
        );
        return state.buildings.filter((b) => ownerPropertyBuildingIds.has(b.id));
    }, [owner, state.properties, state.buildings]);

    useEffect(() => {
        if (!isOpen || !owner) return;
        setDate(toLocalDateString(new Date()));
        const cash = userSelectableAccounts.find((a) => a.name === 'Cash');
        setAccountId(cash?.id || userSelectableAccounts[0]?.id || '');
        setBuildingId(preSelectedBuildingId || '');
        setReference('');
        setNotes('');
        setAmount(
            reportPayableBalance > 0.01 ? String(Math.round(reportPayableBalance * 100) / 100) : ''
        );
        setError('');
    }, [isOpen, owner, preSelectedBuildingId, reportPayableBalance, userSelectableAccounts]);

    useEffect(() => {
        const n = parseFloat(amount) || 0;
        if (n <= 0) setError('Amount must be positive.');
        else if (n > reportPayableBalance + 0.01)
            setError(`Amount cannot exceed payable balance (${CURRENCY} ${reportPayableBalance.toLocaleString()}).`);
        else if (!property && !buildingId && !preSelectedBuildingId)
            setError('Select a building for this payout.');
        else setError('');
    }, [amount, reportPayableBalance, property, buildingId, preSelectedBuildingId]);

    const accountsWithBalance = userSelectableAccounts.map((acc) => ({
        ...acc,
        name: `${acc.name} (${CURRENCY} ${acc.balance.toLocaleString()})`,
    }));

    const handleSubmit = async () => {
        if (!owner || error) return;
        const payoutAccount = state.accounts.find((a) => a.id === accountId);
        if (!payoutAccount) {
            await showAlert('Please select a valid account to pay from.');
            return;
        }
        const payoutCategory = state.categories.find((c) => c.name === 'Owner Payout');
        if (!payoutCategory) {
            await showAlert("Critical: 'Owner Payout' category not found. Please check Rental Settings.");
            return;
        }
        const num = parseFloat(amount) || 0;
        if (num <= 0 || num > reportPayableBalance + 0.01) return;

        const propBuildingId = property?.buildingId;
        const effectiveBuildingId = propBuildingId || buildingId || preSelectedBuildingId || '';
        if (!effectiveBuildingId) {
            await showAlert('Please assign a building to this payout.');
            return;
        }

        const descriptionSuffix = (notes ? ` - ${notes}` : '') + (reference ? ` (Ref: ${reference})` : '');
        const baseDescription = `Owner Payout to ${owner.name}`;
        let description = baseDescription + descriptionSuffix;
        if (property) {
            description += ` [${property.name}]`;
        } else {
            const bName = state.buildings.find((b) => b.id === effectiveBuildingId)?.name;
            if (bName) description += ` [${bName}]`;
        }

        const tx: Transaction = {
            id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            type: TransactionType.EXPENSE,
            amount: num,
            date,
            description,
            accountId: payoutAccount.id,
            contactId: owner.id,
            categoryId: payoutCategory.id,
            buildingId: effectiveBuildingId,
            propertyId: property?.id,
            ownerId: owner.id,
        };

        dispatch({ type: 'ADD_TRANSACTION', payload: tx });
        showToast('Rental income payment recorded. Ledger and accounts are updated.', 'success');
        onClose();
    };

    if (!owner) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Pay owner (rental income)">
            <div className="space-y-4">
                <div className="p-4 bg-app-toolbar/40 rounded-lg border border-app-border space-y-2 text-sm">
                    <div className="flex justify-between gap-4">
                        <span className="text-app-muted">Owner</span>
                        <span className="font-semibold text-app-text text-right">{owner.name}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                        <span className="text-app-muted">Property</span>
                        <span className="font-semibold text-app-text text-right">
                            {property?.name ?? '— (all units in this view)'}
                        </span>
                    </div>
                    <div className="flex justify-between gap-4 items-baseline border-t border-app-border pt-2 mt-2">
                        <span className="text-app-muted">Total account payable (report)</span>
                        <span className="font-bold text-lg text-app-text tabular-nums">
                            {CURRENCY} {reportPayableBalance.toLocaleString()}
                        </span>
                    </div>
                    <p className="text-[11px] text-app-muted">
                        Payable matches the closing balance for the selected period and tree filters (ignores table
                        search).
                    </p>
                </div>

                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-grow">
                        <ComboBox
                            label="Pay from account"
                            items={accountsWithBalance}
                            selectedId={accountId}
                            onSelect={(item) => setAccountId(item?.id || '')}
                            placeholder="Select an account"
                        />
                    </div>
                    <div className="flex-grow">
                        <DatePicker
                            label="Payment date"
                            value={date}
                            onChange={(d) => setDate(toLocalDateString(d))}
                            required
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                        label="Amount"
                        type="text"
                        inputMode="decimal"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        required
                    />
                    <Input
                        label="Reference"
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        placeholder="Cheque #, transfer ref…"
                    />
                </div>

                {property ? (
                    <Input
                        label="Building"
                        value={state.buildings.find((b) => b.id === property.buildingId)?.name || '—'}
                        disabled
                    />
                ) : (
                    <ComboBox
                        label="Assign to building"
                        items={buildingsForOwner}
                        selectedId={buildingId}
                        onSelect={(item) => setBuildingId(item?.id || '')}
                        placeholder="Select a building"
                        allowAddNew={false}
                        required
                    />
                )}

                <Input
                    label="Description / notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional note on this payment"
                />

                {error && <p className="text-sm text-danger">{error}</p>}

                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="button" onClick={handleSubmit} disabled={!!error}>
                        Save payment
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default OwnerRentalIncomePayModal;
