import { useDispatchOnly, useFinancialReportAppState } from '../../hooks/useSelectiveState';
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getAppStateApiService } from '../../services/api/appStateApi';
import { Vendor, Bill, Transaction, Page, TransactionType } from '../../types';
import ContactForm from '../settings/ContactForm';
import VendorLedger from './VendorLedger';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { ICONS, CURRENCY } from '../../constants';
import InvoiceBillForm from '../invoices/InvoiceBillForm';
import TransactionForm from '../transactions/TransactionForm';
import VendorBillPaymentModal from './VendorBillPaymentModal';
import RecordSupplierAdvanceModal from './RecordSupplierAdvanceModal';
import LinkedTransactionWarningModal from '../transactions/LinkedTransactionWarningModal';
import { useNotification } from '../../context/NotificationContext';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { WhatsAppService, sendOrOpenWhatsApp } from '../../services/whatsappService';
import VendorBills from './VendorBills';
import VendorQuotationsTable from './VendorQuotationsTable';
import QuotationForm from './QuotationForm';
import useLocalStorage from '../../hooks/useLocalStorage';
import { Quotation } from '../../types';
import { ImportType } from '../../types';
import ResizeHandle from '../ui/ResizeHandle';
import AllQuotationsTable from './AllQuotationsTable';
import AllBillsTable from './AllBillsTable';
import VendorComparisonReport from '../reports/VendorComparisonReport';
import VendorQuotationComparisonPage from '../procurement/VendorQuotationComparisonPage';
import VendorPriceHistoryPage from '../procurement/VendorPriceHistoryPage';
import PurchaseOrdersPage from '../procurement/PurchaseOrdersPage';
import GoodsReceiptsPage from '../procurement/GoodsReceiptsPage';
const VendorAnalyticsPage = React.lazy(() => import('../../modules/vendor-analytics/VendorAnalyticsPage'));
import VendorLedgerReport from '../reports/VendorLedgerReport';
import { reportDefinitions } from '../reports/reportDefinitions';

const AddVendorSection: React.FC<{
    optionsView: 'Quotation' | 'Comparison' | 'PriceHistory' | 'PurchaseOrders' | 'GoodsReceipts' | 'Bills' | 'Analytics' | 'Reports' | null;
    setOptionsView: (view: 'Quotation' | 'Comparison' | 'PriceHistory' | 'PurchaseOrders' | 'GoodsReceipts' | 'Bills' | 'Analytics' | 'Reports' | null) => void;
    setSelectedVendorId: (id: string | null) => void;
    triggerAddVendor?: boolean;
    onModalOpenHandled?: () => void;
}> = ({ optionsView, setOptionsView, setSelectedVendorId, triggerAddVendor, onModalOpenHandled }) => {
    const state = useFinancialReportAppState();
    const { contacts, vendors: appVendors, transactions, invoices, bills, whatsAppTemplates, whatsAppMode, currentUser } = state;
    const dispatch = useDispatchOnly();
    const { isAuthenticated } = useAuth();
    const { showToast } = useNotification();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isVendorFormSubmitting, setIsVendorFormSubmitting] = useState(false);

    useEffect(() => {
        if (triggerAddVendor) {
            setIsModalOpen(true);
            onModalOpenHandled?.();
        }
    }, [triggerAddVendor, onModalOpenHandled]);

    const handleSubmit = async (vendorData: Partial<Vendor> | any) => {
        const localId = `vendor_${Date.now()}`;
        let payload = { ...vendorData, id: localId } as Vendor;
        if (isAuthenticated) {
            try {
                const merged = await getAppStateApiService().saveVendor({
                    ...vendorData,
                    id: localId,
                    userId: currentUser?.id,
                });
                payload = { ...payload, ...merged };
            } catch (err: any) {
                showToast(err?.message || err?.error || 'Could not save vendor.', 'error');
                return;
            }
        }
        dispatch({ type: 'ADD_VENDOR', payload });
        setIsModalOpen(false);
    };

    const navItems: { id: 'Quotation' | 'Comparison' | 'PriceHistory' | 'PurchaseOrders' | 'GoodsReceipts' | 'Bills' | 'Analytics' | 'Reports'; label: string; icon: any }[] = [
        { id: 'Quotation', label: 'All Quotations', icon: ICONS.fileText },
        { id: 'Comparison', label: 'Compare', icon: ICONS.barChart },
        { id: 'PriceHistory', label: 'Price History', icon: ICONS.trendingUp },
        { id: 'PurchaseOrders', label: 'Purchase Orders', icon: ICONS.fileText },
        { id: 'GoodsReceipts', label: 'Goods Receipts', icon: ICONS.trendingUp },
        { id: 'Bills', label: 'All Bills', icon: ICONS.creditCard },
        { id: 'Analytics', label: 'Analytics', icon: ICONS.barChart },
        { id: 'Reports', label: 'Reports', icon: ICONS.barChart }
    ];

    return (
        <>
            <div className="bg-app-card border-b border-app-border px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 sticky top-0 z-20">
                {/* Global Views Navigation */}
                <div className="flex bg-segment-bg p-1 rounded-xl">
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
                                        ? 'bg-segment-active text-segment-active shadow-ds-card'
                                        : 'text-app-muted hover:text-app-text hover:bg-app-table-hover'
                                    }
                                `}
                            >
                                <span className={isActive ? 'text-inherit' : 'text-app-muted'}>{item.icon}</span>
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
                        className="!bg-app-card !border-app-border hover:!bg-app-table-hover text-app-text"
                    >
                        <div className="w-4 h-4 mr-2">{ICONS.download}</div>
                        <span>Import</span>
                    </Button>
                    <Button
                        onClick={() => setIsModalOpen(true)}
                        className="!bg-primary hover:!bg-primary/90 shadow-ds-card"
                    >
                        <div className="w-4 h-4 mr-2">{ICONS.plus}</div>
                        <span>Create Vendor</span>
                    </Button>
                </div>
            </div>

            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                preventCloseWhile={isVendorFormSubmitting}
                title="Add New Vendor"
                hideHeader
                size="lg"
                disableScroll
            >
                <ContactForm
                    onSubmit={handleSubmit}
                    onCancel={() => setIsModalOpen(false)}
                    isVendorForm={true}
                    existingVendors={appVendors}
                    onSubmittingChange={setIsVendorFormSubmitting}
                />
            </Modal>
        </>
    );
};

type SortKey = 'name' | 'payable';
type SortDirection = 'asc' | 'desc';

const vendorTabBtn = (active: boolean) =>
    active
        ? 'bg-primary text-ds-on-primary shadow-ds-card'
        : 'text-app-muted hover:bg-app-table-hover hover:text-app-text';

const payableBadgeClass =
    'px-4 py-2 bg-[color:var(--badge-unpaid-bg)] border border-ds-danger/30 rounded-xl flex flex-col items-end min-w-[120px]';

const VendorDirectoryPage: React.FC = () => {
    const state = useFinancialReportAppState();
    const {
        contacts,
        vendors: appVendors,
        transactions,
        bills,
        whatsAppTemplates,
        whatsAppMode,
    } = state;
    const dispatch = useDispatchOnly();
    const { isAuthenticated } = useAuth();
    const { showConfirm, showAlert, showToast } = useNotification();
    const { openChat } = useWhatsApp();
    const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isCreateBillModalOpen, setIsCreateBillModalOpen] = useState(false);
    const [isCreatePaymentModalOpen, setIsCreatePaymentModalOpen] = useState(false);
    const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
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
    const [optionsView, setOptionsView] = useLocalStorage<'Quotation' | 'Comparison' | 'PriceHistory' | 'PurchaseOrders' | 'GoodsReceipts' | 'Bills' | 'Analytics' | 'Reports'>('vendorDirectory_optionsView', 'Quotation');
    const [selectedReport, setSelectedReport] = useState<string>('vendor-comparison');
    const [sidebarWidth, setSidebarWidth] = useLocalStorage<number>('vendorDirectory_sidebarWidth', 320);
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'name', direction: 'asc' });

    // Resize handlers
    const isResizing = useRef(false);
    const startX = useRef(0);
    const startWidth = useRef(0);

    const [duplicateBillData, setDuplicateBillData] = useState<Partial<Bill> | null>(null);

    // Check if we need to open a vendor from search or add new vendor
    useEffect(() => {
        const vendorId = sessionStorage.getItem('openVendorId');
        if (vendorId) {
            sessionStorage.removeItem('openVendorId');
            setSelectedVendorId(vendorId);
        }

        const addNewVendor = sessionStorage.getItem('addNewVendor');
        if (addNewVendor === 'true') {
            sessionStorage.removeItem('addNewVendor');
            // We need to trigger the modal which is inside AddVendorSection
            // Since we can't easily reach into AddVendorSection, we'll expose the state
            // But for now, let's use a custom event or refactor. 
            // Better: Move the Modal state to VendorDirectoryPage or trigger via prop.
            // Since AddVendorSection is a child, we can pass a prop 'initialOpenModal'.
            // However, we are in a useEffect here.
            // Let's use a state variable passed to AddVendorSection.
            setTriggerAddVendor(true);
        }
    }, []);

    const [triggerAddVendor, setTriggerAddVendor] = useState(false);

    const vendors = useMemo(() => {
        const list = [...(appVendors || [])];
        return list.sort((a, b) => a.name.localeCompare(b.name));
    }, [appVendors]);

    const filteredVendors = useMemo(() => {
        if (!vendorSearch) return vendors;
        const q = vendorSearch.toLowerCase();
        return appVendors.filter(v => v.name.toLowerCase().includes(q) || (v.companyName && v.companyName.toLowerCase().includes(q)));
    }, [appVendors, vendorSearch]);

    // Calculate payable amounts for each vendor
    const vendorsWithPayable = useMemo(() => {
        const vendors = filteredVendors.map(vendor => {
            const vendorBills = (bills || []).filter(b => (b.vendorId || b.contactId) === vendor.id);

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
    }, [filteredVendors, bills, sortConfig]);

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
        window.removeEventListener('blur', stopResize);
        document.removeEventListener('visibilitychange', stopResize);
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
        window.addEventListener('blur', stopResize);
        document.addEventListener('visibilitychange', stopResize);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, [sidebarWidth, handleResize, stopResize]);

    const selectedVendor = appVendors.find(v => v.id === selectedVendorId) || null;

    const billToEdit = editingItem?.type === 'bill' ? (bills || []).find(b => b.id === editingItem.id) : undefined;
    const transactionToEdit = editingItem?.type === 'transaction' ? (transactions || []).find(t => t.id === editingItem.id) : undefined;


    const handleUpdateVendor = async (vendorData: Partial<Vendor> | any) => {
        if (!selectedVendor) return;
        let payload = { ...selectedVendor, ...vendorData } as Vendor;
        if (isAuthenticated) {
            try {
                const merged = await getAppStateApiService().updateVendor(selectedVendor.id, {
                    ...payload,
                    version: selectedVendor.version,
                });
                payload = { ...payload, ...merged };
            } catch (err: any) {
                showToast(err?.message || err?.error || 'Could not update vendor.', 'error');
                return;
            }
        }
        dispatch({ type: 'UPDATE_VENDOR', payload });
        setIsEditModalOpen(false);
    };

    const handleDeleteVendor = async () => {
        if (!selectedVendor) return;
        const confirmed = await showConfirm(`Are you sure you want to delete vendor "${selectedVendor.name}"? This cannot be undone.`, { title: 'Delete Vendor', confirmLabel: 'Delete', cancelLabel: 'Cancel' });
        if (confirmed) {
            if (isAuthenticated) {
                try {
                    await getAppStateApiService().deleteVendor(selectedVendor.id, selectedVendor.version);
                } catch (err: any) {
                    if (err?.status !== 404) {
                        showToast(err?.message || err?.error || 'Could not delete vendor.', 'error');
                        return;
                    }
                }
            }
            dispatch({ type: 'DELETE_VENDOR', payload: selectedVendor.id });
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
            const bill = (bills || []).find(b => b.id === tx.billId);
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
        const vendorBills = (bills || []).filter(b => (b.vendorId || b.contactId) === vendorId);
        return vendorBills.reduce((sum, bill) => {
            const balance = bill.amount - (bill.paidAmount || 0);
            return sum + Math.max(0, balance);
        }, 0);
    };

    if (!state || !contacts) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-2"></div>
                    <p className="text-sm text-app-muted">Loading vendors...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-app-bg overflow-hidden" data-tour="vendor-directory">
            <AddVendorSection
                optionsView={optionsView}
                setOptionsView={(view) => setOptionsView(view ?? 'Quotation')}
                setSelectedVendorId={setSelectedVendorId}
                triggerAddVendor={triggerAddVendor}
                onModalOpenHandled={() => setTriggerAddVendor(false)}
            />
            <div className="flex-grow flex flex-col md:flex-row gap-3 md:gap-4 p-3 md:p-4 min-h-0 overflow-hidden">
                {/* Vendor List Sidebar */}
                <div
                    className="hidden md:flex flex-col bg-app-card rounded-2xl shadow-ds-card border border-app-border h-full flex-shrink-0 overflow-hidden z-10"
                    style={{ width: sidebarWidth }}
                >
                    <div className="p-3 border-b border-app-border bg-app-card z-10 flex-shrink-0">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-xs font-bold text-app-text uppercase tracking-tight">Vendors</h2>
                            <span className="bg-app-toolbar text-app-muted px-1.5 py-0.5 rounded-full text-[10px] font-semibold">
                                {vendors.length}
                            </span>
                        </div>

                        <div className="relative mb-2 group">
                            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-app-muted group-focus-within:text-primary transition-colors">
                                <span className="h-3.5 w-3.5">{ICONS.search}</span>
                            </div>
                            <input
                                placeholder="Search..."
                                value={vendorSearch}
                                onChange={(e) => setVendorSearch(e.target.value)}
                                className="w-full pl-8 pr-3 py-1.5 ds-input-field rounded-md text-sm transition-all"
                            />
                        </div>

                        <div className="flex items-center justify-between text-[11px] px-1">
                            <button
                                onClick={() => handleSort('name')}
                                className={`flex items-center gap-1 font-medium transition-colors ${sortConfig.key === 'name' ? 'text-primary' : 'text-app-muted hover:text-app-text'}`}
                            >
                                Name
                                {sortConfig.key === 'name' && (
                                    <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                                )}
                            </button>
                            <button
                                onClick={() => handleSort('payable')}
                                className={`flex items-center gap-1 font-medium transition-colors ${sortConfig.key === 'payable' ? 'text-primary' : 'text-app-muted hover:text-app-text'}`}
                            >
                                Payable
                                {sortConfig.key === 'payable' && (
                                    <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                                )}
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto p-1 space-y-0.5 scrollbar-thin scrollbar-thumb-app-border">
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
                                                className={`w-full text-left px-3 py-2 rounded-lg transition-all duration-200 border-b border-app-border/50 last:border-0 ${isSelected
                                                    ? 'bg-primary/15 shadow-sm border-transparent'
                                                    : 'hover:bg-app-table-hover border-transparent'
                                                    }`}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between gap-2 overflow-hidden">
                                                            <h3 className={`text-sm font-semibold truncate ${isSelected ? 'text-primary' : 'text-app-text'} ${vendor.isActive === false ? 'opacity-50 line-through' : ''}`}>
                                                                {vendor.name}
                                                            </h3>
                                                            {vendor.isActive === false && (
                                                                <span className="flex-shrink-0 text-[8px] px-1 py-0.5 rounded-full bg-app-toolbar text-app-muted font-bold uppercase tracking-tight border border-app-border">Deactivated</span>
                                                            )}
                                                        </div>
                                                        {vendor.companyName && (
                                                            <div className="text-[10px] text-app-muted truncate mt-0.5 opacity-90">
                                                                {vendor.companyName}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {vendor.payableAmount > 0 ? (
                                                        <div className="flex-shrink-0 text-right">
                                                            <div className="text-xs font-bold text-ds-danger">
                                                                {CURRENCY} {vendor.payableAmount.toLocaleString()}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex-shrink-0 text-right">
                                                            <div className="text-xs font-medium text-app-muted/50">
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
                                <p className="text-xs font-semibold text-app-muted">No vendors found</p>
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
                            <div className="bg-app-card rounded-2xl shadow-ds-card border border-app-border mb-4 flex-shrink-0 relative overflow-hidden group">
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>
                                <div className="p-6">
                                    <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-6">
                                        {/* Vendor Profile */}
                                        <div className="flex items-start gap-5">
                                            <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-primary/15 flex items-center justify-center text-primary text-2xl font-bold shadow-inner border border-app-border ring-4 ring-primary/10">
                                                {getInitials(selectedVendor.name)}
                                            </div>
                                            <div className="flex-1 min-w-0 pt-1">
                                                <h1 className="text-2xl font-bold text-app-text leading-tight mb-1">
                                                    {selectedVendor.name}
                                                </h1>
                                                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-app-muted">
                                                    {selectedVendor.companyName && (
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="p-1 bg-app-toolbar rounded">{ICONS.building}</span>
                                                            <span className="font-medium">{selectedVendor.companyName}</span>
                                                        </div>
                                                    )}
                                                    {selectedVendor.contactNo && (
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="p-1 bg-app-toolbar rounded">{ICONS.phone}</span>
                                                            <span className="font-mono">{selectedVendor.contactNo}</span>
                                                        </div>
                                                    )}
                                                    {selectedVendor.address && (
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="p-1 bg-app-toolbar rounded">{ICONS.mapPin}</span>
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
                                                    className="p-2 text-app-muted hover:text-primary hover:bg-app-table-hover rounded-lg transition-colors"
                                                    title="Edit Vendor Details"
                                                >
                                                    {ICONS.edit}
                                                </button>
                                                <div className="h-6 w-px bg-app-border"></div>
                                                {selectedVendor.contactNo && (
                                                    <button
                                                        onClick={() => {
                                                            try {
                                                                const message = WhatsAppService.generateVendorGreeting(whatsAppTemplates.vendorGreeting, selectedVendor);
                                                                sendOrOpenWhatsApp(
                                                                    { contact: selectedVendor, message, phoneNumber: selectedVendor.contactNo },
                                                                    () => whatsAppMode,
                                                                    openChat
                                                                );
                                                            } catch (error) {
                                                                showAlert(error instanceof Error ? error.message : 'Failed to open WhatsApp');
                                                            }
                                                        }}
                                                        className="p-2 text-ds-success hover:bg-[color:var(--badge-paid-bg)] rounded-lg transition-colors"
                                                        title="WhatsApp"
                                                    >
                                                        {ICONS.whatsapp}
                                                    </button>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-3">
                                                <div className={payableBadgeClass}>
                                                    <span className="text-[10px] font-bold text-ds-danger/80 uppercase tracking-wider">Payable</span>
                                                    <span className="text-lg font-bold text-ds-danger leading-none mt-0.5">
                                                        {CURRENCY} {getVendorPayable(selectedVendor.id).toLocaleString()}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Bar */}
                                    <div className="flex items-center justify-between mt-6 pt-5 border-t border-app-border">
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setActiveTab('Ledger')}
                                                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${vendorTabBtn(activeTab === 'Ledger')}`}
                                            >
                                                Ledger
                                            </button>
                                            <button
                                                onClick={() => setActiveTab('Bills')}
                                                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${vendorTabBtn(activeTab === 'Bills')}`}
                                            >
                                                Bills
                                            </button>
                                            <button
                                                onClick={() => setActiveTab('Quotations')}
                                                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${vendorTabBtn(activeTab === 'Quotations')}`}
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
                                                variant="secondary"
                                                onClick={() => setIsAdvanceModalOpen(true)}
                                                disabled={false}
                                                title={
                                                     'Record prepaid money to this supplier'
                                                }
                                                className="!py-1.5 !px-3 !text-xs !border-ds-warning/30 !bg-[color:var(--badge-partial-bg)] hover:!bg-app-table-hover !text-[color:var(--badge-partial-text)] disabled:opacity-50"
                                            >
                                                <span className="w-3.5 h-3.5 mr-1.5 opacity-80">{ICONS.wallet}</span>
                                                Advance
                                            </Button>
                                            <Button
                                                onClick={() => setIsCreatePaymentModalOpen(true)}
                                                className="!py-1.5 !px-3 !text-xs !bg-ds-success hover:!bg-ds-success/90"
                                            >
                                                <span className="w-3.5 h-3.5 mr-1.5">{ICONS.dollarSign}</span>
                                                Record Payment
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Content Area */}
                            <div className="flex-grow flex flex-col bg-app-card rounded-2xl shadow-ds-card border border-app-border min-h-0 overflow-hidden relative">
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

                            <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title={`Edit: ${selectedVendor.name}`} hideHeader size="lg" disableScroll>
                                <ContactForm
                                    key={selectedVendor.id}
                                    vendorToEdit={selectedVendor}
                                    onSubmit={handleUpdateVendor}
                                    onDelete={handleDeleteVendor}
                                    onCancel={() => setIsEditModalOpen(false)}
                                    existingVendors={vendors}
                                    isVendorForm={true}
                                />
                            </Modal>
                            <Modal isOpen={isCreateBillModalOpen} onClose={() => setIsCreateBillModalOpen(false)} title={duplicateBillData ? `Duplicate Bill for ${selectedVendor.name}` : `Create Bill for ${selectedVendor.name}`} size="xl" className="sm:!max-w-7xl">
                                <InvoiceBillForm
                                    key={duplicateBillData ? 'dup-bill' : `new-bill-${selectedVendor.id}`}
                                    type="bill"
                                    onClose={() => setIsCreateBillModalOpen(false)}
                                    initialVendorId={selectedVendor.id}
                                    initialData={duplicateBillData || undefined}
                                />
                            </Modal>

                            <VendorBillPaymentModal
                                isOpen={isCreatePaymentModalOpen}
                                onClose={() => setIsCreatePaymentModalOpen(false)}
                                vendor={selectedVendor}
                            />

                            <RecordSupplierAdvanceModal
                                isOpen={isAdvanceModalOpen}
                                onClose={() => setIsAdvanceModalOpen(false)}
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
                                        procurementSettings={state.procurementSettings}
                                        onClose={() => {
                                            setIsQuotationFormModalOpen(false);
                                            setEditingQuotation(null);
                                        }}
                                    />
                                </Modal>
                            )}
                        </>
                    ) : (
                        <div className="flex-grow flex flex-col bg-app-card rounded-2xl shadow-ds-card border border-app-border min-h-0 overflow-hidden m-0">
                            {/* Options Content */}
                            <div className="flex-grow min-h-0 p-4 overflow-auto">
                                {optionsView === 'Quotation' ? (
                                    <AllQuotationsTable
                                        onEditQuotation={(quotation) => {
                                            const vendor = (vendors || []).find(v => v.id === quotation.vendorId);
                                            if (vendor) {
                                                setSelectedVendorId(vendor.id);
                                                setActiveTab('Quotations');
                                                setEditingQuotation(quotation);
                                                setIsQuotationFormModalOpen(true);
                                            }
                                        }}
                                    />
                                ) : optionsView === 'Comparison' ? (
                                    <VendorQuotationComparisonPage />
                                ) : optionsView === 'PriceHistory' ? (
                                    <VendorPriceHistoryPage />
                                ) : optionsView === 'PurchaseOrders' ? (
                                    <PurchaseOrdersPage />
                                ) : optionsView === 'GoodsReceipts' ? (
                                    <GoodsReceiptsPage />
                                ) : optionsView === 'Bills' ? (
                                    <AllBillsTable
                                        onEditBill={(bill) => {
                                            const vendor = (vendors || []).find(v => v.id === bill.vendorId);
                                            if (vendor) {
                                                setSelectedVendorId(vendor.id);
                                                setActiveTab('Bills');
                                                setEditingItem({ id: bill.id, type: 'bill' });
                                            }
                                        }}
                                    />
                                ) : optionsView === 'Analytics' ? (
                                    <React.Suspense fallback={<div className="flex items-center justify-center h-full text-app-muted">Loading analytics…</div>}>
                                        <VendorAnalyticsPage />
                                    </React.Suspense>
                                ) : optionsView === 'Reports' ? (
                                    <div className="h-full flex flex-col max-w-7xl mx-auto w-full">
                                        {/* Report Selection Menu */}
                                        <div className="mb-6 flex-shrink-0 bg-app-toolbar/40 p-4 rounded-xl border border-app-border flex items-center justify-between">
                                            <div>
                                                <h3 className="font-bold text-app-text">Vendor Reports</h3>
                                                <p className="text-sm text-app-muted">Analyze your spending and vendor performance</p>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-sm font-medium text-app-muted">Report Type:</span>
                                                <div className="relative min-w-[240px]">
                                                    <select
                                                        value={selectedReport}
                                                        onChange={(e) => setSelectedReport(e.target.value)}
                                                        className="w-full pl-4 pr-10 py-2 ds-input-field rounded-lg appearance-none font-medium shadow-sm transition-all"
                                                        aria-label="Select report"
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
                                                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-app-muted">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                        </svg>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Report Display */}
                                        <div className="flex-grow min-h-0 overflow-hidden bg-app-card rounded-xl shadow-ds-card border border-app-border">
                                            {selectedReport === 'vendor-comparison' ? (
                                                <VendorComparisonReport />
                                            ) : selectedReport === 'vendor-ledger' ? (
                                                <VendorLedgerReport />
                                            ) : (
                                                <div className="p-12 text-center">
                                                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-app-toolbar text-app-muted mb-4">
                                                        {ICONS.barChart}
                                                    </div>
                                                    <h3 className="text-lg font-bold text-app-text mb-1">Select a Report</h3>
                                                    <p className="text-app-muted">Choose a report type to view analysis</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full max-w-md mx-auto text-center p-8">
                                        <div className="w-24 h-24 bg-primary/10 rounded-3xl flex items-center justify-center mb-6 shadow-ds-card border border-primary/20">
                                            <div className="w-12 h-12 text-primary opacity-80">
                                                {ICONS.users}
                                            </div>
                                        </div>
                                        <h2 className="text-2xl font-bold text-app-text mb-3">Select a Vendor</h2>
                                        <p className="text-app-muted mb-8 leading-relaxed">
                                            Select a vendor from the list to view their ledger, bills, and manage payments. Or use the views above to see all data.
                                        </p>
                                        <div className="flex flex-wrap justify-center gap-3">
                                            <div className="px-4 py-2 bg-app-card border border-app-border rounded-lg shadow-ds-card text-sm font-medium text-app-text flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-primary"></span>
                                                Manage Bills
                                            </div>
                                            <div className="px-4 py-2 bg-app-card border border-app-border rounded-lg shadow-ds-card text-sm font-medium text-app-text flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-ds-success"></span>
                                                Record Payments
                                            </div>
                                            <div className="px-4 py-2 bg-app-card border border-app-border rounded-lg shadow-ds-card text-sm font-medium text-app-text flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-primary"></span>
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
                <Modal
                    isOpen={true}
                    onClose={() => setEditingItem(null)}
                    title="Edit Bill"
                    size="xl"
                    className="sm:!max-w-7xl"
                >
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