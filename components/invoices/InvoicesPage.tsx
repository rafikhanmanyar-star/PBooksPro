import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
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
import TransactionForm from '../transactions/TransactionForm';
import TransactionItem from '../transactions/TransactionItem';
import LinkedTransactionWarningModal from '../transactions/LinkedTransactionWarningModal';
import { formatDate } from '../../utils/dateUtils';
import { useNotification } from '../../context/NotificationContext';
import RentalFinancialGrid, { FinancialRecord } from './RentalFinancialGrid';
import useLocalStorage from '../../hooks/useLocalStorage';
import InvoiceDetailView from './InvoiceDetailView';
import { ImportType } from '../../services/importService';
import { useDebounce } from '../../hooks/useDebounce';

interface InvoicesPageProps {
    invoiceTypeFilter?: InvoiceType;
    hideTitleAndGoBack?: boolean;
    showCreateButton?: boolean;
    onTreeSelectionChange?: (selection: { id: string; type: 'group' | 'subgroup' | 'invoice'; parentId?: string | null; groupBy: string } | null) => void;
}

type InvoiceTreeSelectionType = 'group' | 'subgroup' | 'invoice' | null;

/** Premium tree sidebar: Directories label, avatars, active state, chevron expand (same style as Project Agreements) */
const InvoiceTreeSidebar: React.FC<{
    nodes: TreeNode[];
    selectedId: string | null;
    selectedType: InvoiceTreeSelectionType;
    selectedParentId: string | null;
    onSelect: (id: string, type: 'group' | 'subgroup' | 'invoice', parentId?: string | null) => void;
    onContextMenu?: (node: TreeNode, event: React.MouseEvent) => void;
}> = ({ nodes, selectedId, selectedType, selectedParentId, onSelect, onContextMenu }) => {
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

    const SortIcon = ({ column }: { column: 'name' | 'balance' }) => {
        if (sortConfig.key !== column) return <span className="text-slate-300 opacity-50 ml-1 text-[10px]">↕</span>;
        return <span className="text-orange-600 ml-1 text-[10px]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
    };

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
            <div key={node.id} className={level > 0 ? 'ml-4 border-l border-slate-200/80 pl-3' : ''}>
                <div
                    className={`group flex items-center gap-2 py-1.5 px-2 rounded-lg -mx-0.5 transition-all cursor-pointer ${isSelected
                        ? 'bg-orange-500/10 text-orange-700'
                        : 'hover:bg-slate-100/80 text-slate-700 hover:text-slate-900'
                        }`}
                    onClick={() => onSelect(node.id, node.type, level > 0 ? parentId : undefined)}
                    onContextMenu={node.type === 'subgroup' && onContextMenu ? (e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(node, e); } : undefined}
                >
                    {hasChildren ? (
                        <button
                            onClick={(e) => { e.stopPropagation(); toggleExpanded(node.id); }}
                            className={`flex-shrink-0 w-5 h-5 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                        >
                            <div className="w-3.5 h-3.5">{ICONS.chevronRight}</div>
                        </button>
                    ) : (
                        <span className="w-5 flex-shrink-0" />
                    )}
                    <span className="flex-1 text-xs font-medium truncate">{node.name}</span>
                    {node.balance > 0 && (
                        <span className={`text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded border flex-shrink-0 ${isSelected ? 'bg-orange-500 text-white border-orange-600' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
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
            <div className="text-xs text-slate-400 italic p-2">No directories match your search</div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Sort Header */}
            <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-100 mb-1 bg-slate-50/50 rounded-md">
                <button
                    onClick={() => handleSort('name')}
                    className="flex items-center text-[10px] font-bold text-slate-500 uppercase tracking-wider hover:text-slate-900 transition-colors"
                >
                    Entity <SortIcon column="name" />
                </button>
                <button
                    onClick={() => handleSort('balance')}
                    className="flex items-center text-[10px] font-bold text-slate-500 uppercase tracking-wider hover:text-slate-900 transition-colors"
                >
                    A/R <SortIcon column="balance" />
                </button>
            </div>

            <div className="space-y-0.5">
                {sortedNodes.map(node => renderNode(node, 0))}
            </div>
        </div>
    );
};

const InvoicesPage: React.FC<InvoicesPageProps> = ({ invoiceTypeFilter, hideTitleAndGoBack, showCreateButton = true, onTreeSelectionChange }) => {
    const dispatch = useDispatchOnly();
    const invoices = useStateSelector(s => s.invoices);
    const contacts = useStateSelector(s => s.contacts);
    const accounts = useStateSelector(s => s.accounts);
    const transactions = useStateSelector(s => s.transactions);
    const properties = useStateSelector(s => s.properties);
    const units = useStateSelector(s => s.units);
    const buildings = useStateSelector(s => s.buildings);
    const projects = useStateSelector(s => s.projects);
    const projectAgreements = useStateSelector(s => s.projectAgreements);
    const defaultProjectId = useStateSelector(s => s.defaultProjectId);
    const { showConfirm, showToast, showAlert } = useNotification();

    // Persistent View Settings
    const storageKeyPrefix = invoiceTypeFilter ? `invoices_${invoiceTypeFilter}` : 'invoices_all';

    const [statusFilter, setStatusFilter] = useLocalStorage<string>(`${storageKeyPrefix}_statusFilter`, 'All');
    const [groupBy, setGroupBy] = useLocalStorage<'tenant' | 'owner' | 'property'>(`${storageKeyPrefix}_groupBy`, invoiceTypeFilter === InvoiceType.RENTAL ? 'tenant' : 'owner');
    const [buildingFilter, setBuildingFilter] = useState<string>('all');
    const [projectFilter, setProjectFilter] = useState<string>(defaultProjectId || 'all');
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

    // Invoice History & Detail View State
    const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);
    const [invoiceToEdit, setInvoiceToEdit] = useState<Invoice | null>(null);
    const [duplicateInvoiceData, setDuplicateInvoiceData] = useState<Partial<Invoice> | null>(null);
    const [transactionToEdit, setTransactionToEdit] = useState<Transaction | null>(null);
    const [warningModalState, setWarningModalState] = useState<{ isOpen: boolean; transaction: Transaction | null; action: 'edit' | 'delete' | null; }>({ isOpen: false, transaction: null, action: null });

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
        return () => {
            window.removeEventListener('mousemove', handleMouseMoveSidebar);
            window.removeEventListener('mouseup', handleUp);
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

    // --- Base Data Filtering (For Tree Structure) ---
    const baseInvoices = useMemo(() => {
        try {
            let filtered = invoices;

            if (invoiceTypeFilter) {
                filtered = filtered.filter(inv => inv.invoiceType === invoiceTypeFilter);
            }

            if (statusFilter !== 'All') {
                filtered = filtered.filter(inv => inv.status === statusFilter);
            }

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
                filtered = filtered.filter(inv => inv.projectId === projectFilter);
            }

            if (debouncedSearch) {
                const query = debouncedSearch.toLowerCase();
                filtered = filtered.filter(inv => {
                    if (inv.invoiceNumber.toLowerCase().includes(query)) return true;
                    if (contacts.find(c => c.id === inv.contactId)?.name.toLowerCase().includes(query)) return true;
                    if (inv.description && inv.description.toLowerCase().includes(query)) return true;
                    if (inv.propertyId) {
                        const prop = properties.find(p => p.id === inv.propertyId);
                        if (prop?.name.toLowerCase().includes(query)) return true;
                    }
                    if (inv.unitId) {
                        const unit = units.find(u => u.id === inv.unitId);
                        if (unit?.name.toLowerCase().includes(query)) return true;
                    }
                    return false;
                });
            }

            return filtered;
        } catch (error) {
            console.error("Error filtering invoices:", error);
            return [];
        }
    }, [invoices, contacts, properties, units, invoiceTypeFilter, debouncedSearch, statusFilter, buildingFilter, projectFilter]);

    // --- Final Data Filtering (For List View) ---
    const filteredInvoices = useMemo(() => {
        let filtered = baseInvoices;

        if (treeFilter) {
            if (treeFilter.type === 'group') {
                filtered = filtered.filter(inv => {
                    if (inv.projectId === treeFilter.id) return true;
                    if (inv.buildingId === treeFilter.id) return true;
                    if (inv.agreementId && projectAgreements.find(pa => pa.id === inv.agreementId)?.projectId === treeFilter.id) return true;
                    if (inv.propertyId) {
                        const prop = properties.find(p => p.id === inv.propertyId);
                        if (prop && prop.buildingId === treeFilter.id) return true;
                    }
                    return false;
                });
            } else if (treeFilter.type === 'subgroup') {
                const parentId = treeFilter.parentId ?? null;
                if (invoiceTypeFilter === InvoiceType.RENTAL) {
                    filtered = filtered.filter(inv => {
                        const invBuildingId = inv.buildingId || (inv.propertyId ? properties.find(p => p.id === inv.propertyId)?.buildingId : undefined) || 'Unassigned';
                        const matchParent = parentId === null || invBuildingId === parentId;
                        if (!matchParent) return false;
                        if (groupBy === 'tenant') return inv.contactId === treeFilter.id;
                        if (groupBy === 'owner') {
                            const prop = properties.find(p => p.id === inv.propertyId);
                            return prop && prop.ownerId === treeFilter.id;
                        }
                        if (groupBy === 'property') return inv.propertyId === treeFilter.id;
                        return false;
                    });
                } else if (invoiceTypeFilter === InvoiceType.INSTALLMENT) {
                    filtered = filtered.filter(inv => {
                        const matchParent = parentId === null || inv.projectId === parentId;
                        if (!matchParent) return false;
                        if (groupBy === 'owner') return inv.contactId === treeFilter.id;
                        if (groupBy === 'property') return inv.unitId === treeFilter.id;
                        return false;
                    });
                }
            } else if (treeFilter.type === 'invoice') {
                filtered = filtered.filter(inv => inv.id === treeFilter.id);
            }
        }

        return filtered.sort((a, b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime());
    }, [baseInvoices, treeFilter, invoiceTypeFilter, groupBy, properties, projectAgreements]);

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
                    let buildingId = inv.buildingId;
                    if (!buildingId && inv.propertyId) {
                        const prop = properties.find(p => p.id === inv.propertyId);
                        if (prop) buildingId = prop.buildingId;
                    }
                    if (!buildingId) buildingId = 'Unassigned';

                    const buildingName = buildingId === 'Unassigned'
                        ? 'Unassigned'
                        : buildings.find(b => b.id === buildingId)?.name || 'Unknown Building';

                    let subgroupId = 'Unassigned';
                    let subgroupName = 'Unassigned';

                    if (groupBy === 'tenant') {
                        subgroupId = inv.contactId || 'No-Contact';
                        subgroupName = contacts.find(c => c.id === subgroupId)?.name || 'Unknown Tenant';
                    } else if (groupBy === 'owner') {
                        const prop = properties.find(p => p.id === inv.propertyId);
                        subgroupId = prop?.ownerId || 'No-Owner';
                        subgroupName = contacts.find(c => c.id === subgroupId)?.name || 'Unknown Owner';
                    } else if (groupBy === 'property') {
                        subgroupId = inv.propertyId || 'No-Property';
                        subgroupName = properties.find(p => p.id === subgroupId)?.name || 'Unknown Unit';
                    }

                    const due = Math.max(0, inv.amount - inv.paidAmount);

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
                    const projectId = inv.projectId || 'Unassigned';
                    const projectName = projectId === 'Unassigned' ? 'Unassigned' : projects.find(p => p.id === projectId)?.name || 'Unknown Project';
                    const due = Math.max(0, inv.amount - inv.paidAmount);

                    let subgroupId = 'Unassigned';
                    let subgroupName = 'Unassigned';

                    if (groupBy === 'owner') {
                        subgroupId = inv.contactId || 'No-Client';
                        subgroupName = contacts.find(c => c.id === subgroupId)?.name || 'Unknown Client';
                    } else if (groupBy === 'property') {
                        subgroupId = inv.unitId || 'No-Unit';
                        subgroupName = units.find(u => u.id === subgroupId)?.name || 'General Project Invoice';
                    } else {
                        subgroupId = inv.contactId || 'No-Client';
                        subgroupName = contacts.find(c => c.id === subgroupId)?.name || 'Unknown Client';
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

    }, [baseInvoices, invoiceTypeFilter, projects, buildings, properties, units, contacts, groupBy]);

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
            let filtered = invoices;

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
                filtered = filtered.filter(inv => inv.projectId === projectFilter);
            }

            if (debouncedSearch) {
                const query = debouncedSearch.toLowerCase();
                filtered = filtered.filter(inv => {
                    if (inv.invoiceNumber.toLowerCase().includes(query)) return true;
                    if (contacts.find(c => c.id === inv.contactId)?.name.toLowerCase().includes(query)) return true;
                    if (inv.description && inv.description.toLowerCase().includes(query)) return true;
                    if (inv.propertyId) {
                        const prop = properties.find(p => p.id === inv.propertyId);
                        if (prop?.name.toLowerCase().includes(query)) return true;
                    }
                    if (inv.unitId) {
                        const unit = units.find(u => u.id === inv.unitId);
                        if (unit?.name.toLowerCase().includes(query)) return true;
                    }
                    return false;
                });
            }

            if (treeFilter) {
                if (treeFilter.type === 'group') {
                    filtered = filtered.filter(inv => {
                        if (inv.projectId === treeFilter.id) return true;
                        if (inv.buildingId === treeFilter.id) return true;
                        if (inv.agreementId && projectAgreements.find(pa => pa.id === inv.agreementId)?.projectId === treeFilter.id) return true;
                        if (inv.propertyId) {
                            const prop = properties.find(p => p.id === inv.propertyId);
                            if (prop && prop.buildingId === treeFilter.id) return true;
                        }
                        return false;
                    });
                } else if (treeFilter.type === 'subgroup') {
                    const parentId = treeFilter.parentId ?? null;
                    if (invoiceTypeFilter === InvoiceType.RENTAL) {
                        filtered = filtered.filter(inv => {
                            const invBuildingId = inv.buildingId || (inv.propertyId ? properties.find(p => p.id === inv.propertyId)?.buildingId : undefined) || 'Unassigned';
                            const matchParent = parentId === null || invBuildingId === parentId;
                            if (!matchParent) return false;
                            if (groupBy === 'tenant') return inv.contactId === treeFilter.id;
                            if (groupBy === 'owner') {
                                const prop = properties.find(p => p.id === inv.propertyId);
                                return prop && prop.ownerId === treeFilter.id;
                            }
                            if (groupBy === 'property') return inv.propertyId === treeFilter.id;
                            return false;
                        });
                    } else if (invoiceTypeFilter === InvoiceType.INSTALLMENT) {
                        filtered = filtered.filter(inv => {
                            const matchParent = parentId === null || inv.projectId === parentId;
                            if (!matchParent) return false;
                            if (groupBy === 'owner') return inv.contactId === treeFilter.id;
                            if (groupBy === 'property') return inv.unitId === treeFilter.id;
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
    }, [invoices, contacts, properties, units, projectAgreements, invoiceTypeFilter, debouncedSearch, buildingFilter, projectFilter, treeFilter, groupBy]);

    // --- Combined Financial Records for Grid View ---
    const financialRecords = useMemo<FinancialRecord[]>(() => {
        const records: FinancialRecord[] = [];
        const relevantInvoices = filteredInvoices; // Use already filtered list
        // Build invoiceIdSet from invoicesWithoutStatusFilter (not baseInvoices) to include payments even if invoice status changes after payment
        // This ensures payments remain visible even if their linked invoice changes status (e.g., Unpaid -> Paid)
        const invoiceIdSet = new Set(invoicesWithoutStatusFilter.map(i => i.id));

        // 1. Invoices
        relevantInvoices.forEach(inv => {
            const contact = contacts.find(c => c.id === inv.contactId);
            records.push({
                id: inv.id,
                type: 'Invoice',
                reference: inv.invoiceNumber,
                date: inv.issueDate,
                accountName: contact?.name || 'Unknown Client',
                amount: inv.amount,
                remainingAmount: inv.amount - inv.paidAmount,
                raw: inv,
                status: inv.status
            });
        });

        // 2. Payments (Transactions linked to these invoices)
        const processedBatchIds = new Set<string>();

        transactions.forEach(tx => {
            if (tx.type !== TransactionType.INCOME) return;

            // If it's an invoice payment, check if it's relevant to current view
            const isInvoicePayment = tx.invoiceId && invoiceIdSet.has(tx.invoiceId);

            if (!isInvoicePayment) return;

            if (tx.batchId) {
                if (processedBatchIds.has(tx.batchId)) return;

                // Get entire batch to aggregate
                const batchTxs = transactions.filter(t => t.batchId === tx.batchId);
                const totalAmount = batchTxs.reduce((sum, t) => sum + t.amount, 0);
                const account = accounts.find(a => a.id === tx.accountId);

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
                        children: batchTxs // Pass children for expansion
                    } as Transaction,
                    status: 'Paid'
                });

                processedBatchIds.add(tx.batchId);
            } else {
                const inv = invoices.find(i => i.id === tx.invoiceId);
                const account = accounts.find(a => a.id === tx.accountId);

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
    }, [filteredInvoices, transactions, accounts, contacts, invoices]);


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
        setWarningModalState({ isOpen: true, transaction: tx, action: 'delete' });
    };

    const handleConfirmWarning = () => {
        const { transaction, action } = warningModalState;
        if (transaction && action === 'delete') {
            dispatch({ type: 'DELETE_TRANSACTION', payload: transaction.id });
        }
        setWarningModalState({ isOpen: false, transaction: null, action: null });
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
            ? invoices.filter(inv => inv.invoiceType === invoiceTypeFilter)
            : invoices;

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
            candidateInvoices = candidateInvoices.filter(inv => inv.projectId === projectFilter);
        }

        // Find all open invoices for this owner/tenant (filter by node ID based on groupBy)
        let openInvoices: Invoice[] = [];

        if (invoiceTypeFilter === InvoiceType.RENTAL) {
            if (groupBy === 'tenant') {
                openInvoices = candidateInvoices.filter(inv =>
                    inv.contactId === node.id &&
                    (inv.status === InvoiceStatus.UNPAID || inv.status === InvoiceStatus.PARTIALLY_PAID || inv.status === InvoiceStatus.OVERDUE) &&
                    (inv.amount - inv.paidAmount) > 0
                );
            } else if (groupBy === 'owner') {
                openInvoices = candidateInvoices.filter(inv => {
                    const prop = properties.find(p => p.id === inv.propertyId);
                    return prop && prop.ownerId === node.id &&
                        (inv.status === InvoiceStatus.UNPAID || inv.status === InvoiceStatus.PARTIALLY_PAID || inv.status === InvoiceStatus.OVERDUE) &&
                        (inv.amount - inv.paidAmount) > 0;
                });
            } else if (groupBy === 'property') {
                openInvoices = candidateInvoices.filter(inv =>
                    inv.propertyId === node.id &&
                    (inv.status === InvoiceStatus.UNPAID || inv.status === InvoiceStatus.PARTIALLY_PAID || inv.status === InvoiceStatus.OVERDUE) &&
                    (inv.amount - inv.paidAmount) > 0
                );
            }
        } else if (invoiceTypeFilter === InvoiceType.INSTALLMENT) {
            if (groupBy === 'owner') {
                openInvoices = candidateInvoices.filter(inv =>
                    inv.contactId === node.id &&
                    (inv.status === InvoiceStatus.UNPAID || inv.status === InvoiceStatus.PARTIALLY_PAID || inv.status === InvoiceStatus.OVERDUE) &&
                    (inv.amount - inv.paidAmount) > 0
                );
            } else if (groupBy === 'property') {
                openInvoices = candidateInvoices.filter(inv =>
                    inv.unitId === node.id &&
                    (inv.status === InvoiceStatus.UNPAID || inv.status === InvoiceStatus.PARTIALLY_PAID || inv.status === InvoiceStatus.OVERDUE) &&
                    (inv.amount - inv.paidAmount) > 0
                );
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
    }, [contextMenu, invoices, invoiceTypeFilter, groupBy, properties, buildingFilter, projectFilter, showAlert]);

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
        invoices.filter(inv => selectedInvoiceIds.has(inv.id)),
        [invoices, selectedInvoiceIds]);

    const supportsTreeView = invoiceTypeFilter === InvoiceType.INSTALLMENT || invoiceTypeFilter === InvoiceType.RENTAL;
    const isRental = invoiceTypeFilter === InvoiceType.RENTAL;
    const isProject = invoiceTypeFilter === InvoiceType.INSTALLMENT;

    const filterInputClass = "w-full pl-3 py-2 text-sm border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-accent/50 focus:border-accent bg-white";

    return (
        <div className="flex flex-col h-full bg-slate-50/50 p-4 sm:p-6 gap-4 sm:gap-6">
            {!hideTitleAndGoBack && (
                <div className="flex flex-col gap-4 flex-shrink-0">
                    <div className="flex justify-between items-start">
                        <div>
                            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Invoices & Payments</h1>
                            <p className="text-xs sm:text-sm text-slate-500 mt-1">Track billings, payments, and financial status across projects</p>
                        </div>
                    </div>

                    {/* Top Control Bar */}
                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
                        <div className="flex items-center gap-3 flex-1 w-full md:w-auto overflow-x-auto scroll-container-x pb-1 md:pb-0">
                            {/* Search */}
                            <div className="relative min-w-[200px]">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                    <div className="w-4 h-4">{ICONS.search}</div>
                                </div>
                                <input
                                    type="text"
                                    placeholder="Search references..."
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

                            {/* Filters based on Context */}
                            {isRental && (
                                <Select
                                    value={buildingFilter}
                                    onChange={(e) => setBuildingFilter(e.target.value)}
                                    className="!w-40 !py-1.5 !text-sm !border-slate-200 !bg-slate-50/50"
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
                                    className="!w-40 !py-1.5 !text-sm !border-slate-200 !bg-slate-50/50"
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
                                className="!w-32 !py-1.5 !text-sm !border-slate-200 !bg-slate-50/50"
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

                        <div className="flex items-center gap-3 w-full md:w-auto border-t md:border-t-0 md:border-l border-slate-100 pt-3 md:pt-0 pl-0 md:pl-3">
                            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Group By:</span>
                            <div className="flex bg-slate-100 p-1 rounded-lg">
                                {(isRental ? ['tenant', 'owner', 'property'] : ['owner', 'property']).map((opt) => (
                                    <button
                                        key={opt}
                                        onClick={() => setGroupBy(opt as any)}
                                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all capitalize ${groupBy === opt
                                            ? 'bg-white text-indigo-600 shadow-sm font-bold ring-1 ring-black/5'
                                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
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
                            className="hidden md:flex flex-col flex-shrink-0 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
                            style={{ width: `${sidebarWidth}px` }}
                        >
                            <div className="flex-shrink-0 p-3 border-b border-slate-100 bg-slate-50/50">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Directories</span>
                            </div>
                            <div className="flex-shrink-0 px-2 pt-2 pb-1 border-b border-slate-100">
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-2 flex items-center pointer-events-none text-slate-400">
                                        <div className="w-3.5 h-3.5">{ICONS.search}</div>
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Search projects, owners, units..."
                                        value={treeSearchQuery}
                                        onChange={(e) => setTreeSearchQuery(e.target.value)}
                                        className="w-full pl-8 pr-6 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50/80 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 placeholder:text-slate-400 transition-all"
                                    />
                                    {treeSearchQuery && (
                                        <button
                                            type="button"
                                            onClick={() => setTreeSearchQuery('')}
                                            className="absolute inset-y-0 right-2 flex items-center text-slate-400 hover:text-rose-500"
                                        >
                                            <div className="w-3.5 h-3.5">{ICONS.x}</div>
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="flex-shrink-0 px-3 py-2 border-b border-slate-100 bg-slate-50/30">
                                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Group by</span>
                                <div className="flex bg-slate-100 p-1 rounded-lg mt-1.5">
                                    {(isRental ? ['tenant', 'owner', 'property'] : ['owner', 'property']).map((opt) => (
                                        <button
                                            key={opt}
                                            onClick={() => setGroupBy(opt as 'tenant' | 'owner' | 'property')}
                                            className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-all capitalize ${groupBy === opt
                                                ? 'bg-white text-orange-600 shadow-sm font-bold ring-1 ring-black/5'
                                                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
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
                                    onSelect={(id, type, parentId) => {
                                        if (treeFilter?.id === id && treeFilter.type === type && (treeFilter.parentId ?? null) === (parentId ?? null)) {
                                            setTreeFilter(null);
                                        } else {
                                            setTreeFilter({ id, type, parentId: parentId ?? null });
                                        }
                                    }}
                                    onContextMenu={handleContextMenu}
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
                    <RentalFinancialGrid
                        records={financialRecords}
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
                        onReceivePayment={handleRecordPayment}
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
            ) : (
                <Modal isOpen={isPaymentModalOpen} onClose={() => { setIsPaymentModalOpen(false); setPaymentInvoice(null); }} title="Receive Payment">
                    <TransactionForm
                        onClose={() => { setIsPaymentModalOpen(false); setPaymentInvoice(null); }}
                        transactionTypeForNew={TransactionType.INCOME}
                        transactionToEdit={{
                            id: '',
                            type: TransactionType.INCOME,
                            amount: paymentInvoice ? (paymentInvoice.amount - paymentInvoice.paidAmount) : 0,
                            date: new Date().toISOString().split('T')[0],
                            accountId: '',
                            invoiceId: paymentInvoice?.id,
                            contactId: paymentInvoice?.contactId,
                            projectId: paymentInvoice?.projectId,
                            unitId: paymentInvoice?.unitId,
                            buildingId: paymentInvoice?.buildingId,
                            propertyId: paymentInvoice?.propertyId,
                            categoryId: paymentInvoice?.categoryId,
                            description: paymentInvoice ? `Payment for Invoice #${paymentInvoice.invoiceNumber}` : ''
                        } as Transaction}
                        onShowDeleteWarning={() => { }}
                    />
                </Modal>
            )}

            {/* Invoice History / Detail Modal */}
            <Modal isOpen={!!viewInvoice} onClose={() => setViewInvoice(null)} title={`Invoice #${viewInvoice?.invoiceNumber}`}>
                {viewInvoice && (
                    <InvoiceDetailView
                        invoice={viewInvoice}
                        onRecordPayment={(inv) => handleRecordPayment(inv)}
                        onEdit={(inv) => handleEditInvoiceFromDetail(inv)}
                        onDelete={(inv) => handleDeleteInvoice(inv)}
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
                onClose={() => setWarningModalState({ isOpen: false, transaction: null, action: null })}
                onConfirm={handleConfirmWarning}
                action={warningModalState.action as 'delete'}
                linkedItemName={getLinkedItemName(warningModalState.transaction)}
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