
import React, { useState, useMemo, useRef, useCallback } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Staff } from '../../types';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Modal from '../ui/Modal';
import { ICONS, CURRENCY } from '../../constants';
import StaffForm from './StaffForm';
import { PromotionModal, StaffExitModal, TransferStaffModal } from './StaffActionsModals';
import { formatDate } from '../../utils/dateUtils';
import PayrollTreeView, { PayrollTreeNode } from './PayrollTreeView';
import ResizeHandle from '../ui/ResizeHandle';

interface StaffManagementProps {
    payrollType?: 'Rental' | 'Project';
}

const StaffManagement: React.FC<StaffManagementProps> = ({ payrollType }) => {
    const { state, dispatch } = useAppContext();
    const [searchQuery, setSearchQuery] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [staffToEdit, setStaffToEdit] = useState<Staff | null>(null);
    
    // Tree Selection State
    const [selectedTreeId, setSelectedTreeId] = useState<string | null>(null);
    const [selectedTreeType, setSelectedTreeType] = useState<'project' | 'building' | 'staff' | null>(null);

    // Sidebar Resizing
    const [sidebarWidth, setSidebarWidth] = useState(250);
    const isResizing = useRef(false);
    const startX = useRef(0);
    const startWidth = useRef(0);

    // New Modals
    const [promotionModal, setPromotionModal] = useState<{ isOpen: boolean; staff: Staff | null }>({ isOpen: false, staff: null });
    const [transferModal, setTransferModal] = useState<{ isOpen: boolean; staff: Staff | null }>({ isOpen: false, staff: null });
    const [exitModal, setExitModal] = useState<{ isOpen: boolean; staff: Staff | null }>({ isOpen: false, staff: null });

    const allStaff = useMemo(() => {
        if (payrollType === 'Rental') return state.rentalStaff;
        if (payrollType === 'Project') return state.projectStaff;
        return [...state.rentalStaff, ...state.projectStaff];
    }, [state.rentalStaff, state.projectStaff, payrollType]);

    // --- Build Tree Data ---
    const treeData = useMemo<PayrollTreeNode[]>(() => {
        const nodes: PayrollTreeNode[] = [];

        // 1. Projects
        if (!payrollType || payrollType === 'Project') {
            state.projects.forEach(proj => {
                const staffInProject = state.projectStaff.filter(s => s.projectId === proj.id);
                if (staffInProject.length > 0) {
                    const children = staffInProject.map(s => {
                        const contact = state.contacts.find(c => c.id === s.id);
                        return {
                            id: s.id,
                            name: contact?.name || 'Unknown',
                            type: 'staff' as const,
                            children: []
                        };
                    }).sort((a, b) => a.name.localeCompare(b.name));

                    nodes.push({
                        id: proj.id,
                        name: proj.name,
                        type: 'project',
                        count: staffInProject.length,
                        children
                    });
                }
            });
        }

        // 2. Buildings
        if (!payrollType || payrollType === 'Rental') {
            state.buildings.forEach(bldg => {
                const staffInBldg = state.rentalStaff.filter(s => s.buildingId === bldg.id);
                if (staffInBldg.length > 0) {
                    const children = staffInBldg.map(s => {
                        const contact = state.contacts.find(c => c.id === s.id);
                        return {
                            id: s.id,
                            name: contact?.name || 'Unknown',
                            type: 'staff' as const,
                            children: []
                        };
                    }).sort((a, b) => a.name.localeCompare(b.name));

                    nodes.push({
                        id: bldg.id,
                        name: bldg.name,
                        type: 'building',
                        count: staffInBldg.length,
                        children
                    });
                }
            });
        }

        return nodes.sort((a, b) => a.name.localeCompare(b.name));
    }, [state.projects, state.buildings, state.projectStaff, state.rentalStaff, state.contacts, payrollType]);

    const filteredStaff = useMemo(() => {
        let list = allStaff;

        // Tree Filter
        if (selectedTreeId) {
            if (selectedTreeType === 'staff') {
                list = list.filter(s => s.id === selectedTreeId);
            } else if (selectedTreeType === 'project') {
                list = list.filter(s => s.projectId === selectedTreeId);
            } else if (selectedTreeType === 'building') {
                list = list.filter(s => s.buildingId === selectedTreeId);
            }
        }

        // Search Filter
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            list = list.filter(s => {
                const contact = state.contacts.find(c => c.id === s.id);
                const name = contact?.name || '';
                return name.toLowerCase().includes(q) ||
                       s.designation.toLowerCase().includes(q);
            });
        }
        return list;
    }, [allStaff, state.contacts, searchQuery, selectedTreeId, selectedTreeType]);

    const openModal = (staff?: Staff) => {
        setStaffToEdit(staff || null);
        setIsModalOpen(true);
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
    }, []);

    const stopResize = useCallback(() => {
        isResizing.current = false;
        document.removeEventListener('mousemove', handleResize);
        document.removeEventListener('mouseup', stopResize);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }, []);

    const getStatusColor = (status: string) => {
        switch(status) {
            case 'Active': return 'bg-emerald-100 text-emerald-800';
            case 'Inactive': return 'bg-slate-100 text-slate-600';
            case 'Resigned': return 'bg-amber-100 text-amber-800';
            case 'Terminated': return 'bg-rose-100 text-rose-800';
            default: return 'bg-slate-100 text-slate-600';
        }
    };

    const calculateServiceDuration = (startDateStr: string, endDateStr?: string) => {
        const start = new Date(startDateStr);
        const end = endDateStr ? new Date(endDateStr) : new Date();
        
        if (isNaN(start.getTime())) return '-';

        let years = end.getFullYear() - start.getFullYear();
        let months = end.getMonth() - start.getMonth();
        let days = end.getDate() - start.getDate();

        if (days < 0) {
            months--;
            const prevMonthDate = new Date(end.getFullYear(), end.getMonth(), 0);
            days += prevMonthDate.getDate();
        }

        if (months < 0) {
            years--;
            months += 12;
        }

        const parts = [];
        if (years > 0) parts.push(`${years} Yr${years > 1 ? 's' : ''}`);
        if (months > 0) parts.push(`${months} Mo${months !== 1 ? 's' : ''}`);
        if (days > 0) parts.push(`${days} Day${days !== 1 ? 's' : ''}`);
        
        if (parts.length === 0) return '0 Days';
        
        return parts.join(' ');
    };

    return (
        <div className="space-y-4 h-full flex flex-col">
            {/* Top Toolbar */}
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex-shrink-0">
                <div className="flex-grow relative max-w-md">
                     <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            <span className="h-5 w-5">{ICONS.search}</span>
                        </div>
                        <Input 
                            id="staff-search"
                            placeholder="Search staff name..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 pr-8"
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
                </div>
                <div className="flex-shrink-0 self-end sm:self-auto">
                    <Button onClick={() => openModal()}>
                        <div className="w-4 h-4 mr-2">{ICONS.plus}</div>
                        Add Staff
                    </Button>
                </div>
            </div>

            {/* Split View Content */}
            <div className="flex-grow flex flex-col md:flex-row gap-4 overflow-hidden min-h-0">
                {/* Left Tree (Hidden on Mobile) */}
                <div 
                    className="hidden md:flex flex-col h-full flex-shrink-0"
                    style={{ width: sidebarWidth }}
                >
                    <div className="font-bold text-slate-700 mb-2 px-1">Organization</div>
                    <PayrollTreeView 
                        treeData={treeData} 
                        selectedId={selectedTreeId} 
                        onSelect={(id, type) => {
                             if (selectedTreeId === id) { setSelectedTreeId(null); setSelectedTreeType(null); }
                             else { setSelectedTreeId(id); setSelectedTreeType(type); }
                        }} 
                    />
                </div>

                {/* Resizer Handle */}
                <div className="hidden md:block h-full">
                    <ResizeHandle onMouseDown={startResizing} />
                </div>

                {/* Right Grid */}
                <div className="flex-grow overflow-y-auto p-1">
                    <div className="grid grid-cols-1 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                        {filteredStaff.map(staff => {
                            const contact = state.contacts.find(c => c.id === staff.id);
                            const isExited = staff.status === 'Resigned' || staff.status === 'Terminated';
                            const duration = calculateServiceDuration(staff.joiningDate, isExited ? staff.exitDetails?.date : undefined);
                            const hasAdvance = staff.advanceBalance && staff.advanceBalance > 0;

                            return (
                                <div key={staff.id} className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 hover:shadow-md transition-shadow flex flex-col">
                                    <div className="flex justify-between items-start mb-2" onClick={() => openModal(staff)}>
                                        <div>
                                            <h3 className="font-bold text-lg text-slate-800 cursor-pointer hover:text-indigo-600">{contact?.name}</h3>
                                            <p className="text-sm text-slate-500">{staff.designation}</p>
                                        </div>
                                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(staff.status)}`}>
                                            {staff.status}
                                        </span>
                                    </div>
                                    
                                    <div className="text-sm space-y-1 mb-4 cursor-pointer" onClick={() => openModal(staff)}>
                                        <div className="flex justify-between">
                                            <span className="text-slate-600">Basic Salary:</span>
                                            <span className="font-semibold">{CURRENCY} {staff.basicSalary.toLocaleString()}</span>
                                        </div>
                                        {staff.buildingId && <div className="text-xs text-slate-400">Building: {state.buildings.find(b=>b.id === staff.buildingId)?.name}</div>}
                                        {staff.projectId && <div className="text-xs text-slate-400">Project: {state.projects.find(p=>p.id === staff.projectId)?.name}</div>}
                                        
                                        {hasAdvance && (
                                            <div className="mt-2 flex justify-between items-center bg-amber-50 p-1.5 rounded border border-amber-100 text-amber-800 font-medium">
                                                <span>Advance Balance:</span>
                                                <span>{CURRENCY} {(staff.advanceBalance || 0).toLocaleString()}</span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="bg-slate-50 p-2 rounded text-xs text-slate-600 space-y-1 border border-slate-100 mb-3">
                                        <div className="flex justify-between">
                                            <span className="text-slate-400">Joined:</span>
                                            <span className="font-medium">{formatDate(staff.joiningDate)}</span>
                                        </div>
                                        {isExited && staff.exitDetails?.date && (
                                            <div className="flex justify-between text-rose-600">
                                                <span>{staff.status}:</span>
                                                <span className="font-medium">{formatDate(staff.exitDetails.date)}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between border-t border-slate-200 pt-1 mt-1">
                                            <span className="text-slate-400">Total Service:</span>
                                            <span className="font-bold text-slate-700">{duration}</span>
                                        </div>
                                    </div>

                                    {staff.status === 'Active' && (
                                        <div className="mt-auto pt-3 border-t border-slate-100 space-y-2">
                                            <div className="flex gap-2">
                                                <Button variant="secondary" size="sm" onClick={() => setPromotionModal({ isOpen: true, staff })} className="flex-1 text-[10px] px-1">
                                                    Promote
                                                </Button>
                                                <Button variant="secondary" size="sm" onClick={() => setTransferModal({ isOpen: true, staff })} className="flex-1 text-[10px] px-1">
                                                    Transfer
                                                </Button>
                                            </div>
                                            <div className="flex gap-2">
                                                <Button variant="secondary" size="sm" onClick={() => setExitModal({ isOpen: true, staff })} className="flex-1 text-[10px] px-1 text-rose-600 hover:bg-rose-50 hover:text-rose-700 border-rose-200">
                                                    Exit
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {filteredStaff.length === 0 && (
                            <div className="col-span-full text-center py-12 text-slate-500 flex flex-col items-center justify-center">
                                <div className="w-16 h-16 text-slate-300 mb-2">{ICONS.users}</div>
                                <p>No staff members found.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={staffToEdit ? "Edit Staff" : "Add New Staff"}>
                <StaffForm onClose={() => setIsModalOpen(false)} staffToEdit={staffToEdit} />
            </Modal>

            {promotionModal.staff && (
                <PromotionModal 
                    isOpen={promotionModal.isOpen} 
                    onClose={() => setPromotionModal({ isOpen: false, staff: null })} 
                    staff={promotionModal.staff} 
                />
            )}

            {transferModal.staff && (
                <TransferStaffModal 
                    isOpen={transferModal.isOpen} 
                    onClose={() => setTransferModal({ isOpen: false, staff: null })} 
                    staff={transferModal.staff} 
                />
            )}

            {exitModal.staff && (
                <StaffExitModal 
                    isOpen={exitModal.isOpen} 
                    onClose={() => setExitModal({ isOpen: false, staff: null })} 
                    staff={exitModal.staff} 
                />
            )}
        </div>
    );
};

export default StaffManagement;
