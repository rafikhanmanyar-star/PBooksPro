import React, { useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { ImportType } from '../../services/importService';
import { ICONS } from '../../constants';
import RentalInvoicesContent from './RentalInvoicesContent';
import CreateRentalInvoiceModal from './CreateRentalInvoiceModal';
import RecurringInvoicesList from './RecurringInvoicesList';
import MonthlyServiceChargesPage from './MonthlyServiceChargesPage';
import Button from '../ui/Button';

const TABS = ['Invoices', 'Recurring Templates', 'Monthly Service Charges'] as const;

const RentalInvoicesPage: React.FC = () => {
  const { dispatch } = useAppContext();
  const [activeTab, setActiveTab] = useState<typeof TABS[number]>('Invoices');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createModalType, setCreateModalType] = useState<'rental' | 'security'>('rental');

  const handleCreateRental = () => {
    setCreateModalType('rental');
    setCreateModalOpen(true);
  };

  const handleCreateSecurity = () => {
    setCreateModalType('security');
    setCreateModalOpen(true);
  };

  const handleSchedulesClick = () => {
    setActiveTab('Recurring Templates');
  };

  const handleBulkImport = () => {
    dispatch({ type: 'SET_INITIAL_IMPORT_TYPE', payload: ImportType.INVOICES });
    dispatch({ type: 'SET_PAGE', payload: 'import' });
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'Invoices':
        return (
          <RentalInvoicesContent
            onCreateRentalClick={handleCreateRental}
            onCreateSecurityClick={handleCreateSecurity}
            onSchedulesClick={handleSchedulesClick}
          />
        );
      case 'Recurring Templates':
        return (
          <div className="h-full overflow-y-auto">
            <RecurringInvoicesList />
          </div>
        );
      case 'Monthly Service Charges':
        return <MonthlyServiceChargesPage />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar min-w-0">
          {TABS.map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`whitespace-nowrap px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab
                  ? 'bg-indigo-50 text-accent ring-1 ring-indigo-100'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        {activeTab === 'Invoices' && (
          <div className="flex flex-shrink-0 items-center gap-2 ml-2">
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
        )}
      </div>
      <div className="flex-grow overflow-hidden min-h-0">
        {renderContent()}
      </div>

      <CreateRentalInvoiceModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        initialInvoiceType={createModalType}
      />
    </div>
  );
};

export default RentalInvoicesPage;
