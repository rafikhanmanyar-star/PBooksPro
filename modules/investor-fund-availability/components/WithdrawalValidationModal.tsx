import React from 'react';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import { formatFullMoney } from '../utils/financialFormat';
import type { WithdrawalValidationResult } from '../types/fundAvailability.types';

export const WithdrawalValidationModal: React.FC<{
    open: boolean;
    result: WithdrawalValidationResult | null;
    onClose: () => void;
}> = ({ open, result, onClose }) => {
    if (!result) return null;
    return (
        <Modal isOpen={open} onClose={onClose} title="Withdrawal validation">
            <div className="space-y-3 text-sm text-app-text">
                {!result.ok ? (
                    <p className="text-ds-danger font-medium">Withdrawal cannot be posted — distributable funds would be exceeded.</p>
                ) : (
                    <p className="text-ds-success font-medium">Withdrawal is within the distributable balance.</p>
                )}
                <ul className="list-disc pl-5 space-y-1 text-app-muted">
                    <li>Requested: {formatFullMoney(result.requestedAmount)}</li>
                    <li>Distributable (after reserve & payables): {formatFullMoney(result.distributableFunds)}</li>
                    {result.shortfall > 0.005 && <li>Shortfall: {formatFullMoney(result.shortfall)}</li>}
                </ul>
                {result.messages.length > 0 && (
                    <div className="rounded-lg border border-app-border bg-app-highlight/50 p-3 text-xs text-app-text space-y-1">
                        {result.messages.map((m, i) => (
                            <p key={i}>{m}</p>
                        ))}
                    </div>
                )}
                <div className="flex justify-end pt-2">
                    <Button variant="secondary" type="button" onClick={onClose}>
                        Close
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
