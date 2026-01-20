import React, { useState } from 'react';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { ICONS } from '../../constants';

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
          <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 text-2xl">
            {ICONS.alertTriangle}
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Clear All Transactions</h2>
            <p className="text-sm text-slate-600">This action cannot be undone</p>
          </div>
        </div>

        {/* Warning Message */}
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 mb-6">
          <p className="text-rose-800 font-semibold mb-3">
            ⚠️ This will permanently delete:
          </p>
          <ul className="space-y-1 text-sm text-rose-700 ml-4">
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
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <p className="text-green-800 font-semibold mb-3">
            ✓ This will preserve:
          </p>
          <ul className="space-y-1 text-sm text-green-700 ml-4">
            <li>• Accounts (balances will be reset to 0)</li>
            <li>• Contacts (owners, tenants, brokers)</li>
            <li>• Categories</li>
            <li>• Projects, buildings, properties, units</li>
            <li>• All settings and configurations</li>
          </ul>
        </div>

        {/* Confirmation Input */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Type <span className="text-rose-600 font-mono bg-rose-50 px-2 py-0.5 rounded">{REQUIRED_TEXT}</span> to confirm:
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
            <p className="text-xs text-rose-600 mt-1">
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
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-xs text-amber-800">
            <strong>Note:</strong> This will clear data from both your local database and the cloud database. 
            All users in your organization will see the changes immediately.
          </p>
        </div>
      </div>
    </Modal>
  );
};

export default ClearTransactionsModal;

