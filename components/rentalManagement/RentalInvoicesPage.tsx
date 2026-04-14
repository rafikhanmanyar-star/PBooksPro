import React, { useState, useEffect, useMemo, memo, startTransition } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppContext } from '../../context/AppContext';
import { ImportType } from '../../services/importService';
import { ICONS } from '../../constants';
import RentalARDashboard from './RentalARDashboard';
import CreateRentalInvoiceModal from './CreateRentalInvoiceModal';
import Button from '../ui/Button';
import { useInvoices } from '../../hooks/useSelectiveState';
import { queryKeys } from '../../hooks/queries/queryKeys';
import { selectRentalInvoicesForCache } from '../../hooks/queries/rentalInvoicesCache';
import { cancelScheduledIdle, scheduleIdleWork } from '../../utils/interactionScheduling';

export interface RentalInvoicesPageProps {
  /** Switches rental sidebar to Recurring Templates (e.g. Manage Schedules). */
  onNavigateToRecurringTemplates?: () => void;
}

/** Fixed-height shell to avoid CLS while AR dashboard mounts (heavy tree + grid). */
const RentalInvoicesBodySkeleton: React.FC = () => (
  <div
    className="flex-grow min-h-[min(70vh,640px)] flex flex-col gap-3 p-4 border-t border-app-border bg-app-bg"
    aria-busy
    aria-label="Loading invoices"
  >
    <div className="grid grid-cols-2 md:grid-cols-6 gap-2 flex-shrink-0">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="h-[72px] rounded-lg bg-app-toolbar animate-pulse" style={{ animationDelay: `${i * 40}ms` }} />
      ))}
    </div>
    <div className="h-14 rounded-lg bg-app-toolbar animate-pulse flex-shrink-0" />
    <div className="flex-1 min-h-[280px] rounded-xl border border-app-border bg-app-card overflow-hidden flex gap-2 p-2">
      <div className="w-[280px] shrink-0 space-y-2">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="h-8 rounded bg-app-toolbar/80 animate-pulse" />
        ))}
      </div>
      <div className="flex-1 space-y-2 min-w-0">
        <div className="h-8 bg-app-table-header rounded animate-pulse" />
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
          <div key={i} className="h-9 rounded bg-app-toolbar/60 animate-pulse" style={{ animationDelay: `${i * 25}ms` }} />
        ))}
      </div>
    </div>
  </div>
);

const RentalInvoicesPage: React.FC<RentalInvoicesPageProps> = ({ onNavigateToRecurringTemplates }) => {
  const { dispatch } = useAppContext();
  const invoices = useInvoices();
  const queryClient = useQueryClient();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createModalType, setCreateModalType] = useState<'rental' | 'security'>('rental');
  const [prefillPropertyId, setPrefillPropertyId] = useState<string | null>(null);
  const [dashboardReady, setDashboardReady] = useState(false);

  const rentalSlice = useMemo(() => selectRentalInvoicesForCache(invoices), [invoices]);

  useEffect(() => {
    queryClient.setQueryData(queryKeys.rental.invoicesList(), rentalSlice);
  }, [queryClient, rentalSlice]);

  useEffect(() => {
    const idleId = scheduleIdleWork(() => {
      startTransition(() => setDashboardReady(true));
    }, { timeout: 400 });
    return () => cancelScheduledIdle(idleId);
  }, []);

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
    startTransition(() => {
      dispatch({ type: 'SET_INITIAL_IMPORT_TYPE', payload: ImportType.INVOICES });
      dispatch({ type: 'SET_PAGE', payload: 'import' });
    });
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex flex-shrink-0 items-center justify-end gap-2 flex-wrap border-b border-app-border bg-app-card px-4 py-2">
        <div className="flex flex-shrink-0 items-center gap-2">
          <Button onClick={() => handleCreateRental()} size="sm">
            <div className="w-4 h-4 mr-2">{ICONS.plus}</div>
            New Rental Invoice
          </Button>
          <Button variant="secondary" onClick={() => handleCreateSecurity()} size="sm">
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
        {dashboardReady ? (
          <RentalARDashboard
            listMode
            onCreateRentalClick={handleCreateRental}
            onCreateSecurityClick={handleCreateSecurity}
            onSchedulesClick={handleSchedulesClick}
          />
        ) : (
          <RentalInvoicesBodySkeleton />
        )}
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

export default memo(RentalInvoicesPage);
