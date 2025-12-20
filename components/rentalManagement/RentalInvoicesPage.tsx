
import React, { useState, useEffect } from 'react';
import Tabs from '../ui/Tabs';
import InvoicesPage from '../invoices/InvoicesPage';
import { InvoiceType, Transaction, TransactionType, Category } from '../../types';
import Button from '../ui/Button';
import { ICONS } from '../../constants';
import Modal from '../ui/Modal';
import InvoiceBillForm from '../invoices/InvoiceBillForm';
import { useAppContext } from '../../context/AppContext';
import { ImportType } from '../../services/importService';
import RecurringInvoicesList from './RecurringInvoicesList';
import MonthlyServiceChargesPage from './MonthlyServiceChargesPage';

const TABS = ['Rental Invoices', 'Recurring Templates', 'Monthly Service Charges'];

const RentalInvoicesPage: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const [activeTab, setActiveTab] = useState(TABS[0]);
    const [isCreateRentModalOpen, setIsCreateRentModalOpen] = useState(false);

    const renderContent = () => {
        switch (activeTab) {
            case 'Rental Invoices':
                return <InvoicesPage invoiceTypeFilter={InvoiceType.RENTAL} hideTitleAndGoBack={true} showCreateButton={false} />;
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
        <div className="flex flex-col h-full space-y-4">
            <div className="flex justify-between items-center flex-wrap gap-4 flex-shrink-0">
                <Tabs tabs={TABS} activeTab={activeTab} onTabClick={setActiveTab} />
                <div className="flex gap-2 items-center">
                    {activeTab === 'Rental Invoices' && (
                        <>
                            <Button
                                variant="secondary"
                                onClick={() => {
                                    dispatch({ type: 'SET_INITIAL_IMPORT_TYPE', payload: ImportType.INVOICES });
                                    dispatch({ type: 'SET_PAGE', payload: 'import' });
                                }}
                            >
                                <div className="w-4 h-4 mr-2">{ICONS.download}</div>
                                <span>Bulk Import</span>
                            </Button>
                            <Button onClick={() => setIsCreateRentModalOpen(true)}>
                                <div className="w-4 h-4 mr-2">{ICONS.plus}</div>
                                <span>New Rent Invoice</span>
                            </Button>
                        </>
                    )}
                </div>
            </div>
            <div className="flex-grow overflow-hidden relative">
                {renderContent()}
            </div>
            
            <Modal isOpen={isCreateRentModalOpen} onClose={() => setIsCreateRentModalOpen(false)} title="Create New Rent Invoice">
                <InvoiceBillForm 
                    key={'new-rent-invoice'} 
                    onClose={() => setIsCreateRentModalOpen(false)} 
                    type="invoice" 
                    invoiceTypeForNew={InvoiceType.RENTAL} 
                />
            </Modal>
        </div>
    );
};

export default RentalInvoicesPage;
