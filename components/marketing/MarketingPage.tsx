import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { 
    ContactType, 
    Project, 
    Unit, 
    InstallmentPlan, 
    InstallmentFrequency,
    Contact
} from '../../types';
import Input from '../ui/Input';
import Button from '../ui/Button';
import ComboBox from '../ui/ComboBox';
import Card from '../ui/Card';
import { ICONS } from '../../constants';
import { useNotification } from '../../context/NotificationContext';

const MarketingPage: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const { showToast, showAlert, showConfirm } = useNotification();
    
    const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);

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

    // Filtered Leads
    const leads = useMemo(() => state.contacts.filter(c => c.type === ContactType.LEAD), [state.contacts]);
    
    // Units for selected project
    const units = useMemo(() => {
        if (!projectId) return [];
        return state.units.filter(u => u.projectId === projectId);
    }, [projectId, state.units]);

    // Calculations
    const calculations = useMemo(() => {
        const lp = parseFloat(listPrice) || 0;
        const cd = parseFloat(customerDiscount) || 0;
        const fd = parseFloat(floorDiscount) || 0;
        const lsd = parseFloat(lumpSumDiscount) || 0;
        const md = parseFloat(miscDiscount) || 0;
        
        const netValue = lp - cd - fd - lsd - md;
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
            freqMonths
        };
    }, [listPrice, customerDiscount, floorDiscount, lumpSumDiscount, miscDiscount, downPaymentPercentage, durationYears, frequency]);

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
        setShowForm(true);
    };

    const handleDelete = async (id: string) => {
        const confirmed = await showConfirm('Are you sure you want to delete this plan?');
        if (confirmed) {
            dispatch({ type: 'DELETE_INSTALLMENT_PLAN', payload: id });
            showToast('Plan deleted');
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
            <div className="flex items-center justify-between p-4 bg-white border-b border-slate-200">
                <h1 className="text-xl font-bold text-slate-800">Installment Plans (Marketing)</h1>
                <Button 
                    variant="primary" 
                    onClick={() => { resetForm(); setShowForm(true); }}
                    className="flex items-center gap-2"
                >
                    <div className="w-4 h-4">{ICONS.plus}</div>
                    New Plan
                </Button>
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

                                {/* Pricing */}
                                <div className="space-y-4">
                                    <h3 className="font-bold text-slate-700 border-b pb-2">Pricing & Discounts</h3>
                                    <Input label="List Price" type="number" value={listPrice} onChange={e => setListPrice(e.target.value)} />
                                    <Input label="Customer Discount" type="number" value={customerDiscount} onChange={e => setCustomerDiscount(e.target.value)} />
                                    <Input label="Floor Discount" type="number" value={floorDiscount} onChange={e => setFloorDiscount(e.target.value)} />
                                    <Input label="Lump Sum Discount" type="number" value={lumpSumDiscount} onChange={e => setLumpSumDiscount(e.target.value)} />
                                    <Input label="Misc. Discount" type="number" value={miscDiscount} onChange={e => setMiscDiscount(e.target.value)} />
                                </div>

                                {/* Summary */}
                                <div className="space-y-4 bg-indigo-50/50 p-4 rounded-lg border border-indigo-100">
                                    <h3 className="font-bold text-indigo-900 border-b border-indigo-200 pb-2">Plan Summary</h3>
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
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
        </div>
    );
};

export default MarketingPage;
