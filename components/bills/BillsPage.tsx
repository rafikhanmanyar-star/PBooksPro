import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useAppContext } from '../../context/AppContext';
import InvoiceBillForm from '../invoices/InvoiceBillForm';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { ICONS, CURRENCY } from '../../constants';
import Modal from '../ui/Modal';
import TransactionForm from '../transactions/TransactionForm';
import { TransactionType, Bill, InvoiceStatus, Transaction } from '../../types';
import BillTreeView, { BillTreeNode } from '../bills/BillTreeView';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import Select from '../ui/Select';
import { formatDate } from '../../utils/dateUtils';
import useLocalStorage from '../../hooks/useLocalStorage';
import { WhatsAppService } from '../../services/whatsappService';
import { useNotification } from '../../context/NotificationContext';
import { useWhatsApp } from '../../context/WhatsAppContext';
import ResizeHandle from '../ui/ResizeHandle';
import LinkedTransactionWarningModal from '../transactions/LinkedTransactionWarningModal';
import { ImportType } from '../../services/importService';
import BillBulkPaymentModal from './BillBulkPaymentModal';

type DateRangeOption = 'all' | 'thisMonth' | 'lastMonth' | 'custom';
type TypeFilter = 'All' | 'Bills' | 'Payments';
type SortKey = 'issueDate' | 'entityName' | 'dueDate' | 'amount' | 'status' | 'balance' | 'vendorName' | 'billNumber' | 'contract' | 'type';

interface TableRow {
    id: string;
    type: 'bill' | 'payment';
    bill?: Bill;
    payment?: Transaction;
    date: string;
    billNumber?: string;
    vendorName?: string;
    projectName?: string;
    contractNumber?: string;
    dueDate?: string;
    amount: number;
    status?: string;
    balance?: number;
}

interface BillsPageProps {
    projectContext?: boolean; // When true, indicates bills are being managed from project management section
}

const BillsPage: React.FC<BillsPageProps> = ({ projectContext = false }) => {
    const { state, dispatch } = useAppContext();
    const { showToast, showAlert } = useNotification();
    const { openChat } = useWhatsApp();

    // --- State: Toolbar & Filters (Persistent) ---
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useLocalStorage<TypeFilter>('bills_typeFilter', 'All');
    const [dateRange, setDateRange] = useLocalStorage<DateRangeOption>('bills_dateRange', 'all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [projectFilter, setProjectFilter] = useLocalStorage<string>('bills_projectFilter', state.defaultProjectId || 'all');
    const [sortConfig, setSortConfig] = useLocalStorage<{ key: SortKey; direction: 'asc' | 'desc' }>('bills_sort', { key: 'issueDate', direction: 'desc' });

    // --- State: View & Selection ---
    const [selectedNode, setSelectedNode] = useState<{ id: string; type: 'group' | 'vendor'; parentId?: string } | null>(null);
    const [selectedBillIds, setSelectedBillIds] = useState<Set<string>>(new Set());
    const [isBulkPayModalOpen, setIsBulkPayModalOpen] = useState(false);

    // --- State: Modals ---
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [paymentBill, setPaymentBill] = useState<Bill | null>(null);
    const [duplicateBillData, setDuplicateBillData] = useState<Partial<Bill> | null>(null);
    const [billToEdit, setBillToEdit] = useState<Bill | null>(null);

    // Transaction Editing State
    const [transactionToEdit, setTransactionToEdit] = useState<Transaction | null>(null);
    const [warningModalState, setWarningModalState] = useState<{ isOpen: boolean; transaction: Transaction | null; action: 'delete' | null }>({ isOpen: false, transaction: null, action: null });

    // Persistent UI State
    const [sidebarWidth, setSidebarWidth] = useLocalStorage<number>('bills_sidebarWidth', 300);
    const isResizing = useRef(false);
    const startX = useRef(0);
    const startWidth = useRef(0);

    // --- Computed: Projects List for Dropdown ---
    const projects = useMemo(() => [{ id: 'all', name: 'All Projects' }, ...state.projects], [state.projects]);

    // --- Date Range Logic ---
    const handleRangeChange = (option: DateRangeOption) => {
        setDateRange(option);
        const now = new Date();
        if (option === 'all') {
            setStartDate('');
            setEndDate('');
        } else if (option === 'thisMonth') {
            const first = new Date(now.getFullYear(), now.getMonth(), 1);
            const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            setStartDate(first.toISOString().split('T')[0]);
            setEndDate(last.toISOString().split('T')[0]);
        } else if (option === 'lastMonth') {
            const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const last = new Date(now.getFullYear(), now.getMonth(), 0);
            setStartDate(first.toISOString().split('T')[0]);
            setEndDate(last.toISOString().split('T')[0]);
        }
    };

    const handleCustomDateChange = (start: string, end: string) => {
        setStartDate(start);
        setEndDate(end);
        setDateRange('custom');
    };

    // Initialize dates on mount based on persistent setting
    useEffect(() => {
        if (dateRange !== 'custom' && dateRange !== 'all') {
            handleRangeChange(dateRange);
        }
    }, []);

    // Check if we need to open a bill from search
    useEffect(() => {
        const billId = sessionStorage.getItem('openBillId');
        if (billId) {
            sessionStorage.removeItem('openBillId');
            const bill = state.bills.find(b => b.id === billId);
            if (bill) {
                setBillToEdit(bill);
                setIsCreateModalOpen(true);
            }
        }
    }, [state.bills]);

    // --- Filter Logic (Raw Bills) ---
    const baseBills = useMemo(() => {
        // Context: Project Bills (Usually have projectId)
        // We include bills that are having a projectId, OR general bills if we are in "All" mode and they aren't explicitly rental
        // Explicitly exclude if linked to a rental Property (propertyId) or Building (buildingId)
        let bills = state.bills.filter(b => b.projectId || (!b.projectId && !b.buildingId && !b.propertyId));

        // Filter by selected project if not 'all'
        if (projectFilter !== 'all') {
            bills = bills.filter(b => b.projectId === projectFilter);
        }

        return bills;
    }, [state.bills, projectFilter]);

    // --- Tree Data Generation ---
    const treeData = useMemo<BillTreeNode[]>(() => {
        const groupMap = new Map<string, BillTreeNode>();

        // If a specific project is selected, only show that project in tree
        if (projectFilter !== 'all') {
            const project = state.projects.find(p => p.id === projectFilter);
            if (project) {
                groupMap.set(project.id, {
                    id: project.id,
                    name: project.name,
                    type: 'group',
                    children: [],
                    count: 0,
                    amount: 0,
                    balance: 0
                });
            }
        } else {
            // Initialize with Projects
            state.projects.forEach(p => {
                groupMap.set(p.id, {
                    id: p.id,
                    name: p.name,
                    type: 'group',
                    children: [],
                    count: 0,
                    amount: 0,
                    balance: 0
                });
            });

            // Add "Unassigned" group for general bills (only when showing all projects)
            groupMap.set('unassigned', {
                id: 'unassigned',
                name: 'General / Unassigned',
                type: 'group',
                children: [],
                count: 0,
                amount: 0,
                balance: 0
            });
        }

        baseBills.forEach(bill => {
            const groupId = bill.projectId || 'unassigned';
            const group = groupMap.get(groupId);
            const balance = bill.amount - bill.paidAmount;

            if (group) {
                group.count++;
                group.amount += bill.amount;
                group.balance += balance;

                // Find or create Vendor node
                let vendorNode = group.children.find(c => c.id === bill.contactId);
                if (!vendorNode) {
                    const vendor = state.contacts.find(c => c.id === bill.contactId);
                    vendorNode = {
                        id: bill.contactId,
                        name: vendor?.name || 'Unknown Vendor',
                        type: 'vendor',
                        children: [],
                        count: 0,
                        amount: 0,
                        balance: 0
                    };
                    group.children.push(vendorNode);
                }
                vendorNode.count++;
                vendorNode.amount += bill.amount;
                vendorNode.balance += balance;
            }
        });

        return Array.from(groupMap.values())
            .filter(g => g.count > 0) // Only show groups with bills
            .sort((a, b) => a.name.localeCompare(b.name));

    }, [baseBills, state.projects, state.contacts, projectFilter]);

    // --- Unified Table Data (Bills + Payments) ---
    const tableRows = useMemo<TableRow[]>(() => {
        const rows: TableRow[] = [];

        // Add bill rows
        if (typeFilter === 'All' || typeFilter === 'Bills') {
            baseBills.forEach(bill => {
                const project = state.projects.find(p => p.id === bill.projectId);
                const vendor = state.contacts.find(c => c.id === bill.contactId);
                const contract = state.contracts.find(c => c.id === bill.contractId);
                const balance = bill.amount - bill.paidAmount;

                rows.push({
                    id: `bill-${bill.id}`,
                    type: 'bill',
                    bill,
                    date: bill.issueDate,
                    billNumber: bill.billNumber,
                    vendorName: vendor?.name || 'Unknown',
                    projectName: project?.name || 'General',
                    contractNumber: contract?.contractNumber,
                    dueDate: bill.dueDate,
                    amount: bill.amount,
                    status: bill.status,
                    balance
                });
            });
        }

        // Add payment rows
        if (typeFilter === 'All' || typeFilter === 'Payments') {
            state.transactions
                .filter(tx => tx.type === TransactionType.EXPENSE && tx.billId)
                .forEach(payment => {
                    const bill = state.bills.find(b => b.id === payment.billId);
                    if (!bill || !baseBills.includes(bill)) return; // Only include payments for bills in our base list

                    const project = state.projects.find(p => p.id === payment.projectId || bill.projectId);
                    const vendor = state.contacts.find(c => c.id === payment.contactId || bill.contactId);
                    const contract = state.contracts.find(c => c.id === payment.contractId || bill.contractId);

                    rows.push({
                        id: `payment-${payment.id}`,
                        type: 'payment',
                        payment,
                        bill,
                        date: payment.date,
                        billNumber: bill.billNumber,
                        vendorName: vendor?.name || 'Unknown',
                        projectName: project?.name || 'General',
                        contractNumber: contract?.contractNumber,
                        dueDate: bill.dueDate,
                        amount: payment.amount,
                        balance: -payment.amount // Payments are negative for balance
                    });
                });
        }

        return rows;
    }, [baseBills, state.transactions, state.bills, state.projects, state.contacts, state.contracts, typeFilter]);

    // --- Filtered Table Rows ---
    const filteredRows = useMemo(() => {
        let result = [...tableRows];

        // 1. Tree Filter (if specific node selected)
        if (selectedNode) {
            if (selectedNode.type === 'group') {
                result = result.filter(row => {
                    const projectId = row.bill?.projectId || row.payment?.projectId;
                    return projectId === selectedNode.id || (selectedNode.id === 'unassigned' && !projectId);
                });
            } else if (selectedNode.type === 'vendor') {
                const parentGroupId = selectedNode.parentId || 'unassigned';
                result = result.filter(row => {
                    const bill = row.bill || (row.payment ? state.bills.find(b => b.id === row.payment?.billId) : null);
                    if (!bill) return false;
                    const contactId = bill.contactId;
                    if (parentGroupId === 'unassigned') {
                        return !bill.projectId && contactId === selectedNode.id;
                    } else {
                        return bill.projectId === parentGroupId && contactId === selectedNode.id;
                    }
                });
            }
        }

        // 2. Date Range Filter (Project filter is now applied at baseBills level)
        if (startDate && endDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);

            result = result.filter(row => {
                const d = new Date(row.date);
                return d >= start && d <= end;
            });
        }

        // 4. Search
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter(row =>
                row.billNumber?.toLowerCase().includes(q) ||
                row.vendorName?.toLowerCase().includes(q) ||
                row.projectName?.toLowerCase().includes(q) ||
                (row.bill?.description && row.bill.description.toLowerCase().includes(q)) ||
                (row.payment?.description && row.payment.description.toLowerCase().includes(q))
            );
        }

        // 5. Sorting
        return result.sort((a, b) => {
            let valA: any = '';
            let valB: any = '';

            switch (sortConfig.key) {
                case 'type': valA = a.type; valB = b.type; break;
                case 'issueDate': valA = new Date(a.date).getTime(); valB = new Date(b.date).getTime(); break;
                case 'dueDate':
                    valA = a.dueDate ? new Date(a.dueDate).getTime() : 0;
                    valB = b.dueDate ? new Date(b.dueDate).getTime() : 0;
                    break;
                case 'amount': valA = a.amount; valB = b.amount; break;
                case 'balance': valA = a.balance || 0; valB = b.balance || 0; break;
                case 'status': valA = a.status || ''; valB = b.status || ''; break;
                case 'entityName':
                    valA = (a.projectName || '').toLowerCase();
                    valB = (b.projectName || '').toLowerCase();
                    break;
                case 'vendorName':
                    valA = (a.vendorName || '').toLowerCase();
                    valB = (b.vendorName || '').toLowerCase();
                    break;
                case 'billNumber':
                    valA = (a.billNumber || '').toLowerCase();
                    valB = (b.billNumber || '').toLowerCase();
                    break;
                case 'contract':
                    valA = (a.contractNumber || '').toLowerCase();
                    valB = (b.contractNumber || '').toLowerCase();
                    break;
                default: valA = new Date(a.date).getTime(); valB = new Date(b.date).getTime();
            }

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

    }, [tableRows, selectedNode, startDate, endDate, searchQuery, sortConfig, state.bills]);

    // --- Handlers ---
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
    }, [sidebarWidth]);

    const handleResize = useCallback((e: MouseEvent) => {
        if (isResizing.current) {
            const delta = e.clientX - startX.current;
            const newWidth = Math.max(200, Math.min(800, startWidth.current + delta));
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

    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };


    const SortIcon = ({ column }: { column: SortKey }) => {
        if (sortConfig.key !== column) return <span className="text-slate-300 opacity-50 ml-1 text-[10px]">↕</span>;
        return <span className="text-indigo-600 ml-1 text-[10px]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
    };

    const handleRecordPayment = (bill: Bill) => {
        setPaymentBill(bill);
        setIsPaymentModalOpen(true);
    };

    const handleDuplicate = (data: Partial<Bill>) => {
        const { id, paidAmount, status, ...rest } = data;
        setDuplicateBillData({ ...rest, paidAmount: 0, status: undefined });
        setBillToEdit(null);
        setIsCreateModalOpen(true);
    };

    const handleEdit = (bill: Bill) => {
        setBillToEdit(bill);
        setDuplicateBillData(null);
        setIsCreateModalOpen(true);
    };

    const handleTransactionDelete = () => {
        if (warningModalState.transaction) {
            dispatch({ type: 'DELETE_TRANSACTION', payload: warningModalState.transaction.id });
            setWarningModalState({ isOpen: false, transaction: null, action: null });
            showToast("Payment deleted successfully");
        }
    };

    const handleBulkPaymentComplete = () => {
        setSelectedBillIds(new Set());
        setIsBulkPayModalOpen(false);
    };

    const selectedBillsList = useMemo(() =>
        state.bills.filter(b => selectedBillIds.has(b.id)),
        [state.bills, selectedBillIds]);

    const handleSendWhatsApp = (e: React.MouseEvent, bill: Bill) => {
        e.stopPropagation();
        const vendor = state.contacts.find(c => c.id === bill.contactId);
        if (!vendor?.contactNo) {
            showAlert("This vendor does not have a phone number saved.");
            return;
        }

        try {
            const { whatsAppTemplates } = state;
            const message = WhatsAppService.generateBillPayment(
                whatsAppTemplates.billPayment,
                vendor,
                bill.billNumber,
                bill.paidAmount
            );

            // Open WhatsApp side panel with pre-filled message
            openChat(vendor, vendor.contactNo, message);
        } catch (error) {
            showAlert(error instanceof Error ? error.message : 'Failed to open WhatsApp');
        }
    };

    const getStatusBadge = (status: string) => {
        const colors: Record<string, string> = {
            'Paid': 'bg-emerald-100 text-emerald-800',
            'Unpaid': 'bg-rose-100 text-rose-800',
            'Partially Paid': 'bg-amber-100 text-amber-800',
            'Overdue': 'bg-red-100 text-red-900',
            'Draft': 'bg-slate-100 text-slate-800'
        };
        return <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${colors[status] || 'bg-gray-100'}`}>{status}</span>;
    };

    return (
        <div className="flex flex-col h-full bg-slate-50/50 p-4 sm:p-6 gap-4 sm:gap-6">
            {/* Header Section */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 flex-shrink-0">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Project Bills & Payments</h1>
                    <p className="text-xs sm:text-sm text-slate-500 mt-1">Manage vendor invoices, project expenses, and payment disbursements.</p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Button
                        variant="secondary"
                        onClick={() => {
                            dispatch({ type: 'SET_INITIAL_IMPORT_TYPE', payload: ImportType.PROJECT_BILLS });
                            dispatch({ type: 'SET_PAGE', payload: 'import' });
                        }}
                        className="!px-4 !py-2 !rounded-xl !text-sm !border-slate-200 hover:!border-indigo-300 hover:!text-indigo-600 !bg-white transition-all shadow-sm"
                    >
                        <div className="w-4 h-4 mr-2 opacity-70">{ICONS.download}</div> Bulk Import
                    </Button>
                    <Button
                        onClick={() => { setDuplicateBillData(null); setBillToEdit(null); setIsCreateModalOpen(true); }}
                        className="!px-4 !py-2 !rounded-xl !text-sm !bg-indigo-600 hover:!bg-indigo-700 !text-white transition-all shadow-md shadow-indigo-500/20"
                    >
                        <div className="w-4 h-4 mr-2">{ICONS.plus}</div> New Bill
                    </Button>
                </div>
            </div>

            {/* Top Control Bar */}
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3 flex-1 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
                    {/* Search */}
                    <div className="relative min-w-[200px]">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            <div className="w-4 h-4">{ICONS.search}</div>
                        </div>
                        <input
                            type="text"
                            placeholder="Search bill #, vendor, project..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 pr-4 py-1.5 w-full text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-slate-400"
                        />
                        {searchQuery && (
                            <button onClick={() => setSearchQuery('')} className="absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400 hover:text-rose-500">
                                <div className="w-4 h-4">{ICONS.x}</div>
                            </button>
                        )}
                    </div>

                    <div className="w-px h-6 bg-slate-200 hidden md:block"></div>

                    {/* Quick Filters */}
                    <Select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
                        className="!w-40 !py-1.5 !text-xs !border-slate-200 !bg-slate-50/50 !font-medium"
                        hideIcon={true}
                    >
                        <option value="All">All Transactions</option>
                        <option value="Bills">Bills Only</option>
                        <option value="Payments">Payments Only</option>
                    </Select>

                    <Select
                        value={dateRange === 'custom' ? 'custom' : dateRange}
                        onChange={(e) => {
                            if (e.target.value === 'custom') {
                                setDateRange('custom');
                            } else {
                                handleRangeChange(e.target.value as DateRangeOption);
                            }
                        }}
                        className="!w-32 !py-1.5 !text-xs !border-slate-200 !bg-slate-50/50 !font-medium"
                        hideIcon={true}
                    >
                        <option value="all">All Period</option>
                        <option value="thisMonth">This Month</option>
                        <option value="lastMonth">Last Month</option>
                        <option value="custom">Custom Range</option>
                    </Select>

                    {dateRange === 'custom' && (
                        <div className="flex items-center gap-2 animate-fade-in">
                            <DatePicker label="" value={startDate} onChange={(d) => handleCustomDateChange(d.toISOString().split('T')[0], endDate)} className="!py-1 !px-2 !text-xs !w-28" />
                            <span className="text-slate-400 text-xs font-bold">-</span>
                            <DatePicker label="" value={endDate} onChange={(d) => handleCustomDateChange(startDate, d.toISOString().split('T')[0])} className="!py-1 !px-2 !text-xs !w-28" />
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto border-t md:border-t-0 md:border-l border-slate-100 pt-3 md:pt-0 pl-0 md:pl-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">Project Scope:</span>
                    <ComboBox
                        items={projects}
                        selectedId={projectFilter}
                        onSelect={(item) => {
                            setProjectFilter(item?.id || 'all');
                            setSelectedNode(null);
                        }}
                        allowAddNew={false}
                        placeholder="Select Project"
                        className="!w-48 !min-h-0"
                        compact={true}
                    />
                    {selectedBillIds.size > 0 && (
                        <Button
                            onClick={() => setIsBulkPayModalOpen(true)}
                            className="animate-fade-in !py-1 !px-3 !text-xs !bg-emerald-600 hover:!bg-emerald-700 !text-white !rounded-lg !shadow-sm whitespace-nowrap"
                        >
                            Record Payment ({selectedBillIds.size})
                        </Button>
                    )}
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-grow flex flex-col md:flex-row gap-6 overflow-hidden min-h-0">
                {/* Left Tree View (Hierarchy) */}
                <div
                    className="flex flex-col h-64 md:h-full flex-shrink-0 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
                    style={{ width: window.innerWidth < 768 ? '100%' : sidebarWidth }}
                >
                    <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Project Hierarchy</span>
                        {selectedNode && (
                            <button
                                onClick={() => setSelectedNode(null)}
                                className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full hover:bg-indigo-100 font-bold transition-colors"
                            >
                                Clear
                            </button>
                        )}
                    </div>
                    <div className="flex-grow overflow-auto p-2">
                        <BillTreeView
                            treeData={treeData}
                            selectedNodeId={selectedNode?.id || null}
                            selectedParentId={selectedNode?.parentId || null}
                            onNodeSelect={(id, type, parentId) => setSelectedNode({ id, type, parentId })}
                        />
                    </div>
                </div>

                {/* Resizer Handle */}
                <div className="hidden md:flex items-center justify-center w-2 hover:w-3 -ml-3 -mr-3 z-10 cursor-col-resize group transition-all" onMouseDown={startResizing}>
                    <div className="w-1 h-8 rounded-full bg-slate-200 group-hover:bg-indigo-400 transition-colors"></div>
                </div>

                {/* Right Data Grid (Table) */}
                <div className="flex-grow overflow-hidden flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex-grow overflow-auto">
                        <table className="min-w-full divide-y divide-slate-100 text-xs border-separate border-spacing-0">
                            <thead className="bg-slate-50 sticky top-0 z-20">
                                <tr>
                                    <th className="px-3 py-2.5 w-10 text-center border-b border-slate-200 bg-slate-50"></th>
                                    <th onClick={() => handleSort('type')} className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 border-b border-slate-200 transition-colors">Type <SortIcon column="type" /></th>
                                    <th onClick={() => handleSort('issueDate')} className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 border-b border-slate-200 transition-colors">Date <SortIcon column="issueDate" /></th>
                                    <th onClick={() => handleSort('billNumber')} className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 border-b border-slate-200 transition-colors">Ref # <SortIcon column="billNumber" /></th>
                                    <th onClick={() => handleSort('entityName')} className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 border-b border-slate-200 transition-colors">Project <SortIcon column="entityName" /></th>
                                    <th onClick={() => handleSort('vendorName')} className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 border-b border-slate-200 transition-colors">Vendor <SortIcon column="vendorName" /></th>
                                    <th onClick={() => handleSort('amount')} className="px-3 py-2.5 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 border-b border-slate-200 transition-colors">Amount <SortIcon column="amount" /></th>
                                    <th onClick={() => handleSort('status')} className="px-3 py-2.5 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 border-b border-slate-200 transition-colors">Status <SortIcon column="status" /></th>
                                    <th onClick={() => handleSort('balance')} className="px-3 py-2.5 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 border-b border-slate-200 transition-colors">Due / Pay <SortIcon column="balance" /></th>
                                    <th className="px-3 py-2.5 w-10 border-b border-slate-200 bg-slate-50"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 bg-white">
                                {filteredRows.length > 0 ? filteredRows.map((row, index) => {
                                    const isBill = row.type === 'bill';
                                    const isPayment = row.type === 'payment';
                                    const bill = row.bill;
                                    const payment = row.payment;

                                    if (isBill && bill) {
                                        return (
                                            <tr
                                                key={row.id}
                                                className="hover:bg-slate-50 cursor-pointer transition-all duration-150 group"
                                                onClick={() => handleEdit(bill)}
                                            >
                                                <td className="px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        className="rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 w-3.5 h-3.5 cursor-pointer transition-all"
                                                        checked={selectedBillIds.has(bill.id)}
                                                        onChange={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedBillIds(prev => {
                                                                const next = new Set(prev);
                                                                if (next.has(bill.id)) next.delete(bill.id);
                                                                else next.add(bill.id);
                                                                return next;
                                                            });
                                                        }}
                                                    />
                                                </td>
                                                <td className="px-3 py-2.5">
                                                    <span className="inline-flex px-1.5 py-0.5 rounded-[6px] text-[10px] font-bold uppercase tracking-tight bg-blue-50 text-blue-700 border border-blue-100">Bill</span>
                                                </td>
                                                <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{formatDate(row.date)}</td>
                                                <td className="px-3 py-2.5">
                                                    <div className="font-mono text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md border border-slate-200 inline-block">
                                                        {row.billNumber}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2.5">
                                                    <div className="font-semibold text-slate-800 leading-tight group-hover:text-indigo-600 transition-colors">{row.projectName}</div>
                                                    <div className="text-[10px] text-slate-400 font-medium uppercase tracking-tight mt-0.5">{row.contractNumber || 'No Contract'}</div>
                                                </td>
                                                <td className="px-3 py-2.5">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500 border border-slate-200">
                                                            {(row.vendorName || 'U')[0]}
                                                        </div>
                                                        <span className="text-slate-600 font-medium truncate max-w-[120px]">{row.vendorName}</span>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2.5 text-right font-semibold text-slate-700 tabular-nums">
                                                    {CURRENCY} {(row.amount || 0).toLocaleString()}
                                                </td>
                                                <td className="px-3 py-2.5 text-center">
                                                    <div className="flex items-center justify-center gap-2">
                                                        {row.status && (
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${row.status === 'Paid' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                                                                row.status === 'Unpaid' ? 'bg-rose-50 text-rose-700 border border-rose-100' :
                                                                    row.status === 'Partially Paid' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                                                                        'bg-slate-100 text-slate-600 border border-slate-200'
                                                                }`}>
                                                                {row.status}
                                                            </span>
                                                        )}
                                                        {bill.paidAmount > 0 && (
                                                            <button
                                                                onClick={(e) => handleSendWhatsApp(e, bill)}
                                                                className="text-green-600 hover:text-green-700 p-1 rounded-full hover:bg-green-50 transition-all opacity-0 group-hover:opacity-100"
                                                            >
                                                                <div className="w-3.5 h-3.5">{ICONS.whatsapp}</div>
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2.5 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <span className={`font-bold tabular-nums ${(row.balance || 0) > 0.01 ? 'text-rose-600' : 'text-slate-400 font-normal'}`}>
                                                            {CURRENCY} {Math.abs(row.balance || 0).toLocaleString()}
                                                        </span>
                                                        {(row.balance || 0) > 0.01 && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleRecordPayment(bill); }}
                                                                className="text-white bg-indigo-600 hover:bg-indigo-700 px-2 py-0.5 rounded text-[10px] font-bold transition-all shadow-sm"
                                                            >
                                                                Pay
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2.5 text-center">
                                                    {bill.documentPath && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                const electronAPI = (window as any).electronAPI;
                                                                if (electronAPI && electronAPI.openDocumentFile) {
                                                                    electronAPI.openDocumentFile({ filePath: bill.documentPath }).catch((err: any) => {
                                                                        console.error('Error opening document:', err);
                                                                    });
                                                                }
                                                            }}
                                                            className="text-slate-400 hover:text-indigo-600 transition-colors"
                                                            title="View Document"
                                                        >
                                                            <div className="w-4 h-4">{ICONS.fileText}</div>
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    } else if (isPayment && payment && bill) {
                                        const account = state.accounts.find(a => a.id === payment.accountId);
                                        return (
                                            <tr
                                                key={row.id}
                                                className="hover:bg-emerald-50/20 cursor-pointer transition-all duration-150 group bg-emerald-50/5"
                                                onClick={() => setTransactionToEdit(payment)}
                                            >
                                                <td className="px-3 py-2.5"></td>
                                                <td className="px-3 py-2.5">
                                                    <span className="inline-flex px-1.5 py-0.5 rounded-[6px] text-[10px] font-bold uppercase tracking-tight bg-emerald-50 text-emerald-700 border border-emerald-100">Payment</span>
                                                </td>
                                                <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap italic">{formatDate(row.date)}</td>
                                                <td className="px-3 py-2.5">
                                                    <div className="text-[10px] text-slate-400 font-medium px-1.5 py-0.5 inline-block">
                                                        linked to {row.billNumber}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2.5 text-slate-500">{row.projectName}</td>
                                                <td className="px-3 py-2.5 text-slate-500 italic">{row.vendorName}</td>
                                                <td className="px-3 py-2.5 text-right font-medium text-emerald-600 tabular-nums">
                                                    {CURRENCY} {(row.amount || 0).toLocaleString()}
                                                </td>
                                                <td className="px-3 py-2.5 text-center">
                                                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-tighter">{account?.name || 'Cash/Bank'}</span>
                                                </td>
                                                <td className="px-3 py-2.5 text-right italic text-slate-400 tabular-nums">
                                                    {CURRENCY} {(row.amount || 0).toLocaleString()}
                                                </td>
                                                <td className="px-3 py-2.5"></td>
                                            </tr>
                                        );
                                    }
                                    return null;
                                }) : (
                                    <tr>
                                        <td colSpan={10} className="px-4 py-20 text-center">
                                            <div className="flex flex-col items-center justify-center text-slate-400 opacity-60">
                                                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-3">
                                                    <div className="w-6 h-6">{ICONS.fileText}</div>
                                                </div>
                                                <p className="text-sm font-medium">No records matching your filters</p>
                                                <p className="text-xs mt-1">Try adjusting the period, project, or search query</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {/* Compact Summary Footer */}
                    <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/50 backdrop-blur-sm flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        <div className="flex items-center gap-6">
                            <div className="flex items-center gap-2">
                                <span className="text-slate-400">Bills Total:</span>
                                <span className="text-slate-900 text-xs tabular-nums">
                                    {CURRENCY} {filteredRows.filter(r => r.type === 'bill').reduce((sum, r) => sum + (r.amount || 0), 0).toLocaleString()}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-slate-400">Payments:</span>
                                <span className="text-emerald-600 text-xs tabular-nums">
                                    {CURRENCY} {filteredRows.filter(r => r.type === 'payment').reduce((sum, r) => sum + (r.amount || 0), 0).toLocaleString()}
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span>Outstanding Balance:</span>
                            <span className="text-rose-600 text-xs tabular-nums">
                                {CURRENCY} {filteredRows.filter(r => r.type === 'bill').reduce((sum, r) => sum + (r.balance || 0), 0).toLocaleString()}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modals */}
            <Modal isOpen={isCreateModalOpen} onClose={() => { setIsCreateModalOpen(false); setBillToEdit(null); setDuplicateBillData(null); }} title={billToEdit ? "Edit Bill" : "New Project Bill"} size="xl">
                <InvoiceBillForm
                    onClose={() => { setIsCreateModalOpen(false); setBillToEdit(null); setDuplicateBillData(null); }}
                    type="bill"
                    itemToEdit={billToEdit || undefined}
                    initialData={duplicateBillData || undefined}
                    projectContext={projectContext}
                />
            </Modal>

            <Modal isOpen={isPaymentModalOpen} onClose={() => setIsPaymentModalOpen(false)} title={paymentBill ? `Pay Bill #${paymentBill.billNumber}` : "Pay Bill"}>
                <TransactionForm
                    onClose={() => setIsPaymentModalOpen(false)}
                    transactionTypeForNew={TransactionType.EXPENSE}
                    transactionToEdit={{
                        id: '',
                        type: TransactionType.EXPENSE,
                        amount: paymentBill ? (paymentBill.amount - paymentBill.paidAmount) : 0,
                        date: paymentBill?.issueDate ? new Date(paymentBill.issueDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                        accountId: '',
                        billId: paymentBill?.id,
                        contactId: paymentBill?.contactId,
                        projectId: paymentBill?.projectId,
                        contractId: paymentBill?.contractId,
                        description: paymentBill?.description || `Payment for Bill #${paymentBill?.billNumber}`,
                    } as any}
                    onShowDeleteWarning={() => { }}
                />
            </Modal>

            <Modal isOpen={!!transactionToEdit} onClose={() => setTransactionToEdit(null)} title="Edit Payment">
                <TransactionForm
                    onClose={() => setTransactionToEdit(null)}
                    transactionToEdit={transactionToEdit}
                    onShowDeleteWarning={(tx) => {
                        setTransactionToEdit(null);
                        setWarningModalState({ isOpen: true, transaction: tx, action: 'delete' });
                    }}
                />
            </Modal>

            <LinkedTransactionWarningModal
                isOpen={warningModalState.isOpen}
                onClose={() => setWarningModalState({ isOpen: false, transaction: null, action: null })}
                onConfirm={() => {
                    if (warningModalState.transaction) dispatch({ type: 'DELETE_TRANSACTION', payload: warningModalState.transaction.id });
                    setWarningModalState({ isOpen: false, transaction: null, action: null });
                    showToast("Payment deleted successfully");
                }}
                action="delete"
                linkedItemName="this bill"
            />

            <BillBulkPaymentModal
                isOpen={isBulkPayModalOpen}
                onClose={() => { setIsBulkPayModalOpen(false); }}
                selectedBills={selectedBillsList}
                onPaymentComplete={handleBulkPaymentComplete}
            />
        </div>
    );
};

export default BillsPage;