import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useAppContext } from '../../context/AppContext';
import { ProjectAgreement, ContactType, ProjectAgreementStatus, TransactionType } from '../../types';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { ICONS, CURRENCY } from '../../constants';
import Modal from '../ui/Modal';
import ProjectAgreementForm from './ProjectAgreementForm';
import CancelAgreementModal from './CancelAgreementModal';
import { formatDate, toLocalDateString } from '../../utils/dateUtils';
import { TreeNode } from '../ui/TreeView';
import DatePicker from '../ui/DatePicker';
import useLocalStorage from '../../hooks/useLocalStorage';
import { ImportType } from '../../services/importService';
import TreeExpandCollapseControls from '../ui/TreeExpandCollapseControls';
import { collectExpandableParentIds } from '../ui/treeExpandCollapseUtils';

type SortKey = 'agreementNumber' | 'owner' | 'project' | 'units' | 'price' | 'paid' | 'balance' | 'date' | 'status';
type DateRangeOption = 'all' | 'thisMonth' | 'lastMonth' | 'custom';
type TreeGroupBy = 'owner' | 'unit';
type TreeSelectionType = 'project' | 'owner' | 'unit' | null;

/** Premium tree sidebar: Directories with Owner/Units selectable, avatars, active state, chevron expand */
const AgreementTreeSidebar: React.FC<{
    nodes: TreeNode[];
    selectedId: string | null;
    selectedType: TreeSelectionType;
    selectedParentId: string | null;
    onSelect: (id: string, type: TreeSelectionType, parentId?: string | null) => void;
}> = ({ nodes, selectedId, selectedType, selectedParentId, onSelect }) => {
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set(nodes.map(n => n.id)));

    const expandableIds = useMemo(() => collectExpandableParentIds(nodes), [nodes]);

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

    const renderNode = (node: TreeNode, level: number, parentId?: string | null) => {
        const hasChildren = node.children && node.children.length > 0;
        const isExpanded = expandedIds.has(node.id);
        const nodeType = (node.type || 'project') as TreeSelectionType;
        const isSelected = selectedId === node.id && selectedType === nodeType && (nodeType === 'project' || selectedParentId === parentId);
        const initials = node.label.slice(0, 2).toUpperCase();

        return (
            <div key={node.id} className={level > 0 ? 'ml-4 border-l border-app-border pl-3' : ''}>
                <div
                    className={`group flex items-center gap-2 py-1.5 px-2 rounded-lg -mx-0.5 transition-all duration-ds cursor-pointer ${
                        isSelected
                            ? 'bg-nav-active text-primary border border-primary/20'
                            : 'hover:bg-app-toolbar/80 text-app-text hover:text-app-text'
                    }`}
                    onClick={() => onSelect(node.id, nodeType, level > 0 ? parentId : undefined)}
                >
                    {hasChildren ? (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); toggleExpanded(node.id); }}
                            className={`flex-shrink-0 w-5 h-5 flex items-center justify-center text-app-muted hover:text-app-text transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                        >
                            <div className="w-3.5 h-3.5">{ICONS.chevronRight}</div>
                        </button>
                    ) : (
                        <span className="w-5 flex-shrink-0" />
                    )}
                    <span className="flex-shrink-0 w-6 h-6 rounded-md bg-app-toolbar text-app-text text-[10px] font-bold flex items-center justify-center border border-app-border">
                        {initials}
                    </span>
                    <span className="flex-1 text-xs font-medium truncate">{node.label}</span>
                    {node.value !== undefined && typeof node.value === 'number' && node.value > 0 && (
                        <span className={`text-[10px] font-semibold tabular-nums ${isSelected ? 'text-primary' : 'text-app-muted'}`}>
                            {node.value}
                        </span>
                    )}
                </div>
                {hasChildren && isExpanded && (
                    <div className="mt-0.5">
                        {node.children!.map(child => renderNode(child, level + 1, node.id))}
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
        <>
            <div className="flex justify-end mb-1">
                <TreeExpandCollapseControls
                    variant="app"
                    allExpandableIds={expandableIds}
                    expandedIds={expandedIds}
                    onExpandAll={handleExpandAll}
                    onCollapseAll={handleCollapseAll}
                    visible={expandableIds.length > 0}
                />
            </div>
            <div className="space-y-0.5">
                {nodes.map(node => renderNode(node, 0))}
            </div>
        </>
    );
};

const ProjectAgreementsPage: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const [searchQuery, setSearchQuery] = useState('');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [agreementToEdit, setAgreementToEdit] = useState<ProjectAgreement | null>(null);
    const [cancelAgreement, setCancelAgreement] = useState<ProjectAgreement | null>(null);

    // Persistent State
    const [dateRange, setDateRange] = useLocalStorage<DateRangeOption>('projectAgreements_dateRange', 'all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [sortConfig, setSortConfig] = useLocalStorage<{ key: SortKey; direction: 'asc' | 'desc' }>('projectAgreements_sort', { key: 'date', direction: 'desc' });

    // Tree Selection State (parentId = project when owner/unit selected, so grid filters by project + owner/unit)
    const [selectedTreeId, setSelectedTreeId] = useState<string | null>(null);
    const [selectedTreeType, setSelectedTreeType] = useState<'project' | 'owner' | 'unit' | null>(null);
    const [selectedTreeParentId, setSelectedTreeParentId] = useState<string | null>(null);

    // Sidebar: group by (owner = Project -> Owner; unit = Project -> Unit), search filter
    const [treeGroupBy, setTreeGroupBy] = useLocalStorage<TreeGroupBy>('projectAgreements_treeGroupBy', 'owner');
    const [treeSearchQuery, setTreeSearchQuery] = useState('');

    // Sidebar Resizing: container-relative width (150–600px)
    const [sidebarWidth, setSidebarWidth] = useLocalStorage<number>('projectAgreements_sidebarWidth', 280);
    const [isResizing, setIsResizing] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

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

    // Sidebar Resize: container-relative width to prevent jumping in nested layouts
    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!containerRef.current) return;
        const containerLeft = containerRef.current.getBoundingClientRect().left;
        const newWidth = e.clientX - containerLeft;
        if (newWidth > 150 && newWidth < 600) {
            setSidebarWidth(newWidth);
        }
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
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleUp);
        window.addEventListener('blur', handleUp);
        document.addEventListener('visibilitychange', handleUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleUp);
            window.removeEventListener('blur', handleUp);
            document.removeEventListener('visibilitychange', handleUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [isResizing, handleMouseMove]);

    const startResizing = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);
    }, []);

    // Clear tree selection when group-by changes so selection stays valid
    useEffect(() => {
        setSelectedTreeId(null);
        setSelectedTreeType(null);
        setSelectedTreeParentId(null);
    }, [treeGroupBy]);

    // Initialize date range on mount
    useEffect(() => {
        if (dateRange !== 'custom' && dateRange !== 'all') {
            handleRangeChange(dateRange);
        }
    }, []);

    // Check if we need to open an agreement from search
    useEffect(() => {
        const agreementId = sessionStorage.getItem('openProjectAgreementId');
        if (agreementId) {
            sessionStorage.removeItem('openProjectAgreementId');
            const agreement = state.projectAgreements.find(a => a.id === agreementId);
            if (agreement) {
                setAgreementToEdit(agreement);
                setIsCreateModalOpen(true);
            }
        }
    }, [state.projectAgreements]);

    // Filter agreements by date first
    const dateFilteredAgreements = useMemo(() => {
        let agreements = state.projectAgreements;
        if (startDate && endDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);

            agreements = agreements.filter(a => {
                const d = new Date(a.issueDate);
                return d >= start && d <= end;
            });
        }
        return agreements;
    }, [state.projectAgreements, startDate, endDate]);

    // --- Tree Data Construction (two levels only: Project -> Owner OR Project -> Unit) ---
    const treeData = useMemo<TreeNode[]>(() => {
        const projectMap = new Map<string, TreeNode>();

        state.projects.forEach(p => {
            projectMap.set(p.id, {
                id: p.id,
                label: p.name,
                type: 'project',
                children: [],
                value: 0
            });
        });

        if (treeGroupBy === 'owner') {
            dateFilteredAgreements.forEach(pa => {
                const projectNode = projectMap.get(pa.projectId);
                if (!projectNode) return;

                const client = state.contacts.find(c => c.id === pa.clientId);
                const clientId = pa.clientId;
                const clientLabel = client?.name || 'Unknown Owner';

                let ownerNode = projectNode.children?.find(c => c.id === clientId);
                if (!ownerNode) {
                    ownerNode = {
                        id: clientId,
                        label: clientLabel,
                        type: 'owner',
                        children: [],
                        value: 0
                    };
                    projectNode.children?.push(ownerNode);
                }
                ownerNode.value = (ownerNode.value as number || 0) + 1;
                projectNode.value = (projectNode.value as number || 0) + 1;
            });
        } else {
            // treeGroupBy === 'unit': Project -> Unit (unique units per project)
            dateFilteredAgreements.forEach(pa => {
                const projectNode = projectMap.get(pa.projectId);
                if (!projectNode) return;

                const unitIds = Array.isArray(pa.unitIds) ? pa.unitIds : [];
                unitIds.forEach(unitId => {
                    const unit = state.units.find(u => u.id === unitId);
                    const unitLabel = unit?.name || unitId;
                    let unitNode = projectNode.children?.find(c => c.id === unitId);
                    if (!unitNode) {
                        unitNode = {
                            id: unitId,
                            label: unitLabel,
                            type: 'unit',
                            children: [],
                            value: 0
                        };
                        projectNode.children?.push(unitNode);
                    }
                    unitNode.value = (unitNode.value as number || 0) + 1;
                });
                if (unitIds.length > 0) projectNode.value = (projectNode.value as number || 0) + 1;
            });
        }

        return Array.from(projectMap.values())
            .filter(node => (node.value as number || 0) > 0)
            .sort((a, b) => a.label.localeCompare(b.label))
            .map(node => ({
                ...node,
                children: (node.children || []).sort((a, b) => a.label.localeCompare(b.label))
            }));
    }, [dateFilteredAgreements, state.projects, state.contacts, state.units, treeGroupBy]);

    // Filter tree by sidebar search (keeps node if label or any descendant matches)
    const filterTree = useCallback((nodes: TreeNode[], q: string): TreeNode[] => {
        if (!q.trim()) return nodes;
        const lower = q.toLowerCase();
        return nodes
            .map(node => {
                const labelMatch = node.label.toLowerCase().includes(lower);
                const filteredChildren = node.children?.length ? filterTree(node.children, q) : [];
                const childMatch = filteredChildren.length > 0;
                if (labelMatch && !filteredChildren.length) return node;
                if (childMatch) return { ...node, children: filteredChildren };
                if (labelMatch) return node;
                return null;
            })
            .filter((n): n is TreeNode => n != null);
    }, []);

    const filteredTreeData = useMemo(() => filterTree(treeData, treeSearchQuery), [treeData, treeSearchQuery, filterTree]);

    // --- Table Data Construction ---
    const filteredAgreements = useMemo(() => {
        let agreements = dateFilteredAgreements.map(pa => {
            const project = state.projects.find(p => p.id === pa.projectId);
            const client = state.contacts.find(c => c.id === pa.clientId);
            const unitIds = Array.isArray(pa.unitIds) ? pa.unitIds : [];
            const units = state.units.filter(u => unitIds.includes(u.id)).map(u => u.name).join(', ');

            // Calculate financials
            const paid = state.invoices
                .filter(inv => inv.agreementId === pa.id)
                .reduce((sum, inv) => sum + inv.paidAmount, 0);

            const sellingPrice = pa.sellingPrice || 0;
            const balance = sellingPrice - paid;

            return {
                ...pa,
                projectName: project?.name || 'Unknown',
                ownerName: client?.name || 'Unknown',
                unitNames: units,
                sellingPrice,
                paid,
                balance
            };
        });

        // 1. Filter by Tree Selection (Project / Owner / Unit). Owner/unit are scoped to their project.
        if (selectedTreeId) {
            if (selectedTreeType === 'project') {
                agreements = agreements.filter(pa => pa.projectId === selectedTreeId);
            } else if (selectedTreeType === 'owner') {
                agreements = agreements.filter(pa =>
                    pa.clientId === selectedTreeId && pa.projectId === selectedTreeParentId
                );
            } else if (selectedTreeType === 'unit') {
                agreements = agreements.filter(pa =>
                    Array.isArray(pa.unitIds) && pa.unitIds.includes(selectedTreeId) && pa.projectId === selectedTreeParentId
                );
            }
        }

        // 2. Filter by Search
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            agreements = agreements.filter(pa =>
                String(pa.agreementNumber || '').toLowerCase().includes(q) ||
                String(pa.ownerName || '').toLowerCase().includes(q) ||
                String(pa.projectName || '').toLowerCase().includes(q) ||
                String(pa.unitNames || '').toLowerCase().includes(q) ||
                String(pa.status || '').toLowerCase().includes(q)
            );
        }

        // 3. Sort
        return agreements.sort((a, b) => {
            let valA: any = '';
            let valB: any = '';

            switch (sortConfig.key) {
                case 'agreementNumber': valA = a.agreementNumber; valB = b.agreementNumber; break;
                case 'owner': valA = a.ownerName; valB = b.ownerName; break;
                case 'project': valA = a.projectName; valB = b.projectName; break;
                case 'units': valA = a.unitNames; valB = b.unitNames; break;
                case 'price': valA = a.sellingPrice; valB = b.sellingPrice; break;
                case 'paid': valA = a.paid; valB = b.paid; break;
                case 'balance': valA = a.balance; valB = b.balance; break;
                case 'date': valA = new Date(a.issueDate).getTime(); valB = new Date(b.issueDate).getTime(); break;
                case 'status': valA = a.status; valB = b.status; break;
            }

            if (typeof valA === 'string') {
                valA = valA.toLowerCase();
                valB = valB.toLowerCase();
            }

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

    }, [dateFilteredAgreements, state.projects, state.contacts, state.units, state.invoices, searchQuery, selectedTreeId, selectedTreeType, selectedTreeParentId, sortConfig]);

    // Summary for cards: same scope as table (date + tree + search). When tree item selected, shows that project/owner/unit summary.
    const summaryStats = useMemo(() => {
        const totalValue = filteredAgreements.reduce((sum, a) => sum + (a.sellingPrice || 0), 0);
        const totalPaid = filteredAgreements.reduce((sum, a) => sum + (a.paid || 0), 0);
        const totalOutstanding = filteredAgreements.reduce((sum, a) => sum + (a.balance || 0), 0);
        const totalAgreements = filteredAgreements.length;
        const totalUnits = filteredAgreements.reduce((sum, a) => sum + (Array.isArray(a.unitIds) ? a.unitIds.length : 0), 0);
        return { totalValue, totalPaid, totalOutstanding, totalAgreements, totalUnits };
    }, [filteredAgreements]);

    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const SortIcon = ({ column }: { column: SortKey }) => (
        <span className={`ml-1.5 inline-flex flex-shrink-0 transition-opacity duration-200 ${sortConfig.key === column ? 'opacity-100 text-primary' : 'opacity-0 group-hover:opacity-100 text-app-muted'}`}>
            <div className="w-3 h-3 transform scale-90">
                {sortConfig.key === column
                    ? (sortConfig.direction === 'asc' ? ICONS.arrowUp : ICONS.arrowDown)
                    : ICONS.arrowUpDown}
            </div>
        </span>
    );

    const handleEdit = (agreement: ProjectAgreement) => {
        setAgreementToEdit(agreement);
        setIsCreateModalOpen(true);
    };

    return (
        <div className="flex flex-col h-full bg-background p-2 sm:p-3 gap-2 sm:gap-3">
            {/* Summary cards: default = all; when tree item selected = project/owner/unit summary */}
            <div className="flex-shrink-0 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                <div className="bg-app-card rounded-lg border border-app-border shadow-ds-card p-2 transition-shadow duration-ds">
                    <p className="text-[10px] font-semibold text-app-muted uppercase tracking-wider">Total Agreement Value</p>
                    <p className="text-lg font-bold text-app-text tabular-nums mt-0.5">{CURRENCY} {summaryStats.totalValue.toLocaleString()}</p>
                </div>
                <div className="bg-app-card rounded-lg border border-app-border shadow-ds-card p-2 transition-shadow duration-ds">
                    <p className="text-[10px] font-semibold text-app-muted uppercase tracking-wider">Total Payment Received</p>
                    <p className="text-lg font-bold text-ds-success tabular-nums mt-0.5">{CURRENCY} {summaryStats.totalPaid.toLocaleString()}</p>
                </div>
                <div className="bg-app-card rounded-lg border border-app-border shadow-ds-card p-2 transition-shadow duration-ds">
                    <p className="text-[10px] font-semibold text-app-muted uppercase tracking-wider">Total Outstanding</p>
                    <p className="text-lg font-bold text-primary tabular-nums mt-0.5">{CURRENCY} {summaryStats.totalOutstanding.toLocaleString()}</p>
                </div>
                <div className="bg-app-card rounded-lg border border-app-border shadow-ds-card p-2 transition-shadow duration-ds">
                    <p className="text-[10px] font-semibold text-app-muted uppercase tracking-wider">Total Agreements</p>
                    <p className="text-lg font-bold text-app-text tabular-nums mt-0.5">{summaryStats.totalAgreements}</p>
                </div>
                <div className="bg-app-card rounded-lg border border-app-border shadow-ds-card p-2 col-span-2 sm:col-span-1 transition-shadow duration-ds">
                    <p className="text-[10px] font-semibold text-app-muted uppercase tracking-wider">Total Units</p>
                    <p className="text-lg font-bold text-app-text tabular-nums mt-0.5">{summaryStats.totalUnits}</p>
                </div>
            </div>

            {/* Filter row */}
            <div className="flex-shrink-0 mt-2">
                <div className="bg-app-card p-1.5 rounded-lg border border-app-border shadow-ds-card flex flex-col md:flex-row gap-2 items-center transition-shadow duration-ds">
                    {/* Date Controls */}
                    <div className="ds-segment-track flex p-1 rounded-lg flex-shrink-0 self-stretch md:self-auto overflow-x-auto">
                        {(['all', 'thisMonth', 'lastMonth', 'custom'] as DateRangeOption[]).map(opt => (
                            <button
                                type="button"
                                key={opt}
                                onClick={() => handleRangeChange(opt)}
                                className={`ds-segment-item px-4 py-1.5 text-xs font-semibold rounded-md transition-all duration-ds whitespace-nowrap capitalize ${dateRange === opt
                                        ? 'ds-segment-item-active shadow-sm'
                                        : 'text-app-muted hover:text-app-text hover:bg-app-surface-2'
                                    }`}
                            >
                                {opt === 'all' ? 'All Time' : opt.replace(/([A-Z])/g, ' $1')}
                            </button>
                        ))}
                    </div>

                    {dateRange === 'custom' && (
                        <div className="flex items-center gap-2 animate-fade-in px-2 border-l border-app-border">
                            <DatePicker value={startDate} onChange={(d) => handleCustomDateChange(toLocalDateString(d), endDate)} className="!py-1.5 !text-xs !w-32" />
                            <span className="text-app-muted">to</span>
                            <DatePicker value={endDate} onChange={(d) => handleCustomDateChange(startDate, toLocalDateString(d))} className="!py-1.5 !text-xs !w-32" />
                        </div>
                    )}

                    <div className="hidden md:block w-px h-6 bg-app-border mx-1"></div>

                    {/* Search */}
                    <div className="relative flex-grow w-full md:w-auto min-w-0">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-app-muted">
                            <div className="w-4 h-4">{ICONS.search}</div>
                        </div>
                        <input
                            type="text"
                            placeholder="Search agreements, projects, or owners..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="block w-full pl-9 pr-8 py-1.5 text-sm border-0 bg-transparent focus:ring-0 placeholder:text-app-muted text-app-text"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="absolute inset-y-0 right-0 flex items-center pr-3 text-app-muted hover:text-ds-danger transition-colors duration-ds"
                            >
                                <div className="w-4 h-4">{ICONS.x}</div>
                            </button>
                        )}
                    </div>

                    <div className="hidden md:block w-px h-6 bg-app-border mx-1"></div>

                    {/* Import & Create New */}
                    <div className="flex items-center gap-2 flex-shrink-0 w-full md:w-auto justify-end">
                        <Button
                            variant="secondary"
                            onClick={() => {
                                dispatch({ type: 'SET_INITIAL_IMPORT_TYPE', payload: ImportType.PROJECT_AGREEMENTS });
                                dispatch({ type: 'SET_PAGE', payload: 'import' });
                            }}
                            className="flex-1 md:flex-none justify-center !px-4 !py-2 !rounded-xl border-app-border bg-app-toolbar hover:bg-app-surface-2 hover:border-primary/40 hover:text-primary shadow-sm text-xs sm:text-sm transition-all duration-ds"
                        >
                            <div className="w-4 h-4 mr-2 opacity-70">{ICONS.download}</div>
                            Import
                        </Button>
                        <Button
                            onClick={() => { setAgreementToEdit(null); setIsCreateModalOpen(true); }}
                            className="flex-1 md:flex-none justify-center !px-4 !py-2 !rounded-xl !bg-primary hover:!bg-ds-primary-hover !text-ds-on-primary shadow-ds-card text-xs sm:text-sm transition-all duration-ds"
                        >
                            <div className="w-4 h-4 mr-2">{ICONS.plus}</div>
                            Create New
                        </Button>
                    </div>
                </div>
            </div>

            {/* Main Split View: flex container with overflow-hidden */}
            <div ref={containerRef} className="flex-grow flex flex-col md:flex-row overflow-hidden min-h-0">

                {/* Left: Resizable Tree Sidebar - no labels, compact for more table space */}
                <aside
                    className="hidden md:flex flex-col flex-shrink-0 bg-app-card rounded-lg border border-app-border shadow-ds-card overflow-hidden transition-shadow duration-ds"
                    style={{ width: `${sidebarWidth}px` }}
                >
                    <div className="flex-shrink-0 px-2 py-1.5 border-b border-app-border">
                        <div className="ds-segment-track flex gap-0.5 p-0.5 rounded-md">
                            <button
                                type="button"
                                onClick={() => setTreeGroupBy('owner')}
                                className={`ds-segment-item flex-1 px-2 py-1 text-xs font-medium rounded transition-all duration-ds capitalize ${treeGroupBy === 'owner'
                                    ? 'ds-segment-item-active shadow-sm font-semibold'
                                    : 'text-app-muted hover:text-app-text hover:bg-app-surface-2'
                                }`}
                            >
                                Owner
                            </button>
                            <button
                                type="button"
                                onClick={() => setTreeGroupBy('unit')}
                                className={`ds-segment-item flex-1 px-2 py-1 text-xs font-medium rounded transition-all duration-ds capitalize ${treeGroupBy === 'unit'
                                    ? 'ds-segment-item-active shadow-sm font-semibold'
                                    : 'text-app-muted hover:text-app-text hover:bg-app-surface-2'
                                }`}
                            >
                                Unit
                            </button>
                        </div>
                    </div>
                    <div className="flex-shrink-0 px-2 py-1 border-b border-app-border">
                        <div className="relative">
                            <div className="absolute inset-y-0 left-2 flex items-center pointer-events-none text-app-muted">
                                <div className="w-3.5 h-3.5">{ICONS.search}</div>
                            </div>
                            <input
                                type="text"
                                placeholder="Search projects, owners, units..."
                                value={treeSearchQuery}
                                onChange={(e) => setTreeSearchQuery(e.target.value)}
                                className="ds-input-field w-full pl-7 pr-6 py-1 text-xs rounded-md placeholder:text-app-muted"
                            />
                            {treeSearchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setTreeSearchQuery('')}
                                    className="absolute inset-y-0 right-2 flex items-center text-app-muted hover:text-ds-danger transition-colors duration-ds"
                                >
                                    <div className="w-3.5 h-3.5">{ICONS.x}</div>
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="flex-grow overflow-y-auto overflow-x-hidden p-1.5 min-h-0">
                        <AgreementTreeSidebar
                            nodes={filteredTreeData}
                            selectedId={selectedTreeId}
                            selectedType={selectedTreeType}
                            selectedParentId={selectedTreeParentId}
                            onSelect={(id, type, parentId) => {
                                if (selectedTreeId === id && selectedTreeType === type && selectedTreeParentId === (parentId ?? null)) {
                                    setSelectedTreeId(null);
                                    setSelectedTreeType(null);
                                    setSelectedTreeParentId(null);
                                } else {
                                    setSelectedTreeId(id);
                                    setSelectedTreeType(type);
                                    setSelectedTreeParentId(parentId ?? null);
                                }
                            }}
                        />
                    </div>
                </aside>

                {/* Resize Handle */}
                <div
                    className="hidden md:flex items-center justify-center flex-shrink-0 w-1 cursor-col-resize select-none touch-none group hover:bg-primary/10 transition-colors duration-ds"
                    onMouseDown={startResizing}
                    title="Drag to resize sidebar"
                >
                    <div className="w-px h-8 rounded-full bg-app-border group-hover:bg-primary transition-all duration-ds" />
                </div>

                {/* Right Data Grid */}
                <div className="flex-1 min-w-0 overflow-hidden flex flex-col bg-app-card rounded-lg border border-app-border shadow-ds-card transition-shadow duration-ds">
                    <div className="flex-grow overflow-auto">
                        <table className="min-w-full divide-y divide-app-border">
                            <thead className="bg-app-table-header sticky top-0 z-10">
                                <tr>
                                    <th onClick={() => handleSort('agreementNumber')} className="group px-3 py-1.5 text-left text-xs font-bold text-app-muted uppercase tracking-wider cursor-pointer hover:bg-app-toolbar select-none border-b border-app-border w-24">ID <SortIcon column="agreementNumber" /></th>
                                    <th onClick={() => handleSort('owner')} className="group px-3 py-1.5 text-left text-xs font-bold text-app-muted uppercase tracking-wider cursor-pointer hover:bg-app-toolbar select-none border-b border-app-border">Owner <SortIcon column="owner" /></th>
                                    <th onClick={() => handleSort('project')} className="group px-3 py-1.5 text-left text-xs font-bold text-app-muted uppercase tracking-wider cursor-pointer hover:bg-app-toolbar select-none border-b border-app-border">Project <SortIcon column="project" /></th>
                                    <th onClick={() => handleSort('units')} className="group px-3 py-1.5 text-left text-xs font-bold text-app-muted uppercase tracking-wider cursor-pointer hover:bg-app-toolbar select-none border-b border-app-border">Units <SortIcon column="units" /></th>
                                    <th onClick={() => handleSort('price')} className="group px-3 py-1.5 text-right text-xs font-bold text-app-muted uppercase tracking-wider cursor-pointer hover:bg-app-toolbar select-none border-b border-app-border">Price <SortIcon column="price" /></th>
                                    <th onClick={() => handleSort('paid')} className="group px-3 py-1.5 text-right text-xs font-bold text-app-muted uppercase tracking-wider cursor-pointer hover:bg-app-toolbar select-none border-b border-app-border">Paid <SortIcon column="paid" /></th>
                                    <th onClick={() => handleSort('balance')} className="group px-3 py-1.5 text-right text-xs font-bold text-app-muted uppercase tracking-wider cursor-pointer hover:bg-app-toolbar select-none border-b border-app-border">Balance <SortIcon column="balance" /></th>
                                    <th onClick={() => handleSort('status')} className="group px-3 py-1.5 text-center text-xs font-bold text-app-muted uppercase tracking-wider cursor-pointer hover:bg-app-toolbar select-none border-b border-app-border">Status <SortIcon column="status" /></th>
                                    <th onClick={() => handleSort('date')} className="group px-3 py-1.5 text-right text-xs font-bold text-app-muted uppercase tracking-wider cursor-pointer hover:bg-app-toolbar select-none border-b border-app-border">Date <SortIcon column="date" /></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-app-border">
                                {filteredAgreements.length > 0 ? filteredAgreements.map((agreement, index) => (
                                    <tr
                                        key={agreement.id}
                                        onClick={() => handleEdit(agreement)}
                                        className={`cursor-pointer transition-colors duration-ds group ${index % 2 === 0 ? 'bg-app-card' : 'bg-app-toolbar/40'} hover:bg-app-table-hover`}
                                    >
                                        <td className="px-3 py-1.5 whitespace-nowrap">
                                            <span className="font-mono text-[10px] sm:text-xs font-medium text-app-muted bg-app-toolbar px-1.5 py-0.5 rounded border border-app-border group-hover:border-primary/40 group-hover:text-primary transition-colors duration-ds">
                                                {agreement.agreementNumber}
                                            </span>
                                        </td>
                                        <td className="px-3 py-1.5 text-xs font-medium text-app-text truncate max-w-[140px]" title={agreement.ownerName}>
                                            <div className="flex items-center gap-2">
                                                <div className="w-5 h-5 rounded-full bg-nav-active text-primary flex items-center justify-center text-[10px] font-bold border border-app-border">
                                                    {agreement.ownerName.charAt(0)}
                                                </div>
                                                {agreement.ownerName}
                                            </div>
                                        </td>
                                        <td className="px-3 py-1.5 text-xs text-app-muted truncate max-w-[140px]" title={agreement.projectName}>{agreement.projectName}</td>
                                        <td className="px-3 py-1.5 text-xs text-app-muted truncate max-w-[100px]" title={agreement.unitNames}>{agreement.unitNames}</td>
                                        <td className="px-3 py-1.5 text-xs text-right font-medium text-app-text tabular-nums">{CURRENCY} {(agreement.sellingPrice || 0).toLocaleString()}</td>
                                        <td className="px-3 py-1.5 text-xs text-right text-ds-success tabular-nums font-medium">{CURRENCY} {(agreement.paid || 0).toLocaleString()}</td>
                                        <td className={`px-3 py-1.5 text-xs text-right font-bold tabular-nums ${(agreement.balance || 0) > 0 ? 'text-app-text' : 'text-app-muted'}`}>{CURRENCY} {(agreement.balance || 0).toLocaleString()}</td>
                                        <td className="px-3 py-1.5 text-center whitespace-nowrap">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${agreement.status === 'Active' ? 'border border-ds-success/30 bg-[color:var(--badge-paid-bg)] text-ds-success' :
                                                    agreement.status === ProjectAgreementStatus.COMPLETED ? 'ds-pill-type ds-pill-type-installment !rounded-full' :
                                                        agreement.status === 'Cancelled' ? 'border border-ds-danger/30 bg-[color:var(--badge-unpaid-bg)] text-[color:var(--badge-unpaid-text)]' :
                                                            'bg-app-toolbar text-app-muted border border-app-border'
                                                }`}>
                                                {agreement.status === 'Active' && <span className="w-1.5 h-1.5 rounded-full bg-ds-success mr-1.5 animate-pulse"></span>}
                                                {agreement.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 text-xs text-right text-app-muted whitespace-nowrap">{formatDate(agreement.issueDate)}</td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={9} className="px-3 py-12 text-center">
                                            <div className="flex flex-col items-center justify-center opacity-90">
                                                <div className="w-16 h-16 bg-app-toolbar rounded-2xl border border-app-border flex items-center justify-center mb-4">
                                                    <div className="transform scale-150 text-app-muted">{ICONS.fileText}</div>
                                                </div>
                                                <p className="text-sm font-semibold text-app-text">No agreements found</p>
                                                <p className="text-xs text-app-muted mt-1">Try adjusting your search or date filters</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="px-3 py-2 border-t border-app-border bg-app-toolbar flex flex-col sm:flex-row justify-between items-center gap-2 text-xs font-medium text-app-muted">
                        <div className="flex items-center gap-2">
                            <span className="bg-app-card border border-app-border px-2 py-0.5 rounded-md shadow-ds-card text-app-text">{filteredAgreements.length} Agreements</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <span>Total Value: <span className="text-app-text font-bold">{CURRENCY} {filteredAgreements.reduce((sum, a) => sum + (a.sellingPrice || 0), 0).toLocaleString()}</span></span>
                            <span>Outstanding: <span className="text-primary font-bold">{CURRENCY} {filteredAgreements.reduce((sum, a) => sum + ((a.sellingPrice || 0) - (a.paid || 0)), 0).toLocaleString()}</span></span>
                        </div>
                    </div>
                </div>
            </div>

            <Modal 
                isOpen={isCreateModalOpen} 
                onClose={() => setIsCreateModalOpen(false)} 
                title={agreementToEdit ? `Edit Agreement ${agreementToEdit.agreementNumber}` : "New Project Agreement"} 
                size="xl"
                disableScroll
            >
                <div className="h-full min-h-0 flex flex-col p-4">
                    <ProjectAgreementForm
                        onClose={() => setIsCreateModalOpen(false)}
                        agreementToEdit={agreementToEdit}
                        onCancelRequest={(agreement) => {
                            setIsCreateModalOpen(false);
                            setCancelAgreement(agreement);
                        }}
                    />
                </div>
            </Modal>

            <CancelAgreementModal
                isOpen={!!cancelAgreement}
                onClose={() => setCancelAgreement(null)}
                agreement={cancelAgreement}
            />
        </div>
    );
};

export default ProjectAgreementsPage;