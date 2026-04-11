import React, { useState, useMemo, useEffect, useRef, useCallback, memo } from 'react';
import { useDispatchOnly, useStateSelector } from '../../hooks/useSelectiveState';
import { Invoice, InvoiceType, InvoiceStatus, Transaction, TransactionType, Bill, RecurringInvoiceTemplate } from '../../types';
import InvoiceBillForm from './InvoiceBillForm';
import BulkPaymentModal from './BulkPaymentModal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import { ICONS, CURRENCY } from '../../constants';
import Modal from '../ui/Modal';
import InvoiceTreeView, { TreeNode } from './InvoiceTreeView';
import RentalPaymentModal from './RentalPaymentModal';
import AssetPaymentModal from './AssetPaymentModal';
import TransactionForm from '../transactions/TransactionForm';
import TransactionItem from '../transactions/TransactionItem';
import LinkedTransactionWarningModal from '../transactions/LinkedTransactionWarningModal';
import { formatDate, toLocalDateString } from '../../utils/dateUtils';
import { useNotification } from '../../context/NotificationContext';
import ProjectFinancialGrid, { FinancialRecord } from './ProjectFinancialGrid';
import useLocalStorage from '../../hooks/useLocalStorage';
import ProjectInvoiceDetailView from './ProjectInvoiceDetailView';
import { ImportType } from '../../services/importService';
import { useDebounce } from '../../hooks/useDebounce';
import { buildLedgerPaidByInvoiceMap, getEffectivePaidForInvoice } from '../../utils/ledgerInvoicePayments';
import { isActiveInvoice } from '../../utils/invoiceActive';
import TreeExpandCollapseControls from '../ui/TreeExpandCollapseControls';
import { collectExpandableParentIds } from '../ui/treeExpandCollapseUtils';

interface InvoicesPageProps {
    invoiceTypeFilter?: InvoiceType;
    hideTitleAndGoBack?: boolean;
    showCreateButton?: boolean;
    onTreeSelectionChange?: (selection: { id: string; type: 'group' | 'subgroup' | 'invoice'; parentId?: string | null; groupBy: string } | null) => void;
}

type InvoiceTreeSelectionType = 'group' | 'subgroup' | 'invoice' | null;

type TreeSortConfig = { key: 'name' | 'balance'; direction: 'asc' | 'desc' };

const TreeSortIcon: React.FC<{ sortConfig: TreeSortConfig; column: 'name' | 'balance' }> = ({ sortConfig, column }) => {
    if (sortConfig.key !== column) return <span className="text-app-muted opacity-50 ml-1 text-[10px]">↕</span>;
    return <span className="text-primary ml-1 text-[10px]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
};

/** Label for the name column in tree sort: reflects what is being sorted (Owner, Unit, Tenant, or Property). */
function treeSortNameLabel(groupBy: 'tenant' | 'owner' | 'property', isRental: boolean): string {
    if (groupBy === 'owner') return 'Owner';
    if (groupBy === 'property') return isRental ? 'Property' : 'Unit';
    return isRental ? 'Tenant' : 'Entity';
}

/** Match treeData + payment matching: project from invoice, agreement, or unit (same as INSTALLMENT tree bucket). */
function resolveInstallmentInvoiceProjectId(
    inv: Invoice,
    projectAgreementMap: Map<string, { projectId?: string }>,
    unitMap: Map<string, { projectId?: string }>
): string | undefined {
    let pid = inv.projectId || (inv.agreementId ? projectAgreementMap.get(inv.agreementId)?.projectId : undefined);
    if (!pid && inv.unitId) {
        const u = unitMap.get(inv.unitId);
        if (u?.projectId) pid = u.projectId;
    }
    return pid;
}

/** Premium tree sidebar: Directories label, avatars, active state, chevron expand (same style as Project Agreements). Memoized to avoid re-renders when parent state unrelated to tree changes. */
const InvoiceTreeSidebar = memo<{
    nodes: TreeNode[];
    selectedId: string | null;
    selectedType: InvoiceTreeSelectionType;
    selectedParentId: string | null;
    onSelect: (id: string, type: 'group' | 'subgroup' | 'invoice', parentId?: string | null) => void;
    onContextMenu?: (node: TreeNode, event: React.MouseEvent) => void;
    groupBy?: 'tenant' | 'owner' | 'property';
    isRental?: boolean;
}>(({ nodes, selectedId, selectedType, selectedParentId, onSelect, onContextMenu, groupBy = 'owner', isRental = false }) => {
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

    const sortNodes = useCallback((items: TreeNode[]): TreeNode[] => {
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

    const handleExpandAll = useCallback(() => {
        setExpandedIds(new Set(expandableIds));
    }, [expandableIds]);

    const handleCollapseAll = useCallback(() => {
        setExpandedIds(new Set());
    }, []);

    const toggleExpanded = (id: string) => {
        // ... (existing toggleExpanded)
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const renderNode = (node: TreeNode, level: number, parentId?: string | null) => {
        // ... (existing renderNode logic)
        const hasChildren = node.children && node.children.length > 0;
        const isExpanded = expandedIds.has(node.id);
        const isSelected = selectedId === node.id && selectedType === node.type && (node.type === 'group' || selectedParentId === parentId);

        return (
            <div key={node.id} className={level > 0 ? 'ml-4 border-l border-app-border pl-3' : ''}>
                <div
                    className={`group flex items-center gap-2 py-1.5 px-2 rounded-lg -mx-0.5 transition-all duration-ds cursor-pointer border-l-[3px] ${isSelected
                        ? 'border-primary bg-app-table-selected text-app-text'
                        : 'border-transparent hover:bg-app-toolbar text-app-text'
                        }`}
                    onClick={() => onSelect(node.id, node.type, level > 0 ? parentId : undefined)}
                    onContextMenu={node.type === 'subgroup' && onContextMenu ? (e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(node, e); } : undefined}
                >
                    {hasChildren ? (
                        <button
                            onClick={(e) => { e.stopPropagation(); toggleExpanded(node.id); }}
                            className={`flex-shrink-0 w-5 h-5 flex items-center justify-center text-app-muted hover:text-primary transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                        >
                            <div className="w-3.5 h-3.5">{ICONS.chevronRight}</div>
                        </button>
                    ) : (
                        <span className="w-5 flex-shrink-0" />
                    )}
                    <span className="flex-1 text-xs font-medium truncate">{node.name}</span>
                    {node.balance > 0 && (
                        <span className={`text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-md border flex-shrink-0 ${isSelected ? 'border-transparent bg-primary text-ds-on-primary' : 'border-app-border bg-app-surface-2 text-ds-danger'}`}>
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
        return (
            <div className="text-xs text-app-muted italic p-2">No directories match your search</div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Sort Header: name = Owner/Unit/Tenant/Property per groupBy; balance = A/R */}
            <div className="flex items-center justify-between px-2 py-1.5 border-b border-app-border mb-1 bg-app-toolbar rounded-md gap-1">
                <button
                    onClick={() => handleSort('name')}
                    className="flex items-center text-[10px] font-bold text-app-muted uppercase tracking-wider hover:text-app-text transition-colors duration-ds"
                    title={`Sort by ${treeSortNameLabel(groupBy, isRental)} name`}
                >
                    {treeSortNameLabel(groupBy, isRental)} <TreeSortIcon sortConfig={sortConfig} column="name" />
                </button>
                <TreeExpandCollapseControls
                    variant="app"
                    onExpandAll={handleExpandAll}
                    onCollapseAll={handleCollapseAll}
                    visible={expandableIds.length > 0}
                />
                <button
                    onClick={() => handleSort('balance')}
                    className="flex items-center text-[10px] font-bold text-app-muted uppercase tracking-wider hover:text-app-text transition-colors duration-ds"
                    title="Sort by Account Receivable (outstanding amount)"
                >
                    A/R <TreeSortIcon sortConfig={sortConfig} column="balance" />
                </button>
            </div>

            <div className="space-y-0.5">
                {sortedNodes.map(node => renderNode(node, 0))}
            </div>
        </div>
    );
});

InvoiceTreeSidebar.displayName = 'InvoiceTreeSidebar';

const InvoicesPage: React.FC<InvoicesPageProps> = ({ invoiceTypeFilter, hideTitleAndGoBack, showCreateButton = true, onTreeSelectionChange }) => {
    const dispatch = useDispatchOnly();
    const invoices = useStateSelector(s => s.invoices);
    /** Exclude soft-deleted (PostgreSQL) so tree / totals match server after delete. */
    const activeInvoices = useMemo(() => invoices.filter(isActiveInvoice), [invoices]);
    const contacts = useStateSelector(s => s.contacts);
    const accounts = useStateSelector(s => s.accounts);
    const transactions = useStateSelector(s => s.transactions);
    const properties = useStateSelector(s => s.properties);
    const units = useStateSelector(s => s.units);
    const buildings = useStateSelector(s => s.buildings);
    const projects = useStateSelector(s => s.projects);
    const projectAgreements = useStateSelector(s => s.projectAgreements);
    const rentalAgreements = useStateSelector(s => s.rentalAgreements);
    const categories = useStateSelector(s => s.categories);
    const defaultProjectId = useStateSelector(s => s.defaultProjectId);
    const { showConfirm, showToast, showAlert } = useNotification();

    // Persistent View Settings
    const storageKeyPrefix = invoiceTypeFilter ? `invoices_${invoiceTypeFilter}` : 'invoices_all';

    const [statusFilter, setStatusFilter] = useLocalStorage<string>(`${storageKeyPrefix}_statusFilter`, 'All');
    const [groupBy, setGroupBy] = useLocalStorage<'tenant' | 'owner' | 'property'>(`${storageKeyPrefix}_groupBy`, invoiceTypeFilter === InvoiceType.RENTAL ? 'tenant' : 'owner');
    const [buildingFilter, setBuildingFilter] = useState<string>('all');
    // Default to "All Projects" for installment view so new agreement invoices are visible; otherwise default project can hide them
    const [projectFilter, setProjectFilter] = useState<string>(
        invoiceTypeFilter === InvoiceType.INSTALLMENT ? 'all' : (defaultProjectId || 'all')
    );
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearch = useDebounce(searchQuery, 300);

    // Sidebar: search filter for tree
    const [treeSearchQuery, setTreeSearchQuery] = useState('');

    // Sidebar Resizing: container-relative width (150–600px), same as Project Agreements
    const [sidebarWidth, setSidebarWidth] = useLocalStorage<number>(`${storageKeyPrefix}_sidebarWidth`, 280);
    const [isResizingSidebar, setIsResizingSidebar] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isBulkPayModalOpen, setIsBulkPayModalOpen] = useState(false);
    const [bulkPaymentInvoices, setBulkPaymentInvoices] = useState<Invoice[]>([]);

    // Payment Modal State
    const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [paymentMode, setPaymentMode] = useState<'cash' | 'asset' | null>(null); // For INSTALLMENT: cash vs asset

    // Invoice History & Detail View State
    const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);
    const [invoiceToEdit, setInvoiceToEdit] = useState<Invoice | null>(null);
    const [duplicateInvoiceData, setDuplicateInvoiceData] = useState<Partial<Invoice> | null>(null);
    const [transactionToEdit, setTransactionToEdit] = useState<Transaction | null>(null);
    const [warningModalState, setWarningModalState] = useState<{
        isOpen: boolean;
        transaction: Transaction | null;
        /** When deleting a bulk payment, the list of all transactions in the batch (so we delete all at once) */
        batchTransactions: Transaction[] | null;
        action: 'edit' | 'delete' | null;
    }>({ isOpen: false, transaction: null, batchTransactions: null, action: null });

    // Selection for Bulk Actions
    const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());
    const [treeFilter, setTreeFilter] = useState<{ id: string; type: 'group' | 'subgroup' | 'invoice'; parentId?: string | null } | null>(null);

    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{ node: TreeNode; x: number; y: number } | null>(null);
    const contextMenuRef = useRef<HTMLDivElement>(null);

    // Reset tree filter when grouping changes to avoid invalid state
    useEffect(() => {
        setTreeFilter(null);
    }, [groupBy, buildingFilter, projectFilter]);

    // Stable handler for tree selection so memoized InvoiceTreeSidebar gets consistent props
    const handleTreeSelect = useCallback((id: string, type: 'group' | 'subgroup' | 'invoice', parentId?: string | null) => {
        setTreeFilter(prev => {
            if (prev?.id === id && prev.type === type && (prev.parentId ?? null) === (parentId ?? null)) return null;
            return { id, type, parentId: parentId ?? null };
        });
    }, []);

    // Notify parent of tree selection changes
    useEffect(() => {
        if (onTreeSelectionChange) {
            if (treeFilter) {
                onTreeSelectionChange({ ...treeFilter, groupBy });
            } else {
                onTreeSelectionChange(null);
            }
        }
    }, [treeFilter, groupBy, onTreeSelectionChange]);

    // Close context menu on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
                setContextMenu(null);
            }
        };
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setContextMenu(null);
            }
        };
        if (contextMenu) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('keydown', handleEscape);
            return () => {
                document.removeEventListener('mousedown', handleClickOutside);
                document.removeEventListener('keydown', handleEscape);
            };
        }
    }, [contextMenu]);

    // --- Sidebar Resize: container-relative width to prevent jumping in nested layouts ---
    const handleMouseMoveSidebar = useCallback((e: MouseEvent) => {
        if (!containerRef.current) return;
        const containerLeft = containerRef.current.getBoundingClientRect().left;
        const newWidth = e.clientX - containerLeft;
        if (newWidth > 150 && newWidth < 600) {
            setSidebarWidth(newWidth);
        }
    }, [setSidebarWidth]);

    useEffect(() => {
        if (!isResizingSidebar) return;
        const handleUp = () => {
            setIsResizingSidebar(false);
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
    }, [isResizingSidebar, handleMouseMoveSidebar]);

    const startResizingSidebar = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsResizingSidebar(true);
    }, []);

    const buildingOptions = useMemo(() => [{ id: 'all', name: 'All Buildings' }, ...buildings], [buildings]);
    const projectOptions = useMemo(() => [{ id: 'all', name: 'All Projects' }, ...projects], [projects]);

    // O(1) lookup maps — declared early so they can be used in all downstream useMemos
    const contactMap = useMemo(() => new Map(contacts.map(c => [c.id, c])), [contacts]);
    const accountMap = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts]);
    const invoiceMap = useMemo(() => new Map(activeInvoices.map(i => [i.id, i])), [activeInvoices]);
    const propertyMap = useMemo(() => new Map(properties.map(p => [p.id, p])), [properties]);
    const unitMap = useMemo(() => new Map(units.map(u => [u.id, u])), [units]);
    const buildingMap = useMemo(() => new Map(buildings.map(b => [b.id, b])), [buildings]);
    const projectMap = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);
    const projectAgreementMap = useMemo(() => new Map(projectAgreements.map(pa => [pa.id, pa])), [projectAgreements]);

    const batchGroupMap = useMemo(() => {
        const map = new Map<string, Transaction[]>();
        transactions.forEach(tx => {
            if (tx.batchId) {
                let group = map.get(tx.batchId);
                if (!group) { group = []; map.set(tx.batchId, group); }
                group.push(tx);
            }
        });
        return map;
    }, [transactions]);

    /** INCOME sums per invoice (aligned with server recalculateInvoicePaymentAggregates); fixes A/R when invoice.paidAmount lags the ledger. */
    const ledgerPaidByInvoiceId = useMemo(() => buildLedgerPaidByInvoiceMap(transactions), [transactions]);

    // Resolve missing FK fields on the payment invoice from linked agreements
    // so payment transactions always carry correct project/unit/category data.
    const resolvedPaymentInvoice = useMemo(() => {
        if (!paymentInvoice) return null;
        let { projectId: pid, unitId: uid, categoryId: cid, buildingId: bid, propertyId: propId, contactId: ctId } = paymentInvoice;

        if (paymentInvoice.agreementId) {
            const pa = projectAgreementMap.get(paymentInvoice.agreementId);
            if (pa) {
                if (!pid) pid = pa.projectId;
                if (!uid && pa.unitIds?.length > 0) uid = pa.unitIds[0];
                if (!ctId) ctId = pa.clientId;
            }
            if (!pid && uid) {
                const u = unitMap.get(uid);
                if (u?.projectId) pid = u.projectId;
            }
        }
        if (!cid) {
            const catName = paymentInvoice.invoiceType === InvoiceType.INSTALLMENT ? 'Unit Selling Income'
                : paymentInvoice.invoiceType === InvoiceType.SERVICE_CHARGE ? 'Service Charge Income'
                : paymentInvoice.invoiceType === InvoiceType.RENTAL ? 'Rental Income'
                : null;
            if (catName) {
                const cat = categories.find(c => c.name === catName && c.type === TransactionType.INCOME);
                if (cat) cid = cat.id;
            }
        }

        return { ...paymentInvoice, projectId: pid, unitId: uid, categoryId: cid, buildingId: bid, propertyId: propId, contactId: ctId };
    }, [paymentInvoice, projectAgreementMap, unitMap, categories]);

    // --- Base Data Filtering (For Tree Structure) ---
    const baseInvoices = useMemo(() => {
        try {
            let filtered = activeInvoices;

            if (invoiceTypeFilter) {
                filtered = filtered.filter(inv => inv.invoiceType === invoiceTypeFilter);
            }

            if (statusFilter !== 'All') {
                filtered = filtered.filter(inv => inv.status === statusFilter);
            }

            if (invoiceTypeFilter === InvoiceType.RENTAL && buildingFilter !== 'all') {
                filtered = filtered.filter(inv => {
                    if (inv.buildingId === buildingFilter) return true;
                    const resolvedPropId = inv.propertyId || (inv.agreementId ? (() => { const ra = rentalAgreements.find(a => a.id === inv.agreementId); return ra?.propertyId; })() : undefined);
                    if (resolvedPropId) {
                        const prop = propertyMap.get(resolvedPropId);
                        return prop && prop.buildingId === buildingFilter;
                    }
                    return false;
                });
            } else if (invoiceTypeFilter === InvoiceType.INSTALLMENT && projectFilter !== 'all') {
                filtered = filtered.filter(inv => {
                    if (inv.projectId === projectFilter) return true;
                    if (inv.agreementId) {
                        const pa = projectAgreementMap.get(inv.agreementId);
                        if (pa?.projectId === projectFilter) return true;
                    }
                    return false;
                });
            }

            if (debouncedSearch) {
                const query = debouncedSearch.toLowerCase();
                filtered = filtered.filter(inv => {
                    if (inv.invoiceNumber.toLowerCase().includes(query)) return true;
                    if (contactMap.get(inv.contactId)?.name.toLowerCase().includes(query)) return true;
                    if (inv.description && inv.description.toLowerCase().includes(query)) return true;
                    if (inv.propertyId) {
                        const prop = propertyMap.get(inv.propertyId);
                        if (prop?.name.toLowerCase().includes(query)) return true;
                    }
                    if (inv.unitId) {
                        const unit = unitMap.get(inv.unitId);
                        if (unit?.name.toLowerCase().includes(query)) return true;
                    }
                    if (!inv.unitId && inv.agreementId) {
                        const pa = projectAgreementMap.get(inv.agreementId);
                        if (pa?.unitIds?.length) {
                            const unit = unitMap.get(pa.unitIds[0]);
                            if (unit?.name.toLowerCase().includes(query)) return true;
                        }
                    }
                    return false;
                });
            }

            return filtered;
        } catch (error) {
            console.error("Error filtering invoices:", error);
            return [];
        }
    }, [activeInvoices, contactMap, propertyMap, unitMap, invoiceTypeFilter, debouncedSearch, statusFilter, buildingFilter, projectFilter, projectAgreementMap, rentalAgreements]);

    // --- Final Data Filtering (For List View) ---
    const filteredInvoices = useMemo(() => {
        let filtered = baseInvoices;

        if (treeFilter) {
            if (treeFilter.type === 'group') {
                filtered = filtered.filter(inv => {
                    if (inv.projectId === treeFilter.id) return true;
                    if (inv.buildingId === treeFilter.id) return true;
                    if (inv.agreementId && projectAgreementMap.get(inv.agreementId)?.projectId === treeFilter.id) return true;
                    if (invoiceTypeFilter === InvoiceType.INSTALLMENT) {
                        const rp = resolveInstallmentInvoiceProjectId(inv, projectAgreementMap, unitMap);
                        if (rp === treeFilter.id) return true;
                    }
                    if (inv.propertyId) {
                        const prop = propertyMap.get(inv.propertyId);
                        if (prop && prop.buildingId === treeFilter.id) return true;
                    }
                    return false;
                });
            } else if (treeFilter.type === 'subgroup') {
                const parentId = treeFilter.parentId ?? null;
                if (invoiceTypeFilter === InvoiceType.RENTAL) {
                    filtered = filtered.filter(inv => {
                        const resolvedPropId = inv.propertyId || (inv.agreementId ? rentalAgreements.find(a => a.id === inv.agreementId)?.propertyId : undefined);
                        const invBuildingId = inv.buildingId || (resolvedPropId ? propertyMap.get(resolvedPropId)?.buildingId : undefined) || 'Unassigned';
                        const matchParent = parentId === null || invBuildingId === parentId;
                        if (!matchParent) return false;
                        if (groupBy === 'tenant') return inv.contactId === treeFilter.id;
                        if (groupBy === 'owner') {
                            const prop = propertyMap.get(resolvedPropId || '');
                            return prop && prop.ownerId === treeFilter.id;
                        }
                        if (groupBy === 'property') return resolvedPropId === treeFilter.id;
                        return false;
                    });
                } else if (invoiceTypeFilter === InvoiceType.INSTALLMENT) {
                    filtered = filtered.filter(inv => {
                        const resolvedProjId = resolveInstallmentInvoiceProjectId(inv, projectAgreementMap, unitMap);
                        const matchParent = parentId === null || resolvedProjId === parentId;
                        if (!matchParent) return false;
                        if (groupBy === 'owner') return inv.contactId === treeFilter.id;
                        if (groupBy === 'property') {
                            if (inv.unitId === treeFilter.id) return true;
                            if (!inv.unitId && inv.agreementId) {
                                const pa = projectAgreementMap.get(inv.agreementId);
                                if (pa?.unitIds?.includes(treeFilter.id)) return true;
                            }
                            return false;
                        }
                        return false;
                    });
                }
            } else if (treeFilter.type === 'invoice') {
                filtered = filtered.filter(inv => inv.id === treeFilter.id);
            }
        }

        return filtered.sort((a, b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime());
    }, [baseInvoices, treeFilter, invoiceTypeFilter, groupBy, propertyMap, projectAgreementMap, rentalAgreements, unitMap]);

    // --- Tree Data Construction ---
    const treeData = useMemo<TreeNode[]>(() => {
        try {
            const isRentalContext = invoiceTypeFilter === InvoiceType.RENTAL;
            const isProjectContext = invoiceTypeFilter === InvoiceType.INSTALLMENT;

            if (!isProjectContext && !isRentalContext) return [];

            const sourceInvoices = baseInvoices;

            if (isRentalContext) {
                const hierarchy: Record<string, { name: string, balance: number, count: number, subgroups: Record<string, { name: string, invoices: Invoice[], balance: number, count: number }> }> = {};

                sourceInvoices.forEach(inv => {
                    // Resolve propertyId with fallback from rental agreement
                    let resolvedPropertyId = inv.propertyId;
                    if (!resolvedPropertyId && inv.agreementId) {
                        const ra = rentalAgreements.find(a => a.id === inv.agreementId);
                        if (ra) resolvedPropertyId = ra.propertyId;
                    }

                    let buildingId = inv.buildingId;
                    if (!buildingId && resolvedPropertyId) {
                        const prop = propertyMap.get(resolvedPropertyId);
                        if (prop) buildingId = prop.buildingId;
                    }
                    if (!buildingId) buildingId = 'Unassigned';

                    const buildingName = buildingId === 'Unassigned'
                        ? 'Unassigned'
                        : buildingMap.get(buildingId)?.name || 'Unknown Building';

                    let subgroupId = 'Unassigned';
                    let subgroupName = 'Unassigned';

                    if (groupBy === 'tenant') {
                        subgroupId = inv.contactId || 'No-Contact';
                        subgroupName = contactMap.get(subgroupId)?.name || 'Unknown Tenant';
                    } else if (groupBy === 'owner') {
                        const prop = propertyMap.get(resolvedPropertyId || '');
                        subgroupId = prop?.ownerId || 'No-Owner';
                        subgroupName = contactMap.get(subgroupId)?.name || 'Unknown Owner';
                    } else if (groupBy === 'property') {
                        subgroupId = resolvedPropertyId || 'No-Property';
                        subgroupName = propertyMap.get(subgroupId)?.name || 'Unknown Unit';
                    }

                    const effectivePaidRental = ledgerPaidByInvoiceId.has(inv.id)
                        ? (ledgerPaidByInvoiceId.get(inv.id) || 0)
                        : (inv.paidAmount || 0);
                    const due = Math.max(0, inv.amount - effectivePaidRental);

                    if (!hierarchy[buildingId]) {
                        hierarchy[buildingId] = { name: buildingName, subgroups: {}, balance: 0, count: 0 };
                    }
                    if (!hierarchy[buildingId].subgroups[subgroupId]) {
                        hierarchy[buildingId].subgroups[subgroupId] = { name: subgroupName, invoices: [], balance: 0, count: 0 };
                    }

                    hierarchy[buildingId].subgroups[subgroupId].invoices.push(inv);
                    hierarchy[buildingId].balance += due;
                    hierarchy[buildingId].count += 1;
                    hierarchy[buildingId].subgroups[subgroupId].balance += due;
                    hierarchy[buildingId].subgroups[subgroupId].count += 1;
                });

                return Object.entries(hierarchy).map(([bId, bData]) => {
                    const children = Object.entries(bData.subgroups).map(([cId, cData]) => ({
                        id: cId,
                        name: cData.name,
                        type: 'subgroup' as const,
                        children: [],
                        invoices: [],
                        count: cData.count,
                        balance: cData.balance
                    }));

                    return {
                        id: bId,
                        name: bData.name,
                        type: 'group' as const,
                        children: children,
                        invoices: [],
                        count: bData.count,
                        balance: bData.balance
                    };
                });

            } else {
                const hierarchy: Record<string, { name: string, balance: number, count: number, subgroups: Record<string, { name: string, invoices: Invoice[], balance: number, count: number }> }> = {};

                sourceInvoices.forEach(inv => {
                    // Resolve projectId / unitId with fallback from linked agreement
                    let resolvedProjectId = inv.projectId;
                    let resolvedUnitId = inv.unitId;
                    if ((!resolvedProjectId || !resolvedUnitId) && inv.agreementId) {
                        const pa = projectAgreementMap.get(inv.agreementId);
                        if (pa) {
                            if (!resolvedProjectId) resolvedProjectId = pa.projectId;
                            if (!resolvedUnitId && pa.unitIds?.length > 0) resolvedUnitId = pa.unitIds[0];
                        }
                    }
                    if (!resolvedProjectId && resolvedUnitId) {
                        const u = unitMap.get(resolvedUnitId);
                        if (u?.projectId) resolvedProjectId = u.projectId;
                    }

                    const projectId = resolvedProjectId || 'Unassigned';
                    const projectName = projectId === 'Unassigned' ? 'Unassigned' : projectMap.get(projectId)?.name || 'Unknown Project';
                    const effectivePaid = ledgerPaidByInvoiceId.has(inv.id)
                        ? (ledgerPaidByInvoiceId.get(inv.id) || 0)
                        : (inv.paidAmount || 0);
                    const due = Math.max(0, inv.amount - effectivePaid);

                    let subgroupId = 'Unassigned';
                    let subgroupName = 'Unassigned';

                    if (groupBy === 'owner') {
                        subgroupId = inv.contactId || 'No-Client';
                        subgroupName = contactMap.get(subgroupId)?.name || 'Unknown Client';
                    } else if (groupBy === 'property') {
                        subgroupId = resolvedUnitId || 'No-Unit';
                        subgroupName = unitMap.get(subgroupId)?.name || 'General Project Invoice';
                    } else {
                        subgroupId = inv.contactId || 'No-Client';
                        subgroupName = contactMap.get(subgroupId)?.name || 'Unknown Client';
                    }

                    if (!hierarchy[projectId]) {
                        hierarchy[projectId] = { name: projectName, subgroups: {}, balance: 0, count: 0 };
                    }

                    if (!hierarchy[projectId].subgroups[subgroupId]) {
                        hierarchy[projectId].subgroups[subgroupId] = { name: subgroupName, invoices: [], balance: 0, count: 0 };
                    }

                    hierarchy[projectId].subgroups[subgroupId].invoices.push(inv);
                    hierarchy[projectId].balance += due;
                    hierarchy[projectId].count += 1;
                    hierarchy[projectId].subgroups[subgroupId].balance += due;
                    hierarchy[projectId].subgroups[subgroupId].count += 1;
                });

                return Object.entries(hierarchy).map(([pId, pData]) => {
                    const children = Object.entries(pData.subgroups).map(([cId, cData]) => ({
                        id: cId,
                        name: cData.name,
                        type: 'subgroup' as const,
                        children: [],
                        invoices: [],
                        count: cData.count,
                        balance: cData.balance
                    }));

                    return {
                        id: pId,
                        name: pData.name,
                        type: 'group' as const,
                        children: children,
                        invoices: [],
                        count: pData.count,
                        balance: pData.balance
                    };
                });
            }

        } catch (error) {
            console.error("Error building invoice tree:", error);
            return [];
        }

    }, [baseInvoices, invoiceTypeFilter, projectMap, buildingMap, propertyMap, unitMap, contactMap, groupBy, projectAgreementMap, rentalAgreements, ledgerPaidByInvoiceId]);

    // Filter tree by sidebar search (keeps node if name or any descendant matches)
    const filterInvoiceTree = useCallback((nodes: TreeNode[], q: string): TreeNode[] => {
        if (!q.trim()) return nodes;
        const lower = q.toLowerCase();
        return nodes
            .map(node => {
                const labelMatch = node.name.toLowerCase().includes(lower);
                const filteredChildren = node.children?.length ? filterInvoiceTree(node.children, q) : [];
                const childMatch = filteredChildren.length > 0;
                if (labelMatch && !filteredChildren.length) return node;
                if (childMatch) return { ...node, children: filteredChildren };
                if (labelMatch) return node;
                return null;
            })
            .filter((n): n is TreeNode => n != null);
    }, []);

    const filteredTreeData = useMemo(() => filterInvoiceTree(treeData, treeSearchQuery), [treeData, treeSearchQuery, filterInvoiceTree]);

    // --- Invoices without status filter (for payment visibility) ---
    // Build a set of invoice IDs that match all filters EXCEPT status filter
    // This ensures payments remain visible even if invoice status changes after payment
    const invoicesWithoutStatusFilter = useMemo(() => {
        try {
            let filtered = activeInvoices;

            if (invoiceTypeFilter) {
                filtered = filtered.filter(inv => inv.invoiceType === invoiceTypeFilter);
            }

            // NOTE: Skip status filter here - we want to include all statuses for payment matching

            if (invoiceTypeFilter === InvoiceType.RENTAL && buildingFilter !== 'all') {
                filtered = filtered.filter(inv => {
                    if (inv.buildingId === buildingFilter) return true;
                    if (inv.propertyId) {
                        const prop = properties.find(p => p.id === inv.propertyId);
                        return prop && prop.buildingId === buildingFilter;
                    }
                    return false;
                });
            } else if (invoiceTypeFilter === InvoiceType.INSTALLMENT && projectFilter !== 'all') {
                filtered = filtered.filter(inv => {
                    if (inv.projectId === projectFilter) return true;
                    if (inv.agreementId) {
                        const pa = projectAgreementMap.get(inv.agreementId);
                        if (pa?.projectId === projectFilter) return true;
                    }
                    return false;
                });
            }

            if (debouncedSearch) {
                const query = debouncedSearch.toLowerCase();
                filtered = filtered.filter(inv => {
                    if (inv.invoiceNumber.toLowerCase().includes(query)) return true;
                    if (contactMap.get(inv.contactId)?.name.toLowerCase().includes(query)) return true;
                    if (inv.description && inv.description.toLowerCase().includes(query)) return true;
                    if (inv.propertyId) {
                        const prop = propertyMap.get(inv.propertyId);
                        if (prop?.name.toLowerCase().includes(query)) return true;
                    }
                    if (inv.unitId) {
                        const unit = unitMap.get(inv.unitId);
                        if (unit?.name.toLowerCase().includes(query)) return true;
                    }
                    if (!inv.unitId && inv.agreementId) {
                        const pa = projectAgreementMap.get(inv.agreementId);
                        if (pa?.unitIds?.length) {
                            const unit = unitMap.get(pa.unitIds[0]);
                            if (unit?.name.toLowerCase().includes(query)) return true;
                        }
                    }
                    return false;
                });
            }

            if (treeFilter) {
                if (treeFilter.type === 'group') {
                    filtered = filtered.filter(inv => {
                        if (inv.projectId === treeFilter.id) return true;
                        if (inv.buildingId === treeFilter.id) return true;
                        if (inv.agreementId && projectAgreementMap.get(inv.agreementId)?.projectId === treeFilter.id) return true;
                        if (invoiceTypeFilter === InvoiceType.INSTALLMENT) {
                            const rp = resolveInstallmentInvoiceProjectId(inv, projectAgreementMap, unitMap);
                            if (rp === treeFilter.id) return true;
                        }
                        if (inv.propertyId) {
                            const prop = propertyMap.get(inv.propertyId);
                            if (prop && prop.buildingId === treeFilter.id) return true;
                        }
                        return false;
                    });
                } else if (treeFilter.type === 'subgroup') {
                    const parentId = treeFilter.parentId ?? null;
                    if (invoiceTypeFilter === InvoiceType.RENTAL) {
                        filtered = filtered.filter(inv => {
                            const resolvedPropId = inv.propertyId || (inv.agreementId ? rentalAgreements.find(a => a.id === inv.agreementId)?.propertyId : undefined);
                            const invBuildingId = inv.buildingId || (resolvedPropId ? propertyMap.get(resolvedPropId)?.buildingId : undefined) || 'Unassigned';
                            const matchParent = parentId === null || invBuildingId === parentId;
                            if (!matchParent) return false;
                            if (groupBy === 'tenant') return inv.contactId === treeFilter.id;
                            if (groupBy === 'owner') {
                                const prop = propertyMap.get(resolvedPropId || '');
                                return prop && prop.ownerId === treeFilter.id;
                            }
                            if (groupBy === 'property') return resolvedPropId === treeFilter.id;
                            return false;
                        });
                    } else if (invoiceTypeFilter === InvoiceType.INSTALLMENT) {
                        filtered = filtered.filter(inv => {
                            const resolvedProjId = resolveInstallmentInvoiceProjectId(inv, projectAgreementMap, unitMap);
                            const matchParent = parentId === null || resolvedProjId === parentId;
                            if (!matchParent) return false;
                            if (groupBy === 'owner') return inv.contactId === treeFilter.id;
                            if (groupBy === 'property') {
                                if (inv.unitId === treeFilter.id) return true;
                                if (!inv.unitId && inv.agreementId) {
                                    const pa = projectAgreementMap.get(inv.agreementId);
                                    if (pa?.unitIds?.includes(treeFilter.id)) return true;
                                }
                                return false;
                            }
                            return false;
                        });
                    }
                } else if (treeFilter.type === 'invoice') {
                    filtered = filtered.filter(inv => inv.id === treeFilter.id);
                }
            }

            return filtered;
        } catch (error) {
            console.error("Error filtering invoices without status filter:", error);
            return [];
        }
    }, [activeInvoices, contactMap, propertyMap, unitMap, projectAgreementMap, rentalAgreements, invoiceTypeFilter, debouncedSearch, buildingFilter, projectFilter, treeFilter, groupBy]);

    // --- Combined Financial Records for Grid View ---
    const financialRecords = useMemo<FinancialRecord[]>(() => {
        const records: FinancialRecord[] = [];
        const relevantInvoices = filteredInvoices;
        const invoiceIdSet = new Set(invoicesWithoutStatusFilter.map(i => i.id));

        relevantInvoices.forEach(inv => {
            const contact = contactMap.get(inv.contactId);
            const effPaid = ledgerPaidByInvoiceId.has(inv.id)
                ? (ledgerPaidByInvoiceId.get(inv.id) || 0)
                : (inv.paidAmount || 0);
            records.push({
                id: inv.id,
                type: 'Invoice',
                reference: inv.invoiceNumber,
                date: inv.issueDate,
                accountName: contact?.name || 'Unknown Client',
                amount: inv.amount,
                remainingAmount: inv.amount - effPaid,
                raw: inv,
                status: inv.status
            });
        });

        const processedBatchIds = new Set<string>();

        transactions.forEach(tx => {
            if (tx.type !== TransactionType.INCOME) return;
            if (!tx.invoiceId || !invoiceIdSet.has(tx.invoiceId)) return;

            if (tx.batchId) {
                if (processedBatchIds.has(tx.batchId)) return;

                const batchTxs = batchGroupMap.get(tx.batchId) || [tx];
                const totalAmount = batchTxs.reduce((sum, t) => sum + t.amount, 0);
                const account = accountMap.get(tx.accountId || '');

                records.push({
                    id: `batch-${tx.batchId}`,
                    type: 'Payment (Bulk)',
                    reference: `${batchTxs.length} Items`,
                    date: tx.date,
                    accountName: account?.name || 'Unknown Account',
                    amount: totalAmount,
                    remainingAmount: 0,
                    raw: {
                        ...tx,
                        amount: totalAmount,
                        description: `Bulk Payment (${batchTxs.length})`,
                        children: batchTxs.map(t => ({
                            ...t,
                            invoiceNumber: invoiceMap.get(t.invoiceId || '')?.invoiceNumber
                        }))
                    } as Transaction & { children?: Array<Transaction & { invoiceNumber?: string }> },
                    status: 'Paid'
                });

                processedBatchIds.add(tx.batchId);
            } else {
                const inv = invoiceMap.get(tx.invoiceId || '');
                const account = accountMap.get(tx.accountId || '');

                records.push({
                    id: tx.id,
                    type: 'Payment',
                    reference: inv?.invoiceNumber || '',
                    date: tx.date,
                    accountName: account?.name || 'Unknown Account',
                    amount: tx.amount,
                    remainingAmount: 0,
                    raw: tx,
                    status: 'Paid'
                });
            }
        });

        return records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [filteredInvoices, transactions, contactMap, accountMap, invoiceMap, batchGroupMap, invoicesWithoutStatusFilter, ledgerPaidByInvoiceId]);

    // Summary for cards: money totals use the same directory scope as the tree + project/search + payment rows (omit
    // status filter) so Total Received / Billed / Outstanding stay correct when Status is not "All". Invoice & unit
    // counts follow the table (filteredInvoices) so they match visible rows.
    const invoiceSummaryStats = useMemo(() => {
        const scope = invoicesWithoutStatusFilter;
        const totalBilled = scope.reduce((sum, inv) => sum + inv.amount, 0);
        const totalReceived = scope.reduce((sum, inv) => {
            const paid = ledgerPaidByInvoiceId.has(inv.id)
                ? (ledgerPaidByInvoiceId.get(inv.id) || 0)
                : (inv.paidAmount || 0);
            return sum + paid;
        }, 0);
        const totalOutstanding = scope.reduce((sum, inv) => {
            const paid = ledgerPaidByInvoiceId.has(inv.id)
                ? (ledgerPaidByInvoiceId.get(inv.id) || 0)
                : (inv.paidAmount || 0);
            return sum + Math.max(0, inv.amount - paid);
        }, 0);
        const totalInvoices = filteredInvoices.length;
        const uniqueUnitIds = new Set(filteredInvoices.map(inv => inv.unitId).filter(Boolean));
        return { totalBilled, totalReceived, totalOutstanding, totalInvoices, totalUnits: uniqueUnitIds.size };
    }, [invoicesWithoutStatusFilter, filteredInvoices, ledgerPaidByInvoiceId]);

    const toggleSelection = (id: string) => {
        setSelectedInvoiceIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleRecordPayment = (item: any) => {
        const invoice = item as Invoice;
        setViewInvoice(null);
        setPaymentInvoice(invoice);
        setIsPaymentModalOpen(true);
    };

    const handleInvoiceClick = (item: Invoice | Bill) => {
        if ('invoiceNumber' in item) {
            setViewInvoice(item as Invoice);
        }
    };

    const handleEditInvoiceFromDetail = (invoice: Invoice) => {
        setInvoiceToEdit(invoice);
        setViewInvoice(null);
    };

    const handleDuplicateInvoice = (data: Partial<Invoice>) => {
        const { id, paidAmount, status, ...rest } = data as any;
        setDuplicateInvoiceData({ ...rest, paidAmount: 0, status: undefined });
        setInvoiceToEdit(null);
        setIsCreateModalOpen(true);
    };

    const handleShowDeleteWarning = (tx: Transaction) => {
        const raw = tx as Transaction & { batchId?: string; children?: Transaction[] };
        const isBulk = !!raw.batchId && Array.isArray(raw.children) && raw.children.length > 0;
        setWarningModalState({
            isOpen: true,
            transaction: tx,
            batchTransactions: isBulk ? raw.children! : null,
            action: 'delete',
        });
    };

    const handleConfirmWarning = () => {
        const { transaction, batchTransactions, action } = warningModalState;
        if (action === 'delete') {
            if (batchTransactions && batchTransactions.length > 0) {
                const projectAssetId = batchTransactions[0]?.projectAssetId ?? batchTransactions.find(t => t.projectAssetId)?.projectAssetId;
                dispatch({
                    type: 'BATCH_DELETE_TRANSACTIONS',
                    payload: {
                        transactionIds: batchTransactions.map(t => t.id),
                        projectAssetIdToDelete: projectAssetId || undefined,
                    },
                });
                showToast(
                    projectAssetId
                        ? `Bulk payment reversed and asset record removed. ${batchTransactions.length} transaction(s) deleted.`
                        : `Bulk payment reversed. ${batchTransactions.length} transaction(s) deleted.`,
                    'info'
                );
            } else if (transaction) {
                dispatch({ type: 'DELETE_TRANSACTION', payload: transaction.id });
                showToast('Payment reversed.', 'info');
            }
        }
        setWarningModalState({ isOpen: false, transaction: null, batchTransactions: null, action: null });
        setTransactionToEdit(null);
    };

    const handleDeleteInvoice = async (invoice: Invoice) => {
        if (!invoice) return;
        if (invoice.paidAmount > 0) {
            await showAlert('This invoice has payments recorded. Please delete the payments first.', { title: 'Cannot Delete' });
            return;
        }
        const confirmed = await showConfirm(`Are you sure you want to delete Invoice #${invoice.invoiceNumber}?`, { title: 'Delete Invoice', confirmLabel: 'Delete', cancelLabel: 'Cancel' });
        if (confirmed) {
            dispatch({ type: 'DELETE_INVOICE', payload: invoice.id });
            setViewInvoice(null);
            showToast('Invoice deleted successfully', 'info');
        }
    };

    const handleBulkPaymentComplete = () => {
        setSelectedInvoiceIds(new Set());
        setIsBulkPayModalOpen(false);
    };

    const getLinkedItemName = (tx: Transaction | null): string => {
        if (!tx) return '';
        const raw = tx as Transaction & { batchId?: string; children?: Transaction[] };
        if (raw.batchId && Array.isArray(raw.children) && raw.children.length > 0) {
            return `a bulk payment (${raw.children.length} transactions)`;
        }
        if (tx.invoiceId) return 'an Invoice';
        if (tx.billId) return 'a Bill';
        return 'linked item';
    };

    // Context Menu Handlers
    const handleContextMenu = useCallback((node: TreeNode, event: React.MouseEvent) => {
        event.preventDefault();
        setContextMenu({
            node,
            x: event.clientX,
            y: event.clientY
        });
    }, []);

    const handleReceivePayment = useCallback(() => {
        if (!contextMenu) return;

        const { node } = contextMenu;

        // Start with all invoices of the current type (don't use baseInvoices as it may have status filter applied)
        let candidateInvoices = invoiceTypeFilter
            ? activeInvoices.filter(inv => inv.invoiceType === invoiceTypeFilter)
            : activeInvoices;

        // Apply building/project filter if applicable
        if (invoiceTypeFilter === InvoiceType.RENTAL && buildingFilter !== 'all') {
            candidateInvoices = candidateInvoices.filter(inv => {
                if (inv.buildingId === buildingFilter) return true;
                if (inv.propertyId) {
                    const prop = properties.find(p => p.id === inv.propertyId);
                    return prop && prop.buildingId === buildingFilter;
                }
                return false;
            });
        } else if (invoiceTypeFilter === InvoiceType.INSTALLMENT && projectFilter !== 'all') {
            candidateInvoices = candidateInvoices.filter(inv => {
                if (inv.projectId === projectFilter) return true;
                if (inv.agreementId) {
                    const pa = projectAgreements.find(a => a.id === inv.agreementId);
                    if (pa?.projectId === projectFilter) return true;
                }
                return false;
            });
        }

        const isOpen = (inv: Invoice) =>
            (inv.status === InvoiceStatus.UNPAID || inv.status === InvoiceStatus.PARTIALLY_PAID || inv.status === InvoiceStatus.OVERDUE) &&
            (inv.amount - inv.paidAmount) > 0;

        let openInvoices: Invoice[] = [];

        if (invoiceTypeFilter === InvoiceType.RENTAL) {
            if (groupBy === 'tenant') {
                openInvoices = candidateInvoices.filter(inv => inv.contactId === node.id && isOpen(inv));
            } else if (groupBy === 'owner') {
                openInvoices = candidateInvoices.filter(inv => {
                    const prop = properties.find(p => p.id === inv.propertyId);
                    return prop && prop.ownerId === node.id && isOpen(inv);
                });
            } else if (groupBy === 'property') {
                openInvoices = candidateInvoices.filter(inv => inv.propertyId === node.id && isOpen(inv));
            }
        } else if (invoiceTypeFilter === InvoiceType.INSTALLMENT) {
            if (groupBy === 'owner') {
                openInvoices = candidateInvoices.filter(inv => inv.contactId === node.id && isOpen(inv));
            } else if (groupBy === 'property') {
                openInvoices = candidateInvoices.filter(inv => {
                    if (!isOpen(inv)) return false;
                    if (inv.unitId === node.id) return true;
                    if (!inv.unitId && inv.agreementId) {
                        const pa = projectAgreements.find(a => a.id === inv.agreementId);
                        if (pa?.unitIds?.includes(node.id)) return true;
                    }
                    return false;
                });
            }
        }

        if (openInvoices.length === 0) {
            showAlert(`No open invoices found for ${node.name}.`, { title: 'No Invoices' });
            setContextMenu(null);
            return;
        }

        // Open bulk payment modal with these invoices
        setBulkPaymentInvoices(openInvoices);
        setIsBulkPayModalOpen(true);
        setContextMenu(null);
    }, [contextMenu, activeInvoices, invoiceTypeFilter, groupBy, properties, projectAgreements, buildingFilter, projectFilter, showAlert]);

    const handleCreateInvoice = useCallback(() => {
        if (!contextMenu) return;

        const { node } = contextMenu;
        // Open create invoice modal with prepopulated contact
        setPrepopulatedContactId(node.id);
        setIsCreateModalOpen(true);
        setContextMenu(null);
    }, [contextMenu]);

    // State for prepopulated contact when creating invoice from context menu
    const [prepopulatedContactId, setPrepopulatedContactId] = useState<string | undefined>(undefined);

    const selectedInvoicesList = useMemo(() =>
        activeInvoices.filter(inv => selectedInvoiceIds.has(inv.id)),
        [activeInvoices, selectedInvoiceIds]);

    const supportsTreeView = invoiceTypeFilter === InvoiceType.INSTALLMENT || invoiceTypeFilter === InvoiceType.RENTAL;
    const isRental = invoiceTypeFilter === InvoiceType.RENTAL;
    const isProject = invoiceTypeFilter === InvoiceType.INSTALLMENT;

    const filterInputClass = "ds-input-field w-full pl-3 py-2 text-sm rounded-lg";

    return (
        <div className="flex flex-col h-full bg-background p-4 sm:p-6 gap-4 sm:gap-6">
            {/* Summary cards: project selling invoice tab — same behaviour as Agreements (building/owner/unit scope) */}
            {isProject && (
                <div className="flex-shrink-0 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                    <div className="bg-app-card rounded-xl border border-app-border shadow-ds-card p-3 transition-shadow duration-ds">
                        <p className="text-[10px] font-semibold text-app-muted uppercase tracking-wider">Total Billed</p>
                        <p className="text-lg font-bold text-app-text tabular-nums mt-0.5">{CURRENCY} {invoiceSummaryStats.totalBilled.toLocaleString()}</p>
                    </div>
                    <div className="bg-app-card rounded-xl border border-app-border shadow-ds-card p-3 transition-shadow duration-ds">
                        <p className="text-[10px] font-semibold text-app-muted uppercase tracking-wider">Total Received</p>
                        <p className="text-lg font-bold text-ds-success tabular-nums mt-0.5">{CURRENCY} {invoiceSummaryStats.totalReceived.toLocaleString()}</p>
                    </div>
                    <div className="bg-app-card rounded-xl border border-app-border shadow-ds-card p-3 transition-shadow duration-ds">
                        <p className="text-[10px] font-semibold text-app-muted uppercase tracking-wider">Total Outstanding</p>
                        <p className="text-lg font-bold text-primary tabular-nums mt-0.5">{CURRENCY} {invoiceSummaryStats.totalOutstanding.toLocaleString()}</p>
                    </div>
                    <div className="bg-app-card rounded-xl border border-app-border shadow-ds-card p-3 transition-shadow duration-ds">
                        <p className="text-[10px] font-semibold text-app-muted uppercase tracking-wider">Total Invoices</p>
                        <p className="text-lg font-bold text-app-text tabular-nums mt-0.5">{invoiceSummaryStats.totalInvoices}</p>
                    </div>
                    <div className="bg-app-card rounded-xl border border-app-border shadow-ds-card p-3 col-span-2 sm:col-span-1 transition-shadow duration-ds">
                        <p className="text-[10px] font-semibold text-app-muted uppercase tracking-wider">Units</p>
                        <p className="text-lg font-bold text-app-text tabular-nums mt-0.5">{invoiceSummaryStats.totalUnits}</p>
                    </div>
                </div>
            )}

            {!hideTitleAndGoBack && (
                <div className="flex flex-col gap-4 flex-shrink-0">
                    <div className="flex justify-between items-start">
                        <div>
                            <h1 className="text-xl sm:text-2xl font-bold text-app-text tracking-tight">Invoices & Payments</h1>
                            <p className="text-xs sm:text-sm text-app-muted mt-1">Track billings, payments, and financial status across projects</p>
                        </div>
                    </div>

                    {/* Top Control Bar */}
                    <div className="bg-app-card p-3 rounded-xl border border-app-border shadow-ds-card flex flex-col md:flex-row gap-4 items-center justify-between transition-shadow duration-ds">
                        <div className="flex items-center gap-3 flex-1 w-full md:w-auto min-w-0 flex-wrap md:flex-nowrap pb-1 md:pb-0">
                            {/* Search */}
                            <div className="relative min-w-[200px]">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-app-muted">
                                    <div className="w-4 h-4">{ICONS.search}</div>
                                </div>
                                <input
                                    type="text"
                                    placeholder="Search references..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="ds-input-field pl-9 pr-4 py-1.5 w-full text-sm rounded-lg placeholder:text-app-muted"
                                />
                                {searchQuery && (
                                    <button onClick={() => setSearchQuery('')} className="absolute inset-y-0 right-0 flex items-center pr-2 text-app-muted hover:text-ds-danger">
                                        <div className="w-4 h-4">{ICONS.x}</div>
                                    </button>
                                )}
                            </div>

                            <div className="w-px h-6 bg-app-border hidden md:block"></div>

                            {/* Filters based on Context */}
                            {isRental && (
                                <Select
                                    value={buildingFilter}
                                    onChange={(e) => setBuildingFilter(e.target.value)}
                                    className="!w-40 !py-1.5 !text-sm !border-app-border !bg-app-surface-2 !text-app-text"
                                    hideIcon={true}
                                >
                                    <option value="all">All Buildings</option>
                                    {buildingOptions.map(b => (
                                        <option key={b.id} value={b.id}>{b.name}</option>
                                    ))}
                                </Select>
                            )}

                            {isProject && (
                                <Select
                                    value={projectFilter}
                                    onChange={(e) => setProjectFilter(e.target.value)}
                                    className="!w-40 !py-1.5 !text-sm !border-app-border !bg-app-surface-2 !text-app-text"
                                    hideIcon={true}
                                >
                                    <option value="all">All Projects</option>
                                    {projectOptions.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </Select>
                            )}

                            <Select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="!w-32 !py-1.5 !text-sm !border-app-border !bg-app-surface-2 !text-app-text"
                                hideIcon={true}
                            >
                                <option value="All">All Status</option>
                                <option value={InvoiceStatus.UNPAID}>Unpaid</option>
                                <option value={InvoiceStatus.PARTIALLY_PAID}>Partially</option>
                                <option value={InvoiceStatus.PAID}>Paid</option>
                                <option value={InvoiceStatus.OVERDUE}>Overdue</option>
                                <option value={InvoiceStatus.DRAFT}>Draft</option>
                            </Select>
                        </div>

                        <div className="flex items-center gap-3 w-full md:w-auto border-t md:border-t-0 md:border-l border-app-border pt-3 md:pt-0 pl-0 md:pl-3">
                            <span className="text-xs font-semibold text-app-muted uppercase tracking-wider whitespace-nowrap">Group By:</span>
                            <div className="ds-segment-track flex gap-0.5">
                                {(isRental ? ['tenant', 'owner', 'property'] : ['owner', 'property']).map((opt) => (
                                    <button
                                        key={opt}
                                        type="button"
                                        onClick={() => setGroupBy(opt as any)}
                                        className={`ds-segment-item px-3 py-1 text-xs font-medium rounded-md capitalize transition-all duration-ds ${groupBy === opt
                                            ? 'ds-segment-item-active shadow-sm'
                                            : 'text-app-muted hover:text-app-text'
                                            }`}
                                    >
                                        {opt}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div ref={containerRef} className={`flex-grow flex flex-col md:flex-row overflow-hidden min-h-0 ${hideTitleAndGoBack ? 'pt-2' : ''}`}>
                {/* Left: Resizable Tree Sidebar (same layout as Project Agreements) */}
                {supportsTreeView && (
                    <>
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
                                        placeholder="Search projects, owners, units..."
                                        value={treeSearchQuery}
                                        onChange={(e) => setTreeSearchQuery(e.target.value)}
                                        className="ds-input-field w-full pl-8 pr-6 py-1.5 text-xs rounded-lg placeholder:text-app-muted"
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
                            <div className="flex-shrink-0 px-3 py-2 border-b border-app-border bg-app-toolbar">
                                <span className="text-[10px] font-semibold text-app-muted uppercase tracking-wider">Group by</span>
                                <div className="ds-segment-track flex gap-0.5 mt-1.5">
                                    {(isRental ? ['tenant', 'owner', 'property'] : ['owner', 'property']).map((opt) => (
                                        <button
                                            key={opt}
                                            type="button"
                                            onClick={() => setGroupBy(opt as 'tenant' | 'owner' | 'property')}
                                            className={`ds-segment-item flex-1 px-2 py-1.5 text-xs font-medium rounded-md capitalize transition-all duration-ds ${groupBy === opt
                                                ? 'ds-segment-item-active shadow-sm font-semibold'
                                                : 'text-app-muted hover:text-app-text'
                                                }`}
                                        >
                                            {opt === 'property' && isRental ? 'Property' : opt === 'property' ? 'Unit' : opt}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="flex-grow overflow-y-auto overflow-x-hidden p-2 min-h-0">
                                <InvoiceTreeSidebar
                                    nodes={filteredTreeData}
                                    selectedId={treeFilter?.id ?? null}
                                    selectedType={treeFilter?.type ?? null}
                                    selectedParentId={treeFilter?.parentId ?? null}
                                    onSelect={handleTreeSelect}
                                    onContextMenu={handleContextMenu}
                                    groupBy={groupBy}
                                    isRental={invoiceTypeFilter === InvoiceType.RENTAL}
                                />
                            </div>
                        </aside>

                        {/* Resize Handle: larger hit area, col-resize, hover highlight (same as Project Agreements) */}
                        <div
                            className="hidden md:flex items-center justify-center flex-shrink-0 w-2 cursor-col-resize select-none touch-none group hover:bg-blue-500/10 transition-colors"
                            onMouseDown={startResizingSidebar}
                            title="Drag to resize sidebar"
                        >
                            <div className="w-0.5 h-12 rounded-full bg-slate-200 group-hover:bg-blue-500 group-hover:w-1 transition-all" />
                        </div>
                    </>
                )}

                {/* List Area: flex-1 min-w-0 to avoid horizontal scroll */}
                <div className="flex-1 min-w-0 overflow-hidden min-h-0 flex flex-col">
                    <ProjectFinancialGrid
                        records={financialRecords}
                        invoicePaymentTypeFilter={invoiceTypeFilter === InvoiceType.INSTALLMENT}
                        onInvoiceClick={handleInvoiceClick}
                        onPaymentClick={(tx) => setTransactionToEdit(tx)}
                        selectedIds={selectedInvoiceIds}
                        onToggleSelect={toggleSelection}
                        onNewClick={() => setIsCreateModalOpen(true)}
                        onBulkImportClick={() => {
                            dispatch({ type: 'SET_INITIAL_IMPORT_TYPE', payload: ImportType.INVOICES });
                            dispatch({ type: 'SET_PAGE', payload: 'import' });
                        }}
                        showButtons={showCreateButton}
                        onBulkPaymentClick={() => setIsBulkPayModalOpen(true)}
                        selectedCount={selectedInvoiceIds.size}
                        onEditInvoice={handleEditInvoiceFromDetail}
                        onDeleteInvoice={handleDeleteInvoice}
                        onReceivePayment={handleRecordPayment}
                        onEditPayment={(tx) => setTransactionToEdit(tx)}
                        onDeletePayment={handleShowDeleteWarning}
                    />
                </div>
            </div>

            <Modal isOpen={isCreateModalOpen} onClose={() => { setIsCreateModalOpen(false); setPrepopulatedContactId(undefined); setDuplicateInvoiceData(null); }} title={duplicateInvoiceData ? "Duplicate Invoice" : "Create New Invoice"}>
                <InvoiceBillForm
                    onClose={() => { setIsCreateModalOpen(false); setPrepopulatedContactId(undefined); setDuplicateInvoiceData(null); }}
                    type="invoice"
                    invoiceTypeForNew={invoiceTypeFilter}
                    initialContactId={prepopulatedContactId}
                    initialData={duplicateInvoiceData || undefined}
                />
            </Modal>

            <BulkPaymentModal
                isOpen={isBulkPayModalOpen}
                onClose={() => { setIsBulkPayModalOpen(false); setBulkPaymentInvoices([]); }}
                selectedInvoices={bulkPaymentInvoices.length > 0 ? bulkPaymentInvoices : selectedInvoicesList}
                onPaymentComplete={() => {
                    handleBulkPaymentComplete();
                    setBulkPaymentInvoices([]);
                }}
            />

            {/* Individual Payment Modals */}
            {paymentInvoice?.invoiceType === InvoiceType.RENTAL ? (
                <RentalPaymentModal
                    isOpen={isPaymentModalOpen}
                    onClose={() => { setIsPaymentModalOpen(false); setPaymentInvoice(null); }}
                    invoice={paymentInvoice}
                />
            ) : paymentInvoice?.invoiceType === InvoiceType.INSTALLMENT ? (
                <Modal isOpen={isPaymentModalOpen} onClose={() => { setIsPaymentModalOpen(false); setPaymentInvoice(null); setPaymentMode(null); }} title="Receive Payment">
                    {paymentMode === null ? (
                        <div className="space-y-3">
                            <p className="text-sm text-slate-600">How is the client paying?</p>
                            <div className="flex gap-3">
                                <Button variant="primary" onClick={() => setPaymentMode('cash')}>Cash / Bank</Button>
                                <Button variant="secondary" onClick={() => setPaymentMode('asset')}>Asset (plot, car, etc.)</Button>
                            </div>
                        </div>
                    ) : paymentMode === 'cash' ? (
                        <div>
                            <button type="button" className="text-sm text-slate-500 hover:text-slate-700 mb-2" onClick={() => setPaymentMode(null)}>← Back</button>
                            <TransactionForm
                                onClose={() => { setIsPaymentModalOpen(false); setPaymentInvoice(null); setPaymentMode(null); }}
                                transactionTypeForNew={TransactionType.INCOME}
                                transactionToEdit={{
                                    id: '',
                                    type: TransactionType.INCOME,
                                    amount: resolvedPaymentInvoice
                                        ? resolvedPaymentInvoice.amount -
                                          getEffectivePaidForInvoice(
                                              resolvedPaymentInvoice.id,
                                              resolvedPaymentInvoice.paidAmount,
                                              ledgerPaidByInvoiceId
                                          )
                                        : 0,
                                    date: toLocalDateString(new Date()),
                                    accountId: '',
                                    invoiceId: resolvedPaymentInvoice?.id,
                                    contactId: resolvedPaymentInvoice?.contactId,
                                    projectId: resolvedPaymentInvoice?.projectId,
                                    unitId: resolvedPaymentInvoice?.unitId,
                                    buildingId: resolvedPaymentInvoice?.buildingId,
                                    propertyId: resolvedPaymentInvoice?.propertyId,
                                    categoryId: resolvedPaymentInvoice?.categoryId,
                                    agreementId: resolvedPaymentInvoice?.agreementId,
                                    description: resolvedPaymentInvoice ? `Payment for Invoice #${resolvedPaymentInvoice.invoiceNumber}` : ''
                                } as Transaction}
                                onShowDeleteWarning={() => { }}
                            />
                        </div>
                    ) : (
                        <AssetPaymentModal
                            renderInline
                            isOpen={true}
                            invoice={resolvedPaymentInvoice!}
                            onClose={() => { setIsPaymentModalOpen(false); setPaymentInvoice(null); setPaymentMode(null); }}
                            onSuccess={() => { setIsPaymentModalOpen(false); setPaymentInvoice(null); setPaymentMode(null); }}
                        />
                    )}
                </Modal>
            ) : (
                <Modal isOpen={isPaymentModalOpen} onClose={() => { setIsPaymentModalOpen(false); setPaymentInvoice(null); }} title="Receive Payment">
                    <TransactionForm
                        onClose={() => { setIsPaymentModalOpen(false); setPaymentInvoice(null); }}
                        transactionTypeForNew={TransactionType.INCOME}
                        transactionToEdit={{
                            id: '',
                            type: TransactionType.INCOME,
                            amount: resolvedPaymentInvoice
                                ? resolvedPaymentInvoice.amount -
                                  getEffectivePaidForInvoice(
                                      resolvedPaymentInvoice.id,
                                      resolvedPaymentInvoice.paidAmount,
                                      ledgerPaidByInvoiceId
                                  )
                                : 0,
                            date: toLocalDateString(new Date()),
                            accountId: '',
                            invoiceId: resolvedPaymentInvoice?.id,
                            contactId: resolvedPaymentInvoice?.contactId,
                            projectId: resolvedPaymentInvoice?.projectId,
                            unitId: resolvedPaymentInvoice?.unitId,
                            buildingId: resolvedPaymentInvoice?.buildingId,
                            propertyId: resolvedPaymentInvoice?.propertyId,
                            categoryId: resolvedPaymentInvoice?.categoryId,
                            agreementId: resolvedPaymentInvoice?.agreementId,
                            description: resolvedPaymentInvoice ? `Payment for Invoice #${resolvedPaymentInvoice.invoiceNumber}` : ''
                        } as Transaction}
                        onShowDeleteWarning={() => { }}
                    />
                </Modal>
            )}

            {/* Invoice History / Detail Modal */}
            <Modal isOpen={!!viewInvoice} onClose={() => setViewInvoice(null)} title={`Invoice #${viewInvoice?.invoiceNumber}`} size="lg">
                {viewInvoice && (
                    <ProjectInvoiceDetailView
                        invoice={viewInvoice}
                        onRecordPayment={(inv) => handleRecordPayment(inv)}
                        onEdit={(inv) => handleEditInvoiceFromDetail(inv)}
                        onDelete={(inv) => handleDeleteInvoice(inv)}
                        onEditPayment={(tx) => { setViewInvoice(null); setTransactionToEdit(tx); }}
                        onDeletePayment={(tx) => { setViewInvoice(null); handleShowDeleteWarning(tx); }}
                    />
                )}
            </Modal>

            <Modal isOpen={!!transactionToEdit} onClose={() => setTransactionToEdit(null)} title="Edit Transaction">
                <TransactionForm
                    onClose={() => setTransactionToEdit(null)}
                    transactionToEdit={transactionToEdit}
                    onShowDeleteWarning={handleShowDeleteWarning}
                />
            </Modal>

            <Modal isOpen={!!invoiceToEdit} onClose={() => setInvoiceToEdit(null)} title="Edit Invoice">
                <InvoiceBillForm
                    onClose={() => setInvoiceToEdit(null)}
                    type="invoice"
                    itemToEdit={invoiceToEdit || undefined}
                    onDuplicate={handleDuplicateInvoice}
                />
            </Modal>

            <LinkedTransactionWarningModal
                isOpen={warningModalState.isOpen}
                onClose={() => setWarningModalState({ isOpen: false, transaction: null, batchTransactions: null, action: null })}
                onConfirm={handleConfirmWarning}
                action={warningModalState.action as 'delete'}
                linkedItemName={getLinkedItemName(warningModalState.transaction)}
                customMessage={warningModalState.batchTransactions?.length ? `This is a bulk payment (${warningModalState.batchTransactions.length} transactions).` : undefined}
                customConsequence={warningModalState.batchTransactions?.length
                    ? `Deleting will remove all ${warningModalState.batchTransactions.length} payment transactions, update the related invoices, and remove the linked asset record (if any). This action cannot be undone.`
                    : undefined}
            />

            {/* Context Menu */}
            {contextMenu && (
                <div
                    ref={contextMenuRef}
                    className="fixed z-50 bg-white border border-slate-300 rounded-lg shadow-lg py-1 min-w-[180px]"
                    style={{
                        left: `${Math.min(contextMenu.x, window.innerWidth - 200)}px`,
                        top: `${Math.min(contextMenu.y, window.innerHeight - 100)}px`,
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2"
                        onClick={handleReceivePayment}
                    >
                        <div className="w-4 h-4">{ICONS.wallet || ICONS.plus}</div>
                        Receive payment
                    </button>
                    <button
                        className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2"
                        onClick={handleCreateInvoice}
                    >
                        <div className="w-4 h-4">{ICONS.plus}</div>
                        Create invoice
                    </button>
                </div>
            )}
        </div>
    );
};

export default InvoicesPage;