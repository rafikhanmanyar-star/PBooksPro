import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
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
import { WhatsAppService } from '../../services/whatsappService';
import VendorBills from './VendorBills';
import VendorQuotationsTable from './VendorQuotationsTable';
import QuotationForm from './QuotationForm';
import useLocalStorage from '../../hooks/useLocalStorage';
import { Quotation } from '../../types';
import { ImportType } from '../../services/importService';
import ResizeHandle from '../ui/ResizeHandle';
import AllQuotationsTable from './AllQuotationsTable';
import AllBillsTable from './AllBillsTable';
import VendorComparisonReport from '../reports/VendorComparisonReport';
import VendorLedgerReport from '../reports/VendorLedgerReport';
import { reportDefinitions } from '../reports/reportDefinitions';

const AddVendorSection: React.FC<{ optionsView: 'Quotation' | 'Bills' | 'Reports'; setOptionsView: (view: 'Quotation' | 'Bills' | 'Reports') => void }> = ({ optionsView, setOptionsView }) => {
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
                    {/* Left side: Options tabs */}
                    <div className="flex items-center gap-1">
                        <button 
                            onClick={() => setOptionsView('Quotation')} 
                            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 ${
                                optionsView === 'Quotation' 
                                    ? 'bg-indigo-600 text-white shadow border border-indigo-700' 
                                    : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200 border border-slate-300'
                            }`}
                        >
                            Quotation
                        </button>
                        <button 
                            onClick={() => setOptionsView('Bills')} 
                            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 ${
                                optionsView === 'Bills' 
                                    ? 'bg-indigo-600 text-white shadow border border-indigo-700' 
                                    : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200 border border-slate-300'
                            }`}
                        >
                            Bills
                        </button>
                        <button 
                            onClick={() => setOptionsView('Reports')} 
                            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 ${
                                optionsView === 'Reports' 
                                    ? 'bg-indigo-600 text-white shadow border border-indigo-700' 
                                    : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200 border border-slate-300'
                            }`}
                        >
                            Reports
                        </button>
                    </div>
                    
                    {/* Right side: Action buttons */}
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

type SortKey = 'name' | 'payable';
type SortDirection = 'asc' | 'desc';

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
    const [optionsView, setOptionsView] = useLocalStorage<'Quotation' | 'Bills' | 'Reports'>('vendorDirectory_optionsView', 'Quotation');
    const [selectedReport, setSelectedReport] = useState<string>('vendor-comparison');
    const [sidebarWidth, setSidebarWidth] = useLocalStorage<number>('vendorDirectory_sidebarWidth', 320);
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'name', direction: 'asc' });
    
    // Resize handlers
    const isResizing = useRef(false);
    const startX = useRef(0);
    const startWidth = useRef(0);
    
    const [duplicateBillData, setDuplicateBillData] = useState<Partial<Bill> | null>(null);

    // Check if we need to open a vendor from search
    useEffect(() => {
        const vendorId = sessionStorage.getItem('openVendorId');
        if (vendorId) {
            sessionStorage.removeItem('openVendorId');
            setSelectedVendorId(vendorId);
        }
    }, []);

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
        const vendors = filteredVendors.map(vendor => {
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
        
        // Sort vendors
        return [...vendors].sort((a, b) => {
            let aVal: any = a[sortConfig.key];
            let bVal: any = b[sortConfig.key];
            
            if (sortConfig.key === 'name') {
                aVal = aVal.toLowerCase();
                bVal = bVal.toLowerCase();
            }
            
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [filteredVendors, state.bills, sortConfig]);
    
    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };
    
    const handleResize = useCallback((e: MouseEvent) => {
        if (isResizing.current) {
            const delta = e.clientX - startX.current;
            const newWidth = Math.max(200, Math.min(600, startWidth.current + delta));
            setSidebarWidth(newWidth);
        }
    }, [setSidebarWidth]);

    const stopResize = useCallback(() => {
        isResizing.current = false;
        document.removeEventListener('mousemove', handleResize);
        document.removeEventListener('mouseup', stopResize);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }, [handleResize]);

    const startResizing = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        isResizing.current = true;
        startX.current = e.clientX;
        startWidth.current = sidebarWidth;

        document.addEventListener('mousemove', handleResize);
        document.addEventListener('mouseup', stopResize);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, [sidebarWidth, handleResize, stopResize]);
        
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
            <AddVendorSection optionsView={optionsView} setOptionsView={setOptionsView} />
            <div className="flex-grow flex flex-col md:flex-row gap-4 p-4 min-h-0">
                {/* Vendor List Sidebar */}
                <div 
                    className="hidden md:flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 h-full flex-shrink-0 overflow-hidden"
                    style={{ width: sidebarWidth }}
                >
                    <div className="p-4 border-b border-slate-200 flex-shrink-0 bg-gradient-to-r from-slate-50 to-white">
                        <div className="flex items-center justify-between mb-3">
                            <button
                                onClick={() => handleSort('name')}
                                className="text-sm font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 flex items-center gap-1 cursor-pointer"
                                title="Sort by Name"
                            >
                                All Vendors
                                <span className="text-[10px]">
                                    {sortConfig.key === 'name' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
                                </span>
                            </button>
                            <button
                                onClick={() => handleSort('payable')}
                                className="text-xs text-slate-500 font-medium hover:text-slate-700 flex items-center gap-1 cursor-pointer"
                                title="Sort by Payable"
                            >
                                Payable
                                <span className="text-[10px]">
                                    {sortConfig.key === 'payable' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
                                </span>
                            </button>
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

                {/* Resize Handle */}
                <div className="hidden md:block h-full">
                    <ResizeHandle onMouseDown={startResizing} />
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
                                                    try {
                                                        const message = WhatsAppService.generateVendorGreeting(
                                                            state.whatsAppTemplates.vendorGreeting,
                                                            selectedVendor
                                                        );
                                                        WhatsAppService.sendMessage({ contact: selectedVendor, message });
                                                    } catch (error) {
                                                        await showAlert(error instanceof Error ? error.message : 'Failed to open WhatsApp');
                                                    }
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
                        <div className="flex-grow flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 min-h-0 overflow-hidden">
                            {/* Options Content */}
                            <div className="flex-grow overflow-y-auto min-h-0 p-3">
                                {optionsView === 'Quotation' ? (
                                    <AllQuotationsTable 
                                        onEditQuotation={(quotation) => {
                                            const vendor = state.contacts.find(c => c.id === quotation.vendorId);
                                            if (vendor) {
                                                setSelectedVendorId(vendor.id);
                                                setActiveTab('Quotations');
                                                setEditingQuotation(quotation);
                                                setIsQuotationFormModalOpen(true);
                                            }
                                        }}
                                    />
                                ) : optionsView === 'Bills' ? (
                                    <AllBillsTable 
                                        onEditBill={(bill) => {
                                            const vendor = state.contacts.find(c => c.id === bill.contactId);
                                            if (vendor) {
                                                setSelectedVendorId(vendor.id);
                                                setActiveTab('Bills');
                                                setEditingItem({ id: bill.id, type: 'bill' });
                                            }
                                        }}
                                    />
                                ) : (
                                    <div className="h-full flex flex-col">
                                        {/* Report Selection */}
                                        <div className="mb-4 flex-shrink-0">
                                            <label className="block text-sm font-semibold text-slate-700 mb-2">Select Report</label>
                                            <select
                                                value={selectedReport}
                                                onChange={(e) => setSelectedReport(e.target.value)}
                                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                            >
                                                <option value="vendor-comparison">Vendor Comparison Report</option>
                                                <option value="vendor-ledger">Vendor Ledger Report</option>
                                                {reportDefinitions
                                                    .filter(r => r.title.toLowerCase().includes('vendor'))
                                                    .map(report => (
                                                        <option key={report.id} value={report.id}>
                                                            {report.title}
                                                        </option>
                                                    ))}
                                            </select>
                                        </div>
                                        
                                        {/* Report Display */}
                                        <div className="flex-grow min-h-0 overflow-hidden">
                                            {selectedReport === 'vendor-comparison' ? (
                                                <VendorComparisonReport />
                                            ) : selectedReport === 'vendor-ledger' ? (
                                                <VendorLedgerReport />
                                            ) : (
                                                <div className="p-8 text-center text-slate-500">
                                                    <p>Report view will be implemented here</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
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