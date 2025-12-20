import React from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

interface LinkedTransactionWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  linkedItemName: string;
  action: 'update' | 'delete';
}

const LinkedTransactionWarningModal: React.FC<LinkedTransactionWarningModalProps> = ({ isOpen, onClose, onConfirm, linkedItemName, action }) => {
  const title = `Confirm Transaction ${action === 'update' ? 'Update' : 'Deletion'}`;
  const message = `This transaction is linked to ${linkedItemName}.`;
  const consequence = action === 'update'
    ? "Updating it will adjust the paid amount on the linked item. Are you sure you want to proceed?"
    : "Deleting it will reverse the payment and update the linked item's status (e.g., from 'Paid' to 'Unpaid'). This action cannot be undone.";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-4">
        <p className="text-slate-600">{message}</p>
        <p className="font-semibold text-slate-800">{consequence}</p>
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant={action === 'delete' ? 'danger' : 'primary'} onClick={onConfirm}>
            Yes, {action === 'delete' ? 'Delete It' : 'Proceed'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default LinkedTransactionWarningModal;