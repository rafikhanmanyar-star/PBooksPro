import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { 
    ContactType, 
    Project, 
    Unit, 
    InstallmentPlan, 
    InstallmentFrequency,
    Contact,
    PlanAmenity,
    InstallmentPlanAmenity,
    TransactionType
} from '../../types';
import Input from '../ui/Input';
import Button from '../ui/Button';
import ComboBox from '../ui/ComboBox';
import Card from '../ui/Card';
import { ICONS } from '../../constants';
import { useNotification } from '../../context/NotificationContext';

// Amenity Configuration Modal Component
const AmenityConfigModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    amenities: PlanAmenity[];
    onSave: (amenity: Partial<PlanAmenity>) => void;
    onDelete: (id: string) => void;
}> = ({ isOpen, onClose, amenities, onSave, onDelete }) => {
    const [editingAmenity, setEditingAmenity] = useState<Partial<PlanAmenity> | null>(null);
    const [name, setName] = useState('');
    const [price, setPrice] = useState('0');
    const [isPercentage, setIsPercentage] = useState(false);
    const [description, setDescription] = useState('');
    const { showConfirm, showToast } = useNotification();

    const resetForm = () => {
        setEditingAmenity(null);
        setName('');
        setPrice('0');
        setIsPercentage(false);
        setDescription('');
    };

    const handleEdit = (amenity: PlanAmenity) => {
        setEditingAmenity(amenity);
        setName(amenity.name);
        setPrice(amenity.price.toString());
        setIsPercentage(amenity.isPercentage);
        setDescription(amenity.description || '');
    };

    const handleSubmit = () => {
        if (!name.trim()) {
            showToast('Please enter amenity name');
            return;
        }
        onSave({
            id: editingAmenity?.id,
            name: name.trim(),
            price: parseFloat(price) || 0,
            isPercentage,
            isActive: true,
            description: description.trim() || undefined
        });
        resetForm();
    };

    const handleDelete = async (id: string) => {
        const confirmed = await showConfirm('Are you sure you want to delete this amenity?');
        if (confirmed) {
            onDelete(id);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-slate-200">
                    <h2 className="text-lg font-bold text-slate-800">Configure Amenities</h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
                        <div className="w-5 h-5">{ICONS.x}</div>
                    </button>
                </div>

                <div className="flex-1 overflow-auto p-4 space-y-4">
                    {/* Add/Edit Form */}
                    <Card className="p-4 bg-slate-50">
                        <h3 className="text-sm font-bold text-slate-700 mb-3">
                            {editingAmenity ? 'Edit Amenity' : 'Add New Amenity'}
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <Input 
                                label="Amenity Name" 
                                value={name} 
                                onChange={e => setName(e.target.value)} 
                                placeholder="e.g., Parking Space"
                                required
                            />
                            <div className="space-y-1">
                                <label className="text-sm font-medium text-slate-600">Price Type</label>
                                <div className="flex items-center gap-4 py-2">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input 
                                            type="radio" 
                                            checked={!isPercentage} 
                                            onChange={() => setIsPercentage(false)}
                                            className="w-4 h-4 text-indigo-600"
                                        />
                                        <span className="text-sm text-slate-700">Fixed Amount</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input 
                                            type="radio" 
                                            checked={isPercentage} 
                                            onChange={() => setIsPercentage(true)}
                                            className="w-4 h-4 text-indigo-600"
                                        />
                                        <span className="text-sm text-slate-700">% of List Price</span>
                                    </label>
                                </div>
                            </div>
                            <Input 
                                label={isPercentage ? "Percentage (%)" : "Price"} 
                                type="number" 
                                value={price} 
                                onChange={e => setPrice(e.target.value)}
                            />
                            <Input 
                                label="Description (Optional)" 
                                value={description} 
                                onChange={e => setDescription(e.target.value)} 
                                placeholder="Optional description"
                            />
                        </div>
                        <div className="flex gap-2 mt-4">
                            <Button onClick={handleSubmit}>
                                {editingAmenity ? 'Update' : 'Add Amenity'}
                            </Button>
                            {editingAmenity && (
                                <Button variant="ghost" onClick={resetForm}>Cancel</Button>
                            )}
                        </div>
                    </Card>

                    {/* Amenities List */}
                    <div className="space-y-2">
                        <h3 className="text-sm font-bold text-slate-700">Configured Amenities</h3>
                        {amenities.length === 0 ? (
                            <p className="text-sm text-slate-500 py-4 text-center">No amenities configured yet. Add one above.</p>
                        ) : (
                            <div className="space-y-2">
                                {amenities.map(amenity => (
                                    <div 
                                        key={amenity.id} 
                                        className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 transition-colors"
                                    >
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-slate-900">{amenity.name}</span>
                                                <span className={`text-xs px-2 py-0.5 rounded ${amenity.isPercentage ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                                                    {amenity.isPercentage ? `${amenity.price}%` : amenity.price.toLocaleString()}
                                                </span>
                                            </div>
                                            {amenity.description && (
                                                <p className="text-xs text-slate-500 mt-1">{amenity.description}</p>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button 
                                                onClick={() => handleEdit(amenity)}
                                                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
                                            >
                                                <div className="w-4 h-4">{ICONS.edit}</div>
                                            </button>
                                            <button 
                                                onClick={() => handleDelete(amenity.id)}
                                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                                            >
                                                <div className="w-4 h-4">{ICONS.trash}</div>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-4 border-t border-slate-200">
                    <Button variant="ghost" onClick={onClose} className="w-full">Close</Button>
                </div>
            </div>
        </div>
    );
};

const MarketingPage: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const { showToast, showAlert, showConfirm } = useNotification();
    
    const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [showConfigModal, setShowConfigModal] = useState(false);

    // Form State
    const [leadId, setLeadId] = useState('');
    const [projectId, setProjectId] = useState('');
    const [unitId, setUnitId] = useState('');
    const [durationYears, setDurationYears] = useState('1');
    const [downPaymentPercentage, setDownPaymentPercentage] = useState('20');
    const [frequency, setFrequency] = useState<InstallmentFrequency>('Monthly');
    const [description, setDescription] = useState('');

    // Pricing State
    const [listPrice, setListPrice] = useState('0');
    const [customerDiscount, setCustomerDiscount] = useState('0');
    const [floorDiscount, setFloorDiscount] = useState('0');
    const [lumpSumDiscount, setLumpSumDiscount] = useState('0');
    const [miscDiscount, setMiscDiscount] = useState('0');

    // Discount Category IDs (link to expense categories)
    const [customerDiscountCategoryId, setCustomerDiscountCategoryId] = useState('');
    const [floorDiscountCategoryId, setFloorDiscountCategoryId] = useState('');
    const [lumpSumDiscountCategoryId, setLumpSumDiscountCategoryId] = useState('');
    const [miscDiscountCategoryId, setMiscDiscountCategoryId] = useState('');

    // Selected Amenities
    const [selectedAmenityIds, setSelectedAmenityIds] = useState<string[]>([]);

    // Get expense categories for discount mapping
    const expenseCategories = useMemo(() => 
        state.categories.filter(c => c.type === TransactionType.EXPENSE),
        [state.categories]
    );

    // Get active amenities
    const activeAmenities = useMemo(() => 
        (state.planAmenities || []).filter(a => a.isActive),
        [state.planAmenities]
    );

    // Filtered Leads
    const leads = useMemo(() => state.contacts.filter(c => c.type === ContactType.LEAD), [state.contacts]);
    
    // Units for selected project
    const units = useMemo(() => {
        if (!projectId) return [];
        return state.units.filter(u => u.projectId === projectId);
    }, [projectId, state.units]);

    // Calculate amenities total
    const amenitiesTotal = useMemo(() => {
        const lp = parseFloat(listPrice) || 0;
        return selectedAmenityIds.reduce((total, amenityId) => {
            const amenity = activeAmenities.find(a => a.id === amenityId);
            if (!amenity) return total;
            if (amenity.isPercentage) {
                return total + (lp * amenity.price / 100);
            }
            return total + amenity.price;
        }, 0);
    }, [selectedAmenityIds, activeAmenities, listPrice]);

    // Calculations (now includes amenities)
    const calculations = useMemo(() => {
        const lp = parseFloat(listPrice) || 0;
        const cd = parseFloat(customerDiscount) || 0;
        const fd = parseFloat(floorDiscount) || 0;
        const lsd = parseFloat(lumpSumDiscount) || 0;
        const md = parseFloat(miscDiscount) || 0;
        
        // Add amenities to list price, then subtract discounts
        const priceWithAmenities = lp + amenitiesTotal;
        const netValue = priceWithAmenities - cd - fd - lsd - md;
        const dpPercent = parseFloat(downPaymentPercentage) || 0;
        const dpAmount = netValue * (dpPercent / 100);
        const remaining = netValue - dpAmount;
        
        let freqMonths = 1;
        if (frequency === 'Quarterly') freqMonths = 3;
        if (frequency === 'Yearly') freqMonths = 12;
        
        const totalInstallments = Math.max(1, Math.round((parseFloat(durationYears) || 1) * 12 / freqMonths));
        const installmentAmount = remaining / totalInstallments;
        
        return {
            netValue,
            dpAmount,
            remaining,
            totalInstallments,
            installmentAmount,
            freqMonths,
            priceWithAmenities
        };
    }, [listPrice, customerDiscount, floorDiscount, lumpSumDiscount, miscDiscount, downPaymentPercentage, durationYears, frequency, amenitiesTotal]);

    // Installment Schedule
    const schedule = useMemo(() => {
        const items = [];
        const baseDate = new Date();
        
        for (let i = 1; i <= calculations.totalInstallments; i++) {
            const dueDate = new Date(baseDate);
            dueDate.setMonth(baseDate.getMonth() + (i * calculations.freqMonths));
            
            items.push({
                index: i,
                dueDate: dueDate.toISOString().split('T')[0],
                amount: calculations.installmentAmount
            });
        }
        return items;
    }, [calculations]);

    // Handle Unit Selection - Auto fill list price
    useEffect(() => {
        if (unitId) {
            const unit = state.units.find(u => u.id === unitId);
            if (unit && unit.salePrice) {
                setListPrice(unit.salePrice.toString());
            }
        }
    }, [unitId, state.units]);

    // Build selected amenities array for saving
    const buildSelectedAmenities = (): InstallmentPlanAmenity[] => {
        const lp = parseFloat(listPrice) || 0;
        return selectedAmenityIds.map(amenityId => {
            const amenity = activeAmenities.find(a => a.id === amenityId);
            if (!amenity) return null;
            const calculatedAmount = amenity.isPercentage 
                ? (lp * amenity.price / 100)
                : amenity.price;
            return {
                amenityId: amenity.id,
                amenityName: amenity.name,
                calculatedAmount
            };
        }).filter(Boolean) as InstallmentPlanAmenity[];
    };

    const handleSave = () => {
        if (!leadId || !projectId || !unitId) {
            showAlert('Please fill all required fields');
            return;
        }

        const newPlan: InstallmentPlan = {
            id: selectedPlanId || Date.now().toString(),
            leadId,
            projectId,
            unitId,
            durationYears: parseFloat(durationYears),
            downPaymentPercentage: parseFloat(downPaymentPercentage),
            frequency,
            listPrice: parseFloat(listPrice),
            customerDiscount: parseFloat(customerDiscount),
            floorDiscount: parseFloat(floorDiscount),
            lumpSumDiscount: parseFloat(lumpSumDiscount),
            miscDiscount: parseFloat(miscDiscount),
            netValue: calculations.netValue,
            downPaymentAmount: calculations.dpAmount,
            installmentAmount: calculations.installmentAmount,
            totalInstallments: calculations.totalInstallments,
            description,
            // New fields
            customerDiscountCategoryId: customerDiscountCategoryId || undefined,
            floorDiscountCategoryId: floorDiscountCategoryId || undefined,
            lumpSumDiscountCategoryId: lumpSumDiscountCategoryId || undefined,
            miscDiscountCategoryId: miscDiscountCategoryId || undefined,
            selectedAmenities: buildSelectedAmenities(),
            amenitiesTotal,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        if (selectedPlanId) {
            dispatch({ type: 'UPDATE_INSTALLMENT_PLAN', payload: newPlan });
            showToast('Installment plan updated successfully');
        } else {
            dispatch({ type: 'ADD_INSTALLMENT_PLAN', payload: newPlan });
            showToast('Installment plan created successfully');
        }
        
        resetForm();
    };

    const resetForm = () => {
        setLeadId('');
        setProjectId('');
        setUnitId('');
        setDurationYears('1');
        setDownPaymentPercentage('20');
        setFrequency('Monthly');
        setDescription('');
        setListPrice('0');
        setCustomerDiscount('0');
        setFloorDiscount('0');
        setLumpSumDiscount('0');
        setMiscDiscount('0');
        setCustomerDiscountCategoryId('');
        setFloorDiscountCategoryId('');
        setLumpSumDiscountCategoryId('');
        setMiscDiscountCategoryId('');
        setSelectedAmenityIds([]);
        setSelectedPlanId(null);
        setShowForm(false);
    };

    const handleEdit = (plan: InstallmentPlan) => {
        setSelectedPlanId(plan.id);
        setLeadId(plan.leadId);
        setProjectId(plan.projectId);
        setUnitId(plan.unitId);
        setDurationYears(plan.durationYears.toString());
        setDownPaymentPercentage(plan.downPaymentPercentage.toString());
        setFrequency(plan.frequency);
        setListPrice(plan.listPrice.toString());
        setCustomerDiscount(plan.customerDiscount.toString());
        setFloorDiscount(plan.floorDiscount.toString());
        setLumpSumDiscount(plan.lumpSumDiscount.toString());
        setMiscDiscount(plan.miscDiscount.toString());
        setDescription(plan.description || '');
        // Load new fields
        setCustomerDiscountCategoryId(plan.customerDiscountCategoryId || '');
        setFloorDiscountCategoryId(plan.floorDiscountCategoryId || '');
        setLumpSumDiscountCategoryId(plan.lumpSumDiscountCategoryId || '');
        setMiscDiscountCategoryId(plan.miscDiscountCategoryId || '');
        setSelectedAmenityIds((plan.selectedAmenities || []).map(a => a.amenityId));
        setShowForm(true);
    };

    const handleDelete = async (id: string) => {
        const confirmed = await showConfirm('Are you sure you want to delete this plan?');
        if (confirmed) {
            dispatch({ type: 'DELETE_INSTALLMENT_PLAN', payload: id });
            showToast('Plan deleted');
        }
    };

    // Amenity handlers
    const handleSaveAmenity = (amenity: Partial<PlanAmenity>) => {
        if (amenity.id) {
            dispatch({ type: 'UPDATE_PLAN_AMENITY', payload: amenity as PlanAmenity });
            showToast('Amenity updated');
        } else {
            const newAmenity: PlanAmenity = {
                ...amenity,
                id: `amenity_${Date.now()}`,
                isActive: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            } as PlanAmenity;
            dispatch({ type: 'ADD_PLAN_AMENITY', payload: newAmenity });
            showToast('Amenity added');
        }
    };

    const handleDeleteAmenity = (id: string) => {
        dispatch({ type: 'DELETE_PLAN_AMENITY', payload: id });
        showToast('Amenity deleted');
    };

    const toggleAmenity = (amenityId: string) => {
        setSelectedAmenityIds(prev => 
            prev.includes(amenityId) 
                ? prev.filter(id => id !== amenityId)
                : [...prev, amenityId]
        );
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
            <div className="flex items-center justify-between p-4 bg-white border-b border-slate-200">
                <h1 className="text-xl font-bold text-slate-800">Installment Plans (Marketing)</h1>
                <div className="flex items-center gap-2">
                    <Button 
                        variant="secondary" 
                        onClick={() => setShowConfigModal(true)}
                        className="flex items-center gap-2"
                    >
                        <div className="w-4 h-4">{ICONS.settings}</div>
                        Configuration
                    </Button>
                    <Button 
                        variant="primary" 
                        onClick={() => { resetForm(); setShowForm(true); }}
                        className="flex items-center gap-2"
                    >
                        <div className="w-4 h-4">{ICONS.plus}</div>
                        New Plan
                    </Button>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-4">
                {showForm ? (
                    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
                        <Card className="p-6">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-lg font-bold text-slate-800">
                                    {selectedPlanId ? 'Edit Plan' : 'Create Installment Plan'}
                                </h2>
                                <Button variant="ghost" onClick={() => setShowForm(false)}>
                                    <div className="w-4 h-4">{ICONS.x}</div>
                                </Button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {/* Basic Info */}
                                <div className="space-y-4">
                                    <ComboBox 
                                        label="Lead Name" 
                                        items={leads} 
                                        selectedId={leadId} 
                                        onSelect={item => setLeadId(item?.id || '')} 
                                        placeholder="Select Lead"
                                        required
                                    />
                                    <ComboBox 
                                        label="Project" 
                                        items={state.projects} 
                                        selectedId={projectId} 
                                        onSelect={item => { setProjectId(item?.id || ''); setUnitId(''); }} 
                                        placeholder="Select Project"
                                        required
                                    />
                                    <ComboBox 
                                        label="Unit" 
                                        items={units} 
                                        selectedId={unitId} 
                                        onSelect={item => setUnitId(item?.id || '')} 
                                        placeholder="Select Unit"
                                        required
                                        disabled={!projectId}
                                    />
                                    <div className="grid grid-cols-2 gap-4">
                                        <Input 
                                            label="Duration (Years)" 
                                            type="number" 
                                            value={durationYears} 
                                            onChange={e => setDurationYears(e.target.value)}
                                        />
                                        <div className="flex flex-col gap-1">
                                            <label className="text-sm font-medium text-slate-600">Frequency</label>
                                            <select 
                                                value={frequency}
                                                onChange={e => setFrequency(e.target.value as InstallmentFrequency)}
                                                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm"
                                            >
                                                <option value="Monthly">Monthly</option>
                                                <option value="Quarterly">Quarterly</option>
                                                <option value="Yearly">Yearly</option>
                                            </select>
                                        </div>
                                    </div>
                                    <Input 
                                        label="Down Payment %" 
                                        type="number" 
                                        value={downPaymentPercentage} 
                                        onChange={e => setDownPaymentPercentage(e.target.value)}
                                    />
                                </div>

                                {/* Pricing & Discounts */}
                                <div className="space-y-4">
                                    <h3 className="font-bold text-slate-700 border-b pb-2">Pricing & Discounts</h3>
                                    <Input label="List Price" type="number" value={listPrice} onChange={e => setListPrice(e.target.value)} />
                                    
                                    {/* Customer Discount with Category */}
                                    <div className="space-y-1">
                                        <div className="flex gap-2">
                                            <div className="flex-1">
                                                <Input label="Customer Discount" type="number" value={customerDiscount} onChange={e => setCustomerDiscount(e.target.value)} />
                                            </div>
                                            <div className="w-32">
                                                <label className="text-xs font-medium text-slate-500 block mb-1">Category</label>
                                                <select 
                                                    value={customerDiscountCategoryId}
                                                    onChange={e => setCustomerDiscountCategoryId(e.target.value)}
                                                    className="w-full px-2 py-2 bg-white border border-slate-300 rounded-md text-xs"
                                                >
                                                    <option value="">None</option>
                                                    {expenseCategories.map(cat => (
                                                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Floor Discount with Category */}
                                    <div className="space-y-1">
                                        <div className="flex gap-2">
                                            <div className="flex-1">
                                                <Input label="Floor Discount" type="number" value={floorDiscount} onChange={e => setFloorDiscount(e.target.value)} />
                                            </div>
                                            <div className="w-32">
                                                <label className="text-xs font-medium text-slate-500 block mb-1">Category</label>
                                                <select 
                                                    value={floorDiscountCategoryId}
                                                    onChange={e => setFloorDiscountCategoryId(e.target.value)}
                                                    className="w-full px-2 py-2 bg-white border border-slate-300 rounded-md text-xs"
                                                >
                                                    <option value="">None</option>
                                                    {expenseCategories.map(cat => (
                                                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Lump Sum Discount with Category */}
                                    <div className="space-y-1">
                                        <div className="flex gap-2">
                                            <div className="flex-1">
                                                <Input label="Lump Sum Discount" type="number" value={lumpSumDiscount} onChange={e => setLumpSumDiscount(e.target.value)} />
                                            </div>
                                            <div className="w-32">
                                                <label className="text-xs font-medium text-slate-500 block mb-1">Category</label>
                                                <select 
                                                    value={lumpSumDiscountCategoryId}
                                                    onChange={e => setLumpSumDiscountCategoryId(e.target.value)}
                                                    className="w-full px-2 py-2 bg-white border border-slate-300 rounded-md text-xs"
                                                >
                                                    <option value="">None</option>
                                                    {expenseCategories.map(cat => (
                                                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Misc Discount with Category */}
                                    <div className="space-y-1">
                                        <div className="flex gap-2">
                                            <div className="flex-1">
                                                <Input label="Misc. Discount" type="number" value={miscDiscount} onChange={e => setMiscDiscount(e.target.value)} />
                                            </div>
                                            <div className="w-32">
                                                <label className="text-xs font-medium text-slate-500 block mb-1">Category</label>
                                                <select 
                                                    value={miscDiscountCategoryId}
                                                    onChange={e => setMiscDiscountCategoryId(e.target.value)}
                                                    className="w-full px-2 py-2 bg-white border border-slate-300 rounded-md text-xs"
                                                >
                                                    <option value="">None</option>
                                                    {expenseCategories.map(cat => (
                                                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Summary & Amenities */}
                                <div className="space-y-4">
                                    {/* Amenities Selection */}
                                    {activeAmenities.length > 0 && (
                                        <div className="bg-purple-50/50 p-4 rounded-lg border border-purple-100">
                                            <h3 className="font-bold text-purple-900 border-b border-purple-200 pb-2 mb-3">Select Amenities</h3>
                                            <div className="space-y-2 max-h-32 overflow-y-auto">
                                                {activeAmenities.map(amenity => {
                                                    const isSelected = selectedAmenityIds.includes(amenity.id);
                                                    const lp = parseFloat(listPrice) || 0;
                                                    const calculatedAmount = amenity.isPercentage 
                                                        ? (lp * amenity.price / 100)
                                                        : amenity.price;
                                                    return (
                                                        <label 
                                                            key={amenity.id} 
                                                            className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                                                                isSelected ? 'bg-purple-100 border border-purple-300' : 'bg-white border border-slate-200 hover:border-purple-300'
                                                            }`}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <input 
                                                                    type="checkbox" 
                                                                    checked={isSelected}
                                                                    onChange={() => toggleAmenity(amenity.id)}
                                                                    className="w-4 h-4 text-purple-600 rounded"
                                                                />
                                                                <span className="text-sm font-medium text-slate-800">{amenity.name}</span>
                                                                <span className="text-xs text-slate-500">
                                                                    ({amenity.isPercentage ? `${amenity.price}%` : amenity.price.toLocaleString()})
                                                                </span>
                                                            </div>
                                                            {isSelected && (
                                                                <span className="text-sm font-bold text-purple-700">
                                                                    +{calculatedAmount.toLocaleString()}
                                                                </span>
                                                            )}
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                            {amenitiesTotal > 0 && (
                                                <div className="flex justify-between pt-2 mt-2 border-t border-purple-200 text-sm">
                                                    <span className="font-medium text-purple-800">Amenities Total:</span>
                                                    <span className="font-bold text-purple-900">+{amenitiesTotal.toLocaleString()}</span>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Plan Summary */}
                                    <div className="bg-indigo-50/50 p-4 rounded-lg border border-indigo-100">
                                        <h3 className="font-bold text-indigo-900 border-b border-indigo-200 pb-2">Plan Summary</h3>
                                        <div className="space-y-2 text-sm mt-3">
                                            <div className="flex justify-between">
                                                <span className="text-slate-600">List Price:</span>
                                                <span className="font-medium text-slate-900">{parseFloat(listPrice).toLocaleString()}</span>
                                            </div>
                                            {amenitiesTotal > 0 && (
                                                <div className="flex justify-between text-purple-700">
                                                    <span>+ Amenities:</span>
                                                    <span className="font-medium">+{amenitiesTotal.toLocaleString()}</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between border-t border-indigo-200 pt-2">
                                                <span className="text-slate-600">Net Value:</span>
                                                <span className="font-bold text-slate-900">{calculations.netValue.toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-slate-600">Down Payment ({downPaymentPercentage}%):</span>
                                                <span className="font-bold text-indigo-700">{calculations.dpAmount.toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between border-t border-indigo-200 pt-2">
                                                <span className="text-slate-600">Financed Amount:</span>
                                                <span className="font-bold text-slate-900">{calculations.remaining.toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-slate-600">Installments:</span>
                                                <span className="font-bold text-slate-900">{calculations.totalInstallments} x {calculations.installmentAmount.toLocaleString()}</span>
                                            </div>
                                        </div>
                                        <div className="pt-4">
                                            <Button className="w-full" onClick={handleSave}>
                                                {selectedPlanId ? 'Update Plan' : 'Save Plan'}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </Card>

                        {/* Installment Table */}
                        <Card className="p-6 overflow-hidden">
                            <h3 className="font-bold text-slate-800 mb-4">Installment Schedule</h3>
                            <div className="overflow-auto max-h-96 border rounded-lg">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-100 sticky top-0">
                                        <tr>
                                            <th className="px-4 py-2 border-b">#</th>
                                            <th className="px-4 py-2 border-b">Due Date</th>
                                            <th className="px-4 py-2 border-b text-right">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {schedule.map(item => (
                                            <tr key={item.index} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-2 border-b">{item.index}</td>
                                                <td className="px-4 py-2 border-b">{item.dueDate}</td>
                                                <td className="px-4 py-2 border-b text-right font-medium">{item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-slate-50 font-bold">
                                        <tr>
                                            <td colSpan={2} className="px-4 py-2 text-right">Total Financed:</td>
                                            <td className="px-4 py-2 text-right">{calculations.remaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </Card>
                    </div>
                ) : (
                    <div className="max-w-6xl mx-auto space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {(state.installmentPlans || []).map(plan => {
                                const lead = leads.find(l => l.id === plan.leadId);
                                const project = state.projects.find(p => p.id === plan.projectId);
                                const unit = state.units.find(u => u.id === plan.unitId);
                                
                                return (
                                    <Card 
                                        key={plan.id} 
                                        className="p-4 hover:shadow-lg transition-all cursor-pointer border-l-4 border-indigo-500"
                                        onClick={() => handleEdit(plan)}
                                    >
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h3 className="font-bold text-slate-900">{lead?.name || 'Unknown Lead'}</h3>
                                                <p className="text-xs text-slate-500">{project?.name} - {unit?.name}</p>
                                            </div>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleDelete(plan.id); }}
                                                className="text-slate-400 hover:text-rose-500 p-1"
                                            >
                                                <div className="w-4 h-4">{ICONS.trash}</div>
                                            </button>
                                        </div>
                                        
                                        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                                            <div className="bg-slate-50 p-2 rounded">
                                                <p className="text-[10px] text-slate-500 uppercase font-bold">Net Value</p>
                                                <p className="font-bold text-indigo-700">{plan.netValue?.toLocaleString()}</p>
                                            </div>
                                            <div className="bg-slate-50 p-2 rounded">
                                                <p className="text-[10px] text-slate-500 uppercase font-bold">Monthly</p>
                                                <p className="font-bold text-slate-800">{plan.installmentAmount?.toLocaleString()}</p>
                                            </div>
                                        </div>

                                        {/* Show amenities if any */}
                                        {plan.selectedAmenities && plan.selectedAmenities.length > 0 && (
                                            <div className="mt-2 flex flex-wrap gap-1">
                                                {plan.selectedAmenities.map(a => (
                                                    <span key={a.amenityId} className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
                                                        {a.amenityName}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        
                                        <div className="mt-4 flex justify-between items-center text-xs text-slate-500">
                                            <span>{plan.durationYears} Years | {plan.frequency}</span>
                                            <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">View Detail</span>
                                        </div>
                                    </Card>
                                );
                            })}
                        </div>
                        
                        {(state.installmentPlans || []).length === 0 && (
                            <div className="text-center py-20 bg-white rounded-xl border-2 border-dashed border-slate-200">
                                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                                    <div className="w-8 h-8">{ICONS.trendingUp}</div>
                                </div>
                                <h3 className="text-lg font-medium text-slate-900">No Installment Plans Yet</h3>
                                <p className="text-slate-500 max-w-sm mx-auto mt-2">Create your first installment plan to help clients visualize their payment schedule.</p>
                                <Button 
                                    variant="primary" 
                                    onClick={() => setShowForm(true)}
                                    className="mt-6"
                                >
                                    Create First Plan
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Amenity Configuration Modal */}
            <AmenityConfigModal 
                isOpen={showConfigModal}
                onClose={() => setShowConfigModal(false)}
                amenities={state.planAmenities || []}
                onSave={handleSaveAmenity}
                onDelete={handleDeleteAmenity}
            />
        </div>
    );
};

export default MarketingPage;
