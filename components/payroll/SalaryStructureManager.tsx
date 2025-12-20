
import React, { useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { SalaryComponent, SalaryComponentType, CalculationType } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import ComboBox from '../ui/ComboBox';
import { ICONS } from '../../constants';
import Modal from '../ui/Modal';
import { useNotification } from '../../context/NotificationContext';

const SalaryStructureManager: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const { showConfirm, showToast } = useNotification();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingComponent, setEditingComponent] = useState<SalaryComponent | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<SalaryComponentType | 'All'>('All');

    // Form State
    const [name, setName] = useState('');
    const [type, setType] = useState<SalaryComponentType>('Earning');
    const [isTaxable, setIsTaxable] = useState(true);
    const [calculationType, setCalculationType] = useState<CalculationType>('Fixed');
    const [formula, setFormula] = useState('');
    const [category, setCategory] = useState('');
    const [effectiveFrom, setEffectiveFrom] = useState('');
    const [effectiveTo, setEffectiveTo] = useState('');
    const [countryCode, setCountryCode] = useState('');

    const filteredComponents = (state.salaryComponents || []).filter(comp => {
        if (typeFilter !== 'All' && comp.type !== typeFilter) return false;
        if (searchQuery && !comp.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
    });

    const handleOpen = (comp?: SalaryComponent) => {
        if (comp) {
            setEditingComponent(comp);
            setName(comp.name);
            setType(comp.type);
            setIsTaxable(comp.isTaxable);
            setCalculationType(comp.calculationType || 'Fixed');
            setFormula(comp.formula || '');
            setCategory(comp.category || '');
            setEffectiveFrom(comp.effectiveFrom || '');
            setEffectiveTo(comp.effectiveTo || '');
            setCountryCode(comp.countryCode || '');
        } else {
            setEditingComponent(null);
            setName('');
            setType('Earning');
            setIsTaxable(true);
            setCalculationType('Fixed');
            setFormula('');
            setCategory('');
            setEffectiveFrom('');
            setEffectiveTo('');
            setCountryCode('');
        }
        setIsModalOpen(true);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!name.trim()) {
            showToast('Component name is required', 'error');
            return;
        }

        const payload: SalaryComponent = {
            id: editingComponent ? editingComponent.id : `comp-${Date.now()}`,
            name: name.trim(),
            type,
            isTaxable,
            isSystem: editingComponent?.isSystem || false,
            calculationType: calculationType !== 'Fixed' ? calculationType : undefined,
            formula: formula.trim() || undefined,
            category: category.trim() || undefined,
            effectiveFrom: effectiveFrom || undefined,
            effectiveTo: effectiveTo || undefined,
            countryCode: countryCode.trim() || undefined
        };

        if (editingComponent) {
            dispatch({ type: 'UPDATE_SALARY_COMPONENT', payload });
            showToast('Salary component updated successfully', 'success');
        } else {
            dispatch({ type: 'ADD_SALARY_COMPONENT', payload });
            showToast('Salary component added successfully', 'success');
        }
        setIsModalOpen(false);
    };

    const handleDelete = async (id: string) => {
        const comp = state.salaryComponents.find(c => c.id === id);
        if (!comp) return;
        
        if (comp.isSystem) {
            showToast('System components cannot be deleted', 'error');
            return;
        }

        const confirmed = await showConfirm(
            `Delete "${comp.name}"? This will remove it from all employee salary structures.`,
            { title: 'Delete Component', confirmLabel: 'Delete', cancelLabel: 'Cancel' }
        );
        
        if (confirmed) {
            dispatch({ type: 'DELETE_SALARY_COMPONENT', payload: id });
            showToast('Component deleted successfully');
        }
    };

    const getTypeColor = (compType: SalaryComponentType) => {
        switch (compType) {
            case 'Earning':
            case 'Allowance':
            case 'Bonus':
            case 'Overtime':
            case 'Commission':
                return 'bg-emerald-100 text-emerald-800 border-emerald-200';
            case 'Deduction':
            case 'Tax':
                return 'bg-rose-100 text-rose-800 border-rose-200';
            case 'Statutory':
                return 'bg-blue-100 text-blue-800 border-blue-200';
            case 'Benefit':
                return 'bg-purple-100 text-purple-800 border-purple-200';
            default:
                return 'bg-slate-100 text-slate-800 border-slate-200';
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h3 className="text-xl font-bold text-slate-900">Salary Components</h3>
                    <p className="text-sm text-slate-500 mt-1">Configure salary components, allowances, and deductions</p>
                </div>
                <Button onClick={() => handleOpen()} className="shadow-md hover:shadow-lg">
                    <div className="w-4 h-4 mr-2">{ICONS.plus}</div>
                    Add Component
                </Button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3">
                <div className="flex-1 min-w-[200px]">
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            <div className="w-4 h-4">{ICONS.search}</div>
                        </div>
                        <Input
                            placeholder="Search components..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9"
                        />
                    </div>
                </div>
                <div className="w-48">
                    <ComboBox
                        items={[
                            { id: 'All', name: 'All Types' },
                            { id: 'Earning', name: 'Earning' },
                            { id: 'Allowance', name: 'Allowance' },
                            { id: 'Bonus', name: 'Bonus' },
                            { id: 'Deduction', name: 'Deduction' },
                            { id: 'Tax', name: 'Tax' },
                            { id: 'Statutory', name: 'Statutory' },
                            { id: 'Benefit', name: 'Benefit' }
                        ]}
                        selectedId={typeFilter}
                        onSelect={(item) => setTypeFilter((item?.id as SalaryComponentType | 'All') || 'All')}
                        placeholder="Filter by Type"
                    />
                </div>
            </div>

            {/* Components Grid */}
            {filteredComponents.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredComponents.map(comp => (
                        <Card key={comp.id} className="relative group hover:shadow-lg transition-shadow">
                            <div className="flex justify-between items-start">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-2">
                                        <h4 className="font-bold text-slate-900 truncate">{comp.name}</h4>
                                        {comp.isSystem && (
                                            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold flex-shrink-0">
                                                System
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-2 mb-3">
                                        <span className={`text-xs px-2 py-1 rounded-full border font-semibold ${getTypeColor(comp.type)}`}>
                                            {comp.type}
                                        </span>
                                        {comp.isTaxable && (
                                            <span className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded-full border border-slate-200 font-semibold">
                                                Taxable
                                            </span>
                                        )}
                                        {comp.calculationType && comp.calculationType !== 'Fixed' && (
                                            <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full border border-indigo-200 font-semibold">
                                                {comp.calculationType}
                                            </span>
                                        )}
                                        {comp.category && (
                                            <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full border border-blue-200">
                                                {comp.category}
                                            </span>
                                        )}
                                    </div>
                                    {comp.formula && (
                                        <p className="text-xs text-slate-600 font-mono bg-slate-50 p-2 rounded border border-slate-200 mb-2">
                                            Formula: {comp.formula}
                                        </p>
                                    )}
                                    {(comp.effectiveFrom || comp.effectiveTo) && (
                                        <p className="text-xs text-slate-500">
                                            {comp.effectiveFrom && `From: ${new Date(comp.effectiveFrom).toLocaleDateString()}`}
                                            {comp.effectiveFrom && comp.effectiveTo && ' • '}
                                            {comp.effectiveTo && `To: ${new Date(comp.effectiveTo).toLocaleDateString()}`}
                                        </p>
                                    )}
                                </div>
                                {!comp.isSystem && (
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                                        <button 
                                            onClick={() => handleOpen(comp)} 
                                            className="p-2 hover:bg-indigo-50 rounded-lg text-indigo-600 transition-colors"
                                            title="Edit"
                                        >
                                            <div className="w-4 h-4">{ICONS.edit}</div>
                                        </button>
                                        <button 
                                            onClick={() => handleDelete(comp.id)} 
                                            className="p-2 hover:bg-rose-50 rounded-lg text-rose-600 transition-colors"
                                            title="Delete"
                                        >
                                            <div className="w-4 h-4">{ICONS.trash}</div>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </Card>
                    ))}
                </div>
            ) : (
                <div className="text-center py-12 bg-slate-50 rounded-xl border-2 border-dashed border-slate-300">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <div className="w-8 h-8 text-slate-400">{ICONS.settings}</div>
                    </div>
                    <p className="text-slate-600 font-medium mb-1">No components found</p>
                    <p className="text-sm text-slate-500">
                        {searchQuery || typeFilter !== 'All' 
                            ? 'Try adjusting your filters' 
                            : 'Add your first salary component to get started'}
                    </p>
                </div>
            )}

            {/* Modal */}
            <Modal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)} 
                title={editingComponent ? "Edit Component" : "New Salary Component"}
                size="lg"
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
                            <Input 
                                value={name} 
                                onChange={e => setName(e.target.value)} 
                                required 
                                placeholder="e.g., Transport Allowance"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Type *</label>
                            <ComboBox
                                items={[
                                    { id: 'Earning', name: 'Earning' },
                                    { id: 'Allowance', name: 'Allowance' },
                                    { id: 'Bonus', name: 'Bonus' },
                                    { id: 'Overtime', name: 'Overtime' },
                                    { id: 'Commission', name: 'Commission' },
                                    { id: 'Deduction', name: 'Deduction' },
                                    { id: 'Tax', name: 'Tax' },
                                    { id: 'Statutory', name: 'Statutory' },
                                    { id: 'Benefit', name: 'Benefit' },
                                    { id: 'Information', name: 'Information' }
                                ]}
                                selectedId={type}
                                onSelect={(item) => setType((item?.id as SalaryComponentType) || 'Earning')}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Calculation Type</label>
                            <ComboBox
                                items={[
                                    { id: 'Fixed', name: 'Fixed Amount' },
                                    { id: 'Percentage of Basic', name: 'Percentage of Basic' },
                                    { id: 'Percentage of Gross', name: 'Percentage of Gross' },
                                    { id: 'Formula', name: 'Formula Based' },
                                    { id: 'Per Day', name: 'Per Day' },
                                    { id: 'Per Hour', name: 'Per Hour' }
                                ]}
                                selectedId={calculationType}
                                onSelect={(item) => setCalculationType((item?.id as CalculationType) || 'Fixed')}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                            <Input 
                                value={category} 
                                onChange={e => setCategory(e.target.value)} 
                                placeholder="e.g., Transport, Housing, Food"
                            />
                        </div>
                    </div>

                    {calculationType === 'Formula' && (
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Formula</label>
                            <Input 
                                value={formula} 
                                onChange={e => setFormula(e.target.value)} 
                                placeholder="e.g., basic * 0.1 + 500"
                            />
                            <p className="text-xs text-slate-500 mt-1">Use variables like: basic, gross, days, hours</p>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Effective From</label>
                            <Input 
                                type="date"
                                value={effectiveFrom} 
                                onChange={e => setEffectiveFrom(e.target.value)} 
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Effective To</label>
                            <Input 
                                type="date"
                                value={effectiveTo} 
                                onChange={e => setEffectiveTo(e.target.value)} 
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Country Code (Optional)</label>
                        <Input 
                            value={countryCode} 
                            onChange={e => setCountryCode(e.target.value)} 
                            placeholder="e.g., US, IN, UK"
                        />
                        <p className="text-xs text-slate-500 mt-1">For country-specific components</p>
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                        <input 
                            type="checkbox" 
                            checked={isTaxable} 
                            onChange={e => setIsTaxable(e.target.checked)} 
                            id="isTaxable"
                            className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                        />
                        <label htmlFor="isTaxable" className="text-sm text-slate-700 font-medium">
                            Is Taxable?
                        </label>
                    </div>

                    <div className="flex justify-end pt-4 gap-3 border-t border-slate-200">
                        <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="submit">
                            {editingComponent ? 'Update Component' : 'Add Component'}
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default SalaryStructureManager;
