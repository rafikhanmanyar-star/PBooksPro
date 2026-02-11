import React, { useState } from 'react';
import RentalInvoicesContent from './RentalInvoicesContent';
import CreateRentalInvoiceModal from './CreateRentalInvoiceModal';
import RecurringInvoicesList from './RecurringInvoicesList';
import MonthlyServiceChargesPage from './MonthlyServiceChargesPage';

const TABS = ['Invoices', 'Recurring Templates', 'Monthly Service Charges'] as const;

const RentalInvoicesPage: React.FC = () => {
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
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
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
