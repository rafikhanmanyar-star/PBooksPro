import React, { useState } from 'react';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { ICONS } from '../../constants';
import { backupAlertError, backupAlertSuccess, backupAlertWarning } from './backupThemeClasses';

interface ClearTransactionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

const ClearTransactionsModal: React.FC<ClearTransactionsModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
}) => {
  const [confirmText, setConfirmText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const REQUIRED_TEXT = 'Clear transaction';

  const isConfirmValid = confirmText === REQUIRED_TEXT;

  const handleConfirm = async () => {
    if (!isConfirmValid) return;

    setIsProcessing(true);
    try {
      await onConfirm();
      setConfirmText('');
      onClose();
    } catch (error) {
      console.error('Error clearing transactions:', error);
      // Error will be shown by the parent component
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    if (isProcessing) return;
    setConfirmText('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="">
      <div className="p-6">
        {/* Warning Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-[color:var(--badge-unpaid-bg)] flex items-center justify-center text-ds-danger text-2xl">
            {ICONS.alertTriangle}
          </div>
          <div>
            <h2 className="text-xl font-bold text-app-text">Clear All Transactions</h2>
            <p className="text-sm text-app-muted">This action cannot be undone</p>
          </div>
        </div>

        {/* Warning Message */}
        <div className={`${backupAlertError} p-4 mb-6`}>
          <p className="text-ds-danger font-semibold mb-3">
            ⚠️ This will permanently delete:
          </p>
          <ul className="space-y-1 text-sm text-app-text ml-4">
            <li>• All transactions</li>
            <li>• All invoices</li>
            <li>• All bills</li>
            <li>• All contracts</li>
            <li>• All rental agreements</li>
            <li>• All project agreements</li>
            <li>• All sales returns</li>
            <li>• All quotations</li>
          </ul>
        </div>

        {/* What will be preserved */}
        <div className={`${backupAlertSuccess} p-4 mb-6`}>
          <p className="text-ds-success font-semibold mb-3">
            ✓ This will preserve:
          </p>
          <ul className="space-y-1 text-sm text-app-text ml-4">
            <li>• Accounts (balances will be reset to 0)</li>
            <li>• Contacts (owners, tenants, brokers)</li>
            <li>• Categories</li>
            <li>• Projects, buildings, properties, units</li>
            <li>• All settings and configurations</li>
          </ul>
        </div>

        {/* Confirmation Input */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-app-text mb-2">
            Type <span className="text-ds-danger font-mono bg-[color:var(--badge-unpaid-bg)] px-2 py-0.5 rounded border border-ds-danger/20">{REQUIRED_TEXT}</span> to confirm:
          </label>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Type here to confirm..."
            disabled={isProcessing}
            className="font-mono"
            autoFocus
          />
          {confirmText && !isConfirmValid && (
            <p className="text-xs text-ds-danger mt-1">
              Text doesn't match. Please type exactly: {REQUIRED_TEXT}
            </p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button
            onClick={handleClose}
            variant="secondary"
            disabled={isProcessing}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            variant="danger"
            disabled={!isConfirmValid || isProcessing}
            className="flex-1"
          >
            {isProcessing ? (
              <>
                <span className="inline-block animate-spin mr-2">⏳</span>
                Clearing...
              </>
            ) : (
              <>
                {ICONS.trash} Clear All Transactions
              </>
            )}
          </Button>
        </div>

        {/* Additional Warning */}
        <div className={`${backupAlertWarning} p-3 mt-4`}>
          <p className="text-xs text-app-text">
            <strong>Note:</strong> This will clear data from both your local database and the cloud database. 
            All users in your organization will see the changes immediately.
          </p>
        </div>
      </div>
    </Modal>
  );
};

export default ClearTransactionsModal;

