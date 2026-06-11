
import { useDispatchOnly, useFinancialReportAppState } from '../../hooks/useSelectiveState';
import React, { useMemo, useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import TransactionItem from '../transactions/TransactionItem';
import { TransactionType, LoanSubtype, AccountType } from '../../types';
import Button from '../ui/Button';
import { CURRENCY } from '../../constants';
import { isLocalOnlyMode } from '../../config/apiUrl';

interface SettingsLedgerModalProps {
    isOpen: boolean;
    onClose: () => void;
    entityId: string;
    entityType: 'account' | 'category' | 'contact' | 'project' | 'building' | 'property' | 'unit';
    entityName: string;
}

const SettingsLedgerModal: React.FC<SettingsLedgerModalProps> = ({ isOpen, onClose, entityId, entityType, entityName }) => {
        const state = useFinancialReportAppState();
    const { accounts, transactions: allTransactions } = state;
    const dispatch = useDispatchOnly();

    const [contractorLedger, setContractorLedger] = useState<{
        advances: Array<{ id: string; advanceDate: string; originalAmount: number; remainingAmount: number; description?: string }>;
        adjustments: Array<{
            id: string;
            contractorBillId: string;
            billNumber?: string;
            billDate: string;
            billAmount: number;
            advanceId: string;
            adjustmentAmount: number;
        }>;
        summary?: { totalOriginalAmount: number; totalRemainingAmount: number };
        loadError?: string | null;
    } | null>(null);

    useEffect(() => {
        if (!isOpen || entityType !== 'contact' || !entityId || isLocalOnlyMode()) {
            setContractorLedger(null);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const { contractorApi } = await import('../../services/api/contractorApi');
                const data = await contractorApi.getContractorLedger(entityId);
                if (!cancelled && data !== null) {
                    setContractorLedger({
                        advances: data.advances ?? [],
                        adjustments: (data.adjustments ?? []).map((a) => ({
                            id: a.id,
                            contractorBillId: a.contractorBillId,
                            billNumber: a.billNumber,
                            billDate: a.billDate,
                            billAmount: a.billAmount,
                            advanceId: a.advanceId,
                            adjustmentAmount: a.adjustmentAmount })),
                        summary: data.summary,
                        loadError: null });
                } else if (!cancelled) {
                    setContractorLedger(null);
                }
            } catch (e) {
                if (!cancelled)
                    setContractorLedger({
                        advances: [],
                        adjustments: [],
                        summary: { totalOriginalAmount: 0, totalRemainingAmount: 0 },
                        loadError: 'Could not load contractor ledger.' });
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isOpen, entityType, entityId]);

    const transactions = useMemo(() => {
        if (!entityId) return [];

        return allTransactions.filter(tx => {
            if (entityType === 'account') {
                return tx.accountId === entityId || tx.fromAccountId === entityId || tx.toAccountId === entityId;
            }
            if (entityType === 'category') {
                return tx.categoryId === entityId;
            }
            if (entityType === 'contact') {
                return tx.contactId === entityId;
            }
            if (entityType === 'project') {
                return tx.projectId === entityId;
            }
            if (entityType === 'building') {
                return tx.buildingId === entityId;
            }
            if (entityType === 'property') {
                return tx.propertyId === entityId;
            }
            if (entityType === 'unit') {
                return tx.unitId === entityId;
            }
            return false;
        }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [allTransactions, entityId, entityType]);

    const totalBalance = useMemo(() => {
        if (entityType === 'account') {
            const acc = accounts.find(a => a.id === entityId);
            // Invert balance for Equity and Liability accounts so positive numbers mean "Credit Balance" (Money in the bucket for Equity/Liability)
            if (acc && (acc.type === AccountType.LIABILITY || acc.type === AccountType.EQUITY)) {
                return -(acc.balance || 0);
            }
            return acc?.balance || 0;
        }
        
        return transactions.reduce((sum, tx) => {
            let amount = tx.amount;
            
            if (entityType === 'category' || entityType === 'project' || entityType === 'building' || entityType === 'property' || entityType === 'unit') {
                // For categorical/structural entities, calculate net flow (Income - Expense)
                if (tx.type === TransactionType.INCOME) return sum + amount;
                if (tx.type === TransactionType.EXPENSE) return sum - amount;
                return sum;
            }

            // For contacts (Ledger logic)
            // Income linked to contact = Credit (Positive impact on business cash, but for contact ledger usually implies they paid us)
            // Expense linked to contact = Debit (Negative impact on business cash, we paid them)
            // Displaying net flow:
            if (tx.type === TransactionType.EXPENSE) return sum - amount;
            if (tx.type === TransactionType.INCOME) return sum + amount;
            if (tx.type === TransactionType.LOAN) {
                 if (tx.subtype === LoanSubtype.RECEIVE || tx.subtype === LoanSubtype.COLLECT) return sum + amount;
                 return sum - amount;
            }
            return sum;
        }, 0);
    }, [transactions, entityType, entityId, accounts]);

    const contractorLedgerSectionVisible =
        contractorLedger &&
        (contractorLedger.loadError ||
            ((contractorLedger.summary?.totalOriginalAmount ?? 0) > 0 ||
                (contractorLedger.adjustments?.length ?? 0) > 0 ||
                (contractorLedger.advances?.length ?? 0) > 0));

    const handleEditTransaction = (tx: any) => {
        onClose();
        dispatch({ type: 'SET_EDITING_ENTITY', payload: null }); 
        // Note: Transaction editing navigation would typically happen here
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Ledger: ${entityName}`} size="xl">
            <div className="space-y-4">
                <div className="p-4 bg-app-bg rounded-lg border border-app-border flex justify-between items-center">
                    <span className="text-sm font-medium text-app-muted">Net Volume / Balance</span>
                    <span className={`text-xl font-bold ${totalBalance >= 0 ? 'text-app-text' : 'text-ds-danger'}`}>
                        {CURRENCY} {totalBalance.toLocaleString()}
                    </span>
                </div>

                {contractorLedgerSectionVisible ? (
                    <div className="p-4 rounded-lg border border-amber-200 bg-amber-50/90 space-y-3">
                        <div className="text-sm font-semibold text-app-text">Contractor advances & adjustments</div>
                        {contractorLedger.loadError ? (
                            <p className="text-sm text-ds-danger">{contractorLedger.loadError}</p>
                        ) : (
                            <>
                                <div className="flex flex-wrap gap-4 text-sm text-app-text">
                                    <span>
                                        <span className="text-app-muted">Outstanding advances:</span>{' '}
                                        <strong>
                                            {CURRENCY}{' '}
                                            {(contractorLedger.summary?.totalRemainingAmount ?? 0).toLocaleString()}
                                        </strong>
                                    </span>
                                    <span>
                                        <span className="text-app-muted">Advances originally issued:</span>{' '}
                                        {CURRENCY} {(contractorLedger.summary?.totalOriginalAmount ?? 0).toLocaleString()}
                                    </span>
                                </div>
                                {(contractorLedger.advances?.length ?? 0) > 0 && (
                                    <div className="text-xs text-app-muted">
                                        <div className="font-medium text-app-text mb-1">Advances</div>
                                        <ul className="list-disc pl-4 space-y-0.5">
                                            {contractorLedger.advances.map((a) => (
                                                <li key={a.id}>
                                                    {a.advanceDate}: issued {CURRENCY}{' '}
                                                    {a.originalAmount.toLocaleString()} — remaining{' '}
                                                    <strong>{CURRENCY} {a.remainingAmount.toLocaleString()}</strong>
                                                    {a.description ? ` — ${a.description}` : ''}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                {(contractorLedger.adjustments?.length ?? 0) > 0 && (
                                    <div className="text-xs text-app-muted">
                                        <div className="font-medium text-app-text mb-1">Bill adjustments vs advances</div>
                                        <ul className="list-disc pl-4 space-y-0.5">
                                            {contractorLedger.adjustments.map((r) => (
                                                <li key={r.id}>
                                                    Bill {r.billNumber || `#${r.contractorBillId.slice(0, 8)}`} ({r.billDate}): −{CURRENCY}{' '}
                                                    {r.adjustmentAmount.toLocaleString()} applied from advance {r.advanceId.slice(0, 8)}… · bill{' '}
                                                    {CURRENCY} {r.billAmount.toLocaleString()}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                ) : null}

                <div className="max-h-[60vh] overflow-y-auto border rounded-lg border-app-border">
                    {transactions.length > 0 ? (
                        <div className="divide-y divide-app-border">
                            {transactions.map(tx => (
                                <TransactionItem key={tx.id} transaction={tx} onEdit={handleEditTransaction} />
                            ))}
                        </div>
                    ) : (
                        <div className="p-8 text-center text-app-muted">
                            No transactions found for this item.
                        </div>
                    )}
                </div>

                <div className="flex justify-end">
                    <Button variant="secondary" onClick={onClose}>Close</Button>
                </div>
            </div>
        </Modal>
    );
};

export default SettingsLedgerModal;
