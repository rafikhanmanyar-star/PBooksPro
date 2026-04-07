import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Invoice, ProjectReceivedAsset, ProjectReceivedAssetType, InvoiceStatus, TransactionType } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import DatePicker from '../ui/DatePicker';
import { CURRENCY } from '../../constants';
import { useNotification } from '../../context/NotificationContext';
import { findProjectAssetCategory } from '../../constants/projectAssetSystemCategories';
import { resolveSystemAccountId } from '../../services/systemEntityIds';
import { toLocalDateString } from '../../utils/dateUtils';

const ASSET_TYPES: { value: ProjectReceivedAssetType; label: string }[] = [
    { value: 'Plot', label: 'Plot' },
    { value: 'Car', label: 'Car' },
    { value: 'Other', label: 'Other' },
];

interface AssetPaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    invoice: Invoice;
    onSuccess?: () => void;
    /** When true, render only the form (no Modal wrapper) for embedding in parent modal */
    renderInline?: boolean;
}

const AssetPaymentModal: React.FC<AssetPaymentModalProps> = ({ isOpen, onClose, invoice, onSuccess, renderInline }) => {
    const { state, dispatch } = useAppContext();
    const { showToast, showAlert } = useNotification();

    const [description, setDescription] = useState('');
    const [assetType, setAssetType] = useState<ProjectReceivedAssetType>('Other');
    const [value, setValue] = useState('');
    const [receivedDate, setReceivedDate] = useState(toLocalDateString(new Date()));

    const balanceDue = useMemo(() => Math.max(0, invoice.amount - (invoice.paidAmount || 0)), [invoice.amount, invoice.paidAmount]);

    const receivedAssetsAccount = useMemo(() => state.accounts.find(a => a.id === RECEIVED_ASSETS_ACCOUNT_ID), [state.accounts]);
    const assetReceivedCategory = useMemo(
        () => findProjectAssetCategory(state.categories, 'REVENUE_ASSET_IN_KIND'),
        [state.categories]
    );

    const handleSubmit = async () => {
        const numValue = parseFloat(value);
        if (!description.trim()) {
            await showAlert('Please enter a description for the asset.');
            return;
        }
        if (isNaN(numValue) || numValue <= 0) {
            await showAlert('Please enter a valid asset value.');
            return;
        }
        if (numValue > balanceDue + 0.01) {
            await showAlert(`Asset value (${CURRENCY} ${numValue.toLocaleString()}) cannot exceed balance due (${CURRENCY} ${balanceDue.toLocaleString()}).`);
            return;
        }
        if (!receivedAssetsAccount || !assetReceivedCategory) {
            await showAlert('System account or category for received assets is not set up. Please contact support.');
            return;
        }

        const assetId = `asset-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const asset: ProjectReceivedAsset = {
            id: assetId,
            projectId: invoice.projectId!,
            contactId: invoice.contactId,
            invoiceId: invoice.id,
            description: description.trim(),
            assetType,
            recordedValue: numValue,
            receivedDate,
        };

        const newPaidAmount = (invoice.paidAmount || 0) + numValue;
        const newStatus = newPaidAmount >= invoice.amount - 0.01 ? InvoiceStatus.PAID : (newPaidAmount > 0.01 ? InvoiceStatus.PARTIALLY_PAID : InvoiceStatus.UNPAID);

        const txId = `txn-asset-${Date.now()}-${assetId}`;
        const incomeTx = {
            id: txId,
            type: TransactionType.INCOME,
            amount: numValue,
            date: receivedDate,
            description: `Asset received: ${description.trim()} (Inv #${invoice.invoiceNumber})`,
            accountId: receivedAssetsAccountId,
            categoryId: assetReceivedCategory.id,
            projectId: invoice.projectId,
            contactId: invoice.contactId,
            invoiceId: invoice.id,
            projectAssetId: assetId,
        };

        dispatch({ type: 'ADD_PROJECT_RECEIVED_ASSET', payload: asset });
        dispatch({ type: 'UPDATE_INVOICE', payload: { ...invoice, paidAmount: newPaidAmount, status: newStatus } });
        dispatch({ type: 'ADD_TRANSACTION', payload: incomeTx });

        showToast(`Recorded asset (${CURRENCY} ${numValue.toLocaleString()}) and applied to Invoice #${invoice.invoiceNumber}`, 'success');
        onSuccess?.();
        onClose();
    };

    const formContent = (
        <div className="space-y-4">
            <p className="text-sm text-slate-600">
                Invoice #<strong>{invoice.invoiceNumber}</strong> — Balance due: <strong>{CURRENCY} {balanceDue.toLocaleString()}</strong>
            </p>
            <Input
                label="Asset description"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="e.g. Plot near Phase 2, Car Toyota Corolla"
            />
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Asset type</label>
                <select
                    value={assetType}
                    onChange={e => setAssetType(e.target.value as ProjectReceivedAssetType)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accent/50 focus:border-accent"
                    aria-label="Asset type"
                >
                    {ASSET_TYPES.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                </select>
            </div>
            <Input
                label="Value applied to invoice"
                type="number"
                min="0"
                step="0.01"
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder={balanceDue.toFixed(0)}
            />
            <DatePicker label="Date received" value={receivedDate} onChange={d => setReceivedDate(toLocalDateString(d))} />
            <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                <Button type="button" onClick={handleSubmit}>Record asset & apply to invoice</Button>
            </div>
        </div>
    );

    if (renderInline) {
        return formContent;
    }
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Receive payment (Asset)">
            {formContent}
        </Modal>
    );
};

export default AssetPaymentModal;
