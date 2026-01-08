import React, { useState, useMemo, useRef, useCallback } from 'react';
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
import { formatDate } from '../../utils/dateUtils';
import { useNotification } from '../../context/NotificationContext';
import { WhatsAppService } from '../../services/whatsappService';
import useLocalStorage from '../../hooks/useLocalStorage';
import ResizeHandle from '../ui/ResizeHandle';
import LinkedTransactionWarningModal from '../transactions/LinkedTransactionWarningModal';
import { ImportType } from '../../services/importService';
import BillBulkPaymentModal from '../bills/BillBulkPaymentModal';

type DateRangeOption = 'all' | 'thisMonth' | 'lastMonth' | 'custom';
type SortKey = 'issueDate' | 'entityName' | 'dueDate' | 'amount' | 'status' | 'balance' | 'vendorName' | 'billNumber' | 'contract';

const RentalBillsPage: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const { showToast, showAlert } = useNotification();
    
    // --- State: Toolbar & Filters ---
    const [searchQuery, setSearchQuery] = useState('');
    const [dateRange, setDateRange] = useState<DateRangeOption>('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [buildingFilter, setBuildingFilter] = useState<string>('all');
    
    // --- State: View & Selection ---
    const [selectedNode, setSelectedNode] = useState<{ id: string; type: 'group' | 'vendor'; parentId?: string } | null>(null);
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'issueDate', direction: 'desc' });
    const [expandedBillIds, setExpandedBillIds] = useState<Set<string>>(new Set());
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
    const [sidebarWidth, setSidebarWidth] = useLocalStorage<number>('rental_bills_sidebarWidth', 300);

    // Resizing Refs
    const isResizing = useRef(false);
    const startX = useRef(0);
    const startWidth = useRef(0);

    // --- Computed: Buildings List for Dropdown ---
    const buildings = useMemo(() => [{ id: 'all', name: 'All Buildings' }, ...state.buildings], [state.buildings]);

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

    // --- Filter Logic (Raw Bills) ---
    const baseBills = useMemo(() => {
        // Context: Rental Bills
        // We include bills that are NOT linked to a project.
        // They might be linked to a Building or Property, or general overhead.
        return state.bills.filter(b => !b.projectId); 
    }, [state.bills]);

    // --- Tree Data Generation ---
    const treeData = useMemo<BillTreeNode[]>(() => {
        const groupMap = new Map<string, BillTreeNode>();
        
        // Initialize with Buildings
        state.buildings.forEach(b => {
            groupMap.set(b.id, {
                id: b.id,
                name: b.name,
                type: 'group',
                children: [],
                count: 0,
                amount: 0,
                balance: 0
            });
        });
        
        // Add "General/Unassigned" group
        groupMap.set('unassigned', {
            id: 'unassigned',
            name: 'General / Unassigned',
            type: 'group',
            children: [],
            count: 0,
            amount: 0,
            balance: 0
        });

        baseBills.forEach(bill => {
            let groupId = bill.buildingId;
            if (!groupId && bill.propertyId) {
                const prop = state.properties.find(p => p.id === bill.propertyId);
                if (prop) groupId = prop.buildingId;
            }
            if (!groupId) groupId = 'unassigned';

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
            
    }, [baseBills, state.buildings, state.properties, state.contacts]);

    // --- Grid Data Logic ---
    const filteredBills = useMemo(() => {
        let result = baseBills;

        // 1. Tree Selection Filter
        if (selectedNode) {
            if (selectedNode.type === 'group') {
                if (selectedNode.id === 'unassigned') {
                    result = result.filter(b => !b.buildingId && !b.propertyId);
                } else {
                    // Match building ID or property belonging to building
                    result = result.filter(b => {
                        if (b.buildingId === selectedNode.id) return true;
                        if (b.propertyId) {
                            const prop = state.properties.find(p => p.id === b.propertyId);
                            return prop && prop.buildingId === selectedNode.id;
                        }
                        return false;
                    });
                }
            } else if (selectedNode.type === 'vendor') {
                 // Filter by Vendor within context of parent group
                 const parentGroupId = selectedNode.parentId || 'unassigned';
                 if (parentGroupId === 'unassigned') {
                     result = result.filter(b => !b.buildingId && !b.propertyId && b.contactId === selectedNode.id);
                 } else {
                     result = result.filter(b => {
                         if (b.contactId !== selectedNode.id) return false;
                         if (b.buildingId === parentGroupId) return true;
                         if (b.propertyId) {
                             const prop = state.properties.find(p => p.id === b.propertyId);
                             return prop && prop.buildingId === parentGroupId;
                         }
                         return false;
                     });
                 }
            }
        }

        // 2. Toolbar Building Filter
        if (buildingFilter !== 'all') {
             result = result.filter(b => {
                 if (b.buildingId === buildingFilter) return true;
                 if (b.propertyId) {
                     const prop = state.properties.find(p => p.id === b.propertyId);
                     return prop && prop.buildingId === buildingFilter;
                 }
                 return false;
             });
        }

        // 3. Date Range Filter
        if (startDate && endDate) {
            const start = new Date(startDate);
            start.setHours(0,0,0,0);
            const end = new Date(endDate);
            end.setHours(23,59,59,999);
            
            result = result.filter(b => {
                const d = new Date(b.issueDate);
                return d >= start && d <= end;
            });
        }

        // 4. Search
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter(b => 
                b.billNumber.toLowerCase().includes(q) ||
                (b.description && b.description.toLowerCase().includes(q)) ||
                state.contacts.find(c => c.id === b.contactId)?.name.toLowerCase().includes(q)
            );
        }

        // 5. Sorting
        return result.sort((a, b) => {
            let valA: any = '';
            let valB: any = '';

            switch (sortConfig.key) {
                case 'issueDate': valA = new Date(a.issueDate).getTime(); valB = new Date(b.issueDate).getTime(); break;
                case 'dueDate': valA = a.dueDate ? new Date(a.dueDate).getTime() : 0; valB = b.dueDate ? new Date(b.dueDate).getTime() : 0; break;
                case 'amount': valA = a.amount; valB = b.amount; break;
                case 'balance': valA = a.amount - a.paidAmount; valB = b.amount - b.paidAmount; break;
                case 'status': valA = a.status; valB = b.status; break;
                case 'entityName': {
                     // Resolve Building Name
                     const getBName = (bill: Bill) => {
                         if (bill.buildingId) return state.buildings.find(b => b.id === bill.buildingId)?.name || '';
                         if (bill.propertyId) {
                             const prop = state.properties.find(p => p.id === bill.propertyId);
                             return state.buildings.find(b => b.id === prop?.buildingId)?.name || '';
                         }
                         return 'General';
                     };
                     valA = getBName(a).toLowerCase(); valB = getBName(b).toLowerCase();
                     break;
                }
                case 'vendorName': {
                    const vA = state.contacts.find(c => c.id === a.contactId)?.name || '';
                    const vB = state.contacts.find(c => c.id === b.contactId)?.name || '';
                    valA = vA.toLowerCase(); valB = vB.toLowerCase();
                    break;
                }
                case 'billNumber': {
                    valA = a.billNumber.toLowerCase(); valB = b.billNumber.toLowerCase();
                    break;
                }
                case 'contract': {
                    const cA = state.contracts.find(c => c.id === a.contractId)?.contractNumber || '';
                    const cB = state.contracts.find(c => c.id === b.contractId)?.contractNumber || '';
                    valA = cA.toLowerCase(); valB = cB.toLowerCase();
                    break;
                }
                default: valA = a.issueDate; valB = b.issueDate;
            }

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

    }, [baseBills, selectedNode, buildingFilter, startDate, endDate, searchQuery, sortConfig, state.buildings, state.properties, state.contacts, state.contracts]);

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
    }, []);

    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const toggleExpand = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setExpandedBillIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const SortIcon = ({ column }: { column: SortKey }) => {
        if (sortConfig.key !== column) return <span className="text-slate-300 opacity-50 ml-1 text-[10px]">↕</span>;
        return <span className="text-accent ml-1 text-[10px]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
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
            WhatsAppService.sendMessage({ contact: vendor, message });
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
        <div className="flex flex-col h-full space-y-4">
            
            {/* Toolbar */}
            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between flex-shrink-0">
                
                <div className="flex flex-wrap gap-3 items-center w-full lg:w-auto">
                    {/* Date Filter */}
                    <div className="flex bg-slate-100 p-1 rounded-lg flex-shrink-0">
                        {(['all', 'thisMonth', 'lastMonth', 'custom'] as DateRangeOption[]).map(opt => (
                            <button
                                key={opt}
                                onClick={() => handleRangeChange(opt)}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap capitalize ${
                                    dateRange === opt 
                                    ? 'bg-white text-accent shadow-sm font-bold' 
                                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/60'
                                }`}
                            >
                                {opt === 'all' ? 'All Time' : opt.replace(/([A-Z])/g, ' $1')}
                            </button>
                        ))}
                    </div>

                    {dateRange === 'custom' && (
                        <div className="flex items-center gap-2 animate-fade-in">
                            <DatePicker value={startDate} onChange={(d) => handleCustomDateChange(d.toISOString().split('T')[0], endDate)} />
                            <span className="text-slate-400">-</span>
                            <DatePicker value={endDate} onChange={(d) => handleCustomDateChange(startDate, d.toISOString().split('T')[0])} />
                        </div>
                    )}

                    {/* Building Dropdown */}
                    <div className="w-48 flex-shrink-0">
                        <ComboBox 
                            items={buildings} 
                            selectedId={buildingFilter} 
                            onSelect={(item) => setBuildingFilter(item?.id || 'all')} 
                            allowAddNew={false}
                            placeholder="Filter by Building"
                        />
                    </div>
                    
                    {/* Search */}
                    <div className="relative w-full sm:w-48">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            <span className="h-4 w-4">{ICONS.search}</span>
                        </div>
                        <Input 
                            placeholder="Search bills..." 
                            value={searchQuery} 
                            onChange={(e) => setSearchQuery(e.target.value)} 
                            className={`pl-9 py-1.5 text-sm ${searchQuery ? 'pr-9' : ''}`}
                        />
                        {searchQuery && (
                            <button 
                                onClick={() => setSearchQuery('')} 
                                className="absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400 hover:text-slate-600 transition-colors"
                                type="button"
                                aria-label="Clear search"
                            >
                                <div className="w-4 h-4">{ICONS.x}</div>
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex gap-2 flex-wrap w-full lg:w-auto justify-end">
                    {selectedBillIds.size > 0 && (
                        <Button
                            onClick={() => setIsBulkPayModalOpen(true)}
                            className="animate-fade-in"
                        >
                            Pay ({selectedBillIds.size})
                        </Button>
                    )}
                    <Button
                        variant="secondary"
                        onClick={() => {
                            dispatch({ type: 'SET_INITIAL_IMPORT_TYPE', payload: ImportType.RENTAL_BILLS });
                            dispatch({ type: 'SET_PAGE', payload: 'import' });
                        }}
                    >
                        <div className="w-4 h-4 mr-2">{ICONS.download}</div> Bulk Import
                    </Button>
                    <Button onClick={() => { setDuplicateBillData(null); setBillToEdit(null); setIsCreateModalOpen(true); }}>
                        <div className="w-4 h-4 mr-2">{ICONS.plus}</div> New Bill
                    </Button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-grow flex flex-col md:flex-row gap-4 overflow-hidden min-h-0">
                
                {/* Left Tree View */}
                <div 
                    className="hidden md:flex flex-col h-full flex-shrink-0"
                    style={{ width: sidebarWidth }}
                >
                    <div className="font-bold text-slate-700 mb-2 px-1 flex justify-between items-center">
                        <span>Buildings & Vendors</span>
                        {selectedNode && (
                            <button onClick={() => setSelectedNode(null)} className="text-xs text-accent hover:underline">Clear Selection</button>
                        )}
                    </div>
                    <BillTreeView 
                        treeData={treeData} 
                        selectedNodeId={selectedNode?.id || null} 
                        selectedParentId={selectedNode?.parentId || null}
                        onNodeSelect={(id, type, parentId) => setSelectedNode({ id, type, parentId })} 
                    />
                </div>

                {/* Resizer Handle */}
                <div className="hidden md:block h-full">
                    <ResizeHandle onMouseDown={startResizing} />
                </div>

                {/* Right Data Grid */}
                <div className="flex-grow overflow-hidden flex flex-col bg-white rounded-lg border border-slate-200 shadow-sm">
                    <div className="flex-grow overflow-y-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-sm">
                            <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="px-4 py-3 w-10"></th>
                                    <th onClick={() => handleSort('issueDate')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Date <SortIcon column="issueDate"/></th>
                                    <th onClick={() => handleSort('entityName')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Building <SortIcon column="entityName"/></th>
                                    <th onClick={() => handleSort('billNumber')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Bill No <SortIcon column="billNumber"/></th>
                                    <th onClick={() => handleSort('vendorName')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Vendor <SortIcon column="vendorName"/></th>
                                    <th onClick={() => handleSort('contract')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Contract <SortIcon column="contract"/></th>
                                    <th onClick={() => handleSort('dueDate')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Due Date <SortIcon column="dueDate"/></th>
                                    <th onClick={() => handleSort('amount')} className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Amount <SortIcon column="amount"/></th>
                                    <th onClick={() => handleSort('status')} className="px-4 py-3 text-center font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Status <SortIcon column="status"/></th>
                                    <th onClick={() => handleSort('balance')} className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Balance <SortIcon column="balance"/></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 bg-white">
                                {filteredBills.length > 0 ? filteredBills.map((bill) => {
                                    const balance = bill.amount - bill.paidAmount;
                                    let buildingName = 'General';
                                    if (bill.buildingId) buildingName = state.buildings.find(b => b.id === bill.buildingId)?.name || 'Unknown';
                                    else if (bill.propertyId) {
                                        const prop = state.properties.find(p => p.id === bill.propertyId);
                                        buildingName = state.buildings.find(b => b.id === prop?.buildingId)?.name || 'Unknown';
                                    }

                                    const vendor = state.contacts.find(c => c.id === bill.contactId);
                                    const contract = state.contracts.find(c => c.id === bill.contractId);
                                    
                                    const isExpanded = expandedBillIds.has(bill.id);
                                    const hasPayments = bill.paidAmount > 0;
                                    const payments = hasPayments ? state.transactions.filter(t => t.billId === bill.id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) : [];

                                    return (
                                        <React.Fragment key={bill.id}>
                                            <tr 
                                                className="hover:bg-slate-50 cursor-pointer transition-colors group"
                                                onClick={() => handleEdit(bill)}
                                            >
                                                <td className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                                                    <input 
                                                        type="checkbox" 
                                                        className="rounded text-accent focus:ring-accent w-4 h-4 border-gray-300 cursor-pointer"
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
                                                <td className="px-4 py-3 whitespace-nowrap text-slate-700 flex items-center gap-2">
                                                    {hasPayments && (
                                                        <button 
                                                            onClick={(e) => toggleExpand(e, bill.id)}
                                                            className={`p-1 rounded hover:bg-slate-200 text-slate-400 transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                                        >
                                                            <div className="w-3 h-3">{ICONS.chevronRight}</div>
                                                        </button>
                                                    )}
                                                    {formatDate(bill.issueDate)}
                                                </td>
                                                <td className="px-4 py-3 text-slate-800 font-medium">{buildingName}</td>
                                                <td className="px-4 py-3 text-slate-600 font-mono text-xs">{bill.billNumber}</td>
                                                <td className="px-4 py-3 text-slate-600 truncate max-w-[150px]">{vendor?.name || 'Unknown'}</td>
                                                <td className="px-4 py-3 text-slate-600 font-mono text-xs">{contract ? contract.contractNumber : '-'}</td>
                                                <td className="px-4 py-3 text-slate-500">{bill.dueDate ? formatDate(bill.dueDate) : '-'}</td>
                                                <td className="px-4 py-3 text-right font-mono font-semibold text-slate-800">{CURRENCY} {bill.amount.toLocaleString()}</td>
                                                <td className="px-4 py-3 text-center">
                                                    <div className="flex items-center justify-center gap-2">
                                                        {getStatusBadge(bill.status)}
                                                        {bill.paidAmount > 0 && (
                                                            <button 
                                                                onClick={(e) => handleSendWhatsApp(e, bill)} 
                                                                className="text-green-600 hover:text-green-800 p-1 rounded-full hover:bg-green-50 transition-colors opacity-0 group-hover:opacity-100" 
                                                                title="Send Payment Notification via WhatsApp"
                                                            >
                                                                <div className="w-4 h-4">{ICONS.whatsapp}</div>
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                     <div className="flex items-center justify-end gap-2">
                                                        <span className={`font-mono font-bold ${balance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                            {CURRENCY} {balance.toLocaleString()}
                                                        </span>
                                                        {balance > 0 && (
                                                            <Button 
                                                                size="sm" 
                                                                onClick={(e) => { e.stopPropagation(); handleRecordPayment(bill); }}
                                                                className="opacity-0 group-hover:opacity-100 transition-opacity h-6 text-[10px] px-2"
                                                            >
                                                                Pay
                                                            </Button>
                                                        )}
                                                     </div>
                                                </td>
                                            </tr>
                                            {isExpanded && hasPayments && (
                                                <tr className="bg-slate-50/50">
                                                    <td colSpan={10} className="p-0 border-b border-slate-100">
                                                        <div className="border-l-4 border-indigo-200 ml-8 my-2 pl-4 py-2 space-y-1">
                                                            {payments.length > 0 ? payments.map((pay) => (
                                                                <div 
                                                                    key={pay.id} 
                                                                    className="flex items-center text-xs text-slate-600 hover:bg-slate-100 p-1 rounded cursor-pointer group"
                                                                    onClick={() => setTransactionToEdit(pay)}
                                                                >
                                                                    <div className="w-24 flex-shrink-0 text-slate-500">{formatDate(pay.date)}</div>
                                                                    <div className="flex-grow truncate font-medium text-slate-700">{pay.description || 'Payment'}</div>
                                                                    <div className="w-32 flex-shrink-0 text-right">{state.accounts.find(a => a.id === pay.accountId)?.name}</div>
                                                                    <div className="w-24 text-right font-mono text-emerald-600 tabular-nums">{CURRENCY} {pay.amount.toLocaleString()}</div>
                                                                    <div className="w-6 flex justify-center opacity-0 group-hover:opacity-100 text-indigo-600">
                                                                        <div className="w-3 h-3">{ICONS.edit}</div>
                                                                    </div>
                                                                </div>
                                                            )) : <div className="text-xs text-slate-400 italic">No transaction records found.</div>}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    )
                                }) : (
                                    <tr>
                                        <td colSpan={10} className="px-4 py-12 text-center text-slate-500">
                                            No bills found matching selected criteria.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="p-3 border-t border-slate-200 bg-slate-50 flex justify-between items-center text-sm font-bold text-slate-700">
                        <span>Total Bills: {filteredBills.length}</span>
                        <span>Total Amount: {CURRENCY} {filteredBills.reduce((sum, b) => sum + b.amount, 0).toLocaleString()}</span>
                    </div>
                </div>
            </div>

            {/* Modals */}
            <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title={duplicateBillData ? "New Bill (Duplicate)" : billToEdit ? "Edit Bill" : "Record New Bill"} size="xl">
                <InvoiceBillForm 
                    onClose={() => setIsCreateModalOpen(false)} 
                    type="bill" 
                    rentalContext={true}
                    itemToEdit={billToEdit || undefined}
                    initialData={duplicateBillData || undefined}
                    onDuplicate={handleDuplicate}
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
                        buildingId: paymentBill?.buildingId,
                        propertyId: paymentBill?.propertyId,
                        categoryId: paymentBill?.categoryId,
                        contractId: paymentBill?.contractId,
                        description: paymentBill?.description || `Payment for Bill #${paymentBill?.billNumber}`,
                    } as any}
                    onShowDeleteWarning={() => {}}
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
                    if(warningModalState.transaction) dispatch({ type: 'DELETE_TRANSACTION', payload: warningModalState.transaction.id }); 
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

export default RentalBillsPage;