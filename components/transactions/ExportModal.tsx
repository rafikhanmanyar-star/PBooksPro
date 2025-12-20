
import React from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: () => void;
}

const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, onExport }) => {
  
  const handleExportClick = () => {
    onExport();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Export All Data">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          This will export <strong>all</strong> your data including accounts, contacts, transactions, recurring templates, staff payroll, and application settings into a single multi-sheet Excel file.
        </p>
        <p className="text-sm text-slate-600">
          This comprehensive file serves as a complete backup. It includes raw IDs and configuration details to ensure nothing is missed if you need to restore your data later or perform detailed offline analysis.
        </p>

        <div className="flex flex-col sm:flex-row justify-end gap-2 pt-4">
          <Button type="button" variant="secondary" onClick={onClose} className="w-full sm:w-auto">Cancel</Button>
          <Button type="button" variant="primary" onClick={handleExportClick} className="w-full sm:w-auto">Export Full Backup</Button>
        </div>
      </div>
    </Modal>
  );
};

export default ExportModal;
