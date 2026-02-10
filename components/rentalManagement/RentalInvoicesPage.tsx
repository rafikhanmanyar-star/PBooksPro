
import React, { useState, useCallback } from 'react';
import InvoicesPage from '../invoices/InvoicesPage';
import { InvoiceType } from '../../types';
import Button from '../ui/Button';
import { ICONS } from '../../constants';
import Modal from '../ui/Modal';
import { useAppContext } from '../../context/AppContext';
import { useNotification } from '../../context/NotificationContext';
import { ImportType } from '../../services/importService';
import RecurringInvoicesList from './RecurringInvoicesList';
import MonthlyServiceChargesPage from './MonthlyServiceChargesPage';
import CreateRentInvoiceForm from './CreateRentInvoiceForm';

const TABS = ['Rental Invoices', 'Recurring Templates', 'Monthly Service Charges'];

interface TreeSelection {
    id: string;
    type: 'group' | 'subgroup' | 'invoice';
    parentId?: string | null;
    groupBy: string;
}

const RentalInvoicesPage: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const { showAlert } = useNotification();
    const [activeTab, setActiveTab] = useState(TABS[0]);
    const [isCreateRentModalOpen, setIsCreateRentModalOpen] = useState(false);
    const [resolvedPropertyId, setResolvedPropertyId] = useState<string | null>(null);

    // Track tree selection from InvoicesPage
    const [treeSelection, setTreeSelection] = useState<TreeSelection | null>(null);

    const handleTreeSelectionChange = useCallback((selection: TreeSelection | null) => {
        setTreeSelection(selection);
    }, []);

    // Resolve propertyId from tree selection based on groupBy mode
    const resolvePropertyFromSelection = useCallback((): string | null => {
        if (!treeSelection || treeSelection.type !== 'subgroup') return null;

        const { id, parentId, groupBy } = treeSelection;

        if (groupBy === 'property') {
            // subgroup id IS the property id
            return id;
        }

        if (groupBy === 'tenant') {
            // subgroup id is a contact (tenant) id
            // Find active agreement for this tenant, optionally within the parent building
            const agreements = state.rentalAgreements.filter(ra => {
                if (ra.contactId !== id || ra.status !== 'Active') return false;
                if (parentId && parentId !== 'Unassigned') {
                    const prop = state.properties.find(p => p.id === ra.propertyId);
                    return prop && prop.buildingId === parentId;
                }
                return true;
            });
            if (agreements.length >= 1) return agreements[0].propertyId;
            return null;
        }

        if (groupBy === 'owner') {
            // subgroup id is an owner contact id
            // Find properties owned by this person with an active agreement
            const properties = state.properties.filter(p => {
                if (p.ownerId !== id) return false;
                if (parentId && parentId !== 'Unassigned') return p.buildingId === parentId;
                return true;
            });
            const propsWithAgreements = properties.filter(p =>
                state.rentalAgreements.some(ra => ra.propertyId === p.id && ra.status === 'Active')
            );
            if (propsWithAgreements.length >= 1) return propsWithAgreements[0].id;
            return null;
        }

        return null;
    }, [treeSelection, state.rentalAgreements, state.properties]);

    const handleNewRentInvoice = useCallback(async () => {
        const propId = resolvePropertyFromSelection();
        if (!propId) {
            await showAlert(
                'Please select a tenant, owner, or property from the tree sidebar first.',
                { title: 'No Selection' }
            );
            return;
        }
        setResolvedPropertyId(propId);
        setIsCreateRentModalOpen(true);
    }, [resolvePropertyFromSelection, showAlert]);

    const handleCloseCreateModal = useCallback(() => {
        setIsCreateRentModalOpen(false);
        setResolvedPropertyId(null);
    }, []);

    const renderContent = () => {
        switch (activeTab) {
            case 'Rental Invoices':
                return (
                    <InvoicesPage
                        invoiceTypeFilter={InvoiceType.RENTAL}
                        hideTitleAndGoBack={true}
                        showCreateButton={false}
                        onTreeSelectionChange={handleTreeSelectionChange}
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

    const TabButton = ({ tab, label }: { tab: string; label: string }) => (
        <button
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`whitespace-nowrap px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab
                    ? 'bg-indigo-50 text-accent ring-1 ring-indigo-100'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
        >
            {label}
        </button>
    );

    return (
        <div className="flex flex-col h-full space-y-4">
            <div className="flex justify-between items-center flex-wrap gap-4 flex-shrink-0">
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                    {TABS.map((tab) => (
                        <TabButton key={tab} tab={tab} label={tab} />
                    ))}
                </div>
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
                            <Button onClick={handleNewRentInvoice}>
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
            
            <Modal isOpen={isCreateRentModalOpen} onClose={handleCloseCreateModal} title="Create New Rent Invoice">
                {resolvedPropertyId && (
                    <CreateRentInvoiceForm 
                        key={resolvedPropertyId}
                        propertyId={resolvedPropertyId}
                        onClose={handleCloseCreateModal}
                    />
                )}
            </Modal>
        </div>
    );
};

export default RentalInvoicesPage;
