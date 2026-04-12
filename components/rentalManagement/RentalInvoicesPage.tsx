import React, { useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { ImportType } from '../../services/importService';
import { ICONS } from '../../constants';
import RentalARDashboard from './RentalARDashboard';
import CreateRentalInvoiceModal from './CreateRentalInvoiceModal';
import Button from '../ui/Button';

export interface RentalInvoicesPageProps {
  /** Switches rental sidebar to Recurring Templates (e.g. Manage Schedules). */
  onNavigateToRecurringTemplates?: () => void;
}

const RentalInvoicesPage: React.FC<RentalInvoicesPageProps> = ({ onNavigateToRecurringTemplates }) => {
  const { dispatch } = useAppContext();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createModalType, setCreateModalType] = useState<'rental' | 'security'>('rental');
  /** When set, modal opens with form prefilled from this property; when null/undefined, form opens empty. */
  const [prefillPropertyId, setPrefillPropertyId] = useState<string | null>(null);

  const handleCreateRental = (selectedPropertyId?: string | null) => {
    setCreateModalType('rental');
    setPrefillPropertyId(selectedPropertyId ?? null);
    setCreateModalOpen(true);
  };

  const handleCreateSecurity = (selectedPropertyId?: string | null) => {
    setCreateModalType('security');
    setPrefillPropertyId(selectedPropertyId ?? null);
    setCreateModalOpen(true);
  };

  const handleCloseCreateModal = () => {
    setCreateModalOpen(false);
    setPrefillPropertyId(null);
  };

  const handleSchedulesClick = () => {
    onNavigateToRecurringTemplates?.();
  };

  const handleBulkImport = () => {
    dispatch({ type: 'SET_INITIAL_IMPORT_TYPE', payload: ImportType.INVOICES });
    dispatch({ type: 'SET_PAGE', payload: 'import' });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-shrink-0 items-center justify-end gap-2 flex-wrap border-b border-app-border bg-app-card px-4 py-2">
        <div className="flex flex-shrink-0 items-center gap-2">
          <Button onClick={handleCreateRental} size="sm">
            <div className="w-4 h-4 mr-2">{ICONS.plus}</div>
            New Rental Invoice
          </Button>
          <Button variant="secondary" onClick={handleCreateSecurity} size="sm">
            <div className="w-4 h-4 mr-2">{ICONS.plus}</div>
            New Security Deposit
          </Button>
          <Button variant="secondary" onClick={handleBulkImport} size="sm">
            <div className="w-4 h-4 mr-2">{ICONS.download}</div>
            Bulk Import
          </Button>
          <Button variant="ghost" onClick={handleSchedulesClick} size="sm">
            Manage Schedules
          </Button>
        </div>
      </div>
      <div className="flex-grow overflow-hidden min-h-0">
        <RentalARDashboard
          listMode
          onCreateRentalClick={handleCreateRental}
          onCreateSecurityClick={handleCreateSecurity}
          onSchedulesClick={handleSchedulesClick}
        />
      </div>

      <CreateRentalInvoiceModal
        isOpen={createModalOpen}
        onClose={handleCloseCreateModal}
        initialInvoiceType={createModalType}
        initialPreFillPropertyId={prefillPropertyId}
      />
    </div>
  );
};

export default RentalInvoicesPage;
