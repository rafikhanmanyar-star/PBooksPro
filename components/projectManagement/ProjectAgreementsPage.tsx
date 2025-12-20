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
import PayrollTreeView, { PayrollTreeNode } from '../payroll/PayrollTreeView';
import DatePicker from '../ui/DatePicker';
import useLocalStorage from '../../hooks/useLocalStorage';
import ResizeHandle from '../ui/ResizeHandle';
import { ImportType } from '../../services/importService';

type SortKey = 'agreementNumber' | 'owner' | 'project' | 'units' | 'price' | 'paid' | 'balance' | 'date' | 'status';
type DateRangeOption = 'all' | 'thisMonth' | 'lastMonth' | 'custom';

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

    // Tree Selection State
    const [selectedTreeId, setSelectedTreeId] = useState<string | null>(null);
    const [selectedTreeType, setSelectedTreeType] = useState<'project' | 'staff' | null>(null);

    // Sidebar Resizing
    const [sidebarWidth, setSidebarWidth] = useLocalStorage<number>('projectAgreements_sidebarWidth', 300);
    const isResizing = useRef(false);
    const startX = useRef(0);
    const startWidth = useRef(0);

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

    // Initialize date range on mount
    useEffect(() => {
        if (dateRange !== 'custom' && dateRange !== 'all') {
            handleRangeChange(dateRange);
        }
    }, []);

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

    // --- Tree Data Construction ---
    // Hierarchy: Project -> Owner
    const treeData = useMemo<PayrollTreeNode[]>(() => {
        const projectMap = new Map<string, PayrollTreeNode>();

        // Initialize Projects
        state.projects.forEach(p => {
            projectMap.set(p.id, {
                id: p.id,
                name: p.name,
                type: 'project',
                children: [],
                count: 0
            });
        });

        dateFilteredAgreements.forEach(pa => {
            const projectNode = projectMap.get(pa.projectId);
            
            if (projectNode) {
                const client = state.contacts.find(c => c.id === pa.clientId);
                const clientId = pa.clientId;
                const clientName = client?.name || 'Unknown Owner';

                // Find or create Owner Node
                let clientNode = projectNode.children.find(c => c.id === clientId);
                if (!clientNode) {
                    clientNode = {
                        id: clientId,
                        name: clientName,
                        type: 'staff', // Reusing 'staff' type for sub-item styling
                        children: [],
                        count: 0
                    };
                    projectNode.children.push(clientNode);
                }

                clientNode.count!++;
                projectNode.count!++;
            }
        });

        return Array.from(projectMap.values())
            .filter(node => node.count! > 0)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(node => ({
                ...node,
                children: node.children.sort((a, b) => a.name.localeCompare(b.name))
            }));

    }, [dateFilteredAgreements, state.projects, state.contacts]);

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
            
            const balance = pa.sellingPrice - paid;

            return {
                ...pa,
                projectName: project?.name || 'Unknown',
                ownerName: client?.name || 'Unknown',
                unitNames: units,
                paid,
                balance
            };
        });

        // 1. Filter by Tree Selection
        if (selectedTreeId) {
            if (selectedTreeType === 'project') {
                agreements = agreements.filter(pa => pa.projectId === selectedTreeId);
            } else if (selectedTreeType === 'staff') {
                agreements = agreements.filter(pa => pa.clientId === selectedTreeId);
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

            switch(sortConfig.key) {
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

    }, [dateFilteredAgreements, state.projects, state.contacts, state.units, state.invoices, searchQuery, selectedTreeId, selectedTreeType, sortConfig]);

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

    const handleEdit = (agreement: ProjectAgreement) => {
        setAgreementToEdit(agreement);
        setIsCreateModalOpen(true);
    };

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
                        <Button
                            variant="secondary"
                            onClick={() => {
                                dispatch({ type: 'SET_INITIAL_IMPORT_TYPE', payload: ImportType.PROJECT_AGREEMENTS });
                                dispatch({ type: 'SET_PAGE', payload: 'import' });
                            }}
                            className="justify-center whitespace-nowrap w-full sm:w-auto"
                        >
                            <div className="w-4 h-4 mr-2">{ICONS.download}</div>
                            <span>Bulk Import</span>
                        </Button>
                        <Button onClick={() => { setAgreementToEdit(null); setIsCreateModalOpen(true); }} className="justify-center whitespace-nowrap w-full sm:w-auto">
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
                        <span>Projects & Owners</span>
                        {selectedTreeId && (
                            <button onClick={() => { setSelectedTreeId(null); setSelectedTreeType(null); }} className="text-xs text-accent hover:underline">Clear</button>
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
                                    <th onClick={() => handleSort('owner')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Owner <SortIcon column="owner"/></th>
                                    <th onClick={() => handleSort('project')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Project <SortIcon column="project"/></th>
                                    <th onClick={() => handleSort('units')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Units <SortIcon column="units"/></th>
                                    <th onClick={() => handleSort('price')} className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Price <SortIcon column="price"/></th>
                                    <th onClick={() => handleSort('paid')} className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Paid <SortIcon column="paid"/></th>
                                    <th onClick={() => handleSort('balance')} className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Balance <SortIcon column="balance"/></th>
                                    <th onClick={() => handleSort('date')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Date <SortIcon column="date"/></th>
                                    <th onClick={() => handleSort('status')} className="px-4 py-3 text-center font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Status <SortIcon column="status"/></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 bg-white">
                                {filteredAgreements.length > 0 ? filteredAgreements.map(agreement => (
                                    <tr 
                                        key={agreement.id} 
                                        onClick={() => handleEdit(agreement)}
                                        className="hover:bg-slate-50 cursor-pointer transition-colors group"
                                    >
                                        <td className="px-4 py-3 font-mono text-xs font-medium text-slate-600">{agreement.agreementNumber}</td>
                                        <td className="px-4 py-3 font-medium text-slate-800 truncate max-w-[150px]" title={agreement.ownerName}>{agreement.ownerName}</td>
                                        <td className="px-4 py-3 text-slate-600 truncate max-w-[150px]" title={agreement.projectName}>{agreement.projectName}</td>
                                        <td className="px-4 py-3 text-slate-500 truncate max-w-[100px]" title={agreement.unitNames}>{agreement.unitNames}</td>
                                        <td className="px-4 py-3 text-right font-medium text-slate-700">{CURRENCY} {agreement.sellingPrice.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right text-emerald-600">{CURRENCY} {agreement.paid.toLocaleString()}</td>
                                        <td className={`px-4 py-3 text-right font-bold text-slate-600`}>{CURRENCY} {agreement.balance.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatDate(agreement.issueDate)}</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                                                agreement.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 
                                                agreement.status === 'Cancelled' ? 'bg-rose-100 text-rose-800' : 
                                                'bg-slate-100 text-slate-600'
                                            }`}>
                                                {agreement.status}
                                            </span>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={9} className="px-4 py-12 text-center text-slate-500">
                                            No agreements found matching your criteria.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="p-3 border-t border-slate-200 bg-slate-50 text-sm font-medium text-slate-600 flex justify-between">
                        <span>Total Agreements: {filteredAgreements.length}</span>
                        <span>Total Value: {CURRENCY} {filteredAgreements.reduce((sum, a) => sum + a.sellingPrice, 0).toLocaleString()}</span>
                    </div>
                </div>
            </div>

            <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title={agreementToEdit ? `Edit Agreement ${agreementToEdit.agreementNumber}` : "New Project Agreement"} size="xl">
                <ProjectAgreementForm 
                    onClose={() => setIsCreateModalOpen(false)} 
                    agreementToEdit={agreementToEdit} 
                />
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