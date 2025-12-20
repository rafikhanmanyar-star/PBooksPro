
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import Tabs from '../ui/Tabs';
import { Invoice, Bill, Transaction, TransactionType, InvoiceStatus } from '../../types';
import InvoiceBillItem from '../invoices/InvoiceBillItem';
import TransactionForm from '../transactions/TransactionForm';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Select from '../ui/Select';
import { ICONS } from '../../constants';

const MobilePaymentsPage: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const [activeTab, setActiveTab] = useState('Pay Bills');
    const [searchQuery, setSearchQuery] = useState('');
    const [projectFilter, setProjectFilter] = useState('all');
    
    // Default to unpaid/partial for operational view
    const [statusFilter, setStatusFilter] = useState('Unpaid'); 
    
    // Modal State
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState<Invoice | Bill | null>(null);

    const projects = useMemo(() => [{ id: 'all', name: 'All Projects' }, ...state.projects], [state.projects]);

    const isReceiving = activeTab === 'Receive Payments';

    const filteredData = useMemo(() => {
        let data: (Invoice | Bill)[] = [];
        
        if (isReceiving) {
            data = state.invoices;
        } else {
            data = state.bills;
        }

        // 1. Status Filter
        if (statusFilter !== 'All') {
            if (statusFilter === 'Unpaid') {
                data = data.filter(item => item.status === 'Unpaid' || item.status === 'Partially Paid' || item.status === 'Overdue');
            } else {
                data = data.filter(item => item.status === statusFilter);
            }
        }

        // 2. Project Filter
        if (projectFilter !== 'all') {
            data = data.filter(item => item.projectId === projectFilter);
        }

        // 3. Search
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            data = data.filter(item => {
                const number = 'invoiceNumber' in item ? item.invoiceNumber : item.billNumber;
                const contact = state.contacts.find(c => c.id === item.contactId);
                const description = item.description || '';
                
                return (
                    number.toLowerCase().includes(q) ||
                    (contact?.name || '').toLowerCase().includes(q) ||
                    description.toLowerCase().includes(q)
                );
            });
        }

        // Sort by Date (desc)
        return data.sort((a, b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime());

    }, [activeTab, statusFilter, projectFilter, searchQuery, state.invoices, state.bills, state.contacts]);

    const handleItemClick = (item: Invoice | Bill) => {
        setSelectedItem(item);
        setIsPaymentModalOpen(true);
    };

    const handleRecordPayment = (item: Invoice | Bill) => {
        setSelectedItem(item);
        setIsPaymentModalOpen(true);
    };

    const closeModal = () => {
        setIsPaymentModalOpen(false);
        setSelectedItem(null);
    };

    // Helper to prepare transaction form defaults
    const getTransactionDefaults = (): Partial<Transaction> => {
        if (!selectedItem) return {};
        
        const isInvoice = 'invoiceNumber' in selectedItem;
        const due = selectedItem.amount - selectedItem.paidAmount;
        
        return {
            id: '', // Will be generated
            type: isInvoice ? TransactionType.INCOME : TransactionType.EXPENSE,
            amount: due,
            date: new Date().toISOString().split('T')[0],
            accountId: '', // User must select
            contactId: selectedItem.contactId,
            projectId: selectedItem.projectId,
            buildingId: selectedItem.buildingId,
            propertyId: selectedItem.propertyId,
            categoryId: selectedItem.categoryId,
            // Link ids
            invoiceId: isInvoice ? selectedItem.id : undefined,
            billId: !isInvoice ? selectedItem.id : undefined,
            description: isInvoice 
                ? `Payment for Invoice #${(selectedItem as Invoice).invoiceNumber}` 
                : `Payment for Bill #${(selectedItem as Bill).billNumber}`
        };
    };

    return (
        <div className="flex flex-col h-full bg-slate-50">
            {/* Header / Tabs */}
            <div className="bg-white p-4 shadow-sm border-b border-slate-200 sticky top-0 z-10">
                <Tabs 
                    tabs={['Pay Bills', 'Receive Payments']} 
                    activeTab={activeTab} 
                    onTabClick={setActiveTab} 
                />
                
                {/* Filters */}
                <div className="mt-4 grid grid-cols-2 gap-3">
                    <Select 
                        value={statusFilter} 
                        onChange={e => setStatusFilter(e.target.value)}
                        className="text-sm py-2"
                        hideIcon={true}
                    >
                        <option value="Unpaid">Unpaid / Due</option>
                        <option value="Paid">Paid</option>
                        <option value="All">All Status</option>
                    </Select>
                    
                    <Select 
                        value={projectFilter} 
                        onChange={e => setProjectFilter(e.target.value)}
                         className="text-sm py-2"
                         hideIcon={true}
                    >
                        {projects.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </Select>
                </div>
                
                <div className="mt-3 relative">
                     <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <span className="h-4 w-4">{ICONS.search}</span>
                    </div>
                    <Input 
                        placeholder={isReceiving ? "Search invoices..." : "Search bills..."}
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="pl-9 py-2 text-sm"
                    />
                </div>
            </div>

            {/* List Content */}
            <div className="flex-grow overflow-y-auto p-3">
                {filteredData.length > 0 ? (
                    <div className="space-y-3">
                        {filteredData.map(item => (
                            <InvoiceBillItem 
                                key={item.id}
                                item={item}
                                type={isReceiving ? 'invoice' : 'bill'}
                                onRecordPayment={handleRecordPayment}
                                onItemClick={handleItemClick}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                        <div className="w-12 h-12 mb-2 opacity-30">{ICONS.fileText}</div>
                        <p>No {isReceiving ? 'invoices' : 'bills'} found.</p>
                    </div>
                )}
            </div>
            
            {/* Payment Modal */}
            <Modal isOpen={isPaymentModalOpen} onClose={closeModal} title={isReceiving ? "Receive Payment" : "Pay Bill"}>
                <TransactionForm 
                    onClose={closeModal}
                    transactionTypeForNew={isReceiving ? TransactionType.INCOME : TransactionType.EXPENSE}
                    transactionToEdit={getTransactionDefaults() as Transaction}
                    onShowDeleteWarning={() => {}} // Not needed for new payment
                />
            </Modal>
        </div>
    );
};

export default MobilePaymentsPage;
