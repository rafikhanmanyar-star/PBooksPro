import React, { useState } from 'react';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { ICONS } from '../../constants';

interface ClearPosDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

const ClearPosDataModal: React.FC<ClearPosDataModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
}) => {
  const [confirmText, setConfirmText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const REQUIRED_TEXT = 'Clear POS';

  const isConfirmValid = confirmText === REQUIRED_TEXT;

  const handleConfirm = async () => {
    if (!isConfirmValid) return;

    setIsProcessing(true);
    try {
      await onConfirm();
      setConfirmText('');
      onClose();
    } catch (error) {
      console.error('Error clearing POS data:', error);
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
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 text-2xl">
            {ICONS.alertTriangle}
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Clear POS Data</h2>
            <p className="text-sm text-slate-600">This action cannot be undone</p>
          </div>
        </div>

        <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 mb-6">
          <p className="text-rose-800 font-semibold mb-3">
            ⚠️ This will permanently delete:
          </p>
          <ul className="space-y-1 text-sm text-rose-700 ml-4">
            <li>• POS Sales & sale items</li>
            <li>• Shop products</li>
            <li>• Inventory records & movements</li>
            <li>• Loyalty members</li>
            <li>• Shop branches, terminals, warehouses, policies</li>
          </ul>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <p className="text-green-800 font-semibold mb-3">
            ✓ This will preserve:
          </p>
          <ul className="space-y-1 text-sm text-green-700 ml-4">
            <li>• Accounts, contacts, categories, projects, buildings, properties, units</li>
            <li>• Financial transactions (General Ledger)</li>
            <li>• All non-shop settings and configurations</li>
          </ul>
        </div>

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
                {ICONS.trash} Clear POS Data
              </>
            )}
          </Button>
        </div>

        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-xs text-amber-800">
            <strong>Note:</strong> This clears POS data from both your local database and the cloud database.
          </p>
        </div>
      </div>
    </Modal>
  );
};

export default ClearPosDataModal;

