import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useAppContext } from '../../context/AppContext';
import { ProjectAgreement, ContactType, ProjectAgreementStatus, TransactionType } from '../../types';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { ICONS, CURRENCY } from '../../constants';
import Modal from '../ui/Modal';
import ProjectAgreementForm from './ProjectAgreementForm';
import CancelAgreementModal from './CancelAgreementModal';
import { formatDate } from '../../utils/dateUtils';
import { TreeNode } from '../ui/TreeView';
import DatePicker from '../ui/DatePicker';
import useLocalStorage from '../../hooks/useLocalStorage';
import { ImportType } from '../../services/importService';

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

    const toggleExpanded = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const renderNode = (node: TreeNode, level: number, parentId?: string | null) => {
        const hasChildren = node.children && node.children.length > 0;
        const isExpanded = expandedIds.has(node.id);
        const nodeType = (node.type || 'project') as TreeSelectionType;
        const isSelected = selectedId === node.id && selectedType === nodeType && (nodeType === 'project' || selectedParentId === parentId);
        const initials = node.label.slice(0, 2).toUpperCase();

        return (
            <div key={node.id} className={level > 0 ? 'ml-4 border-l border-slate-200/80 pl-3' : ''}>
                <div
                    className={`group flex items-center gap-2 py-1.5 px-2 rounded-lg -mx-0.5 transition-all cursor-pointer ${
                        isSelected
                            ? 'bg-orange-500/10 text-orange-700'
                            : 'hover:bg-slate-100/80 text-slate-700 hover:text-slate-900'
                    }`}
                    onClick={() => onSelect(node.id, nodeType, level > 0 ? parentId : undefined)}
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
                    <span className="flex-shrink-0 w-6 h-6 rounded-md bg-slate-800 text-slate-200 text-[10px] font-bold flex items-center justify-center">
                        {initials}
                    </span>
                    <span className="flex-1 text-xs font-medium truncate">{node.label}</span>
                    {node.value !== undefined && typeof node.value === 'number' && node.value > 0 && (
                        <span className={`text-[10px] font-semibold tabular-nums ${isSelected ? 'text-orange-600' : 'text-slate-500'}`}>
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
            <div className="text-xs text-slate-400 italic p-2">No directories match your search</div>
        );
    }

    return (
        <div className="space-y-0.5">
            {nodes.map(node => renderNode(node, 0))}
        </div>
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
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleUp);
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

    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const SortIcon = ({ column }: { column: SortKey }) => (
        <span className={`ml-1.5 inline-flex flex-shrink-0 transition-opacity duration-200 ${sortConfig.key === column ? 'opacity-100 text-indigo-600' : 'opacity-0 group-hover:opacity-100 text-slate-400'}`}>
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
        <div className="flex flex-col h-full bg-slate-50/50 p-4 sm:p-6 gap-4 sm:gap-6">
            {/* Search and filter bar (with Import & Create New) */}
            <div className="flex-shrink-0">
                <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3 items-center">
                    {/* Date Controls */}
                    <div className="flex bg-slate-100/80 p-1 rounded-lg flex-shrink-0 self-stretch md:self-auto overflow-x-auto">
                        {(['all', 'thisMonth', 'lastMonth', 'custom'] as DateRangeOption[]).map(opt => (
                            <button
                                key={opt}
                                onClick={() => handleRangeChange(opt)}
                                className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap capitalize ${dateRange === opt
                                        ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5'
                                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                                    }`}
                            >
                                {opt === 'all' ? 'All Time' : opt.replace(/([A-Z])/g, ' $1')}
                            </button>
                        ))}
                    </div>

                    {dateRange === 'custom' && (
                        <div className="flex items-center gap-2 animate-fade-in px-2 border-l border-slate-100">
                            <DatePicker value={startDate} onChange={(d) => handleCustomDateChange(d.toISOString().split('T')[0], endDate)} className="!py-1.5 !text-xs !w-32" />
                            <span className="text-slate-300">to</span>
                            <DatePicker value={endDate} onChange={(d) => handleCustomDateChange(startDate, d.toISOString().split('T')[0])} className="!py-1.5 !text-xs !w-32" />
                        </div>
                    )}

                    <div className="hidden md:block w-px h-6 bg-slate-200 mx-1"></div>

                    {/* Search */}
                    <div className="relative flex-grow w-full md:w-auto min-w-0">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            <div className="w-4 h-4">{ICONS.search}</div>
                        </div>
                        <input
                            type="text"
                            placeholder="Search agreements, projects, or owners..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="block w-full pl-9 pr-8 py-1.5 text-sm border-0 bg-transparent focus:ring-0 placeholder:text-slate-400 text-slate-700"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-rose-500 transition-colors"
                            >
                                <div className="w-4 h-4">{ICONS.x}</div>
                            </button>
                        )}
                    </div>

                    <div className="hidden md:block w-px h-6 bg-slate-200 mx-1"></div>

                    {/* Import & Create New */}
                    <div className="flex items-center gap-2 flex-shrink-0 w-full md:w-auto justify-end">
                        <Button
                            variant="secondary"
                            onClick={() => {
                                dispatch({ type: 'SET_INITIAL_IMPORT_TYPE', payload: ImportType.PROJECT_AGREEMENTS });
                                dispatch({ type: 'SET_PAGE', payload: 'import' });
                            }}
                            className="flex-1 md:flex-none justify-center !px-4 !py-2 !rounded-xl border-slate-200 bg-white hover:border-indigo-300 hover:text-indigo-600 shadow-sm text-xs sm:text-sm"
                        >
                            <div className="w-4 h-4 mr-2 opacity-70">{ICONS.download}</div>
                            Import
                        </Button>
                        <Button
                            onClick={() => { setAgreementToEdit(null); setIsCreateModalOpen(true); }}
                            className="flex-1 md:flex-none justify-center !px-4 !py-2 !rounded-xl shadow-md shadow-indigo-500/20 text-xs sm:text-sm"
                        >
                            <div className="w-4 h-4 mr-2">{ICONS.plus}</div>
                            Create New
                        </Button>
                    </div>
                </div>
            </div>

            {/* Main Split View: flex container with overflow-hidden */}
            <div ref={containerRef} className="flex-grow flex flex-col md:flex-row overflow-hidden min-h-0">

                {/* Left: Resizable Tree Sidebar */}
                <aside
                    className="hidden md:flex flex-col flex-shrink-0 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
                    style={{ width: `${sidebarWidth}px` }}
                >
                    <div className="flex-shrink-0 p-3 border-b border-slate-100 bg-slate-50/50">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Directories</span>
                    </div>
                    <div className="flex-shrink-0 px-3 py-2 border-b border-slate-100 bg-slate-50/30">
                        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Group by</span>
                        <div className="flex bg-slate-100 p-1 rounded-lg mt-1.5">
                            <button
                                onClick={() => setTreeGroupBy('owner')}
                                className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-all capitalize ${treeGroupBy === 'owner'
                                    ? 'bg-white text-orange-600 shadow-sm font-bold ring-1 ring-black/5'
                                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                                }`}
                            >
                                Owner
                            </button>
                            <button
                                onClick={() => setTreeGroupBy('unit')}
                                className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-all capitalize ${treeGroupBy === 'unit'
                                    ? 'bg-white text-orange-600 shadow-sm font-bold ring-1 ring-black/5'
                                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                                }`}
                            >
                                Unit
                            </button>
                        </div>
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
                    <div className="flex-grow overflow-y-auto overflow-x-hidden p-2 min-h-0">
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

                {/* Resize Handle: larger hit area, col-resize, hover highlight */}
                <div
                    className="hidden md:flex items-center justify-center flex-shrink-0 w-2 cursor-col-resize select-none touch-none group hover:bg-blue-500/10 transition-colors"
                    onMouseDown={startResizing}
                    title="Drag to resize sidebar"
                >
                    <div className="w-0.5 h-12 rounded-full bg-slate-200 group-hover:bg-blue-500 group-hover:w-1 transition-all" />
                </div>

                {/* Right Data Grid: flex-1 min-w-0 to avoid horizontal scroll */}
                <div className="flex-1 min-w-0 overflow-hidden flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex-grow overflow-auto">
                        <table className="min-w-full divide-y divide-slate-100">
                            <thead className="bg-slate-50 sticky top-0 z-10">
                                <tr>
                                    <th onClick={() => handleSort('agreementNumber')} className="group px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none border-b border-slate-200 w-24">ID <SortIcon column="agreementNumber" /></th>
                                    <th onClick={() => handleSort('owner')} className="group px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none border-b border-slate-200">Owner <SortIcon column="owner" /></th>
                                    <th onClick={() => handleSort('project')} className="group px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none border-b border-slate-200">Project <SortIcon column="project" /></th>
                                    <th onClick={() => handleSort('units')} className="group px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none border-b border-slate-200">Units <SortIcon column="units" /></th>
                                    <th onClick={() => handleSort('price')} className="group px-4 py-2.5 text-right text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none border-b border-slate-200">Price <SortIcon column="price" /></th>
                                    <th onClick={() => handleSort('paid')} className="group px-4 py-2.5 text-right text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none border-b border-slate-200">Paid <SortIcon column="paid" /></th>
                                    <th onClick={() => handleSort('balance')} className="group px-4 py-2.5 text-right text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none border-b border-slate-200">Balance <SortIcon column="balance" /></th>
                                    <th onClick={() => handleSort('status')} className="group px-4 py-2.5 text-center text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none border-b border-slate-200">Status <SortIcon column="status" /></th>
                                    <th onClick={() => handleSort('date')} className="group px-4 py-2.5 text-right text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none border-b border-slate-200">Date <SortIcon column="date" /></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredAgreements.length > 0 ? filteredAgreements.map((agreement, index) => (
                                    <tr
                                        key={agreement.id}
                                        onClick={() => handleEdit(agreement)}
                                        className={`cursor-pointer transition-colors group ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'} hover:bg-slate-100`}
                                    >
                                        <td className="px-4 py-2 whitespace-nowrap">
                                            <span className="font-mono text-[10px] sm:text-xs font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md border border-slate-200 group-hover:border-indigo-200 group-hover:text-indigo-600 transition-colors">
                                                {agreement.agreementNumber}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 text-xs font-medium text-slate-800 truncate max-w-[140px]" title={agreement.ownerName}>
                                            <div className="flex items-center gap-2">
                                                <div className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-[10px] font-bold">
                                                    {agreement.ownerName.charAt(0)}
                                                </div>
                                                {agreement.ownerName}
                                            </div>
                                        </td>
                                        <td className="px-4 py-2 text-xs text-slate-600 truncate max-w-[140px]" title={agreement.projectName}>{agreement.projectName}</td>
                                        <td className="px-4 py-2 text-xs text-slate-500 truncate max-w-[100px]" title={agreement.unitNames}>{agreement.unitNames}</td>
                                        <td className="px-4 py-2 text-xs text-right font-medium text-slate-700 tabular-nums">{CURRENCY} {(agreement.sellingPrice || 0).toLocaleString()}</td>
                                        <td className="px-4 py-2 text-xs text-right text-emerald-600 tabular-nums font-medium">{CURRENCY} {(agreement.paid || 0).toLocaleString()}</td>
                                        <td className={`px-4 py-2 text-xs text-right font-bold tabular-nums ${(agreement.balance || 0) > 0 ? 'text-slate-700' : 'text-slate-400'}`}>{CURRENCY} {(agreement.balance || 0).toLocaleString()}</td>
                                        <td className="px-4 py-2 text-center whitespace-nowrap">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${agreement.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                                                    agreement.status === ProjectAgreementStatus.COMPLETED ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' :
                                                        agreement.status === 'Cancelled' ? 'bg-rose-50 text-rose-700 border border-rose-100' :
                                                            'bg-slate-100 text-slate-600 border border-slate-200'
                                                }`}>
                                                {agreement.status === 'Active' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span>}
                                                {agreement.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 text-xs text-right text-slate-400 whitespace-nowrap">{formatDate(agreement.issueDate)}</td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={9} className="px-4 py-16 text-center">
                                            <div className="flex flex-col items-center justify-center opacity-40">
                                                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
                                                    <div className="transform scale-150 text-slate-400">{ICONS.fileText}</div>
                                                </div>
                                                <p className="text-sm font-semibold text-slate-600">No agreements found</p>
                                                <p className="text-xs text-slate-500 mt-1">Try adjusting your search or date filters</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="px-4 py-3 border-t border-slate-200 bg-slate-50/50 backdrop-blur-sm flex flex-col sm:flex-row justify-between items-center gap-2 text-xs font-medium text-slate-600">
                        <div className="flex items-center gap-2">
                            <span className="bg-white border border-slate-200 px-2 py-0.5 rounded-md shadow-sm">{filteredAgreements.length} Agreements</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <span>Total Value: <span className="text-slate-900 font-bold">{CURRENCY} {filteredAgreements.reduce((sum, a) => sum + (a.sellingPrice || 0), 0).toLocaleString()}</span></span>
                            <span>Outstanding: <span className="text-indigo-600 font-bold">{CURRENCY} {filteredAgreements.reduce((sum, a) => sum + ((a.sellingPrice || 0) - (a.paid || 0)), 0).toLocaleString()}</span></span>
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