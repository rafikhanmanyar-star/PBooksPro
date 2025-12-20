
import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Contract, ContactType, ContractStatus, TransactionType } from '../../types';
import Input from '../ui/Input';
import Button from '../ui/Button';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import Select from '../ui/Select';
import Textarea from '../ui/Textarea';
import { useNotification } from '../../context/NotificationContext';
import { CURRENCY, ICONS } from '../../constants';

interface ProjectContractFormProps {
    onClose: () => void;
    contractToEdit?: Contract | null;
}

const ProjectContractForm: React.FC<ProjectContractFormProps> = ({ onClose, contractToEdit }) => {
    const { state, dispatch } = useAppContext();
    const { showToast, showAlert, showConfirm } = useNotification();

    const generateContractNumber = () => {
        const prefix = 'CONT-';
        let maxNum = 0;
        (state.contracts || []).forEach(c => {
            if (c.contractNumber.startsWith(prefix)) {
                const part = c.contractNumber.substring(prefix.length);
                const num = parseInt(part, 10);
                if (!isNaN(num) && num > maxNum) maxNum = num;
            }
        });
        return `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
    };

    const [contractNumber, setContractNumber] = useState(contractToEdit?.contractNumber || generateContractNumber());
    const [name, setName] = useState(contractToEdit?.name || '');
    const [projectId, setProjectId] = useState(contractToEdit?.projectId || '');
    const [vendorId, setVendorId] = useState(contractToEdit?.vendorId || '');
    
    // Calculation fields
    const [area, setArea] = useState(contractToEdit?.area?.toString() || '');
    const [rate, setRate] = useState(contractToEdit?.rate?.toString() || '');
    const [totalAmount, setTotalAmount] = useState(contractToEdit?.totalAmount?.toString() || '');
    
    const [startDate, setStartDate] = useState(contractToEdit?.startDate || new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(contractToEdit?.endDate || '');
    const [status, setStatus] = useState<ContractStatus>(contractToEdit?.status || ContractStatus.ACTIVE);
    const [termsAndConditions, setTermsAndConditions] = useState(contractToEdit?.termsAndConditions || '');
    
    // Category Selection
    const [categoryIds, setCategoryIds] = useState<string[]>(contractToEdit?.categoryIds || []);

    const vendors = useMemo(() => state.contacts.filter(c => c.type === ContactType.VENDOR), [state.contacts]);
    const expenseCategories = useMemo(() => state.categories.filter(c => c.type === TransactionType.EXPENSE), [state.categories]);

    const availableCategories = useMemo(() => {
        return expenseCategories.filter(c => !categoryIds.includes(c.id));
    }, [expenseCategories, categoryIds]);

    const handleAddCategory = (item: { id: string; name: string } | null) => {
        if (item) {
            setCategoryIds(prev => [...prev, item.id]);
        }
    };

    const handleRemoveCategory = (id: string) => {
        setCategoryIds(prev => prev.filter(c => c !== id));
    };

    // Calculations
    const handleAreaChange = (val: string) => {
        setArea(val);
        const a = parseFloat(val);
        const r = parseFloat(rate);
        if (!isNaN(a) && !isNaN(r) && r > 0) {
            setTotalAmount((a * r).toFixed(0));
        }
    };

    const handleRateChange = (val: string) => {
        setRate(val);
        const r = parseFloat(val);
        const a = parseFloat(area);
        if (!isNaN(r) && !isNaN(a) && a > 0) {
            setTotalAmount((a * r).toFixed(0));
        }
    };

    const handleTotalChange = (val: string) => {
        setTotalAmount(val);
        const t = parseFloat(val);
        const a = parseFloat(area);
        if (!isNaN(t) && !isNaN(a) && a > 0) {
            setRate((t / a).toFixed(2));
        }
    };

    // Auto-calculate End Date (1 Year) when Start Date changes (only if creating new or if specifically changing dates)
    useEffect(() => {
        if (!contractToEdit && startDate) {
            const d = new Date(startDate);
            if (!isNaN(d.getTime())) {
                d.setFullYear(d.getFullYear() + 1);
                d.setDate(d.getDate() - 1);
                setEndDate(d.toISOString().split('T')[0]);
            }
        }
    }, [startDate, contractToEdit]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !projectId || !vendorId || !totalAmount) {
            await showAlert("Please fill in all required fields.");
            return;
        }

        const payload: Contract = {
            id: contractToEdit?.id || Date.now().toString(),
            contractNumber,
            name,
            projectId,
            vendorId,
            totalAmount: parseFloat(totalAmount),
            area: parseFloat(area) || undefined,
            rate: parseFloat(rate) || undefined,
            startDate,
            endDate,
            status,
            categoryIds,
            termsAndConditions
        };

        if (contractToEdit) {
            dispatch({ type: 'UPDATE_CONTRACT', payload });
            showToast("Contract updated successfully.");
        } else {
            dispatch({ type: 'ADD_CONTRACT', payload });
            showToast("Contract created successfully.");
        }
        onClose();
    };

    const handleDelete = async () => {
        if (!contractToEdit) return;
        if (await showConfirm("Are you sure you want to delete this contract?")) {
            dispatch({ type: 'DELETE_CONTRACT', payload: contractToEdit.id });
            showToast("Contract deleted.");
            onClose();
        }
    };

    const numberInputStyle = "bg-white font-bold text-slate-700 border-slate-300 focus:border-indigo-500 focus:ring-indigo-200";

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label="Contract Number" value={contractNumber} onChange={e => setContractNumber(e.target.value)} required />
                <Input label="Contract Title" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Grey Structure" required />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ComboBox 
                    label="Project" 
                    items={state.projects} 
                    selectedId={projectId} 
                    onSelect={item => setProjectId(item?.id || '')} 
                    placeholder="Select Project"
                    required 
                    allowAddNew={false}
                />
                <ComboBox 
                    label="Vendor / Contractor" 
                    items={vendors} 
                    selectedId={vendorId} 
                    onSelect={item => setVendorId(item?.id || '')} 
                    placeholder="Select Vendor"
                    required 
                />
            </div>

            {/* Calculation Row */}
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 grid grid-cols-3 gap-4 items-end">
                <Input 
                    label="Total Area (sq ft)" 
                    type="number" 
                    min="0"
                    value={area} 
                    onChange={e => handleAreaChange(e.target.value)}
                    className={numberInputStyle}
                />
                <Input 
                    label="Rate per sq ft" 
                    type="number" 
                    min="0"
                    value={rate} 
                    onChange={e => handleRateChange(e.target.value)}
                    className={numberInputStyle}
                />
                <Input
                    label="Total Contract Value"
                    type="text"
                    inputMode="decimal"
                    value={totalAmount}
                    onChange={e => handleTotalChange(e.target.value)}
                    required
                    className={numberInputStyle}
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <DatePicker label="Start Date" value={startDate} onChange={d => setStartDate(d.toISOString().split('T')[0])} required />
                <DatePicker label="End Date (Est.)" value={endDate} onChange={d => setEndDate(d.toISOString().split('T')[0])} />
            </div>

            <div className="border rounded-lg p-3 bg-slate-50 border-slate-200">
                <label className="block text-sm font-medium text-slate-700 mb-2">Tracked Expense Categories</label>
                
                <div className="mb-3">
                    <ComboBox
                        items={availableCategories}
                        selectedId=""
                        onSelect={handleAddCategory}
                        placeholder="Select expense category to track..."
                        allowAddNew={false}
                    />
                </div>
                
                <div className="flex flex-wrap gap-2 min-h-[2rem]">
                    {categoryIds.length > 0 ? categoryIds.map(id => {
                        const cat = expenseCategories.find(c => c.id === id);
                        if (!cat) return null;
                        return (
                            <div key={id} className="flex items-center gap-1 bg-white border border-slate-300 text-slate-700 px-2 py-1 rounded-full text-sm shadow-sm">
                                <span>{cat.name}</span>
                                <button 
                                    type="button" 
                                    onClick={() => handleRemoveCategory(id)} 
                                    className="text-slate-400 hover:text-rose-500 rounded-full p-0.5 transition-colors"
                                >
                                    <div className="w-3 h-3">{ICONS.x}</div>
                                </button>
                            </div>
                        );
                    }) : (
                        <p className="text-xs text-slate-400 italic p-1">No categories selected. Select from the list above.</p>
                    )}
                </div>
                <p className="text-xs text-slate-500 mt-2">Expenses in these categories will count towards the contract usage.</p>
            </div>

            <Select label="Status" value={status} onChange={e => setStatus(e.target.value as ContractStatus)}>
                {Object.values(ContractStatus).map(s => (
                    <option key={s} value={s}>{s}</option>
                ))}
            </Select>

            <Textarea 
                label="Terms & Conditions" 
                value={termsAndConditions} 
                onChange={e => setTermsAndConditions(e.target.value)} 
                rows={10} 
                placeholder="Enter contract terms, payment milestones, and conditions..." 
            />

            <div className="flex justify-between pt-4 border-t mt-6">
                <div>
                    {contractToEdit && (
                        <Button type="button" variant="danger" onClick={handleDelete}>Delete</Button>
                    )}
                </div>
                <div className="flex gap-2">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button type="submit">{contractToEdit ? 'Update' : 'Create Contract'}</Button>
                </div>
            </div>
        </form>
    );
};

export default ProjectContractForm;
