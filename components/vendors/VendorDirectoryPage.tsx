import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Contact, ContactType, Bill, Transaction, Page, TransactionType } from '../../types';
import ContactForm from '../settings/ContactForm';
import VendorLedger from './VendorLedger';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { ICONS, CURRENCY } from '../../constants';
import InvoiceBillForm from '../invoices/InvoiceBillForm';
import TransactionForm from '../transactions/TransactionForm';
import VendorBillPaymentModal from './VendorBillPaymentModal';
import LinkedTransactionWarningModal from '../transactions/LinkedTransactionWarningModal';
import { useNotification } from '../../context/NotificationContext';
import Input from '../ui/Input';
import VendorBills from './VendorBills';
import VendorQuotationsTable from './VendorQuotationsTable';
import QuotationForm from './QuotationForm';
import useLocalStorage from '../../hooks/useLocalStorage';
import { Quotation } from '../../types';
import { ImportType } from '../../services/importService';

const AddVendorSection: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const [isModalOpen, setIsModalOpen] = useState(false);

    const handleSubmit = (contact: Omit<Contact, 'id'>) => {
        dispatch({ type: 'ADD_CONTACT', payload: { ...contact, id: Date.now().toString() } });
        setIsModalOpen(false);
    };

    return (
        <>
            <div className="bg-white border-b border-slate-200 shadow-sm flex-shrink-0">
                <div className="px-6 py-4 flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-bold text-slate-900">Vendor Directory</h1>
                        <p className="text-sm text-slate-500 mt-1">Manage your suppliers and vendors</p>
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="secondary"
                            onClick={() => {
                                dispatch({ type: 'SET_INITIAL_IMPORT_TYPE', payload: ImportType.VENDORS });
                                dispatch({ type: 'SET_PAGE', payload: 'import' });
                            }}
                            className="shadow-md hover:shadow-lg transition-shadow"
                        >
                            <div className="w-4 h-4 mr-2">{ICONS.download}</div>
                            <span>Bulk Import</span>
                        </Button>
                        <Button onClick={() => setIsModalOpen(true)} className="shadow-md hover:shadow-lg transition-shadow">
                            <div className="w-4 h-4 mr-2">{ICONS.plus}</div>
                            <span>Add New Vendor</span>
                        </Button>
                    </div>
                </div>
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Add New Vendor/Supplier">
                <ContactForm
                    onSubmit={handleSubmit}
                    onCancel={() => setIsModalOpen(false)}
                    fixedTypeForNew={ContactType.VENDOR}
                    existingContacts={state.contacts}
                />
            </Modal>
        </>
    );
};

const VendorDirectoryPage: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const { showConfirm } = useNotification();
    const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isCreateBillModalOpen, setIsCreateBillModalOpen] = useState(false);
    const [isCreatePaymentModalOpen, setIsCreatePaymentModalOpen] = useState(false);
    const [isQuotationFormModalOpen, setIsQuotationFormModalOpen] = useState(false);
    const [editingQuotation, setEditingQuotation] = useState<Quotation | null>(null);
    const [editingItem, setEditingItem] = useState<{ id: string; type: 'bill' | 'transaction' } | null>(null);
    const [warningModalState, setWarningModalState] = useState<{
        isOpen: boolean;
        transaction: Transaction | null;
        action: 'edit' | 'delete' | null;
    }>({ isOpen: false, transaction: null, action: null });
    
    const [vendorSearch, setVendorSearch] = useState('');
    const [activeTab, setActiveTab] = useLocalStorage<'Ledger' | 'Bills' | 'Quotations'>('vendorDirectory_activeTab', 'Ledger');
    
    const [duplicateBillData, setDuplicateBillData] = useState<Partial<Bill> | null>(null);

    const vendors = state.contacts
        .filter(c => c.type === ContactType.VENDOR)
        .sort((a, b) => a.name.localeCompare(b.name));
        
    const filteredVendors = useMemo(() => {
        if (!vendorSearch) return vendors;
        const q = vendorSearch.toLowerCase();
        return vendors.filter(v => v.name.toLowerCase().includes(q) || (v.companyName && v.companyName.toLowerCase().includes(q)));
    }, [vendors, vendorSearch]);

    // Calculate payable amounts for each vendor
    const vendorsWithPayable = useMemo(() => {
        return filteredVendors.map(vendor => {
            const vendorBills = state.bills.filter(b => b.contactId === vendor.id);
            
            // Calculate total payable as sum of unpaid balances for all bills
            const payableAmount = vendorBills.reduce((sum, bill) => {
                const balance = bill.amount - (bill.paidAmount || 0);
                return sum + Math.max(0, balance); // Only count positive balances
            }, 0);
            
            return {
                ...vendor,
                payableAmount
            };
        });
    }, [filteredVendors, state.bills]);
        
    const selectedVendor = vendors.find(v => v.id === selectedVendorId) || null;
    
    const billToEdit = editingItem?.type === 'bill' ? state.bills.find(b => b.id === editingItem.id) : undefined;
    const transactionToEdit = editingItem?.type === 'transaction' ? state.transactions.find(t => t.id === editingItem.id) : undefined;


    const handleUpdateVendor = (contactData: Omit<Contact, 'id'>) => {
        if (!selectedVendor) return;
        dispatch({ type: 'UPDATE_CONTACT', payload: { ...selectedVendor, ...contactData } });
        setIsEditModalOpen(false);
    };

    const handleDeleteVendor = async () => {
        if (!selectedVendor) return;
        const confirmed = await showConfirm(`Are you sure you want to delete vendor "${selectedVendor.name}"? This cannot be undone.`, { title: 'Delete Vendor', confirmLabel: 'Delete', cancelLabel: 'Cancel' });
        if (confirmed) {
            dispatch({ type: 'DELETE_CONTACT', payload: selectedVendor.id });
            setSelectedVendorId(null);
            setIsEditModalOpen(false);
        }
    };
    
    const handleLedgerItemSelect = (id: string, type: 'bill' | 'transaction') => {
        setEditingItem({ id, type });
    };
    
    const handleEditBill = (bill: Bill) => {
        setEditingItem({ id: bill.id, type: 'bill' });
    };

    const handleShowDeleteWarning = (tx: Transaction) => {
        setEditingItem(null); // Close the form modal first
        setWarningModalState({ isOpen: true, transaction: tx, action: 'delete' });
    };

    const handleConfirmWarning = () => {
        const { transaction, action } = warningModalState;
        if (!transaction || action !== 'delete') return;

        dispatch({ type: 'DELETE_TRANSACTION', payload: transaction.id });
        
        setWarningModalState({ isOpen: false, transaction: null, action: null });
    };

    const handleCloseWarning = () => {
        if (warningModalState.action === 'delete' && warningModalState.transaction) {
            setEditingItem({ id: warningModalState.transaction.id, type: 'transaction' });
        }
        setWarningModalState({ isOpen: false, transaction: null, action: null });
    };

    const handleDuplicateBill = (data: Partial<Bill>) => {
        const { id, paidAmount, status, ...rest } = data;
        setDuplicateBillData({ ...rest, paidAmount: 0, status: undefined });
        setEditingItem(null); // Close edit modal
        setIsCreateBillModalOpen(true); // Open create modal
    };

    const getLinkedItemName = (tx: Transaction | null): string => {
        if (!tx) return '';
        if (tx.billId) {
            const bill = state.bills.find(b => b.id === tx.billId);
            return `Bill #${bill?.billNumber || 'N/A'}`;
        }
        return 'a linked item';
    };

    // Helper to get vendor initials for avatar
    const getInitials = (name: string) => {
        return name
            .split(' ')
            .map(n => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
    };

    return (
        <div className="flex flex-col h-full bg-slate-50">
            <AddVendorSection />
            <div className="flex-grow flex flex-col lg:flex-row gap-4 p-4 min-h-0">
                {/* Vendor List Sidebar */}
                <div className="lg:w-80 xl:w-96 flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 h-64 lg:h-full shrink-0 overflow-hidden">
                    <div className="p-4 border-b border-slate-200 flex-shrink-0 bg-gradient-to-r from-slate-50 to-white">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">All Vendors</h3>
                            <span className="text-xs text-slate-500 font-medium">Payable</span>
                        </div>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                <span className="h-4 w-4">{ICONS.search}</span>
                            </div>
                            <Input 
                                id="vendor-search"
                                name="vendor-search"
                                placeholder="Search vendors..." 
                                value={vendorSearch} 
                                onChange={(e) => setVendorSearch(e.target.value)}
                                className="pl-9 py-2 text-sm border-slate-300 focus:border-accent focus:ring-accent"
                            />
                        </div>
                        {vendors.length > 0 && (
                            <div className="mt-3 text-xs text-slate-500 font-medium">
                                {vendorsWithPayable.length} of {vendors.length} vendors
                            </div>
                        )}
                    </div>
                    <div className="overflow-y-auto flex-1">
                        {vendorsWithPayable.length > 0 ? (
                            <ul className="divide-y divide-slate-100">
                                {vendorsWithPayable.map(vendor => {
                                    const isSelected = selectedVendorId === vendor.id;
                                    return (
                                        <li key={vendor.id}>
                                            <button 
                                                onClick={() => { setSelectedVendorId(vendor.id); setActiveTab('Ledger'); }}
                                                className={`w-full text-left p-3 transition-all duration-200 ${
                                                    isSelected 
                                                        ? 'bg-gradient-to-r from-indigo-50 to-blue-50 border-l-4 border-indigo-500 shadow-sm' 
                                                        : 'hover:bg-slate-50 border-l-4 border-transparent'
                                                }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                                                        isSelected 
                                                            ? 'bg-indigo-600 text-white shadow-md' 
                                                            : 'bg-slate-200 text-slate-600'
                                                    }`}>
                                                        {getInitials(vendor.name)}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className={`text-sm font-semibold truncate ${isSelected ? 'text-indigo-900' : 'text-slate-900'}`}>
                                                            {vendor.name}
                                                        </div>
                                                        {vendor.companyName && (
                                                            <div className="text-xs text-slate-500 truncate mt-0.5">
                                                                {vendor.companyName}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex-shrink-0 text-right">
                                                        <div className={`text-sm font-bold tabular-nums ${vendor.payableAmount > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                                                            {vendor.payableAmount > 0 ? `${CURRENCY} ${vendor.payableAmount.toLocaleString()}` : '-'}
                                                        </div>
                                                    </div>
                                                </div>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                                    <div className="w-8 h-8 text-slate-400">{ICONS.search}</div>
                                </div>
                                <p className="text-sm font-medium text-slate-600 mb-1">No vendors found</p>
                                <p className="text-xs text-slate-500">
                                    {vendorSearch ? 'Try a different search term' : 'Add your first vendor to get started'}
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col min-h-0">
                    {selectedVendor ? (
                        <>
                            {/* Compact Vendor Header with Quick Actions */}
                            <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-3 flex-shrink-0">
                                <div className="flex items-center justify-between px-4 py-3 gap-4">
                                    {/* Vendor Info - Compact */}
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-indigo-600 to-blue-600 flex items-center justify-center text-white text-xs font-bold shadow-md">
                                            {getInitials(selectedVendor.name)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-sm font-bold text-slate-900 truncate leading-tight" title={selectedVendor.name}>
                                                {selectedVendor.name}
                                            </h3>
                                            <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                                                {selectedVendor.companyName && (
                                                    <span className="truncate">{selectedVendor.companyName}</span>
                                                )}
                                                {selectedVendor.contactNo && (
                                                    <span className="flex items-center gap-1">
                                                        <span className="w-3 h-3">{ICONS.phone}</span>
                                                        {selectedVendor.contactNo}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Quick Actions Toolbar - Compact */}
                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                        <button
                                            onClick={() => { setDuplicateBillData(null); setIsCreateBillModalOpen(true); }}
                                            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-all shadow-sm hover:shadow-md"
                                            title="Create New Bill"
                                        >
                                            <span className="w-3 h-3">{ICONS.plus}</span>
                                            <span>Bill</span>
                                        </button>
                                        <button
                                            onClick={() => setIsCreatePaymentModalOpen(true)}
                                            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-all"
                                            title="Record Payment"
                                        >
                                            <span className="w-3 h-3">{ICONS.dollarSign}</span>
                                            <span>Payment</span>
                                        </button>
                                        <button
                                            onClick={() => {
                                                setEditingQuotation(null);
                                                setIsQuotationFormModalOpen(true);
                                            }}
                                            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-all"
                                            title="Create Quotation"
                                        >
                                            <span className="w-3 h-3">{ICONS.fileText}</span>
                                            <span>Quote</span>
                                        </button>
                                        
                                        <div className="w-px h-6 bg-slate-200 mx-1"></div>
                                        
                                        {selectedVendor.contactNo && (
                                            <button
                                                onClick={async () => {
                                                    const message = state.whatsAppTemplates.vendorGreeting.replace(/{contactName}/g, selectedVendor.name);
                                                    const phoneNumber = selectedVendor.contactNo!.replace(/[^0-9]/g, '');
                                                    const encodedMessage = encodeURIComponent(message);
                                                    window.open(`https://wa.me/${phoneNumber}?text=${encodedMessage}`, '_blank');
                                                }}
                                                className="flex items-center justify-center w-7 h-7 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 border border-green-200 transition-colors"
                                                title="Send WhatsApp Message"
                                            >
                                                <span className="w-3.5 h-3.5">{ICONS.whatsapp}</span>
                                            </button>
                                        )}
                                        <button
                                            onClick={() => setIsEditModalOpen(true)}
                                            className="flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                                            title="Edit Vendor Details"
                                        >
                                            <span className="w-3.5 h-3.5">{ICONS.edit}</span>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Main Data Grid Area - Maximized */}
                            <div className="flex-grow flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 min-h-0 overflow-hidden">
                                {/* Tabs - More Compact */}
                                <div className="px-3 py-2 border-b border-slate-200 bg-slate-50/50 flex-shrink-0">
                                    <div className="flex items-center gap-1">
                                        <button 
                                            onClick={() => setActiveTab('Ledger')} 
                                            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 ${
                                                activeTab === 'Ledger' 
                                                    ? 'bg-white text-indigo-700 shadow border border-indigo-200' 
                                                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                                            }`}
                                        >
                                            Transaction Ledger
                                        </button>
                                        <button 
                                            onClick={() => setActiveTab('Bills')} 
                                            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 ${
                                                activeTab === 'Bills' 
                                                    ? 'bg-white text-indigo-700 shadow border border-indigo-200' 
                                                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                                            }`}
                                        >
                                            Bill List
                                        </button>
                                        <button 
                                            onClick={() => setActiveTab('Quotations')} 
                                            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 ${
                                                activeTab === 'Quotations' 
                                                    ? 'bg-white text-indigo-700 shadow border border-indigo-200' 
                                                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                                            }`}
                                        >
                                            Quotations
                                        </button>
                                    </div>
                                </div>
                                
                                {/* Content Area - Maximized */}
                                <div className="flex-grow overflow-y-auto min-h-0 p-3">
                                    {activeTab === 'Ledger' ? (
                                        <VendorLedger vendorId={selectedVendor.id} onItemClick={handleLedgerItemSelect} />
                                    ) : activeTab === 'Bills' ? (
                                        <VendorBills vendorId={selectedVendor.id} onEditBill={handleEditBill} />
                                    ) : (
                                        <VendorQuotationsTable 
                                            vendorId={selectedVendor.id} 
                                            onEditQuotation={(quotation) => {
                                                setEditingQuotation(quotation);
                                                setIsQuotationFormModalOpen(true);
                                            }}
                                        />
                                    )}
                                </div>
                            </div>
                            <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title={`Edit: ${selectedVendor.name}`}>
                                <ContactForm
                                    key={selectedVendor.id}
                                    contactToEdit={selectedVendor}
                                    onSubmit={handleUpdateVendor}
                                    onDelete={handleDeleteVendor}
                                    onCancel={() => setIsEditModalOpen(false)}
                                    existingContacts={state.contacts}
                                />
                            </Modal>
                            <Modal isOpen={isCreateBillModalOpen} onClose={() => setIsCreateBillModalOpen(false)} title={duplicateBillData ? `Duplicate Bill for ${selectedVendor.name}` : `Create Bill for ${selectedVendor.name}`}>
                                <InvoiceBillForm
                                    key={duplicateBillData ? 'dup-bill' : `new-bill-${selectedVendor.id}`}
                                    type="bill"
                                    onClose={() => setIsCreateBillModalOpen(false)}
                                    initialContactId={selectedVendor.id}
                                    initialData={duplicateBillData || undefined}
                                />
                            </Modal>
                            
                            <VendorBillPaymentModal 
                                isOpen={isCreatePaymentModalOpen} 
                                onClose={() => setIsCreatePaymentModalOpen(false)} 
                                vendor={selectedVendor} 
                            />

                            {/* Quotation Form Modal */}
                            {selectedVendor && (
                                <Modal
                                    isOpen={isQuotationFormModalOpen}
                                    onClose={() => {
                                        setIsQuotationFormModalOpen(false);
                                        setEditingQuotation(null);
                                    }}
                                    title={editingQuotation ? 'Edit Quotation' : 'Add New Quotation'}
                                    size="large"
                                >
                                    <QuotationForm
                                        quotationToEdit={editingQuotation || undefined}
                                        vendorId={selectedVendor.id}
                                        vendorName={selectedVendor.name}
                                        onClose={() => {
                                            setIsQuotationFormModalOpen(false);
                                            setEditingQuotation(null);
                                        }}
                                    />
                                </Modal>
                            )}
                        </>
                    ) : (
                        <div className="flex-grow flex flex-col items-center justify-center bg-white rounded-xl shadow-sm border-2 border-dashed border-slate-300">
                            <div className="text-center p-8">
                                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-100 to-blue-100 flex items-center justify-center mx-auto mb-4">
                                    <div className="w-10 h-10 text-indigo-600">{ICONS.search}</div>
                                </div>
                                <h3 className="text-sm font-semibold text-slate-900 mb-2">Select a Vendor</h3>
                                <p className="text-sm text-slate-500 max-w-sm">
                                    Choose a vendor from the list to view their details, transaction ledger, and bills
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            
            {billToEdit && (
                <Modal isOpen={true} onClose={() => setEditingItem(null)} title="Edit Bill">
                    <InvoiceBillForm 
                        key={billToEdit.id}
                        onClose={() => setEditingItem(null)} 
                        type="bill" 
                        itemToEdit={billToEdit} 
                        onDuplicate={handleDuplicateBill}
                    />
                </Modal>
            )}

            {transactionToEdit && (
                <Modal isOpen={true} onClose={() => setEditingItem(null)} title="Edit Payment Transaction">
                    <TransactionForm 
                        key={transactionToEdit.id}
                        onClose={() => setEditingItem(null)} 
                        transactionToEdit={transactionToEdit}
                        onShowDeleteWarning={handleShowDeleteWarning}
                    />
                </Modal>
            )}

            <LinkedTransactionWarningModal
                isOpen={warningModalState.isOpen}
                onClose={handleCloseWarning}
                onConfirm={handleConfirmWarning}
                action={warningModalState.action as 'update' | 'delete'}
                linkedItemName={getLinkedItemName(warningModalState.transaction)}
            />
        </div>
    );
};

export default VendorDirectoryPage;