import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { ProjectReceivedAsset, TransactionType } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import DatePicker from '../ui/DatePicker';
import ComboBox from '../ui/ComboBox';
import { CURRENCY } from '../../constants';
import { useNotification } from '../../context/NotificationContext';
import { AccountType } from '../../types';
import { findProjectAssetCategory } from '../../constants/projectAssetSystemCategories';
import { resolveSystemAccountId } from '../../services/systemEntityIds';
import { toLocalDateString } from '../../utils/dateUtils';

interface RecordSaleModalProps {
    isOpen: boolean;
    onClose: () => void;
    asset: ProjectReceivedAsset;
    onSuccess?: () => void;
    /** When 'edit', pre-fill from asset sale data and update existing transactions on submit */
    mode?: 'record' | 'edit';
}

const RecordSaleModal: React.FC<RecordSaleModalProps> = ({ isOpen, onClose, asset, onSuccess, mode = 'record' }) => {
    const { state, dispatch } = useAppContext();
    const { showToast, showAlert } = useNotification();

    const [saleDate, setSaleDate] = useState(toLocalDateString(new Date()));
    const [saleAmount, setSaleAmount] = useState('');
    const [accountId, setAccountId] = useState('');

    const isEdit = mode === 'edit' && !!(asset.soldDate && asset.saleAmount != null);

    useEffect(() => {
        if (isOpen && asset) {
            if (isEdit && asset.soldDate && asset.saleAmount != null) {
                setSaleDate(asset.soldDate);
                setSaleAmount(asset.saleAmount.toString());
                setAccountId(asset.saleAccountId || '');
            } else {
                setSaleDate(toLocalDateString(new Date()));
                setSaleAmount('');
                setAccountId('');
            }
        }
    }, [isOpen, asset?.id, isEdit, asset?.soldDate, asset?.saleAmount, asset?.saleAccountId]);

    const bankAccounts = useMemo(
        () => state.accounts.filter(a => a.type === AccountType.BANK && a.name !== 'Internal Clearing'),
        [state.accounts]
    );
    const saleProceedsCat = useMemo(
        () => findProjectAssetCategory(state.categories, 'SALES_OF_FIXED_ASSET'),
        [state.categories]
    );
    const costOfAssetSoldCat = useMemo(
        () => findProjectAssetCategory(state.categories, 'COST_OF_ASSET_SOLD'),
        [state.categories]
    );

    const receivedAssetsAccountId = useMemo(
        () => resolveSystemAccountId(state.accounts, 'sys-acc-received-assets') ?? 'sys-acc-received-assets',
        [state.accounts]
    );

    const handleSubmit = async () => {
        const amount = parseFloat(saleAmount);
        if (isNaN(amount) || amount <= 0) {
            await showAlert('Please enter a valid sale amount.');
            return;
        }
        if (!accountId) {
            await showAlert('Please select a bank account for the sale proceeds.');
            return;
        }
        if (!saleProceedsCat || !costOfAssetSoldCat) {
            await showAlert('System categories for asset sale (Sales of fixed asset, Cost of Asset Sold) are not set up.');
            return;
        }

        const updated: ProjectReceivedAsset = {
            ...asset,
            soldDate: saleDate,
            saleAmount: amount,
            saleAccountId: accountId,
        };
        dispatch({ type: 'UPDATE_PROJECT_RECEIVED_ASSET', payload: updated });

        if (isEdit) {
            const saleTxns = state.transactions.filter(t => t.projectAssetId === asset.id);
            const incomeTx = saleTxns.find(t => t.type === TransactionType.INCOME);
            const expenseTx = saleTxns.find(t => t.type === TransactionType.EXPENSE);
            if (incomeTx) {
                dispatch({
                    type: 'UPDATE_TRANSACTION',
                    payload: {
                        ...incomeTx,
                        amount,
                        date: saleDate,
                        accountId,
                        categoryId: saleProceedsCat.id,
                        description: `Asset sale: ${asset.description}`,
                    },
                });
            }
            if (expenseTx) {
                dispatch({
                    type: 'UPDATE_TRANSACTION',
                    payload: {
                        ...expenseTx,
                        date: saleDate,
                        amount: asset.recordedValue,
                        description: `Cost of asset sold: ${asset.description}`,
                    },
                });
            }
            showToast(`Sale updated. ${CURRENCY} ${amount.toLocaleString()} proceeds.`, 'success');
        } else {
            const incomeTx = {
                id: `txn-asset-sale-${asset.id}-${Date.now()}`,
                type: TransactionType.INCOME,
                amount,
                date: saleDate,
                description: `Asset sale: ${asset.description}`,
                accountId,
                categoryId: saleProceedsCat.id,
                projectId: asset.projectId,
                contactId: asset.contactId || undefined,
                projectAssetId: asset.id,
            };
            dispatch({ type: 'ADD_TRANSACTION', payload: incomeTx });

            const expenseTx = {
                id: `txn-asset-cost-${asset.id}-${Date.now()}`,
                type: TransactionType.EXPENSE,
                amount: asset.recordedValue,
                date: saleDate,
                description: `Cost of asset sold: ${asset.description}`,
                accountId: receivedAssetsAccountId,
                categoryId: costOfAssetSoldCat.id,
                projectId: asset.projectId,
                contactId: asset.contactId || undefined,
                projectAssetId: asset.id,
            };
            dispatch({ type: 'ADD_TRANSACTION', payload: expenseTx });

            const gainLoss = amount - asset.recordedValue;
            showToast(
                `Sale recorded. ${CURRENCY} ${amount.toLocaleString()} to bank. ${gainLoss >= 0 ? 'Gain' : 'Loss'}: ${CURRENCY} ${Math.abs(gainLoss).toLocaleString()}`,
                'success'
            );
        }
        onSuccess?.();
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit sale' : 'Record sale'} size="md">
            <div className="space-y-4">
                <p className="text-sm text-slate-600">
                    {asset.description} — Recorded value: {CURRENCY} {asset.recordedValue.toLocaleString()}
                </p>
                <DatePicker label="Sale date" value={saleDate} onChange={d => setSaleDate(toLocalDateString(d))} />
                <Input
                    label="Sale amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={saleAmount}
                    onChange={e => setSaleAmount(e.target.value)}
                    placeholder="0.00"
                />
                <ComboBox
                    label="Bank account (sale proceeds)"
                    items={bankAccounts}
                    selectedId={accountId}
                    onSelect={item => setAccountId(item?.id || '')}
                    placeholder="Select account"
                />
                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSubmit}>{isEdit ? 'Update sale' : 'Record sale'}</Button>
                </div>
            </div>
        </Modal>
    );
};

export default RecordSaleModal;
