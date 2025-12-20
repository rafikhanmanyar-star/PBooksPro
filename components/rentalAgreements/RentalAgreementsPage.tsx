
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useAppContext } from '../../context/AppContext';
import Button from '../ui/Button';
import { ICONS, CURRENCY } from '../../constants';
import Modal from '../ui/Modal';
import { RentalAgreement, RentalAgreementStatus } from '../../types';
import RentalAgreementForm from './RentalAgreementForm';
import RentalAgreementTerminationModal from './RentalAgreementTerminationModal';
import Input from '../ui/Input';
import Select from '../ui/Select';
import DatePicker from '../ui/DatePicker';
import { formatDate } from '../../utils/dateUtils';
import PayrollTreeView, { PayrollTreeNode } from '../payroll/PayrollTreeView'; 
import useLocalStorage from '../../hooks/useLocalStorage';
import ResizeHandle from '../ui/ResizeHandle';
import { ImportType } from '../../services/importService';

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
    const [selectedTreeType, setSelectedTreeType] = useState<string | null>(null);
    const [sortConfig, setSortConfig] = useLocalStorage<{ key: SortKey; direction: 'asc' | 'desc' }>('rentalAgreements_sort', { key: 'startDate', direction: 'desc' });
    
    // Sidebar Resizing
    const [sidebarWidth, setSidebarWidth] = useLocalStorage<number>('rentalAgreements_sidebarWidth', 300);
    const isResizing = useRef(false);
    const startX = useRef(0);
    const startWidth = useRef(0);

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

    // Sidebar Resize Handlers
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
    }, []);
    
    // Initialize start/end date based on stored dateRange on mount if needed
    useEffect(() => {
        if (dateRange !== 'custom' && dateRange !== 'all') {
             handleRangeChange(dateRange);
        }
    }, []);

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
    const treeData = useMemo<PayrollTreeNode[]>(() => {
        const buildingMap = new Map<string, PayrollTreeNode>();
        
        // Initialize Buildings
        state.buildings.forEach(b => {
            buildingMap.set(b.id, {
                id: b.id,
                name: b.name,
                type: 'building' as any,
                children: [],
                count: 0
            });
        });
        
        // Fallback 'Unassigned' building
        buildingMap.set('unassigned', {
            id: 'unassigned',
            name: 'Unassigned',
            type: 'building' as any,
            children: [],
            count: 0
        });

        dateFilteredAgreements.forEach(ra => {
            // Determine Building
            const property = state.properties.find(p => p.id === ra.propertyId);
            const buildingId = property?.buildingId || 'unassigned';
            const buildingNode = buildingMap.get(buildingId);

            if (buildingNode) {
                let subId = '';
                let subName = 'Unknown';

                // Determine Child Node based on groupBy
                if (groupBy === 'tenant') {
                    subId = ra.tenantId;
                    subName = state.contacts.find(c => c.id === ra.tenantId)?.name || 'Unknown Tenant';
                } else if (groupBy === 'owner') {
                    subId = property?.ownerId || 'unknown';
                    subName = state.contacts.find(c => c.id === subId)?.name || 'Unknown Owner';
                } else if (groupBy === 'property') {
                    subId = ra.propertyId;
                    subName = property?.name || 'Unknown Property';
                }

                // Find or create Child Node
                let childNode = buildingNode.children.find(c => c.id === subId);
                if (!childNode) {
                    childNode = {
                        id: subId,
                        name: subName,
                        type: 'staff' as any, // Reusing 'staff' type for styling consistency
                        children: [],
                        count: 0
                    };
                    buildingNode.children.push(childNode);
                }
                
                childNode.count!++;
                buildingNode.count!++;
            }
        });

        return Array.from(buildingMap.values())
            .filter(node => node.count! > 0)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(node => ({
                ...node,
                children: node.children.sort((a, b) => a.name.localeCompare(b.name))
            }));

    }, [dateFilteredAgreements, state.buildings, state.properties, state.contacts, groupBy]);


    // --- Table Data Construction ---
    const filteredAgreements = useMemo(() => {
        let agreements = dateFilteredAgreements.map(ra => {
            const property = state.properties.find(p => p.id === ra.propertyId);
            const tenant = state.contacts.find(c => c.id === ra.tenantId);
            const owner = property ? state.contacts.find(c => c.id === property.ownerId) : null;
            const buildingId = property?.buildingId || 'unassigned';

            return {
                ...ra,
                propertyName: property?.name || 'Unknown',
                tenantName: tenant?.name || 'Unknown',
                ownerName: owner?.name || 'Unknown',
                buildingId: buildingId,
                // For filter matching
                ownerId: property?.ownerId
            };
        });

        // 1. Filter by Tree Selection
        if (selectedTreeId) {
            if (selectedTreeType === 'building') {
                agreements = agreements.filter(ra => ra.buildingId === selectedTreeId);
            } else {
                // Subgroup filtering
                if (groupBy === 'tenant') agreements = agreements.filter(ra => ra.tenantId === selectedTreeId);
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
                case 'rent': valA = a.monthlyRent; valB = b.monthlyRent; break;
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

    }, [dateFilteredAgreements, state.properties, state.contacts, searchQuery, selectedTreeId, selectedTreeType, groupBy, sortConfig]);

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
            {/* Toolbar */}
            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex flex-col gap-3 flex-shrink-0">
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
                        <div className="flex items-center gap-2 animate-fade-in">
                            <DatePicker value={startDate} onChange={(d) => handleCustomDateChange(d.toISOString().split('T')[0], endDate)} />
                            <span className="text-slate-400">-</span>
                            <DatePicker value={endDate} onChange={(d) => handleCustomDateChange(startDate, d.toISOString().split('T')[0])} />
                        </div>
                    )}
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4">
                    <div className="relative flex-grow w-full sm:w-auto">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            <div className="w-5 h-5">{ICONS.search}</div>
                        </div>
                        <Input 
                            placeholder="Search agreements..." 
                            value={searchQuery} 
                            onChange={(e) => setSearchQuery(e.target.value)} 
                            className="pl-10"
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
                    
                    <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto">
                        <div className="w-full sm:w-48">
                             <Select
                                label=""
                                value={groupBy}
                                onChange={(e) => { 
                                    setGroupBy(e.target.value as any); 
                                    setSelectedTreeId(null); // Reset selection on group change
                                }}
                                className="py-2"
                            >
                                <option value="tenant">Group by Tenant</option>
                                <option value="owner">Group by Owner</option>
                                <option value="property">Group by Property</option>
                            </Select>
                        </div>
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

            {/* Split View */}
            <div className="flex-grow flex flex-col md:flex-row gap-4 overflow-hidden min-h-0">
                
                {/* Left Tree View */}
                <div 
                    className="hidden md:flex flex-col h-full flex-shrink-0"
                    style={{ width: sidebarWidth }}
                >
                    <div className="font-bold text-slate-700 mb-2 px-1 flex justify-between items-center">
                        <span>Properties & Tenants</span>
                        {selectedTreeId && (
                            <button onClick={() => setSelectedTreeId(null)} className="text-xs text-accent hover:underline">Clear</button>
                        )}
                    </div>
                    <PayrollTreeView 
                        treeData={treeData} 
                        selectedId={selectedTreeId} 
                        onSelect={(id, type) => {
                            if (selectedTreeId === id) {
                                setSelectedTreeId(null);
                                setSelectedTreeType(null);
                            } else {
                                setSelectedTreeId(id);
                                setSelectedTreeType(type as any);
                            }
                        }} 
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
                            <tbody className="divide-y divide-slate-200 bg-white">
                                {filteredAgreements.length > 0 ? filteredAgreements.map(agreement => (
                                    <tr 
                                        key={agreement.id} 
                                        onClick={() => openModal(agreement)}
                                        className="hover:bg-slate-50 cursor-pointer transition-colors group"
                                    >
                                        <td className="px-4 py-3 font-mono text-xs font-medium text-slate-600">{agreement.agreementNumber}</td>
                                        <td className="px-4 py-3 font-medium text-slate-800 truncate max-w-[150px]" title={agreement.tenantName}>{agreement.tenantName}</td>
                                        <td className="px-4 py-3 text-slate-600 truncate max-w-[150px]" title={agreement.propertyName}>{agreement.propertyName}</td>
                                        <td className="px-4 py-3 text-slate-500 truncate max-w-[150px]">{agreement.ownerName}</td>
                                        <td className="px-4 py-3 text-right font-medium text-slate-700">{CURRENCY} {agreement.monthlyRent.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right text-slate-500">{agreement.securityDeposit ? `${CURRENCY} ${agreement.securityDeposit.toLocaleString()}` : '-'}</td>
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
                                                className="text-indigo-600 hover:text-indigo-900 p-1 rounded hover:bg-indigo-50"
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

            <Modal isOpen={isModalOpen} onClose={closeModal} title={agreementToEdit ? `Edit Agreement ${agreementToEdit.agreementNumber}` : "Create New Rental Agreement"}>
                <RentalAgreementForm 
                    key={agreementToEdit?.id || 'new'} 
                    onClose={closeModal} 
                    agreementToEdit={agreementToEdit} 
                    onTerminateRequest={() => {
                        setIsModalOpen(false);
                        setTerminationAgreement(agreementToEdit);
                    }}
                />
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
