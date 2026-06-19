import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useDispatchOnly, useStateSelector, useTransactions } from '../../hooks/useSelectiveState';
import { logPaymentListUiTrace } from '../../services/debug/paymentDisappearanceTrace';
import InvoiceBillForm from '../invoices/InvoiceBillForm';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { ICONS, CURRENCY } from '../../constants';
import Modal from '../ui/Modal';
import TransactionForm from '../transactions/TransactionForm';
import { TransactionType, Bill, InvoiceStatus, Transaction } from '../../types';
import { BillTreeNode } from '../bills/BillTreeView';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import Select from '../ui/Select';
import { parseStoredDateToYyyyMmDdInput, toLocalDateString, todayLocalYyyyMmDd } from '../../utils/dateUtils';
import useLocalStorage from '../../hooks/useLocalStorage';
import { WhatsAppService, sendOrOpenWhatsApp } from '../../services/whatsappService';
import { useNotification } from '../../context/NotificationContext';
import { useWhatsApp } from '../../context/WhatsAppContext';
import LinkedTransactionWarningModal from '../transactions/LinkedTransactionWarningModal';
import { ImportType } from '../../types';
import BillBulkPaymentModal from './BillBulkPaymentModal';
import VendorBillPaymentModal from '../vendors/VendorBillPaymentModal';
import VirtualizedBillsTable from './VirtualizedBillsTable';
import type { BillsSortKey, BillsTableRow } from './billsTableTypes';
import TreeExpandCollapseControls from '../ui/TreeExpandCollapseControls';
import { collectExpandableParentIds } from '../ui/treeExpandCollapseUtils';
import RecordSupplierAdvanceModal from '../vendors/RecordSupplierAdvanceModal';
import { isVendorSettlementCashMirrorReference } from '../../config/vendorSettlementRefs';
import {
    contractorApi,
    type ContractorLedgerAdvance,
    type VendorBillSettlementRow,
} from '../../services/api/contractorApi';
import type { Vendor } from '../../types';

type DateRangeOption = 'all' | 'thisMonth' | 'lastMonth' | 'custom';
type TypeFilter = 'All' | 'Bills' | 'Payments';
interface BillsPageProps {
    projectContext?: boolean; // When true, indicates bills are being managed from project management section
}

type BillTreeSelection = { id: string; type: 'group' | 'vendor'; parentId?: string } | null;

/**
 * Tree / filter grouping for a bill. When the Bills page is scoped to one project, bills with no
 * header project but payments tagged to that project (see baseBills) still group under that project.
 */
function billPrimaryGroupId(bill: Bill, projectFilter: string): string {
    if (bill.projectId) return bill.projectId;
    if (projectFilter !== 'all') return projectFilter;
    return 'unassigned';
}

function billHasExpensePaymentForProject(
    bill: Bill,
    projectId: string,
    transactions: Transaction[]
): boolean {
    return transactions.some(
        (tx) =>
            tx.billId === bill.id &&
            tx.type === TransactionType.EXPENSE &&
            tx.projectId === projectId &&
            !isVendorSettlementCashMirrorReference(tx.reference)
    );
}

/** Unpaid vendor bill ids in current tree/project scope (VendorBillPaymentModal restrict list). */
function restrictUnpaidBillIdsForVendorInView(
    vendorId: string,
    baseBills: Bill[],
    selectedNode: BillTreeSelection,
    projectFilter: string
): string[] | null {
    let pool = baseBills.filter((b) => b.vendorId === vendorId && b.status !== InvoiceStatus.PAID);

    if (selectedNode?.type === 'vendor' && selectedNode.id === vendorId) {
        const parentId = selectedNode.parentId ?? 'unassigned';
        pool = pool.filter((b) => {
            const grp = billPrimaryGroupId(b, projectFilter);
            if (parentId === 'unassigned') return grp === 'unassigned';
            return grp === parentId;
        });
        return pool.map((b) => b.id);
    }

    if (selectedNode?.type === 'group') {
        if (selectedNode.id === 'unassigned') {
            pool = pool.filter((b) => billPrimaryGroupId(b, projectFilter) === 'unassigned');
        } else {
            pool = pool.filter((b) => billPrimaryGroupId(b, projectFilter) === selectedNode.id);
        }
        return pool.map((b) => b.id);
    }

    if (projectFilter !== 'all') {
        pool = pool.filter((b) => billPrimaryGroupId(b, projectFilter) === projectFilter);
        return pool.map((b) => b.id);
    }

    return null;
}

/** Premium tree sidebar: same style as Project Agreements (Directories, avatars, orange active, chevron) */
const BillTreeSidebar: React.FC<{
    nodes: BillTreeNode[];
    selectedId: string | null;
    selectedParentId: string | null;
    onSelect: (id: string, type: 'group' | 'vendor', parentId?: string) => void;
    onViewVendor: (vendorId: string) => void;
}> = ({ nodes, selectedId, selectedParentId, onSelect, onViewVendor }) => {
    const [sortConfig, setSortConfig] = useState<{ key: 'name' | 'balance'; direction: 'asc' | 'desc' }>({ key: 'balance', direction: 'desc' });
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set(nodes.map(n => n.id)));

    useEffect(() => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            nodes.forEach(n => next.add(n.id));
            return next;
        });
    }, [nodes]);

    const handleSort = (key: 'name' | 'balance') => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const sortNodes = useCallback((items: BillTreeNode[]): BillTreeNode[] => {
        const sorted = [...items].sort((a, b) => {
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

        return sorted.map(node => ({
            ...node,
            children: node.children ? sortNodes(node.children) : []
        }));
    }, [sortConfig]);

    const sortedNodes = useMemo(() => sortNodes(nodes), [nodes, sortNodes]);

    const expandableIds = useMemo(() => collectExpandableParentIds(sortedNodes), [sortedNodes]);

    const SortIcon = ({ column }: { column: 'name' | 'balance' }) => {
        if (sortConfig.key !== column) return <span className="text-app-muted/50 ml-1 text-[10px]">↕</span>;
        return <span className="text-ds-primary ml-1 text-[10px]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
    };

    const toggleExpanded = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleExpandAll = useCallback(() => {
        setExpandedIds(new Set(expandableIds));
    }, [expandableIds]);

    const handleCollapseAll = useCallback(() => {
        setExpandedIds(new Set());
    }, []);

    const renderNode = (node: BillTreeNode, level: number, parentId?: string) => {
        const hasChildren = node.children && node.children.length > 0;
        const isExpanded = expandedIds.has(node.id);
        const isSelected = selectedId === node.id && (node.type === 'group' || selectedParentId === parentId);

        return (
            <div key={node.id} className={level > 0 ? 'ml-4 border-l border-app-border pl-3' : ''}>
                <div
                    className={`group flex items-center gap-2 py-1.5 px-2 rounded-lg -mx-0.5 transition-all cursor-pointer ${isSelected ? 'bg-app-table-selected text-ds-primary' : 'hover:bg-app-table-hover text-app-text'
                        }`}
                    onClick={() => onSelect(node.id, node.type, parentId)}
                >
                    {hasChildren ? (
                        <button
                            onClick={(e) => { e.stopPropagation(); toggleExpanded(node.id); }}
                            className={`flex-shrink-0 w-5 h-5 flex items-center justify-center text-app-muted hover:text-app-text transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                        >
                            <div className="w-3.5 h-3.5">{ICONS.chevronRight}</div>
                        </button>
                    ) : (
                        <span className="w-5 flex-shrink-0" />
                    )}
                    <span className="flex-1 text-xs font-medium truncate group-hover:text-clip">{node.name}</span>
                    {node.type === 'vendor' && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onViewVendor(node.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 text-app-muted hover:text-ds-primary transition-all rounded hover:bg-app-table-hover mr-1"
                            title="View in Vendor Directory"
                        >
                            <div className="w-3.5 h-3.5">{ICONS.addressBook}</div>
                        </button>
                    )}
                    {node.balance > 0 && (
                        <span className={`text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded border flex-shrink-0 ${isSelected ? 'bg-ds-danger text-ds-on-primary border-ds-danger' : 'bg-app-error-bg text-ds-danger border-app-border'}`}>
                            {node.balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                    )}
                </div>
                {hasChildren && isExpanded && (
                    <div className="mt-0.5">
                        {node.children.map(child => renderNode(child, level + 1, node.id))}
                    </div>
                )}
            </div>
        );
    };

    if (!nodes || nodes.length === 0) {
        return <div className="text-xs text-app-muted italic p-2">No directories match your search</div>;
    }

    return (
        <div className="flex flex-col h-full">
            {/* Sort Header */}
            <div className="flex items-center justify-between px-2 py-1.5 border-b border-app-border mb-1 bg-app-toolbar rounded-md gap-1">
                <button
                    onClick={() => handleSort('name')}
                    className="flex items-center text-[10px] font-bold text-app-muted uppercase tracking-wider hover:text-app-text transition-colors"
                >
                    Entity <SortIcon column="name" />
                </button>
                <TreeExpandCollapseControls
                    variant="slate"
                    allExpandableIds={expandableIds}
                    expandedIds={expandedIds}
                    onExpandAll={handleExpandAll}
                    onCollapseAll={handleCollapseAll}
                    visible={expandableIds.length > 0}
                />
                <button
                    onClick={() => handleSort('balance')}
                    className="flex items-center text-[10px] font-bold text-app-muted uppercase tracking-wider hover:text-app-text transition-colors"
                >
                    Payable <SortIcon column="balance" />
                </button>
            </div>

            <div className="space-y-0.5">
                {sortedNodes.map(node => renderNode(node, 0))}
            </div>
        </div>
    );
};

const BillsPage: React.FC<BillsPageProps> = ({ projectContext = false }) => {
    const dispatch = useDispatchOnly();
    const state = useStateSelector(s => s);
    const transactions = useTransactions();
    const { showToast, showAlert } = useNotification();
    const { openChat } = useWhatsApp();

    // --- State: Toolbar & Filters (Persistent) ---
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useLocalStorage<TypeFilter>('bills_typeFilter', 'All');
    const [dateRange, setDateRange] = useLocalStorage<DateRangeOption>('bills_dateRange', 'all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [projectFilter, setProjectFilter] = useLocalStorage<string>('bills_projectFilter', state.defaultProjectId || 'all');
    const [sortConfig, setSortConfig] = useLocalStorage<{ key: BillsSortKey; direction: 'asc' | 'desc' }>('bills_sort', { key: 'issueDate', direction: 'desc' });

    // --- State: View & Selection ---
    const [selectedNode, setSelectedNode] = useState<{ id: string; type: 'group' | 'vendor'; parentId?: string } | null>(null);
    const [selectedBillIds, setSelectedBillIds] = useState<Set<string>>(new Set());
    const [isBulkPayModalOpen, setIsBulkPayModalOpen] = useState(false);
    const [bulkPayPresetSnapshot, setBulkPayPresetSnapshot] = useState<string[]>([]);
    const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
    const [vendorSidebarAdvances, setVendorSidebarAdvances] = useState<ContractorLedgerAdvance[]>([]);
    const [vendorSettlementsRows, setVendorSettlementsRows] = useState<VendorBillSettlementRow[]>([]);
    const [settlementListGen, setSettlementListGen] = useState(0);

    // --- State: Modals ---
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [paymentBill, setPaymentBill] = useState<Bill | null>(null);
    const [isAdvancePayBillModalOpen, setIsAdvancePayBillModalOpen] = useState(false);
    const [billForAdvancePay, setBillForAdvancePay] = useState<Bill | null>(null);
    const [duplicateBillData, setDuplicateBillData] = useState<Partial<Bill> | null>(null);
    const [billToEdit, setBillToEdit] = useState<Bill | null>(null);

    // Transaction Editing State
    const [transactionToEdit, setTransactionToEdit] = useState<Transaction | null>(null);
    const [warningModalState, setWarningModalState] = useState<{ isOpen: boolean; transaction: Transaction | null; action: 'delete' | null }>({ isOpen: false, transaction: null, action: null });
    const [vendorSettlementEdit, setVendorSettlementEdit] = useState<{
        settlement: VendorBillSettlementRow;
        vendor: Vendor;
    } | null>(null);

    // Sidebar: search filter for tree
    const [treeSearchQuery, setTreeSearchQuery] = useState('');

    // Sidebar Resizing: container-relative width (150–600px), same as Project Agreements
    const [sidebarWidth, setSidebarWidth] = useLocalStorage<number>('bills_sidebarWidth', 280);
    const [isResizing, setIsResizing] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // --- Computed: Projects List for Dropdown ---
    const projects = useMemo(() => [{ id: 'all', name: 'All Projects' }, ...state.projects], [state.projects]);

    const projectMap = useMemo(() => new Map(state.projects.map(p => [p.id, p])), [state.projects]);
    const vendorMap = useMemo(() => new Map((state.vendors ?? []).map(v => [v.id, v])), [state.vendors]);
    const contractMap = useMemo(() => new Map(state.contracts.map(c => [c.id, c])), [state.contracts]);
    const billMap = useMemo(() => new Map(state.bills.map(b => [String(b.id), b])), [state.bills]);
    const accountMap = useMemo(() => new Map(state.accounts.map(a => [a.id, a])), [state.accounts]);

    const closeBulkPayModal = useCallback(() => {
        setIsBulkPayModalOpen(false);
        setBulkPayPresetSnapshot([]);
    }, []);

    const closeAdvancePayBillModal = useCallback(() => {
        setIsAdvancePayBillModalOpen(false);
        setBillForAdvancePay(null);
    }, []);

    useEffect(() => {
        let cancel = false;
        if (!selectedNode || selectedNode.type !== 'vendor') {
            setVendorSidebarAdvances([]);
            return () => {
                cancel = true;
            };
        }
        contractorApi
            .getAdvances(selectedNode.id)
            .then((rows) => {
                if (!cancel) setVendorSidebarAdvances(rows ?? []);
            })
            .catch(() => {
                if (!cancel) setVendorSidebarAdvances([]);
            });
        return () => {
            cancel = true;
        };
    }, [selectedNode]);

    useEffect(() => {
        const onRecorded = (ev: Event) => {
            const d = (ev as CustomEvent<{ vendorId?: string }>).detail;
            if (!selectedNode || selectedNode.type !== 'vendor') return;
            if (d?.vendorId !== selectedNode.id) return;
            contractorApi
                .getAdvances(selectedNode.id)
                .then(setVendorSidebarAdvances)
                .catch(() => setVendorSidebarAdvances([]));
        };
        window.addEventListener('pbooks:supplier-advance-recorded', onRecorded as EventListener);
        return () => window.removeEventListener('pbooks:supplier-advance-recorded', onRecorded as EventListener);
    }, [selectedNode]);

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
            setStartDate(toLocalDateString(first));
            setEndDate(toLocalDateString(last));
        } else if (option === 'lastMonth') {
            const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const last = new Date(now.getFullYear(), now.getMonth(), 0);
            setStartDate(toLocalDateString(first));
            setEndDate(toLocalDateString(last));
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
            const bill = billMap.get(billId);
            if (bill) {
                setBillToEdit(bill);
                setIsCreateModalOpen(true);
            }
        }
    }, [billMap]);

    // --- Filter Logic (Raw Bills) ---
    const baseBills = useMemo(() => {
        // Context: Project Bills (Usually have projectId)
        // We include bills that are having a projectId, OR general bills if we are in "All" mode and they aren't explicitly rental
        // Explicitly exclude if linked to a rental Property (propertyId) or Building (buildingId)
        let bills = state.bills.filter(b => b.projectId || (!b.projectId && !b.buildingId && !b.propertyId));

        // Filter by selected project if not 'all'
        if (projectFilter !== 'all') {
            bills = bills.filter(
                (b) =>
                    b.projectId === projectFilter ||
                    // Align with Expense-by-Category (and PM payouts): expense payments can carry projectId while the bill header does not.
                    (!b.projectId &&
                        billHasExpensePaymentForProject(b, projectFilter, state.transactions))
            );
        }

        return bills;
    }, [state.bills, state.transactions, projectFilter]);

    useEffect(() => {
        const bump = () => setSettlementListGen((n) => n + 1);
        window.addEventListener('pbooks:request-api-refresh', bump);
        return () => window.removeEventListener('pbooks:request-api-refresh', bump);
    }, []);

    useEffect(() => {
        const ids = baseBills.map((b) => b.id).filter(Boolean);
        if (ids.length === 0) {
            setVendorSettlementsRows([]);
            return;
        }
        let cancel = false;
        contractorApi
            .listVendorBillSettlements(ids)
            .then((rows) => {
                if (!cancel) setVendorSettlementsRows(rows);
            })
            .catch(() => {
                if (!cancel) setVendorSettlementsRows([]);
            });
        return () => {
            cancel = true;
        };
    }, [baseBills, settlementListGen]);

    // --- Tree Data Generation ---
    const treeData = useMemo<BillTreeNode[]>(() => {
        const groupMap = new Map<string, BillTreeNode>();
        const groupVendorMap = new Map<string, Map<string, BillTreeNode>>();

        if (projectFilter !== 'all') {
            const project = projectMap.get(projectFilter);
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
                groupVendorMap.set(project.id, new Map());
            }
        } else {
            projectMap.forEach((p, id) => {
                groupMap.set(p.id, {
                    id: p.id,
                    name: p.name,
                    type: 'group',
                    children: [],
                    count: 0,
                    amount: 0,
                    balance: 0
                });
                groupVendorMap.set(p.id, new Map());
            });
            groupMap.set('unassigned', {
                id: 'unassigned',
                name: 'General / Unassigned',
                type: 'group',
                children: [],
                count: 0,
                amount: 0,
                balance: 0
            });
            groupVendorMap.set('unassigned', new Map());
        }

        baseBills.forEach(bill => {
            const groupId = billPrimaryGroupId(bill, projectFilter);
            const group = groupMap.get(groupId);
            const balance = bill.amount - bill.paidAmount;

            if (group) {
                group.count++;
                group.amount += bill.amount;
                group.balance += balance;

                const vendorId = bill.vendorId;
                if (!vendorId) return;

                let vendorNode = groupVendorMap.get(groupId)?.get(vendorId);
                if (!vendorNode) {
                    const vendor = vendorMap.get(vendorId);
                    vendorNode = {
                        id: vendorId,
                        name: vendor?.name || 'Unknown Vendor',
                        type: 'vendor',
                        children: [],
                        count: 0,
                        amount: 0,
                        balance: 0
                    };
                    group.children.push(vendorNode);
                    groupVendorMap.get(groupId)!.set(vendorId, vendorNode);
                }
                vendorNode.count++;
                vendorNode.amount += bill.amount;
                vendorNode.balance += balance;
            }
        });

        return Array.from(groupMap.values())
            .filter(g => g.count > 0) // Only show groups with bills
            .sort((a, b) => a.name.localeCompare(b.name));

    }, [baseBills, projectMap, vendorMap, projectFilter]);

    // --- Unified Table Data (Bills + Payments) ---
    const tableRows = useMemo<BillsTableRow[]>(() => {
        const rows: BillsTableRow[] = [];

        // Add bill rows
        if (typeFilter === 'All' || typeFilter === 'Bills') {
            baseBills.forEach(bill => {
                const grp = billPrimaryGroupId(bill, projectFilter);
                const project = grp !== 'unassigned' ? projectMap.get(grp) : undefined;
                const vendorId = bill.vendorId;
                const vendor = vendorId ? vendorMap.get(vendorId) : undefined;
                const contract = bill.contractId ? contractMap.get(bill.contractId) : undefined;
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
                .filter(
                    (tx) =>
                        tx.type === TransactionType.EXPENSE &&
                        (tx.billId ?? (tx as any).bill_id) &&
                        !isVendorSettlementCashMirrorReference(tx.reference)
                )
                .forEach(payment => {
                    const pid = String(payment.billId ?? (payment as any).bill_id ?? '');
                    const bill = billMap.get(pid);
                    if (!bill || !baseBills.includes(bill)) return;

                    const payGrp = billPrimaryGroupId(bill, projectFilter);
                    const project = payGrp !== 'unassigned' ? projectMap.get(payGrp) : undefined;
                    const vendorId = payment.vendorId || bill.vendorId;
                    const vendor = vendorId ? vendorMap.get(vendorId) : undefined;
                    const contractId = payment.contractId || bill.contractId;
                    const contract = contractId ? contractMap.get(contractId) : undefined;

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

            vendorSettlementsRows.forEach((vs) => {
                const bill = billMap.get(vs.billId);
                if (!bill || !baseBills.includes(bill)) return;
                const vendorId = bill.vendorId;
                const vendor = vendorId ? vendorMap.get(vendorId) : undefined;
                const vsGrp = billPrimaryGroupId(bill, projectFilter);
                const project = vsGrp !== 'unassigned' ? projectMap.get(vsGrp) : undefined;

                rows.push({
                    id: `vset-${vs.journalEntryId}-${vs.billId}`,
                    type: 'vendor_settlement',
                    bill,
                    vendorSettlement: vs,
                    date: vs.entryDate,
                    billNumber: bill.billNumber,
                    vendorName: vendor?.name || 'Unknown',
                    projectName: project?.name || 'General',
                    contractNumber: bill.contractId ? contractMap.get(bill.contractId)?.contractNumber : undefined,
                    dueDate: bill.dueDate,
                    amount: vs.totalAmount,
                    status: 'Prepaid + bank',
                    balance: -vs.totalAmount,
                });
            });
        }

        return rows;
    }, [
        baseBills,
        state.transactions,
        billMap,
        projectMap,
        vendorMap,
        contractMap,
        typeFilter,
        vendorSettlementsRows,
        projectFilter,
    ]);

    // --- Filtered Table Rows ---
    const filteredRows = useMemo(() => {
        let result = [...tableRows];

        // 1. Tree Filter (if specific node selected)
        if (selectedNode) {
            if (selectedNode.type === 'group') {
                result = result.filter(row => {
                    const projectKey = row.bill
                        ? billPrimaryGroupId(row.bill, projectFilter)
                        : row.payment?.projectId;
                    return (
                        projectKey === selectedNode.id ||
                        (selectedNode.id === 'unassigned' && (!projectKey || projectKey === 'unassigned'))
                    );
                });
            } else if (selectedNode.type === 'vendor') {
                const parentGroupId = selectedNode.parentId || 'unassigned';
                result = result.filter(row => {
                    const bill = row.bill || (row.payment ? billMap.get(String(row.payment?.billId ?? (row.payment as any)?.bill_id ?? '')) : null);
                    if (!bill) return false;
                    const vendorId = bill.vendorId;
                    const grp = billPrimaryGroupId(bill, projectFilter);
                    if (parentGroupId === 'unassigned') {
                        return grp === 'unassigned' && vendorId === selectedNode.id;
                    } else {
                        return grp === parentGroupId && vendorId === selectedNode.id;
                    }
                });
            }
        }

        // Supplier prepaid advances (PostgreSQL API): show in vendor drill-down; not stored as table rows.
        if (
            selectedNode?.type === 'vendor' &&
            vendorSidebarAdvances.length > 0 &&
            (typeFilter === 'All' || typeFilter === 'Payments')
        ) {
            const parentGroupId = selectedNode.parentId ?? 'unassigned';
            const vend = vendorMap.get(selectedNode.id);
            const vendorLabel = vend?.name || 'Unknown';
            for (const adv of vendorSidebarAdvances) {
                if (parentGroupId !== 'unassigned') {
                    if (adv.projectId && adv.projectId !== parentGroupId) continue;
                }
                const rem = adv.remainingAmount ?? 0;
                const fullyApplied = rem <= 0.015;
                result.push({
                    id: `advance-${adv.id}`,
                    type: 'advance',
                    advance: adv,
                    date: adv.advanceDate,
                    billNumber: `ADV-${adv.id.slice(0, 8)}`,
                    vendorName: vendorLabel,
                    projectName: adv.projectId ? projectMap.get(adv.projectId)?.name ?? '—' : 'General',
                    amount: adv.originalAmount,
                    status: fullyApplied ? 'Fully applied' : 'Prepaid',
                    balance: rem,
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
                (row.payment?.description && row.payment.description.toLowerCase().includes(q)) ||
                ((row.advance?.description || '').toLowerCase().includes(q))
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

    }, [
        tableRows,
        selectedNode,
        startDate,
        endDate,
        searchQuery,
        sortConfig,
        billMap,
        vendorSidebarAdvances,
        typeFilter,
        projectMap,
        vendorMap,
        projectFilter,
    ]);

    useEffect(() => {
        const paymentRows = filteredRows.filter((row) => row.type === 'payment' && row.payment);
        logPaymentListUiTrace({
            component: 'BillsPage',
            sourceTransactionCount: transactions.length,
            recordsPropCount: tableRows.length,
            filteredRecordCount: filteredRows.length,
            displayedRecordCount: filteredRows.length,
            transactions,
            displayedRecords: paymentRows.map((row) => ({
                id: row.id,
                type: 'payment',
                raw: row.payment as Transaction,
            })),
            typeFilter,
            dateFilter: dateRange,
        });
    }, [transactions, tableRows, filteredRows, typeFilter, dateRange]);

    // --- Sidebar Resize: container-relative width to prevent jumping ---
    const handleMouseMoveSidebar = useCallback((e: MouseEvent) => {
        if (!containerRef.current) return;
        const containerLeft = containerRef.current.getBoundingClientRect().left;
        const newWidth = e.clientX - containerLeft;
        if (newWidth > 150 && newWidth < 600) setSidebarWidth(newWidth);
    }, [setSidebarWidth]);

    useEffect(() => {
        if (!isResizing) return;
        const handleUp = () => {
            setIsResizing(false);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        window.addEventListener('mousemove', handleMouseMoveSidebar);
        window.addEventListener('mouseup', handleUp);
        window.addEventListener('blur', handleUp);
        document.addEventListener('visibilitychange', handleUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMoveSidebar);
            window.removeEventListener('mouseup', handleUp);
            window.removeEventListener('blur', handleUp);
            document.removeEventListener('visibilitychange', handleUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [isResizing, handleMouseMoveSidebar]);

    const startResizing = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);
    }, []);

    // Filter tree by sidebar search
    const filterBillTree = useCallback((nodes: BillTreeNode[], q: string): BillTreeNode[] => {
        if (!q.trim()) return nodes;
        const lower = q.toLowerCase();
        return nodes
            .map(node => {
                const labelMatch = node.name.toLowerCase().includes(lower);
                const filteredChildren = node.children?.length ? filterBillTree(node.children, q) : [];
                const childMatch = filteredChildren.length > 0;
                if (labelMatch && !filteredChildren.length) return node;
                if (childMatch) return { ...node, children: filteredChildren };
                if (labelMatch) return node;
                return null;
            })
            .filter((n): n is BillTreeNode => n != null);
    }, []);

    const filteredBillTreeData = useMemo(() => filterBillTree(treeData, treeSearchQuery), [treeData, treeSearchQuery, filterBillTree]);

    const handleSort = useCallback((key: BillsSortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    }, [setSortConfig]);

    const handleToggleBillSelection = useCallback((billId: string) => {
        setSelectedBillIds(prev => {
            const next = new Set(prev);
            if (next.has(billId)) next.delete(billId);
            else next.add(billId);
            return next;
        });
    }, []);

    const handleEditSettlement = useCallback((settlement: VendorBillSettlementRow, vendor: Vendor) => {
        setVendorSettlementEdit({ settlement, vendor });
    }, []);

    const handleViewVendor = (vendorId: string) => {
        sessionStorage.setItem('openVendorId', vendorId);
        dispatch({ type: 'SET_PAGE', payload: 'vendorDirectory' });
    };

    const handleRecordPayment = (bill: Bill) => {
        if (bill.vendorId && bill.status !== InvoiceStatus.PAID) {
            const vendorEntity = vendorMap.get(bill.vendorId);
            if (vendorEntity) {
                setBillForAdvancePay(bill);
                setIsAdvancePayBillModalOpen(true);
                return;
            }
        }
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
        closeBulkPayModal();
    };

    const selectedBillsList = useMemo(() =>
        state.bills.filter(b => selectedBillIds.has(b.id)),
        [state.bills, selectedBillIds]);

    const bulkPayVendor = useMemo(() => {
        if (selectedBillsList.length === 0) return undefined;
        const vids = new Set(
            selectedBillsList.map((b) => b.vendorId).filter(Boolean) as string[]
        );
        if (vids.size !== 1) return undefined;
        return vendorMap.get([...vids][0]);
    }, [selectedBillsList, vendorMap]);

    const useVendorAdvancePayModal =
        !!bulkPayVendor && selectedBillsList.length > 0;

    const restrictToBillIdsForVendorPay = useMemo((): string[] | null => {
        if (!bulkPayVendor) return null;
        return restrictUnpaidBillIdsForVendorInView(bulkPayVendor.id, baseBills, selectedNode, projectFilter);
    }, [bulkPayVendor, baseBills, selectedNode, projectFilter]);

    const restrictToBillIdsForSingleAdvancePay = useMemo((): string[] | null => {
        if (!billForAdvancePay?.vendorId) return null;
        return restrictUnpaidBillIdsForVendorInView(
            billForAdvancePay.vendorId,
            baseBills,
            selectedNode,
            projectFilter
        );
    }, [billForAdvancePay, baseBills, selectedNode, projectFilter]);

    const singleAdvancePayPresetIds = useMemo(
        () => (billForAdvancePay?.id ? [billForAdvancePay.id] : undefined),
        [billForAdvancePay?.id]
    );

    /** New bill prefill from project filter + tree (Project Construction): project, vendor, and today when both are known. */
    const newBillContextPrefill = useMemo((): Partial<Bill> | undefined => {
        if (!projectContext || billToEdit || duplicateBillData) return undefined;

        let resolvedProjectId: string | undefined;
        if (selectedNode?.type === 'vendor' && selectedNode.parentId && selectedNode.parentId !== 'unassigned') {
            resolvedProjectId = selectedNode.parentId;
        } else if (selectedNode?.type === 'group' && selectedNode.id !== 'unassigned') {
            resolvedProjectId = selectedNode.id;
        } else if (projectFilter !== 'all') {
            resolvedProjectId = projectFilter;
        }

        const resolvedVendorId = selectedNode?.type === 'vendor' ? selectedNode.id : undefined;

        if (!resolvedProjectId && !resolvedVendorId) return undefined;

        const prefill: Partial<Bill> = {};
        if (resolvedProjectId) prefill.projectId = resolvedProjectId;
        if (resolvedVendorId) prefill.vendorId = resolvedVendorId;
        if (resolvedProjectId && resolvedVendorId) {
            prefill.issueDate = todayLocalYyyyMmDd();
        }
        return prefill;
    }, [projectContext, billToEdit, duplicateBillData, selectedNode, projectFilter]);

    const sidebarVendorForAdvance = useMemo(() => {
        if (!projectContext || selectedNode?.type !== 'vendor') return undefined;
        return vendorMap.get(selectedNode.id);
    }, [projectContext, selectedNode, vendorMap]);

    /** Project context for prepaid advance when a vendor folder is selected (parent project) or project filter applies. */
    const advancePrefillProjectId = useMemo(() => {
        if (!projectContext || selectedNode?.type !== 'vendor') return undefined;
        if (selectedNode.parentId && selectedNode.parentId !== 'unassigned') return selectedNode.parentId;
        if (projectFilter !== 'all') return projectFilter;
        return undefined;
    }, [projectContext, selectedNode, projectFilter]);

    const handleSendWhatsApp = useCallback((e: React.MouseEvent, bill: Bill) => {
        e.stopPropagation();
        const vendorId = bill.vendorId;
        const vendor = vendorId ? vendorMap.get(vendorId) : undefined;
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
            sendOrOpenWhatsApp(
                { contact: vendor, message, phoneNumber: vendor.contactNo },
                () => state.whatsAppMode,
                openChat
            );
        } catch (error) {
            showAlert(error instanceof Error ? error.message : 'Failed to open WhatsApp');
        }
    }, [vendorMap, showAlert, state, openChat]);

    return (
        <div className="flex flex-col h-full bg-app-bg p-4 sm:p-6 gap-4 sm:gap-6">
            {/* Header Section */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 flex-shrink-0">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-app-text tracking-tight">Project Bills & Payments</h1>
                    <p className="text-xs sm:text-sm text-app-muted mt-1">Manage vendor invoices, project expenses, and payment disbursements.</p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Button
                        variant="secondary"
                        onClick={() => {
                            dispatch({ type: 'SET_INITIAL_IMPORT_TYPE', payload: ImportType.PROJECT_BILLS });
                            dispatch({ type: 'SET_PAGE', payload: 'import' });
                        }}
                        className="!px-4 !py-2 !rounded-xl !text-sm"
                    >
                        <div className="w-4 h-4 mr-2 opacity-70">{ICONS.download}</div> Bulk Import
                    </Button>
                    {projectContext && (
                        <Button
                            variant="secondary"
                            disabled={!sidebarVendorForAdvance}
                            title={
                                sidebarVendorForAdvance
                                      ? `Record prepaid advance to ${sidebarVendorForAdvance.name}`
                                      : 'Select a vendor under Directories to record an advance.'
                            }
                            onClick={() => setIsAdvanceModalOpen(true)}
                            className="!px-4 !py-2 !rounded-xl !text-sm !border-ds-warning/40 !text-ds-warning hover:!bg-app-table-hover disabled:opacity-50"
                        >
                            <div className="w-4 h-4 mr-2">{ICONS.wallet}</div>
                            Supplier advance
                        </Button>
                    )}
                    <Button
                        onClick={() => { setDuplicateBillData(null); setBillToEdit(null); setIsCreateModalOpen(true); }}
                        className="!px-4 !py-2 !rounded-xl !text-sm"
                    >
                        <div className="w-4 h-4 mr-2">{ICONS.plus}</div> New Bill
                    </Button>
                </div>
            </div>

            {/* Top Control Bar */}
            <div className="bg-app-card p-3 rounded-xl border border-app-border shadow-ds-card flex flex-col md:flex-row gap-4 items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3 flex-1 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
                    {/* Search */}
                    <div className="relative min-w-[200px]">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-app-muted">
                            <div className="w-4 h-4">{ICONS.search}</div>
                        </div>
                        <input
                            type="text"
                            placeholder="Search bill #, vendor, project..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="ds-input-field pl-9 pr-4 py-1.5 w-full text-sm"
                        />
                        {searchQuery && (
                            <button onClick={() => setSearchQuery('')} className="absolute inset-y-0 right-0 flex items-center pr-2 text-app-muted hover:text-ds-danger">
                                <div className="w-4 h-4">{ICONS.x}</div>
                            </button>
                        )}
                    </div>

                    <div className="w-px h-6 bg-app-border hidden md:block"></div>

                    {/* Quick Filters */}
                    <Select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
                        className="!w-40 !py-1.5 !text-xs !font-medium"
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
                        className="!w-32 !py-1.5 !text-xs !font-medium"
                        hideIcon={true}
                    >
                        <option value="all">All Period</option>
                        <option value="thisMonth">This Month</option>
                        <option value="lastMonth">Last Month</option>
                        <option value="custom">Custom Range</option>
                    </Select>

                    {dateRange === 'custom' && (
                        <div className="flex items-center gap-2 animate-fade-in">
                            <DatePicker label="" value={startDate} onChange={(d) => handleCustomDateChange(toLocalDateString(d), endDate)} className="!py-1 !px-2 !text-xs !w-28" />
                            <span className="text-app-muted text-xs font-bold">-</span>
                            <DatePicker label="" value={endDate} onChange={(d) => handleCustomDateChange(startDate, toLocalDateString(d))} className="!py-1 !px-2 !text-xs !w-28" />
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto border-t md:border-t-0 md:border-l border-app-border pt-3 md:pt-0 pl-0 md:pl-3">
                    <span className="text-[10px] font-bold text-app-muted uppercase tracking-wider whitespace-nowrap">Project Scope:</span>
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
                            onClick={() => {
                                setBulkPayPresetSnapshot(Array.from(selectedBillIds));
                                setIsBulkPayModalOpen(true);
                            }}
                            className="animate-fade-in !py-1 !px-3 !text-xs !rounded-lg !shadow-sm whitespace-nowrap"
                        >
                            Record Payment ({selectedBillIds.size})
                        </Button>
                    )}
                </div>
            </div>

            {/* Main Content Area: same layout as Project Agreements */}
            <div ref={containerRef} className="flex-grow flex flex-col md:flex-row overflow-hidden min-h-0">
                {/* Left: Resizable Tree Sidebar (Directories style) */}
                <aside
                    className="hidden md:flex flex-col flex-shrink-0 bg-app-card rounded-xl border border-app-border shadow-ds-card overflow-hidden"
                    style={{ width: `${sidebarWidth}px` }}
                >
                    <div className="flex-shrink-0 p-3 border-b border-app-border bg-app-toolbar">
                        <span className="text-[10px] font-bold text-app-muted uppercase tracking-widest">Directories</span>
                    </div>
                    <div className="flex-shrink-0 px-2 pt-2 pb-1 border-b border-app-border">
                        <div className="relative">
                            <div className="absolute inset-y-0 left-2 flex items-center pointer-events-none text-app-muted">
                                <div className="w-3.5 h-3.5">{ICONS.search}</div>
                            </div>
                            <input
                                type="text"
                                placeholder="Search projects, vendors..."
                                value={treeSearchQuery}
                                onChange={(e) => setTreeSearchQuery(e.target.value)}
                                className="ds-input-field w-full pl-8 pr-6 py-1.5 text-xs"
                            />
                            {treeSearchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setTreeSearchQuery('')}
                                    className="absolute inset-y-0 right-2 flex items-center text-app-muted hover:text-ds-danger"
                                >
                                    <div className="w-3.5 h-3.5">{ICONS.x}</div>
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="flex-grow overflow-y-auto overflow-x-hidden p-2 min-h-0">
                        <BillTreeSidebar
                            nodes={filteredBillTreeData}
                            selectedId={selectedNode?.id ?? null}
                            selectedParentId={selectedNode?.parentId ?? null}
                            onSelect={(id, type, parentId) => setSelectedNode({ id, type, parentId })}
                            onViewVendor={handleViewVendor}
                        />
                    </div>
                </aside>

                {/* Resize Handle: same as Project Agreements */}
                <div
                    className="hidden md:flex items-center justify-center flex-shrink-0 w-2 cursor-col-resize select-none touch-none group hover:bg-ds-primary/10 transition-colors"
                    onMouseDown={startResizing}
                    title="Drag to resize sidebar"
                >
                    <div className="w-0.5 h-12 rounded-full bg-app-border group-hover:bg-ds-primary group-hover:w-1 transition-all" />
                </div>

                {/* Right Data Grid (Table) */}
                <div className="flex-1 min-w-0 overflow-hidden flex flex-col bg-app-card rounded-xl border border-app-border shadow-ds-card min-h-0">
                    <VirtualizedBillsTable
                        rows={filteredRows}
                        sortConfig={sortConfig}
                        onSort={handleSort}
                        selectedBillIds={selectedBillIds}
                        onToggleBillSelection={handleToggleBillSelection}
                        accountMap={accountMap}
                        vendorMap={vendorMap}
                        documents={state.documents}
                        showAlert={showAlert}
                        onEditBill={handleEdit}
                        onRecordPayment={handleRecordPayment}
                        onSendWhatsApp={handleSendWhatsApp}
                        onEditPayment={setTransactionToEdit}
                        onEditSettlement={handleEditSettlement}
                    />
                    {/* Compact Summary Footer */}
                    <div className="px-4 py-3 border-t border-app-border bg-app-toolbar flex justify-between items-center text-[10px] font-bold text-app-muted uppercase tracking-widest">
                        <div className="flex items-center gap-6">
                            <div className="flex items-center gap-2">
                                <span className="text-app-muted">Bills Total:</span>
                                <span className="text-app-text text-xs tabular-nums">
                                    {CURRENCY} {filteredRows.filter(r => r.type === 'bill').reduce((sum, r) => sum + (r.amount || 0), 0).toLocaleString()}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-app-muted">Payments:</span>
                                <span className="text-ds-success text-xs tabular-nums">
                                    {CURRENCY} {filteredRows.filter(r => r.type === 'payment').reduce((sum, r) => sum + (r.amount || 0), 0).toLocaleString()}
                                </span>
                            </div>
                            {filteredRows.some((r) => r.type === 'advance') && (
                                <div className="flex items-center gap-2">
                                    <span className="text-app-muted">Prepaid:</span>
                                    <span className="text-ds-warning text-xs tabular-nums">
                                        {CURRENCY}{' '}
                                        {filteredRows
                                            .filter((r) => r.type === 'advance')
                                            .reduce((sum, r) => sum + Math.max(0, r.balance || 0), 0)
                                            .toLocaleString()}{' '}
                                        <span className="font-normal text-app-muted lowercase">remaining (open advances)</span>
                                    </span>
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <span>Outstanding Balance:</span>
                            <span className="text-ds-danger text-xs tabular-nums">
                                {CURRENCY} {filteredRows.filter(r => r.type === 'bill').reduce((sum, r) => sum + (r.balance || 0), 0).toLocaleString()}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modals */}
            <Modal
                isOpen={isCreateModalOpen}
                onClose={() => { setIsCreateModalOpen(false); setBillToEdit(null); setDuplicateBillData(null); }}
                title={billToEdit ? "Edit Bill" : "New Project Bill"}
                size="xl"
                className="sm:!max-w-7xl"
            >
                <InvoiceBillForm
                    onClose={() => { setIsCreateModalOpen(false); setBillToEdit(null); setDuplicateBillData(null); }}
                    type="bill"
                    itemToEdit={billToEdit || undefined}
                    initialData={duplicateBillData || newBillContextPrefill || undefined}
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
                        date: paymentBill?.issueDate
                            ? parseStoredDateToYyyyMmDdInput(paymentBill.issueDate)
                            : toLocalDateString(new Date()),
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
                    if (warningModalState.transaction && isVendorSettlementCashMirrorReference(warningModalState.transaction.reference)) {
                        setWarningModalState({ isOpen: false, transaction: null, action: null });
                        showAlert(
                            'This ledger line mirrors a prepaid + bank settlement. Open the teal “Settlement” row for that bill in this list (full amount), then edit the split there.'
                        );
                        return;
                    }
                    if (warningModalState.transaction) dispatch({ type: 'DELETE_TRANSACTION', payload: warningModalState.transaction.id });
                    setWarningModalState({ isOpen: false, transaction: null, action: null });
                    showToast("Payment deleted successfully");
                }}
                action="delete"
                linkedItemName="this bill"
            />

            <BillBulkPaymentModal
                isOpen={isBulkPayModalOpen && !useVendorAdvancePayModal}
                onClose={closeBulkPayModal}
                selectedBills={selectedBillsList}
                onPaymentComplete={handleBulkPaymentComplete}
            />

            {bulkPayVendor && (
                <VendorBillPaymentModal
                    isOpen={isBulkPayModalOpen && useVendorAdvancePayModal}
                    onClose={closeBulkPayModal}
                    onPaymentSuccess={() => setSelectedBillIds(new Set())}
                    vendor={bulkPayVendor}
                    restrictToBillIds={restrictToBillIdsForVendorPay ?? undefined}
                    presetSelectedBillIds={bulkPayPresetSnapshot.length ? bulkPayPresetSnapshot : undefined}
                />
            )}

            {billForAdvancePay?.vendorId && vendorMap.get(billForAdvancePay.vendorId) && (
                <VendorBillPaymentModal
                    isOpen={isAdvancePayBillModalOpen}
                    onClose={closeAdvancePayBillModal}
                    vendor={vendorMap.get(billForAdvancePay.vendorId)!}
                    restrictToBillIds={restrictToBillIdsForSingleAdvancePay ?? undefined}
                    presetSelectedBillIds={singleAdvancePayPresetIds}
                />
            )}

            {vendorSettlementEdit && (
                <VendorBillPaymentModal
                    isOpen
                    onClose={() => setVendorSettlementEdit(null)}
                    onPaymentSuccess={() => setVendorSettlementEdit(null)}
                    vendor={vendorSettlementEdit.vendor}
                    editSettlement={vendorSettlementEdit.settlement}
                    restrictToBillIds={[vendorSettlementEdit.settlement.billId]}
                />
            )}

            {sidebarVendorForAdvance && (
                <RecordSupplierAdvanceModal
                    isOpen={isAdvanceModalOpen}
                    onClose={() => setIsAdvanceModalOpen(false)}
                    vendor={sidebarVendorForAdvance}
                    defaultProjectId={advancePrefillProjectId}
                />
            )}
        </div>
    );
};

export default BillsPage;