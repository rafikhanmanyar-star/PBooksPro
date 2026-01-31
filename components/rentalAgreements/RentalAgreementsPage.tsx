
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useAppContext } from '../../context/AppContext';
import Button from '../ui/Button';
import { ICONS, CURRENCY } from '../../constants';
import Modal from '../ui/Modal';
import { RentalAgreement, RentalAgreementStatus } from '../../types';
import RentalAgreementForm from './RentalAgreementForm';
import RentalAgreementTerminationModal from './RentalAgreementTerminationModal';
import Input from '../ui/Input';
import DatePicker from '../ui/DatePicker';
import { formatDate } from '../../utils/dateUtils';
import { TreeNode } from '../ui/TreeView';
import useLocalStorage from '../../hooks/useLocalStorage';
import { ImportType } from '../../services/importService';

type TreeSelectionType = 'building' | 'staff' | null;

/** Premium tree sidebar: Directories, avatars, orange active state, chevron expand (same style as Project Agreements) */
const RentalAgreementTreeSidebar: React.FC<{
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
        const nodeType = (level === 0 ? 'building' : 'staff') as TreeSelectionType;
        const isSelected = selectedId === node.id && selectedType === nodeType && (nodeType === 'building' || selectedParentId === parentId);
        const initials = node.label.slice(0, 2).toUpperCase();

        return (
            <div key={node.id} className={level > 0 ? 'ml-4 border-l border-slate-200/80 pl-3' : ''}>
                <div
                    className={`group flex items-center gap-2 py-1.5 px-2 rounded-lg -mx-0.5 transition-all cursor-pointer ${
                        isSelected ? 'bg-orange-500/10 text-orange-700' : 'hover:bg-slate-100/80 text-slate-700 hover:text-slate-900'
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

type SortKey = 'agreementNumber' | 'tenant' | 'owner' | 'property' | 'rent' | 'security' | 'startDate' | 'endDate' | 'status';
type DateRangeOption = 'all' | 'thisMonth' | 'lastMonth' | 'custom';

const RentalAgreementsPage: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [agreementToEdit, setAgreementToEdit] = useState<RentalAgreement | null>(null);
    const [terminationAgreement, setTerminationAgreement] = useState<RentalAgreement | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    
    // Persistent State
    const [dateRange, setDateRange] = useLocalStorage<DateRangeOption>('rentalAgreements_dateRange', 'all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const [groupBy, setGroupBy] = useLocalStorage<'tenant' | 'owner' | 'property'>('rentalAgreements_groupBy', 'tenant');
    const [selectedTreeId, setSelectedTreeId] = useState<string | null>(null);
    const [selectedTreeType, setSelectedTreeType] = useState<TreeSelectionType>(null);
    const [selectedTreeParentId, setSelectedTreeParentId] = useState<string | null>(null);
    const [sortConfig, setSortConfig] = useLocalStorage<{ key: SortKey; direction: 'asc' | 'desc' }>('rentalAgreements_sort', { key: 'startDate', direction: 'desc' });

    // Sidebar search and resize (container-relative, 150–600px, same as Project Agreements)
    const [treeSearchQuery, setTreeSearchQuery] = useState('');
    const [sidebarWidth, setSidebarWidth] = useLocalStorage<number>('rentalAgreements_sidebarWidth', 280);
    const [isResizing, setIsResizing] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const openModal = (agreement?: RentalAgreement) => {
        setAgreementToEdit(agreement || null);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setAgreementToEdit(null);
    };

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

    // Sidebar resize: container-relative width (150–600px)
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

    // Clear tree selection when group-by changes
    useEffect(() => {
        setSelectedTreeId(null);
        setSelectedTreeType(null);
        setSelectedTreeParentId(null);
    }, [groupBy]);

    // Initialize start/end date based on stored dateRange on mount if needed
    useEffect(() => {
        if (dateRange !== 'custom' && dateRange !== 'all') {
             handleRangeChange(dateRange);
        }
    }, []);

    // Check if we need to open an agreement from search
    useEffect(() => {
        const agreementId = sessionStorage.getItem('openRentalAgreementId');
        if (agreementId) {
            sessionStorage.removeItem('openRentalAgreementId');
            const agreement = state.rentalAgreements.find(a => a.id === agreementId);
            if (agreement) {
                openModal(agreement);
            }
        }
    }, [state.rentalAgreements]);

    // Filter agreements by date first
    const dateFilteredAgreements = useMemo(() => {
        let agreements = state.rentalAgreements;
        if (startDate && endDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            
            agreements = agreements.filter(a => {
                const d = new Date(a.startDate);
                return d >= start && d <= end;
            });
        }
        return agreements;
    }, [state.rentalAgreements, startDate, endDate]);

    // --- Tree Data Construction ---
    // Hierarchy: Building -> [Selected Subgroup]
    const treeData = useMemo<TreeNode[]>(() => {
        const buildingMap = new Map<string, TreeNode>();
        
        // Initialize Buildings
        state.buildings.forEach(b => {
            buildingMap.set(b.id, {
                id: b.id,
                label: b.name,
                type: 'building',
                children: [],
                value: 0
            });
        });
        
        // Fallback 'Unassigned' building
        buildingMap.set('unassigned', {
            id: 'unassigned',
            label: 'Unassigned',
            type: 'building',
            children: [],
            value: 0
        });

        dateFilteredAgreements.forEach(ra => {
            // Determine Building
            const property = state.properties.find(p => p.id === ra.propertyId);
            const buildingId = property?.buildingId || 'unassigned';
            const buildingNode = buildingMap.get(buildingId);

            if (buildingNode) {
                let subId = '';
                let subLabel = 'Unknown';

                // Determine Child Node based on groupBy
                if (groupBy === 'tenant') {
                    subId = ra.contactId;
                    subLabel = state.contacts.find(c => c.id === ra.contactId)?.name || 'Unknown Tenant';
                } else if (groupBy === 'owner') {
                    subId = property?.ownerId || 'unknown';
                    subLabel = state.contacts.find(c => c.id === subId)?.name || 'Unknown Owner';
                } else if (groupBy === 'property') {
                    subId = ra.propertyId;
                    subLabel = property?.name || 'Unknown Property';
                }

                // Find or create Child Node
                let childNode = buildingNode.children?.find(c => c.id === subId);
                if (!childNode) {
                    childNode = {
                        id: subId,
                        label: subLabel,
                        type: 'staff', // Reusing 'staff' type for styling consistency
                        children: [],
                        value: 0
                    };
                    buildingNode.children?.push(childNode);
                }
                
                childNode.value = (childNode.value as number || 0) + 1;
                buildingNode.value = (buildingNode.value as number || 0) + 1;
            }
        });

        return Array.from(buildingMap.values())
            .filter(node => (node.value as number || 0) > 0)
            .sort((a, b) => a.label.localeCompare(b.label))
            .map(node => ({
                ...node,
                children: node.children?.sort((a, b) => a.label.localeCompare(b.label))
            }));

    }, [dateFilteredAgreements, state.buildings, state.properties, state.contacts, groupBy]);

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
        let agreements = dateFilteredAgreements.map(ra => {
            const property = state.properties.find(p => p.id === ra.propertyId);
            const tenant = state.contacts.find(c => c.id === ra.contactId);
            // Use agreement's ownerId if available (for historical accuracy after property transfer), otherwise use property's ownerId
            const ownerId = ra.ownerId || property?.ownerId;
            const owner = ownerId ? state.contacts.find(c => c.id === ownerId) : null;
            const buildingId = property?.buildingId || 'unassigned';

            return {
                ...ra,
                propertyName: property?.name || 'Unknown',
                tenantName: tenant?.name || 'Unknown',
                ownerName: owner?.name || 'Unknown',
                buildingId: buildingId,
                // For filter matching - use agreement's ownerId if available, otherwise property's ownerId
                ownerId: ownerId
            };
        });

        // 1. Filter by Tree Selection (parent-scoped: subgroup selection filters by building + subgroup)
        if (selectedTreeId) {
            if (selectedTreeType === 'building') {
                agreements = agreements.filter(ra => ra.buildingId === selectedTreeId);
            } else {
                // Subgroup: filter by parent building and subgroup id
                agreements = agreements.filter(ra => ra.buildingId === selectedTreeParentId);
                if (groupBy === 'tenant') agreements = agreements.filter(ra => ra.contactId === selectedTreeId);
                else if (groupBy === 'owner') agreements = agreements.filter(ra => ra.ownerId === selectedTreeId);
                else if (groupBy === 'property') agreements = agreements.filter(ra => ra.propertyId === selectedTreeId);
            }
        }

        // 2. Filter by Search
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            agreements = agreements.filter(ra => 
                ra.agreementNumber.toLowerCase().includes(q) ||
                ra.tenantName.toLowerCase().includes(q) ||
                ra.propertyName.toLowerCase().includes(q) ||
                ra.ownerName.toLowerCase().includes(q) ||
                ra.status.toLowerCase().includes(q)
            );
        }

        // 3. Sort
        return agreements.sort((a, b) => {
            let valA: any = '';
            let valB: any = '';

            switch(sortConfig.key) {
                case 'agreementNumber': valA = a.agreementNumber; valB = b.agreementNumber; break;
                case 'tenant': valA = a.tenantName; valB = b.tenantName; break;
                case 'owner': valA = a.ownerName; valB = b.ownerName; break;
                case 'property': valA = a.propertyName; valB = b.propertyName; break;
                case 'rent': valA = a.monthlyRent || 0; valB = b.monthlyRent || 0; break;
                case 'security': valA = a.securityDeposit || 0; valB = b.securityDeposit || 0; break;
                case 'startDate': valA = new Date(a.startDate).getTime(); valB = new Date(b.startDate).getTime(); break;
                case 'endDate': valA = new Date(a.endDate).getTime(); valB = new Date(b.endDate).getTime(); break;
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

    }, [dateFilteredAgreements, state.properties, state.contacts, searchQuery, selectedTreeId, selectedTreeType, selectedTreeParentId, groupBy, sortConfig]);

    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const SortIcon = ({ column }: { column: SortKey }) => (
        <span className="ml-1 text-[10px] text-slate-400">
            {sortConfig.key === column ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
    );

    return (
        <div className="flex flex-col h-full space-y-4">
            {/* Toolbar: one row — date filter, search (with border), Bulk Import, Create New */}
            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex-shrink-0">
                <div className="flex flex-wrap items-center gap-2">
                    {/* Date Range Filter */}
                    <div className="flex bg-slate-100 p-1 rounded-lg flex-shrink-0 overflow-x-auto">
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
                                {opt === 'all' ? 'Total' : opt.replace(/([A-Z])/g, ' $1')}
                            </button>
                        ))}
                    </div>

                    {dateRange === 'custom' && (
                        <div className="flex items-center gap-2 animate-fade-in flex-shrink-0">
                            <DatePicker value={startDate} onChange={(d) => handleCustomDateChange(d.toISOString().split('T')[0], endDate)} />
                            <span className="text-slate-400">-</span>
                            <DatePicker value={endDate} onChange={(d) => handleCustomDateChange(startDate, d.toISOString().split('T')[0])} />
                        </div>
                    )}

                    {/* Search — same row, with border */}
                    <div className="relative flex-grow min-w-[180px] max-w-md">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            <div className="w-5 h-5">{ICONS.search}</div>
                        </div>
                        <Input 
                            placeholder="Search agreements..." 
                            value={searchQuery} 
                            onChange={(e) => setSearchQuery(e.target.value)} 
                            className="pl-10 border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400"
                        />
                        {searchQuery && (
                            <button 
                                type="button" 
                                onClick={() => setSearchQuery('')} 
                                className="absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400 hover:text-slate-600"
                            >
                                <div className="w-5 h-5">{ICONS.x}</div>
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                            variant="secondary"
                            onClick={() => {
                                dispatch({ type: 'SET_INITIAL_IMPORT_TYPE', payload: ImportType.RENTAL_AGREEMENTS });
                                dispatch({ type: 'SET_PAGE', payload: 'import' });
                            }}
                            className="justify-center whitespace-nowrap"
                        >
                            <div className="w-4 h-4 mr-2">{ICONS.download}</div>
                            <span>Bulk Import</span>
                        </Button>
                        <Button onClick={() => openModal()} className="justify-center whitespace-nowrap">
                            <div className="w-4 h-4 mr-2">{ICONS.plus}</div>
                            <span>Create New</span>
                        </Button>
                    </div>
                </div>
            </div>

            {/* Split View: container-relative resize */}
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
                                onClick={() => setGroupBy('tenant')}
                                className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-all capitalize ${groupBy === 'tenant'
                                    ? 'bg-white text-orange-600 shadow-sm font-bold ring-1 ring-black/5'
                                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                                }`}
                            >
                                Tenant
                            </button>
                            <button
                                onClick={() => setGroupBy('owner')}
                                className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-all capitalize ${groupBy === 'owner'
                                    ? 'bg-white text-orange-600 shadow-sm font-bold ring-1 ring-black/5'
                                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                                }`}
                            >
                                Owner
                            </button>
                            <button
                                onClick={() => setGroupBy('property')}
                                className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-all capitalize ${groupBy === 'property'
                                    ? 'bg-white text-orange-600 shadow-sm font-bold ring-1 ring-black/5'
                                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                                }`}
                            >
                                Property
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
                                placeholder="Search buildings, tenants..."
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
                        <RentalAgreementTreeSidebar
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
                    className="hidden md:flex items-center justify-center flex-shrink-0 w-2 cursor-col-resize select-none touch-none group hover:bg-blue-500/10 transition-colors"
                    onMouseDown={startResizing}
                    title="Drag to resize sidebar"
                >
                    <div className="w-0.5 h-12 rounded-full bg-slate-200 group-hover:bg-blue-500 group-hover:w-1 transition-all" />
                </div>

                {/* Right Data Grid */}
                <div className="flex-1 min-w-0 overflow-hidden flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex-grow overflow-auto">
                        <table className="min-w-full divide-y divide-slate-100 text-sm">
                            <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th onClick={() => handleSort('agreementNumber')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">ID <SortIcon column="agreementNumber"/></th>
                                    <th onClick={() => handleSort('tenant')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Tenant <SortIcon column="tenant"/></th>
                                    <th onClick={() => handleSort('property')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Property <SortIcon column="property"/></th>
                                    <th onClick={() => handleSort('owner')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Owner <SortIcon column="owner"/></th>
                                    <th onClick={() => handleSort('rent')} className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Monthly Rent <SortIcon column="rent"/></th>
                                    <th onClick={() => handleSort('security')} className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Security <SortIcon column="security"/></th>
                                    <th onClick={() => handleSort('startDate')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Start Date <SortIcon column="startDate"/></th>
                                    <th onClick={() => handleSort('endDate')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">End Date <SortIcon column="endDate"/></th>
                                    <th onClick={() => handleSort('status')} className="px-4 py-3 text-center font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Status <SortIcon column="status"/></th>
                                    <th className="px-4 py-3"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredAgreements.length > 0 ? filteredAgreements.map((agreement, index) => (
                                    <tr
                                        key={agreement.id}
                                        onClick={() => openModal(agreement)}
                                        className={`cursor-pointer transition-colors group ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'} hover:bg-slate-100`}
                                    >
                                        <td className="px-4 py-3 font-mono text-xs font-medium text-slate-600">{agreement.agreementNumber}</td>
                                        <td className="px-4 py-3 font-medium text-slate-800 truncate max-w-[150px]" title={agreement.tenantName}>{agreement.tenantName}</td>
                                        <td className="px-4 py-3 text-slate-600 truncate max-w-[150px]" title={agreement.propertyName}>{agreement.propertyName}</td>
                                        <td className="px-4 py-3 text-slate-500 truncate max-w-[150px]">{agreement.ownerName}</td>
                                        <td className="px-4 py-3 text-right font-medium text-slate-700">{CURRENCY} {(agreement.monthlyRent || 0).toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right text-slate-500">{agreement.securityDeposit ? `${CURRENCY} ${(agreement.securityDeposit || 0).toLocaleString()}` : '-'}</td>
                                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatDate(agreement.startDate)}</td>
                                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatDate(agreement.endDate)}</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                                                agreement.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 
                                                agreement.status === 'Terminated' ? 'bg-rose-100 text-rose-800' : 
                                                'bg-slate-100 text-slate-600'
                                            }`}>
                                                {agreement.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); openModal(agreement); }}
                                                className="text-emerald-600 hover:text-emerald-900 p-1 rounded hover:bg-emerald-50"
                                            >
                                                <div className="w-4 h-4">{ICONS.edit}</div>
                                            </button>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={10} className="px-4 py-12 text-center text-slate-500">
                                            No agreements found matching your criteria.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="p-3 border-t border-slate-200 bg-slate-50 text-sm font-medium text-slate-600">
                        Total Agreements: {filteredAgreements.length}
                    </div>
                </div>
            </div>

            <Modal
                isOpen={isModalOpen}
                onClose={closeModal}
                title={agreementToEdit ? `Edit Agreement ${agreementToEdit.agreementNumber}` : "Create New Rental Agreement"}
                size="xl"
                disableScroll
            >
                <div className="h-full min-h-0 flex flex-col p-4">
                    <RentalAgreementForm
                        key={agreementToEdit?.id || 'new'}
                        onClose={closeModal}
                        agreementToEdit={agreementToEdit} 
                        onTerminateRequest={() => {
                            setIsModalOpen(false);
                            setTerminationAgreement(agreementToEdit);
                        }}
                    />
                </div>
            </Modal>

            <RentalAgreementTerminationModal
                isOpen={!!terminationAgreement}
                onClose={() => setTerminationAgreement(null)}
                agreement={terminationAgreement}
            />
        </div>
    );
};

export default RentalAgreementsPage;
