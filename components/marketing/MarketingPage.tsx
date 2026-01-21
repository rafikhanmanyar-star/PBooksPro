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
        
        // Initial Down Payment
        let currentBalance = calculations.netValue;
        const initialRemaining = currentBalance - calculations.dpAmount;
        
        items.push({
            index: 'Initial',
            dueDate: 'At Booking',
            amount: calculations.dpAmount,
            balance: initialRemaining
        });

        currentBalance = initialRemaining;
        
        for (let i = 1; i <= calculations.totalInstallments; i++) {
            const dueDate = new Date(baseDate);
            dueDate.setMonth(baseDate.getMonth() + (i * calculations.freqMonths));
            
            // For the last installment, ensure it zeros out exactly
            const amount = i === calculations.totalInstallments ? currentBalance : calculations.installmentAmount;
            currentBalance -= amount;
            
            items.push({
                index: i.toString(),
                dueDate: dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                amount: amount,
                balance: Math.max(0, currentBalance)
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

            <div className="flex-1 overflow-hidden">
                {showForm ? (
                    <div className="flex h-full animate-fade-in bg-slate-100">
                        {/* Left Sidebar - Form Controls */}
                        <div className="w-80 flex flex-col bg-white border-r border-slate-200 overflow-y-auto shrink-0">
                            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                                <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Project Info</h2>
                                <Button variant="ghost" onClick={() => setShowForm(false)} size="sm">
                                    <div className="w-4 h-4">{ICONS.x}</div>
                                </Button>
                            </div>
                            
                            <div className="p-4 space-y-6">
                                {/* Basic Selection */}
                                <div className="space-y-4">
                                    <ComboBox 
                                        label="Project Name" 
                                        items={state.projects} 
                                        selectedId={projectId} 
                                        onSelect={item => { setProjectId(item?.id || ''); setUnitId(''); }} 
                                        placeholder="Select Project"
                                    />
                                    <div className="grid grid-cols-2 gap-2">
                                        <ComboBox 
                                            label="Unit Type" 
                                            items={[]} // Just text in image usually
                                            selectedId={""}
                                            onSelect={() => {}}
                                            placeholder="3BHK Luxury"
                                        />
                                        <ComboBox 
                                            label="Unit #" 
                                            items={units} 
                                            selectedId={unitId} 
                                            onSelect={item => setUnitId(item?.id || '')} 
                                            placeholder="Select Unit"
                                            disabled={!projectId}
                                        />
                                    </div>
                                </div>

                                {/* Pricing & Discount */}
                                <div className="space-y-4 pt-4 border-t border-slate-100">
                                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pricing & Discount</h3>
                                    <Input label="Base Price ($)" type="number" value={listPrice} onChange={e => setListPrice(e.target.value)} />
                                    <Input label="Amenities ($)" type="number" value={amenitiesTotal.toString()} disabled />
                                    
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-xs font-medium text-slate-600">
                                            <span>Discount (%)</span>
                                            <span className="text-indigo-600 font-bold">{customerDiscount}%</span>
                                        </div>
                                        <input 
                                            type="range" 
                                            min="0" max="25" 
                                            value={customerDiscount} 
                                            onChange={e => setCustomerDiscount(e.target.value)}
                                            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                        />
                                    </div>
                                </div>

                                {/* Installment Plan */}
                                <div className="space-y-4 pt-4 border-t border-slate-100">
                                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Installment Plan</h3>
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-xs font-medium text-slate-600">
                                            <span>Down Payment (%)</span>
                                            <span className="text-indigo-600 font-bold">{downPaymentPercentage}%</span>
                                        </div>
                                        <input 
                                            type="range" 
                                            min="5" max="50" 
                                            value={downPaymentPercentage} 
                                            onChange={e => setDownPaymentPercentage(e.target.value)}
                                            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-500 uppercase">Years</label>
                                            <select 
                                                value={durationYears}
                                                onChange={e => setDurationYears(e.target.value)}
                                                className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                                            >
                                                {[1, 2, 3, 4, 5, 10].map(y => <option key={y} value={y}>{y} Years</option>)}
                                            </select>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-500 uppercase">Frequency</label>
                                            <select 
                                                value={frequency}
                                                onChange={e => setFrequency(e.target.value as InstallmentFrequency)}
                                                className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                                            >
                                                <option value="Monthly">Monthly</option>
                                                <option value="Quarterly">Quarterly</option>
                                                <option value="Yearly">Yearly</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                {/* Client Info */}
                                <div className="space-y-4 pt-4 border-t border-slate-100">
                                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Client Info</h3>
                                    <ComboBox 
                                        label="Client Name" 
                                        items={leads} 
                                        selectedId={leadId} 
                                        onSelect={item => setLeadId(item?.id || '')} 
                                        placeholder="Select Lead"
                                    />
                                </div>

                                <div className="pt-6">
                                    <Button className="w-full justify-center py-3" onClick={handleSave}>
                                        {selectedPlanId ? 'Update Plan' : 'Save Plan'}
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {/* Right Content - Proposal Preview */}
                        <div className="flex-1 overflow-y-auto p-8 bg-slate-100">
                            <div className="max-w-4xl mx-auto bg-white shadow-2xl rounded-sm overflow-hidden min-h-full flex flex-col">
                                {/* Proposal Header */}
                                <div className="bg-[#1a237e] p-10 text-white flex justify-between items-start relative overflow-hidden">
                                    <div className="relative z-10">
                                        <h1 className="text-4xl font-extrabold tracking-tight mb-2">
                                            {state.projects.find(p => p.id === projectId)?.name || 'Project Name'}
                                        </h1>
                                        <div className="flex items-center gap-2 text-indigo-200 text-sm">
                                            <div className="w-4 h-4">{ICONS.mapPin}</div>
                                            <span>Official Investment Proposal</span>
                                        </div>
                                    </div>
                                    <div className="text-right relative z-10">
                                        <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest mb-1">Prepared For</p>
                                        <p className="text-2xl font-bold">{leads.find(l => l.id === leadId)?.name || 'Client Name'}</p>
                                    </div>
                                    {/* Decorative background element */}
                                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32 blur-3xl"></div>
                                </div>

                                <div className="p-10 space-y-10 flex-1">
                                    {/* Intro Text */}
                                    <div className="border-l-4 border-indigo-600 pl-6 py-2">
                                        <h3 className="text-lg font-bold text-slate-800 mb-2">Exclusively for You</h3>
                                        <p className="text-slate-600 italic leading-relaxed">
                                            "Dear {leads.find(l => l.id === leadId)?.name || 'Mr. Doe'}, Unit #{units.find(u => u.id === unitId)?.name || 'A-1204'} at {state.projects.find(p => p.id === projectId)?.name || 'Project Name'} has been meticulously selected for you as a private sanctuary that epitomizes contemporary elegance and absolute exclusivity. This {units.find(u => u.id === unitId)?.propertyType || '3BHK'} residence offers more than just a sophisticated lifestyle; it serves as a high-performing asset with exceptional capital appreciation potential in an increasingly sought-after corridor. Securing this premier unit is a strategic move to anchor your portfolio with a legacy property that truly reflects your standard of distinction."
                                        </p>
                                    </div>

                                    {/* Summary Stats Grid */}
                                    <div className="grid grid-cols-4 gap-4">
                                        <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Unit Details</p>
                                            <p className="text-sm font-bold text-slate-800 line-clamp-1">{units.find(u => u.id === unitId)?.propertyType || '3BHK Luxury Apartment'}</p>
                                            <p className="text-[10px] text-slate-500">Unit ID: {units.find(u => u.id === unitId)?.name || 'N/A'}</p>
                                        </div>
                                        <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Total Net Price</p>
                                            <p className="text-sm font-bold text-indigo-700">${calculations.netValue.toLocaleString()}</p>
                                            <p className="text-[10px] text-slate-500">Incl. {customerDiscount}% Discount</p>
                                        </div>
                                        <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Down Payment</p>
                                            <p className="text-sm font-bold text-indigo-700">${calculations.dpAmount.toLocaleString()}</p>
                                            <p className="text-[10px] text-slate-500">{downPaymentPercentage}% required</p>
                                        </div>
                                        <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Installment</p>
                                            <p className="text-sm font-bold text-indigo-700">${calculations.installmentAmount.toLocaleString()}</p>
                                            <p className="text-[10px] text-slate-500">{frequency} payments</p>
                                        </div>
                                    </div>

                                    {/* Cost Breakdown */}
                                    <div>
                                        <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-2">
                                            <div className="w-5 h-5 text-indigo-600">{ICONS.list}</div>
                                            <h3 className="font-bold text-slate-800">Cost Breakdown</h3>
                                        </div>
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-slate-600">Base Price of Unit</span>
                                                <span className="font-bold text-slate-900">${parseFloat(listPrice).toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-slate-600">Premium Amenities & Facilities</span>
                                                <span className="font-bold text-slate-900">${amenitiesTotal.toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm pt-2 border-t border-slate-100">
                                                <span className="font-bold text-slate-800">Total Gross Price</span>
                                                <span className="font-extrabold text-slate-900">${(parseFloat(listPrice) + amenitiesTotal).toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-rose-600 italic">Exclusive Offer Discount ({customerDiscount}%)</span>
                                                <span className="font-bold text-rose-600">-${( (parseFloat(listPrice) + amenitiesTotal) * parseFloat(customerDiscount) / 100 ).toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between items-center py-4 px-4 bg-indigo-50/50 rounded-lg mt-4">
                                                <span className="font-extrabold text-slate-800 uppercase tracking-wider">Net Payable Price</span>
                                                <span className="text-2xl font-black text-indigo-700">${calculations.netValue.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Installment Schedule */}
                                    <div className="pb-10">
                                        <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-2">
                                            <div className="flex items-center gap-2">
                                                <div className="w-5 h-5 text-indigo-600">{ICONS.calendar}</div>
                                                <h3 className="font-bold text-slate-800">Installment Schedule</h3>
                                            </div>
                                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                                {durationYears} Years Plan • {calculations.totalInstallments} Installments
                                            </div>
                                        </div>
                                        <div className="rounded-lg border border-slate-200 overflow-hidden shadow-sm">
                                            <table className="w-full text-left text-sm border-collapse">
                                                <thead>
                                                    <tr className="bg-[#1a237e] text-white">
                                                        <th className="px-6 py-4 font-bold uppercase tracking-wider text-[10px]">#</th>
                                                        <th className="px-6 py-4 font-bold uppercase tracking-wider text-[10px]">Due Date</th>
                                                        <th className="px-6 py-4 font-bold uppercase tracking-wider text-[10px]">Amount</th>
                                                        <th className="px-6 py-4 font-bold uppercase tracking-wider text-[10px] text-right">Outstanding Balance</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {schedule.map((item, idx) => (
                                                        <tr 
                                                            key={item.index} 
                                                            className={`border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors ${idx === 0 ? 'bg-indigo-50/30' : ''}`}
                                                        >
                                                            <td className="px-6 py-4 font-bold text-slate-800">{item.index}</td>
                                                            <td className="px-6 py-4 text-slate-600">{item.dueDate}</td>
                                                            <td className="px-6 py-4 font-extrabold text-indigo-700">
                                                                ${item.amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                                            </td>
                                                            <td className="px-6 py-4 text-right font-bold text-slate-800">
                                                                ${item.balance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
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
