import React from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

type Props = {
  isOpen: boolean;
  lockedByName: string;
  isAdmin: boolean;
  onViewOnly: () => void;
  onForceEdit: () => void;
  onDismiss: () => void;
};

const RecordLockConflictModal: React.FC<Props> = ({
  isOpen,
  lockedByName,
  isAdmin,
  onViewOnly,
  onForceEdit,
  onDismiss,
}) => (
  <Modal isOpen={isOpen} onClose={onDismiss} title="Record in use">
    <div className="space-y-4">
      <p className="text-slate-700">
        This record is currently being edited by <strong>{lockedByName}</strong>.
      </p>
      <p className="text-sm text-slate-500">You can open in view-only mode, or an administrator can take over the edit lock.</p>
      <div className="flex flex-col sm:flex-row gap-2 justify-end pt-2">
        <Button type="button" variant="secondary" onClick={onViewOnly} className="border-slate-300">
          View only
        </Button>
        {isAdmin && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void onForceEdit();
            }}
            className="border-amber-300 text-amber-900 bg-amber-50 hover:bg-amber-100"
          >
            Force edit (admin)
          </Button>
        )}
        <Button type="button" onClick={onDismiss}>
          OK
        </Button>
      </div>
    </div>
  </Modal>
);

export default RecordLockConflictModal;
