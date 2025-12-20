
import React, { useState, useEffect, useMemo } from 'react';
import { Staff, AccountType, SalaryComponent, CalculationType, ContactType } from '../../types';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Select from '../ui/Select';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import { useAppContext } from '../../context/AppContext';
import { useNotification } from '../../context/NotificationContext';
import Tabs from '../ui/Tabs';
import { ICONS, CURRENCY } from '../../constants';

interface StaffFormProps {
    onClose: () => void;
    staffToEdit?: Staff | null;
}

const StaffForm: React.FC<StaffFormProps> = ({ onClose, staffToEdit }) => {
    const { state, dispatch } = useAppContext();
    const { showAlert, showToast, showConfirm } = useNotification();
    const [activeTab, setActiveTab] = useState('Profile');

    // --- Profile State ---
    const [name, setName] = useState('');
    const [designation, setDesignation] = useState('');
    const [email, setEmail] = useState('');
    const [joiningDate, setJoiningDate] = useState(new Date().toISOString().split('T')[0]);
    const [status, setStatus] = useState<'Active' | 'Inactive' | 'Resigned' | 'Terminated'>('Active');
    
    // --- Assignment State ---
    const [projectId, setProjectId] = useState('');
    const [buildingId, setBuildingId] = useState('');

    // --- Salary State ---
    const [basicSalary, setBasicSalary] = useState('');
    // Store local structure: ComponentID -> { amount, type }
    const [salaryStructure, setSalaryStructure] = useState<{ id: string, amount: string, calcType: CalculationType }[]>([]);

    // --- Bank State ---
    const [bankName, setBankName] = useState('');
    const [accountTitle, setAccountTitle] = useState('');
    const [accountNumber, setAccountNumber] = useState('');
    const [iban, setIban] = useState('');

    useEffect(() => {
        if (staffToEdit) {
            const contact = state.contacts.find(c => c.id === staffToEdit.id);
            setName(contact?.name || '');
            setDesignation(staffToEdit.designation);
            setEmail(staffToEdit.email || '');
            setJoiningDate(new Date(staffToEdit.joiningDate).toISOString().split('T')[0]);
            setStatus(staffToEdit.status);
            setProjectId(staffToEdit.projectId || '');
            setBuildingId(staffToEdit.buildingId || '');
            setBasicSalary(staffToEdit.basicSalary.toString());
            
            if (staffToEdit.salaryStructure) {
                setSalaryStructure(staffToEdit.salaryStructure.map(s => ({
                    id: s.componentId,
                    amount: s.amount.toString(),
                    calcType: s.calculationType
                })));
            }

            if (staffToEdit.bankDetails) {
                setBankName(staffToEdit.bankDetails.bankName);
                setAccountTitle(staffToEdit.bankDetails.accountTitle);
                setAccountNumber(staffToEdit.bankDetails.accountNumber);
                setIban(staffToEdit.bankDetails.iban || '');
            }
        }
    }, [staffToEdit, state.contacts]);

    const handleComponentChange = (id: string, field: 'amount' | 'calcType', value: string) => {
        setSalaryStructure(prev => {
            const exists = prev.find(p => p.id === id);
            if (exists) {
                return prev.map(p => p.id === id ? { ...p, [field]: value } : p);
            } else {
                return [...prev, { id, amount: field === 'amount' ? value : '0', calcType: field === 'calcType' ? value as any : 'Fixed' }];
            }
        });
    };
    
    const removeComponent = (id: string) => {
        setSalaryStructure(prev => prev.filter(p => p.id !== id));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!projectId && !buildingId) {
            await showAlert('Please assign the staff member to either a Project or a Building.');
            setActiveTab('Assignment');
            return;
        }

        const contactPayload = {
            name,
            type: ContactType.STAFF,
            description: `Staff - ${designation}`,
            contactNo: '' // TODO: Add phone field
        };

        let staffId = staffToEdit?.id;

        if (!staffToEdit) {
            staffId = Date.now().toString();
            dispatch({ type: 'ADD_CONTACT', payload: { ...contactPayload, id: staffId, type: ContactType.STAFF } });
        } else {
            const contact = state.contacts.find(c => c.id === staffId);
            if (contact) {
                dispatch({ type: 'UPDATE_CONTACT', payload: { ...contact, name } });
            }
        }

        const finalStructure = salaryStructure.filter(s => parseFloat(s.amount) > 0).map(s => ({
            componentId: s.id,
            amount: parseFloat(s.amount),
            calculationType: s.calcType,
            effectiveDate: new Date().toISOString()
        }));

        const staffPayload: Staff = {
            id: staffId!,
            employeeId: staffToEdit?.employeeId || `EMP-${Date.now().toString().slice(-4)}`,
            designation,
            basicSalary: parseFloat(basicSalary) || 0,
            joiningDate: new Date(joiningDate).toISOString(),
            status,
            email,
            projectId: projectId || undefined,
            buildingId: buildingId || undefined,
            salaryStructure: finalStructure,
            bankDetails: { bankName, accountTitle, accountNumber, iban },
            history: staffToEdit?.history || [],
            advanceBalance: staffToEdit?.advanceBalance || 0
        };

        const isProject = !!projectId;
        const action = staffToEdit 
            ? (isProject ? 'UPDATE_PROJECT_STAFF' : 'UPDATE_RENTAL_STAFF') 
            : (isProject ? 'ADD_PROJECT_STAFF' : 'ADD_RENTAL_STAFF');
            
        // If moved, delete from old
        if (staffToEdit) {
             if (staffToEdit.projectId && !projectId) dispatch({ type: 'DELETE_PROJECT_STAFF', payload: staffId });
             if (staffToEdit.buildingId && !buildingId) dispatch({ type: 'DELETE_RENTAL_STAFF', payload: staffId });
        }

        dispatch({ type: action, payload: staffPayload });
        showToast('Staff record saved successfully');
        onClose();
    };

    const grossSalary = useMemo(() => {
        const basic = parseFloat(basicSalary) || 0;
        let total = basic;
        salaryStructure.forEach(s => {
            const comp = state.salaryComponents.find(c => c.id === s.id);
            if (comp?.type === 'Earning') {
                const amt = parseFloat(s.amount) || 0;
                if (s.calcType === 'Fixed') total += amt;
                else total += (basic * (amt / 100));
            }
        });
        return total;
    }, [basicSalary, salaryStructure, state.salaryComponents]);

    return (
        <form onSubmit={handleSubmit} className="flex flex-col h-[80vh]">
            <div className="flex-shrink-0 mb-4">
                 <Tabs tabs={['Profile', 'Assignment', 'Salary', 'Bank']} activeTab={activeTab} onTabClick={setActiveTab} />
            </div>

            <div className="flex-grow overflow-y-auto p-1">
                {activeTab === 'Profile' && (
                    <div className="space-y-4">
                        <Input label="Full Name" value={name} onChange={e => setName(e.target.value)} required />
                        <div className="grid grid-cols-2 gap-4">
                            <Input label="Designation" value={designation} onChange={e => setDesignation(e.target.value)} required />
                            <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <DatePicker label="Joining Date" value={joiningDate} onChange={d => setJoiningDate(d.toISOString().split('T')[0])} required />
                            <Select label="Status" value={status} onChange={e => setStatus(e.target.value as any)}>
                                <option value="Active">Active</option>
                                <option value="Inactive">Inactive</option>
                                <option value="Resigned">Resigned</option>
                                <option value="Terminated">Terminated</option>
                            </Select>
                        </div>
                    </div>
                )}

                {activeTab === 'Assignment' && (
                    <div className="space-y-6">
                        <div className="p-4 bg-blue-50 rounded border border-blue-100">
                             <p className="text-sm text-blue-800 mb-4">Assign staff to a cost center. This determines where payroll costs are allocated.</p>
                             <div className="space-y-4">
                                <ComboBox 
                                    label="Project" 
                                    items={state.projects} 
                                    selectedId={projectId} 
                                    onSelect={item => { setProjectId(item?.id || ''); setBuildingId(''); }} 
                                    placeholder="Select Project"
                                    allowAddNew={false}
                                    disabled={!!buildingId}
                                />
                                <div className="text-center text-xs text-slate-400 uppercase font-bold">- OR -</div>
                                <ComboBox 
                                    label="Building" 
                                    items={state.buildings} 
                                    selectedId={buildingId} 
                                    onSelect={item => { setBuildingId(item?.id || ''); setProjectId(''); }} 
                                    placeholder="Select Building"
                                    allowAddNew={false}
                                    disabled={!!projectId}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'Salary' && (
                    <div className="space-y-6">
                         <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex justify-between items-center">
                             <div>
                                 <span className="text-sm text-slate-500 block">Gross Salary (Est)</span>
                                 <span className="text-2xl font-bold text-slate-800">{CURRENCY} {grossSalary.toLocaleString()}</span>
                             </div>
                         </div>
                         
                         <Input label="Basic Salary" type="number" value={basicSalary} onChange={e => setBasicSalary(e.target.value)} required />
                         
                         <div className="space-y-3">
                             <div className="flex justify-between items-center border-b pb-2">
                                 <h4 className="font-bold text-slate-700">Components</h4>
                             </div>
                             {state.salaryComponents.filter(c => !c.isSystem).map(comp => {
                                 const current = salaryStructure.find(s => s.id === comp.id) || { id: comp.id, amount: '', calcType: 'Fixed' };
                                 return (
                                     <div key={comp.id} className="grid grid-cols-12 gap-2 items-center">
                                         <div className="col-span-4 text-sm font-medium text-slate-700">{comp.name}</div>
                                         <div className="col-span-4">
                                             <Select value={current.calcType} onChange={(e) => handleComponentChange(comp.id, 'calcType', e.target.value)} className="py-1 text-xs">
                                                 <option value="Fixed">Fixed Amount</option>
                                                 <option value="Percentage of Basic">% of Basic</option>
                                             </Select>
                                         </div>
                                         <div className="col-span-4">
                                              <Input 
                                                value={current.amount} 
                                                onChange={e => handleComponentChange(comp.id, 'amount', e.target.value)} 
                                                placeholder="0"
                                                className="py-1 text-right"
                                              />
                                         </div>
                                     </div>
                                 );
                             })}
                         </div>
                    </div>
                )}

                {activeTab === 'Bank' && (
                    <div className="space-y-4">
                        <Input label="Bank Name" value={bankName} onChange={e => setBankName(e.target.value)} />
                        <Input label="Account Title" value={accountTitle} onChange={e => setAccountTitle(e.target.value)} />
                        <Input label="Account Number" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} />
                        <Input label="IBAN" value={iban} onChange={e => setIban(e.target.value)} />
                    </div>
                )}
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t mt-auto flex-shrink-0">
                <Button variant="secondary" onClick={onClose} type="button">Cancel</Button>
                <Button type="submit">Save Staff</Button>
            </div>
        </form>
    );
};

export default StaffForm;
