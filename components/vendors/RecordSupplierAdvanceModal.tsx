import React, { useEffect, useMemo, useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Vendor, AccountType } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import { CURRENCY } from '../../constants';
import { useNotification } from '../../context/NotificationContext';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { contractorApi } from '../../services/api/contractorApi';
import { formatApiErrorMessage } from '../../services/api/client';
import { toLocalDateString } from '../../utils/dateUtils';

interface RecordSupplierAdvanceModalProps {
    isOpen: boolean;
    onClose: () => void;
    vendor: Vendor;
    /** When set (e.g. project bills sidebar), pre-selects this project on the form. */
    defaultProjectId?: string | null;
}

/**
 * PostgreSQL API: POST /contractor/advance — Dr prepaid asset, Cr bank/cash.
 * Same contractor_contact_id must be used later when settling vendor bills against advances.
 */
const RecordSupplierAdvanceModal: React.FC<RecordSupplierAdvanceModalProps> = ({
    isOpen,
    onClose,
    vendor,
    defaultProjectId,
}) => {
    const { state } = useAppContext();
    const { showToast, showAlert } = useNotification();

    const [advanceDate, setAdvanceDate] = useState(toLocalDateString(new Date()));
    const [amountStr, setAmountStr] = useState('');
    const [cashAccountId, setCashAccountId] = useState('');
    const [advanceAssetAccountId, setAdvanceAssetAccountId] = useState('');
    const [projectId, setProjectId] = useState('');
    const [reference, setReference] = useState('');
    const [description, setDescription] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const cashOutAccounts = useMemo(
        () =>
            state.accounts.filter(
                (a) =>
                    (a.type === AccountType.BANK || a.type === AccountType.CASH) && a.name !== 'Internal Clearing'
            ),
        [state.accounts]
    );

    const assetAccounts = useMemo(
        () => state.accounts.filter((a) => a.type === AccountType.ASSET && a.name !== 'Internal Clearing'),
        [state.accounts]
    );

    const projectItems = useMemo(
        () =>
            [{ id: '', name: '(No project)' }].concat(
                state.projects.map((p) => ({ id: p.id, name: p.name || p.id }))
            ),
        [state.projects]
    );

    useEffect(() => {
        if (!isOpen) return;
        setAdvanceDate(toLocalDateString(new Date()));
        setAmountStr('');
        setReference('');
        setDescription('');
        setProjectId((defaultProjectId ?? '').trim());
        setSubmitting(false);

        const firstCash = cashOutAccounts[0];
        setCashAccountId(firstCash?.id ?? '');
        const preferredAsset =
            assetAccounts.find((a) => /prepaid|advance|supplier|contractor|deposit/i.test(a.name || '')) ||
            assetAccounts[0];
        setAdvanceAssetAccountId(preferredAsset?.id ?? '');
    }, [isOpen, vendor.id, defaultProjectId, cashOutAccounts, assetAccounts]);

    const handleSubmit = async () => {
        if (isLocalOnlyMode()) {
            await showAlert('Recording supplier advances requires the PostgreSQL API (not offline local DB mode).');
            return;
        }
        const amt = parseFloat(amountStr);
        if (!Number.isFinite(amt) || amt <= 0) {
            await showAlert(`Enter a valid advance amount (${CURRENCY}).`);
            return;
        }
        if (!cashAccountId.trim()) {
            await showAlert('Select the bank or cash account the payment leaves from.');
            return;
        }
        if (!advanceAssetAccountId.trim()) {
            await showAlert('Select a prepaid asset account (e.g. supplier advance).');
            return;
        }
        try {
            setSubmitting(true);
            await contractorApi.createSupplierAdvance({
                contractorContactId: vendor.id.trim(),
                advanceDate: advanceDate.trim(),
                amount: amt,
                cashAccountId: cashAccountId.trim(),
                advanceAssetAccountId: advanceAssetAccountId.trim(),
                projectId: projectId.trim() || null,
                reference: reference.trim() || null,
                description:
                    description.trim() ||
                    `Supplier advance — ${vendor.name || vendor.id}`,
            });
            showToast(`Advance recorded for ${vendor.name}. Use Record Payment to allocate it to bills when due.`, 'success');
            if (typeof window !== 'undefined') {
                window.dispatchEvent(
                    new CustomEvent<{ vendorId: string }>('pbooks:supplier-advance-recorded', {
                        detail: { vendorId: vendor.id.trim() },
                    })
                );
            }
            onClose();
        } catch (e) {
            await showAlert(formatApiErrorMessage(e));
        } finally {
            setSubmitting(false);
        }
    };

    const localBlocked = isLocalOnlyMode();

    return (
        <Modal isOpen={isOpen} onClose={() => !submitting && onClose()} title={`Record supplier advance — ${vendor.name}`} size="lg">
            <div className="space-y-4">
                {localBlocked ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                        Offline / local-database mode cannot post supplier advances. Use the LAN or hosted client connected to your API server.
                    </div>
                ) : (
                    <p className="text-sm text-slate-600">
                        Money moves out of bank/cash and increases a{' '}
                        <strong className="text-slate-800">prepaid asset</strong>. Later, use{' '}
                        <strong className="text-slate-800">Record Payment</strong> on this vendor so unpaid bills absorb this balance (FIFO)
                        plus any bank remainder.
                    </p>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                        id="supplier-advance-amount"
                        name="supplier-advance-amount"
                        label={`Advance amount (${CURRENCY})`}
                        type="number"
                        value={amountStr}
                        onChange={(e) => setAmountStr(e.target.value)}
                        placeholder="0.00"
                        required
                        disabled={localBlocked || submitting}
                    />
                    <DatePicker
                        id="supplier-advance-date"
                        name="supplier-advance-date"
                        label="Advance date"
                        value={advanceDate}
                        onChange={(d) => setAdvanceDate(toLocalDateString(d))}
                        required
                        disabled={localBlocked || submitting}
                    />
                    <ComboBox
                        id="supplier-advance-pay-from"
                        name="supplier-advance-pay-from"
                        label="Pay from (bank / cash)"
                        items={cashOutAccounts}
                        selectedId={cashAccountId}
                        onSelect={(item) => setCashAccountId(item?.id || '')}
                        placeholder="Where funds are paid out"
                        required
                        disabled={localBlocked || submitting || cashOutAccounts.length === 0}
                        entityType="account"
                        allowAddNew={false}
                    />
                    <ComboBox
                        id="supplier-advance-asset"
                        name="supplier-advance-asset"
                        label="Prepaid supplier advance (balance sheet)"
                        items={assetAccounts}
                        selectedId={advanceAssetAccountId}
                        onSelect={(item) => setAdvanceAssetAccountId(item?.id || '')}
                        placeholder="e.g. Prepaid advances / supplier deposit"
                        required
                        disabled={localBlocked || submitting || assetAccounts.length === 0}
                        entityType="account"
                        allowAddNew={false}
                    />
                    <div className="md:col-span-2">
                        <ComboBox
                            id="supplier-advance-project"
                            name="supplier-advance-project"
                            label="Project (optional)"
                            items={projectItems}
                            selectedId={projectId}
                            onSelect={(item) => setProjectId(item?.id || '')}
                            placeholder="Allocate journal lines to a project"
                            disabled={localBlocked || submitting}
                            entityType="project"
                            allowAddNew={false}
                        />
                    </div>
                    <Input
                        id="supplier-advance-reference"
                        name="supplier-advance-reference"
                        label="Reference"
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        placeholder="UTR / cheque no."
                        disabled={localBlocked || submitting}
                    />
                    <div />
                    <div className="md:col-span-2">
                        <Input
                            id="supplier-advance-description"
                            name="supplier-advance-description"
                            label="Description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder={`Optional · defaults to “Supplier advance — ${vendor.name}”`}
                            disabled={localBlocked || submitting}
                        />
                    </div>
                </div>

                {(cashOutAccounts.length === 0 || assetAccounts.length === 0) && !localBlocked && (
                    <p className="text-sm text-rose-700">
                        {cashOutAccounts.length === 0
                            ? 'Add a Bank or Cash account in Chart of accounts.'
                            : null}
                        {assetAccounts.length === 0
                            ? ' Add at least one Asset account for prepaid supplier advances.'
                            : null}
                    </p>
                )}

                <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
                    <Button variant="secondary" onClick={onClose} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button
                        onClick={() => void handleSubmit()}
                        disabled={
                            submitting ||
                            localBlocked ||
                            !amountStr.trim() ||
                            cashOutAccounts.length === 0 ||
                            assetAccounts.length === 0
                        }
                    >
                        {submitting ? 'Saving…' : 'Record advance'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default RecordSupplierAdvanceModal;
