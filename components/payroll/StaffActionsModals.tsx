
import React, { useState, useMemo } from 'react';
import { Staff, AccountType } from '../../types';
import { useAppContext } from '../../context/AppContext';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Select from '../ui/Select';
import Textarea from '../ui/Textarea';
import ComboBox from '../ui/ComboBox';
import { useNotification } from '../../context/NotificationContext';
import { CURRENCY, ICONS } from '../../constants';

// --- PROMOTION MODAL ---
interface PromotionModalProps {
    isOpen: boolean;
    onClose: () => void;
    staff: Staff;
}

export const PromotionModal: React.FC<PromotionModalProps> = ({ isOpen, onClose, staff }) => {
    const { state, dispatch } = useAppContext();
    const { showToast } = useNotification();
    const contact = state.contacts.find(c => c.id === staff.id);

    const [newDesignation, setNewDesignation] = useState(staff.designation);
    const [newSalary, setNewSalary] = useState(staff.basicSalary.toString());
    const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        dispatch({
            type: 'PROMOTE_STAFF',
            payload: {
                staffId: staff.id,
                newDesignation,
                newSalary: parseFloat(newSalary) || 0,
                effectiveDate,
                type: 'Promotion'
            }
        });
        showToast('Staff promoted successfully!', 'success');
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Career Promotion" size="lg">
            <form onSubmit={handleSubmit} className="space-y-6">
                
                {/* Header Card */}
                <div className="flex items-center gap-4 bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                     <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-xl font-bold">
                         {contact?.name.charAt(0)}
                     </div>
                     <div>
                         <h3 className="font-bold text-lg text-slate-800">{contact?.name}</h3>
                         <p className="text-sm text-indigo-600 font-medium">Employee ID: {staff.employeeId}</p>
                     </div>
                </div>

                {/* Comparison Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative">
                    {/* Arrow for Desktop */}
                    <div className="hidden md:flex absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 bg-white rounded-full p-2 border border-slate-200 shadow-sm text-slate-400">
                        {ICONS.arrowRight}
                    </div>

                    {/* Current State */}
                    <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 opacity-80">
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 border-b border-slate-200 pb-2">Current Position</h4>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">Designation</label>
                                <div className="font-semibold text-slate-700">{staff.designation}</div>
                            </div>
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">Basic Salary</label>
                                <div className="font-mono font-semibold text-slate-700">{CURRENCY} {staff.basicSalary.toLocaleString()}</div>
                            </div>
                        </div>
                    </div>

                    {/* New State */}
                    <div className="bg-white p-5 rounded-xl border-2 border-indigo-100 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 right-0 bg-indigo-500 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg">NEW</div>
                        <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-4 border-b border-indigo-100 pb-2">New Position</h4>
                        <div className="space-y-4">
                            <Input 
                                label="New Designation" 
                                value={newDesignation} 
                                onChange={e => setNewDesignation(e.target.value)} 
                                required 
                                className="bg-indigo-50/30 border-indigo-200 focus:border-indigo-400 focus:ring-indigo-200"
                            />
                            <Input 
                                label="New Basic Salary" 
                                type="text"
                                inputMode="decimal"
                                value={newSalary} 
                                onChange={e => setNewSalary(e.target.value)} 
                                required 
                                className="bg-indigo-50/30 border-indigo-200 focus:border-indigo-400 focus:ring-indigo-200 font-mono font-bold"
                            />
                        </div>
                    </div>
                </div>

                <div className="border-t pt-4">
                    <Input 
                        label="Effective Date" 
                        type="date" 
                        value={effectiveDate} 
                        onChange={e => setEffectiveDate(e.target.value)} 
                        required 
                    />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700">Confirm Promotion</Button>
                </div>
            </form>
        </Modal>
    );
};

// --- TRANSFER MODAL ---
interface TransferStaffModalProps {
    isOpen: boolean;
    onClose: () => void;
    staff: Staff;
}

export const TransferStaffModal: React.FC<TransferStaffModalProps> = ({ isOpen, onClose, staff }) => {
    const { state, dispatch } = useAppContext();
    const { showToast } = useNotification();
    const contact = state.contacts.find(c => c.id === staff.id);

    const [targetType, setTargetType] = useState<'Project' | 'Building'>('Project');
    const [newProjectId, setNewProjectId] = useState('');
    const [newBuildingId, setNewBuildingId] = useState('');
    const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);

    // Determine current assignment for display
    const currentAssignment = staff.projectId 
        ? `${state.projects.find(p => p.id === staff.projectId)?.name || 'Unknown Project'}`
        : staff.buildingId 
            ? `${state.buildings.find(b => b.id === staff.buildingId)?.name || 'Unknown Building'}`
            : 'Unassigned';

    const currentType = staff.projectId ? 'Project' : staff.buildingId ? 'Building' : 'Pool';

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        dispatch({
            type: 'TRANSFER_STAFF',
            payload: {
                staffId: staff.id,
                newProjectId: targetType === 'Project' ? newProjectId : undefined,
                newBuildingId: targetType === 'Building' ? newBuildingId : undefined,
                effectiveDate
            }
        });
        showToast('Staff transferred successfully!', 'success');
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Transfer Employee" size="md">
            <form onSubmit={handleSubmit} className="space-y-6">
                
                {/* Visual Flow */}
                <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div className="text-center w-1/3">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">From</div>
                        <div className="font-semibold text-slate-700 truncate" title={currentAssignment}>{currentAssignment}</div>
                        <div className="text-[10px] text-slate-400 bg-white border rounded px-1.5 py-0.5 inline-block mt-1">{currentType}</div>
                    </div>
                    
                    <div className="text-slate-300">
                        {ICONS.arrowRight}
                    </div>

                    <div className="text-center w-1/3">
                         <div className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-1">To</div>
                         <div className="font-semibold text-indigo-700 italic">New Location</div>
                    </div>
                </div>

                <div className="space-y-3">
                    <label className="block text-sm font-bold text-slate-700">Destination Type</label>
                    <div className="grid grid-cols-2 gap-4">
                        <label className={`flex items-center justify-center p-3 rounded-lg border cursor-pointer transition-all ${targetType === 'Project' ? 'bg-indigo-50 border-indigo-500 text-indigo-700 font-bold shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                            <input type="radio" name="targetType" checked={targetType === 'Project'} onChange={() => setTargetType('Project')} className="hidden" />
                            Project
                        </label>
                        <label className={`flex items-center justify-center p-3 rounded-lg border cursor-pointer transition-all ${targetType === 'Building' ? 'bg-emerald-50 border-emerald-500 text-emerald-700 font-bold shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                            <input type="radio" name="targetType" checked={targetType === 'Building'} onChange={() => setTargetType('Building')} className="hidden" />
                            Building
                        </label>
                    </div>
                    
                    {targetType === 'Project' ? (
                        <div className="animate-fade-in pt-2">
                             <ComboBox 
                                items={state.projects} 
                                selectedId={newProjectId} 
                                onSelect={(item) => setNewProjectId(item?.id || '')} 
                                placeholder="Select Destination Project"
                                allowAddNew={false}
                                required
                            />
                        </div>
                    ) : (
                        <div className="animate-fade-in pt-2">
                            <ComboBox 
                                items={state.buildings} 
                                selectedId={newBuildingId} 
                                onSelect={(item) => setNewBuildingId(item?.id || '')} 
                                placeholder="Select Destination Building"
                                allowAddNew={false}
                                required
                            />
                        </div>
                    )}
                </div>

                <div className="border-t pt-4">
                    <Input 
                        label="Effective Date" 
                        type="date" 
                        value={effectiveDate} 
                        onChange={e => setEffectiveDate(e.target.value)} 
                        required 
                    />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button type="submit">Confirm Transfer</Button>
                </div>
            </form>
        </Modal>
    );
};

// --- EXIT MODAL ---
interface StaffExitModalProps {
    isOpen: boolean;
    onClose: () => void;
    staff: Staff;
}

export const StaffExitModal: React.FC<StaffExitModalProps> = ({ isOpen, onClose, staff }) => {
    const { state, dispatch } = useAppContext();
    const { showToast, showAlert } = useNotification();
    const contact = state.contacts.find(c => c.id === staff.id);

    const [type, setType] = useState<'Resignation' | 'Termination'>('Resignation');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [reason, setReason] = useState('');
    
    // Financials
    const [gratuityAmount, setGratuityAmount] = useState('');
    const [benefitsAmount, setBenefitsAmount] = useState('');
    const [paymentAccountId, setPaymentAccountId] = useState('');

    // Filter for Bank Accounts (exclude Internal Clearing)
    const accounts = useMemo(() => state.accounts.filter(a => a.type === AccountType.BANK && a.name !== 'Internal Clearing'), [state.accounts]);
    
    const totalSettlement = (parseFloat(gratuityAmount) || 0) + (parseFloat(benefitsAmount) || 0);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (totalSettlement > 0 && !paymentAccountId) {
            await showAlert('Please select a Payment Account for the settlement amount.');
            return;
        }

        dispatch({
            type: 'STAFF_EXIT',
            payload: {
                staffId: staff.id,
                type,
                date,
                reason,
                gratuityAmount: parseFloat(gratuityAmount) || 0,
                benefitsAmount: parseFloat(benefitsAmount) || 0,
                paymentAccountId: totalSettlement > 0 ? paymentAccountId : undefined
            }
        });
        showToast(`Staff marked as ${type === 'Resignation' ? 'Resigned' : 'Terminated'}.`, 'info');
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Process Exit: ${contact?.name}`}>
            <form onSubmit={handleSubmit} className="space-y-6">
                
                {/* 1. Details Section */}
                <div className="space-y-4">
                     <div className="grid grid-cols-2 gap-4">
                        <Select label="Exit Type" value={type} onChange={e => setType(e.target.value as any)}>
                            <option value="Resignation">Resignation</option>
                            <option value="Termination">Termination</option>
                        </Select>
                        <Input 
                            label="Last Working Day" 
                            type="date" 
                            value={date} 
                            onChange={e => setDate(e.target.value)} 
                            required 
                        />
                    </div>
                    <Textarea 
                        label="Reason / Remarks" 
                        value={reason} 
                        onChange={e => setReason(e.target.value)} 
                        placeholder="Reason for leaving, asset handover notes..."
                        rows={2}
                    />
                </div>

                {/* 2. Settlement Section (Visual Group) */}
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-slate-400"></div>
                    <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                        <span className="p-1 bg-white rounded shadow-sm text-slate-500">{ICONS.dollarSign}</span> 
                        Final Settlement
                    </h4>
                    
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <Input 
                            label="Gratuity / Severance" 
                            type="number"
                            value={gratuityAmount} 
                            onChange={e => setGratuityAmount(e.target.value)} 
                            placeholder="0.00"
                            className="bg-white"
                        />
                        <Input 
                            label="Other Benefits / Encashment" 
                            type="number"
                            value={benefitsAmount} 
                            onChange={e => setBenefitsAmount(e.target.value)} 
                            placeholder="0.00"
                            className="bg-white"
                        />
                    </div>

                    {totalSettlement > 0 && (
                        <div className="animate-fade-in pt-3 border-t border-slate-200">
                             <ComboBox 
                                label="Pay Settlement From" 
                                items={accounts} 
                                selectedId={paymentAccountId} 
                                onSelect={(item) => setPaymentAccountId(item?.id || '')} 
                                placeholder="Select bank account"
                                allowAddNew={false}
                                required
                            />
                             <div className="flex justify-between items-center mt-3 bg-slate-800 text-white p-3 rounded-lg">
                                <span className="text-sm font-medium">Net Payable</span>
                                <span className="text-lg font-bold">{CURRENCY} {totalSettlement.toLocaleString()}</span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button type="submit" variant="danger">
                        Confirm {type}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
