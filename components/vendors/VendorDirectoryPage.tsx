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
import { useWhatsApp } from '../../context/WhatsAppContext';
import Input from '../ui/Input';
import { WhatsAppService } from '../../services/whatsappService';
import { useWhatsApp } from '../../context/WhatsAppContext';
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

const AddVendorSection: React.FC<{
    optionsView: 'Quotation' | 'Bills' | 'Reports' | null;
    setOptionsView: (view: 'Quotation' | 'Bills' | 'Reports' | null) => void;
    setSelectedVendorId: (id: string | null) => void;
}> = ({ optionsView, setOptionsView, setSelectedVendorId }) => {
    const { state, dispatch } = useAppContext();
    const [isModalOpen, setIsModalOpen] = useState(false);

    const handleSubmit = (contact: Omit<Contact, 'id'>) => {
        dispatch({ type: 'ADD_CONTACT', payload: { ...contact, id: Date.now().toString() } });
        setIsModalOpen(false);
    };

    const navItems: { id: 'Quotation' | 'Bills' | 'Reports'; label: string; icon: any }[] = [
        { id: 'Quotation', label: 'All Quotations', icon: ICONS.fileText },
        { id: 'Bills', label: 'All Bills', icon: ICONS.creditCard },
        { id: 'Reports', label: 'Reports', icon: ICONS.barChart }
    ];

    return (
        <>
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 sticky top-0 z-20">
                {/* Global Views Navigation */}
                <div className="flex bg-slate-100 p-1 rounded-xl">
                    {navItems.map((item) => {
                        const isActive = optionsView === item.id;
                        return (
                            <button
                                key={item.id}
                                onClick={() => {
                                    setOptionsView(item.id);
                                    setSelectedVendorId(null);
                                }}
                                className={`
                                    flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
                                    ${isActive
                                        ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5'
                                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                                    }
                                `}
                            >
                                <span className={isActive ? 'text-indigo-500' : 'text-slate-400'}>{item.icon}</span>
                                {item.label}
                            </button>
                        );
                    })}
                </div>

                {/* Global Actions */}
                <div className="flex items-center gap-3">
                    <Button
                        variant="secondary"
                        onClick={() => {
                            dispatch({ type: 'SET_INITIAL_IMPORT_TYPE', payload: ImportType.VENDORS });
                            dispatch({ type: 'SET_PAGE', payload: 'import' });
                        }}
                        className="!bg-white !border-slate-300 hover:!bg-slate-50 text-slate-600"
                    >
                        <div className="w-4 h-4 mr-2">{ICONS.download}</div>
                        <span>Import</span>
                    </Button>
                    <Button
                        onClick={() => setIsModalOpen(true)}
                        className="!bg-indigo-600 hover:!bg-indigo-700 shadow-lg shadow-indigo-200"
                    >
                        <div className="w-4 h-4 mr-2">{ICONS.plus}</div>
                        <span>Create Vendor</span>
                    </Button>
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
    const { showConfirm, showAlert } = useNotification();
    const { openChat } = useWhatsApp();
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
            const sortKey = sortConfig.key === 'payable' ? 'payableAmount' : sortConfig.key;
            let aVal: any = a[sortKey as keyof typeof a];
            let bVal: any = b[sortKey as keyof typeof b];

            if (sortConfig.key === 'name') {
                aVal = (aVal || '').toLowerCase();
                bVal = (bVal || '').toLowerCase();
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

    const getVendorPayable = (vendorId: string) => {
        const vendorBills = state.bills.filter(b => b.contactId === vendorId);
        return vendorBills.reduce((sum, bill) => {
            const balance = bill.amount - (bill.paidAmount || 0);
            return sum + Math.max(0, balance);
        }, 0);
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
            <AddVendorSection optionsView={optionsView} setOptionsView={setOptionsView} setSelectedVendorId={setSelectedVendorId} />
            <div className="flex-grow flex flex-col md:flex-row gap-3 md:gap-4 p-3 md:p-4 min-h-0 overflow-hidden">
                {/* Vendor List Sidebar */}
                <div
                    className="hidden md:flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 h-full flex-shrink-0 overflow-hidden z-10"
                    style={{ width: sidebarWidth }}
                >
                    <div className="p-3 border-b border-slate-100 bg-white z-10 flex-shrink-0">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-tight">Vendors</h2>
                            <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full text-[10px] font-semibold">
                                {vendors.length}
                            </span>
                        </div>

                        <div className="relative mb-2 group">
                            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-indigo-500 transition-colors">
                                <span className="h-3.5 w-3.5">{ICONS.search}</span>
                            </div>
                            <input
                                placeholder="Search..."
                                value={vendorSearch}
                                onChange={(e) => setVendorSearch(e.target.value)}
                                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-sm focus:outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all placeholder:text-slate-400"
                            />
                        </div>

                        <div className="flex items-center justify-between text-[11px] px-1">
                            <button
                                onClick={() => handleSort('name')}
                                className={`flex items-center gap-1 font-medium transition-colors ${sortConfig.key === 'name' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-800'}`}
                            >
                                Name
                                {sortConfig.key === 'name' && (
                                    <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                                )}
                            </button>
                            <button
                                onClick={() => handleSort('payable')}
                                className={`flex items-center gap-1 font-medium transition-colors ${sortConfig.key === 'payable' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-800'}`}
                            >
                                Payable
                                {sortConfig.key === 'payable' && (
                                    <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                                )}
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto p-1 space-y-0.5 scrollbar-thin scrollbar-thumb-slate-200">
                        {vendorsWithPayable.length > 0 ? (
                            <ul className="space-y-0.5">
                                {vendorsWithPayable.map(vendor => {
                                    const isSelected = selectedVendorId === vendor.id;
                                    return (
                                        <li key={vendor.id}>
                                            <button
                                                onClick={() => {
                                                    setSelectedVendorId(vendor.id);
                                                    setActiveTab('Ledger');
                                                    setOptionsView(null as any);
                                                }}
                                                className={`w-full text-left px-3 py-2 rounded-lg transition-all duration-200 border-b border-slate-50 last:border-0 ${isSelected
                                                    ? 'bg-indigo-50/50 shadow-sm border-transparent'
                                                    : 'hover:bg-slate-50 border-slate-50'
                                                    }`}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex-1 min-w-0">
                                                        <div className={`text-sm font-semibold truncate ${isSelected ? 'text-indigo-900' : 'text-slate-800'}`}>
                                                            {vendor.name}
                                                        </div>
                                                        {vendor.companyName && (
                                                            <div className="text-[10px] text-slate-500 truncate mt-0.5 opacity-90">
                                                                {vendor.companyName}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {vendor.payableAmount > 0 ? (
                                                        <div className="flex-shrink-0 text-right">
                                                            <div className="text-xs font-bold text-rose-600">
                                                                {CURRENCY} {vendor.payableAmount.toLocaleString()}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex-shrink-0 text-right">
                                                            <div className="text-xs font-medium text-slate-300">
                                                                -
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-32 text-center p-4">
                                <p className="text-xs font-semibold text-slate-600">No vendors found</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Resize Handle */}
                <div className="hidden md:block h-full">
                    <ResizeHandle onMouseDown={startResizing} />
                </div>

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                    {selectedVendor && !optionsView ? (
                        <>
                            {/* Vendor Detail Header */}
                            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 mb-4 flex-shrink-0 relative overflow-hidden group">
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>
                                <div className="p-6">
                                    <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-6">
                                        {/* Vendor Profile */}
                                        <div className="flex items-start gap-5">
                                            <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center text-indigo-600 text-2xl font-bold shadow-inner border border-white ring-4 ring-indigo-50">
                                                {getInitials(selectedVendor.name)}
                                            </div>
                                            <div className="flex-1 min-w-0 pt-1">
                                                <h1 className="text-2xl font-bold text-slate-900 leading-tight mb-1">
                                                    {selectedVendor.name}
                                                </h1>
                                                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500">
                                                    {selectedVendor.companyName && (
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="p-1 bg-slate-100 rounded">{ICONS.building}</span>
                                                            <span className="font-medium">{selectedVendor.companyName}</span>
                                                        </div>
                                                    )}
                                                    {selectedVendor.contactNo && (
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="p-1 bg-slate-100 rounded">{ICONS.phone}</span>
                                                            <span className="font-mono">{selectedVendor.contactNo}</span>
                                                        </div>
                                                    )}
                                                    {selectedVendor.address && (
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="p-1 bg-slate-100 rounded">{ICONS.mapPin}</span>
                                                            <span className="truncate max-w-[200px]">{selectedVendor.address}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Quick Stats & Actions */}
                                        <div className="flex flex-col items-end gap-4">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => setIsEditModalOpen(true)}
                                                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-colors"
                                                    title="Edit Vendor Details"
                                                >
                                                    {ICONS.edit}
                                                </button>
                                                <div className="h-6 w-px bg-slate-200"></div>
                                                {selectedVendor.contactNo && (
                                                    <button
                                                        onClick={async () => {
                                                            try {
                                                                // Check if WhatsApp API is configured, if yes use chat window, otherwise use wa.me
                                                                const { WhatsAppChatService } = await import('../../services/whatsappChatService');
                                                                const isConfigured = await WhatsAppChatService.isConfigured();
                                                                if (isConfigured) {
                                                                    // Open chat window
                                                                    openChat(selectedVendor);
                                                                } else {
                                                                    // Fallback to wa.me URL scheme
                                                                    const message = WhatsAppService.generateVendorGreeting(state.whatsAppTemplates.vendorGreeting, selectedVendor);
                                                                    WhatsAppService.sendMessage({ contact: selectedVendor, message });
                                                                }
                                                            } catch (error) {
                                                                await showAlert(error instanceof Error ? error.message : 'Failed to open WhatsApp');
                                                            }
                                                        }}
                                                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                                        title="WhatsApp"
                                                    >
                                                        {ICONS.whatsapp}
                                                    </button>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-3">
                                                <div className="px-4 py-2 bg-rose-50 border border-rose-100 rounded-xl flex flex-col items-end min-w-[120px]">
                                                    <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">Payable</span>
                                                    <span className="text-lg font-bold text-rose-700 leading-none mt-0.5">
                                                        {CURRENCY} {getVendorPayable(selectedVendor.id).toLocaleString()}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Bar */}
                                    <div className="flex items-center justify-between mt-6 pt-5 border-t border-slate-100">
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setActiveTab('Ledger')}
                                                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeTab === 'Ledger' ? 'bg-slate-900 text-white shadow-lg shadow-slate-200' : 'text-slate-600 hover:bg-slate-50'}`}
                                            >
                                                Ledger
                                            </button>
                                            <button
                                                onClick={() => setActiveTab('Bills')}
                                                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeTab === 'Bills' ? 'bg-slate-900 text-white shadow-lg shadow-slate-200' : 'text-slate-600 hover:bg-slate-50'}`}
                                            >
                                                Bills
                                            </button>
                                            <button
                                                onClick={() => setActiveTab('Quotations')}
                                                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeTab === 'Quotations' ? 'bg-slate-900 text-white shadow-lg shadow-slate-200' : 'text-slate-600 hover:bg-slate-50'}`}
                                            >
                                                Quotations
                                            </button>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="secondary"
                                                onClick={() => {
                                                    setEditingQuotation(null);
                                                    setIsQuotationFormModalOpen(true);
                                                }}
                                                className="!py-1.5 !px-3 !text-xs"
                                            >
                                                <span className="w-3.5 h-3.5 mr-1.5 opacity-70">{ICONS.fileText}</span>
                                                Quote
                                            </Button>
                                            <Button
                                                variant="secondary"
                                                onClick={() => { setDuplicateBillData(null); setIsCreateBillModalOpen(true); }}
                                                className="!py-1.5 !px-3 !text-xs"
                                            >
                                                <span className="w-3.5 h-3.5 mr-1.5 opacity-70">{ICONS.plus}</span>
                                                Bill
                                            </Button>
                                            <Button
                                                onClick={() => setIsCreatePaymentModalOpen(true)}
                                                className="!py-1.5 !px-3 !text-xs !bg-emerald-600 hover:!bg-emerald-700 !shadow-emerald-200"
                                            >
                                                <span className="w-3.5 h-3.5 mr-1.5">{ICONS.dollarSign}</span>
                                                Record Payment
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Content Area */}
                            <div className="flex-grow flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 min-h-0 overflow-hidden relative">
                                <div className="flex-grow min-h-0 p-1 overflow-hidden">
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
                                    size="xl"
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
                        <div className="flex-grow flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 min-h-0 overflow-hidden m-0">
                            {/* Options Content */}
                            <div className="flex-grow min-h-0 p-4 overflow-auto">
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
                                ) : optionsView === 'Reports' ? (
                                    <div className="h-full flex flex-col max-w-7xl mx-auto w-full">
                                        {/* Report Selection Menu */}
                                        <div className="mb-6 flex-shrink-0 bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
                                            <div>
                                                <h3 className="font-bold text-slate-800">Vendor Reports</h3>
                                                <p className="text-sm text-slate-500">Analyze your spending and vendor performance</p>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-sm font-medium text-slate-600">Report Type:</span>
                                                <div className="relative min-w-[240px]">
                                                    <select
                                                        value={selectedReport}
                                                        onChange={(e) => setSelectedReport(e.target.value)}
                                                        className="w-full pl-4 pr-10 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 appearance-none bg-white font-medium text-slate-700 shadow-sm transition-all"
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
                                                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                        </svg>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Report Display */}
                                        <div className="flex-grow min-h-0 overflow-hidden bg-white rounded-xl shadow-sm border border-slate-200">
                                            {selectedReport === 'vendor-comparison' ? (
                                                <VendorComparisonReport />
                                            ) : selectedReport === 'vendor-ledger' ? (
                                                <VendorLedgerReport />
                                            ) : (
                                                <div className="p-12 text-center">
                                                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-50 text-slate-400 mb-4">
                                                        {ICONS.barChart}
                                                    </div>
                                                    <h3 className="text-lg font-bold text-slate-900 mb-1">Select a Report</h3>
                                                    <p className="text-slate-500">Choose a report type to view analysis</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full max-w-md mx-auto text-center p-8">
                                        <div className="w-24 h-24 bg-gradient-to-br from-indigo-50 to-blue-50 rounded-3xl flex items-center justify-center mb-6 shadow-sm border border-indigo-100">
                                            <div className="w-12 h-12 text-indigo-400 opacity-80">
                                                {ICONS.users}
                                            </div>
                                        </div>
                                        <h2 className="text-2xl font-bold text-slate-800 mb-3">Select a Vendor</h2>
                                        <p className="text-slate-500 mb-8 leading-relaxed">
                                            Select a vendor from the list to view their ledger, bills, and manage payments. Or use the views above to see all data.
                                        </p>
                                        <div className="flex flex-wrap justify-center gap-3">
                                            <div className="px-4 py-2 bg-white border border-slate-200 rounded-lg shadow-sm text-sm font-medium text-slate-600 flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                                                Manage Bills
                                            </div>
                                            <div className="px-4 py-2 bg-white border border-slate-200 rounded-lg shadow-sm text-sm font-medium text-slate-600 flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                                Record Payments
                                            </div>
                                            <div className="px-4 py-2 bg-white border border-slate-200 rounded-lg shadow-sm text-sm font-medium text-slate-600 flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                                Track Expenses
                                            </div>
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