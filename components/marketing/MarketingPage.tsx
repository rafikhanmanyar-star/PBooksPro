import React, { useState, useMemo, useEffect } from 'react';
import { apiClient } from '../../services/api/client';
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
import { useEntityFormModal, EntityFormModal } from '../../hooks/useEntityFormModal';
import { usePrint } from '../../hooks/usePrint';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';
import PrintButton from '../ui/PrintButton';
import ReportHeader from '../reports/ReportHeader';
import ReportFooter from '../reports/ReportFooter';

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
                                                    {amenity.isPercentage ? `${amenity.price}%` : `Rs. ${amenity.price.toLocaleString()}`}
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

const ApprovalRequestModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    approvers: { id: string; name: string }[];
    selectedApproverId: string;
    onSelectApprover: (id: string) => void;
    onSubmit: () => void;
}> = ({ isOpen, onClose, approvers, selectedApproverId, onSelectApprover, onSubmit }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-slate-200">
                    <h2 className="text-lg font-bold text-slate-800">Submit for Approval</h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
                        <div className="w-5 h-5">{ICONS.x}</div>
                    </button>
                </div>
                <div className="p-4 space-y-4">
                    <ComboBox
                        label="Approver"
                        items={approvers}
                        selectedId={selectedApproverId}
                        onSelect={item => onSelectApprover(item?.id || '')}
                        placeholder="Select approver"
                        allowAddNew={false}
                        entityType="report"
                    />
                    <p className="text-xs text-slate-500">
                        Only users with approval rights are listed.
                    </p>
                </div>
                <div className="p-4 border-t border-slate-200 flex gap-2 justify-end">
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button onClick={onSubmit} disabled={!selectedApproverId}>
                        Send for Approval
                    </Button>
                </div>
            </div>
        </div>
    );
};

const MarketingPage: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const { showToast, showAlert, showConfirm } = useNotification();
    const entityFormModal = useEntityFormModal();
    const { handlePrint } = usePrint();
    
    const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<'formal' | 'modern'>('formal');

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
    const [discounts, setDiscounts] = useState<{ id: string, name: string, amount: number, categoryId?: string }[]>([]);
    const [introText, setIntroText] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [status, setStatus] = useState<InstallmentPlan['status']>('Draft');
    const [version, setVersion] = useState(1);
    const [rootId, setRootId] = useState<string | undefined>(undefined);
    const [approvalRequestedById, setApprovalRequestedById] = useState<string | undefined>(undefined);
    const [approvalRequestedToId, setApprovalRequestedToId] = useState<string>('');
    const [approvalRequestedAt, setApprovalRequestedAt] = useState<string | undefined>(undefined);
    const [approvalReviewedById, setApprovalReviewedById] = useState<string | undefined>(undefined);
    const [approvalReviewedAt, setApprovalReviewedAt] = useState<string | undefined>(undefined);

    // Dynamic Discount Form State
    const [newDiscountName, setNewDiscountName] = useState('');
    const [newDiscountAmount, setNewDiscountAmount] = useState('0');
    const [newDiscountCategoryId, setNewDiscountCategoryId] = useState('');

    // Dynamic Amenity Selection State
    const [selectedAmenityIdToAdd, setSelectedAmenityIdToAdd] = useState('');
    const [showApprovalModal, setShowApprovalModal] = useState(false);
    const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
    const [historyRootId, setHistoryRootId] = useState<string | null>(null);
    const [approvalModalApproverId, setApprovalModalApproverId] = useState('');
    const [orgUsers, setOrgUsers] = useState<{ id: string; name: string; username: string; role: string }[]>([]);

    // Discount Category IDs (link to expense categories)
    const [customerDiscountCategoryId, setCustomerDiscountCategoryId] = useState('');
    const [floorDiscountCategoryId, setFloorDiscountCategoryId] = useState('');
    const [lumpSumDiscountCategoryId, setLumpSumDiscountCategoryId] = useState('');
    const [miscDiscountCategoryId, setMiscDiscountCategoryId] = useState('');

    // Selected Amenities
    const [selectedAmenityIds, setSelectedAmenityIds] = useState<string[]>([]);

    // Helper to get latest versions only
    const latestVersions = useMemo(() => {
        const plans = state.installmentPlans || [];
        const latest: Record<string, number> = {};
        plans.forEach(p => {
            const rId = p.rootId || p.id;
            if (!latest[rId] || p.version > latest[rId]) {
                latest[rId] = p.version;
            }
        });
        return latest;
    }, [state.installmentPlans]);

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

    useEffect(() => {
        const loadOrgUsers = async () => {
            try {
                const data = await apiClient.get<{ id: string; name: string; username: string; role: string }[]>('/users');
                setOrgUsers(data || []);
            } catch (error) {
                console.error('Failed to load organization users', error);
                setOrgUsers([]);
            }
        };
        loadOrgUsers();
    }, []);

    const usersForApproval = orgUsers.length > 0 ? orgUsers : state.users;
    const approvers = useMemo(
        () => usersForApproval
            .filter(user => user.role === 'Admin')
            .map(user => ({ id: user.id, name: user.name || user.username })),
        [usersForApproval]
    );
    
    // Units for selected project
    const units = useMemo(() => {
        if (!projectId) return [];
        return state.units.filter(u => u.projectId === projectId);
    }, [projectId, state.units]);

    const activePlan = useMemo(() => {
        if (!selectedPlanId) return null;
        return (state.installmentPlans || []).find(p => p.id === selectedPlanId) || null;
    }, [selectedPlanId, state.installmentPlans]);

    const effectiveStatus = activePlan?.status || status;
    const normalizedStatus = (effectiveStatus || '').toString().toLowerCase().replace(/\s+/g, ' ').trim();
    const isPendingApproval = normalizedStatus === 'pending approval';
    const isApprovedStatus = normalizedStatus === 'approved';
    const isRejectedStatus = normalizedStatus === 'rejected';
    const isLockedStatus = normalizedStatus === 'locked';
    const effectiveApprovalRequestedToId = activePlan?.approvalRequestedToId || approvalRequestedToId;
    const effectiveApprovalRequestedById = activePlan?.approvalRequestedById || approvalRequestedById;
    const effectiveApprovalReviewedById = activePlan?.approvalReviewedById || approvalReviewedById;
    const isMatchingUser = useMemo(() => {
        const currentUser = state.currentUser;
        if (!currentUser) return () => false;
        const candidates = [
            currentUser.id,
            currentUser.username,
            currentUser.name
        ].filter(Boolean).map(value => value.toString().toLowerCase());
        return (value?: string) => {
            if (!value) return false;
            return candidates.includes(value.toString().toLowerCase());
        };
    }, [state.currentUser]);
    const isApproverForSelectedPlan = isPendingApproval && isMatchingUser(effectiveApprovalRequestedToId);

    const isReadOnly = isPendingApproval || isApprovedStatus || isLockedStatus;
    const approvalRequestedToName = effectiveApprovalRequestedToId
        ? usersForApproval.find(u => u.id === effectiveApprovalRequestedToId)?.name || usersForApproval.find(u => u.id === effectiveApprovalRequestedToId)?.username
        : undefined;
    const approvalRequestedByName = effectiveApprovalRequestedById
        ? usersForApproval.find(u => u.id === effectiveApprovalRequestedById)?.name || usersForApproval.find(u => u.id === effectiveApprovalRequestedById)?.username
        : undefined;
    const approvalReviewedByName = effectiveApprovalReviewedById
        ? usersForApproval.find(u => u.id === effectiveApprovalReviewedById)?.name || usersForApproval.find(u => u.id === effectiveApprovalReviewedById)?.username
        : undefined;


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

    const totalDiscountAmount = useMemo(() => {
        return discounts.reduce((total, d) => total + (d.amount || 0), 0);
    }, [discounts]);

    // Calculations (now includes amenities)
    const calculations = useMemo(() => {
        const lp = parseFloat(listPrice) || 0;
        
        // Add amenities to list price, then subtract discounts
        const priceWithAmenities = lp + amenitiesTotal;
        const netValue = priceWithAmenities - totalDiscountAmount;
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
    }, [listPrice, totalDiscountAmount, downPaymentPercentage, durationYears, frequency, amenitiesTotal]);

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

    const normalizeMoney = (value: number) => Number.isFinite(value) ? Number(value.toFixed(2)) : 0;

    const normalizeDiscounts = (list: { id: string; name: string; amount: number; categoryId?: string }[]) => {
        return [...list]
            .map(d => ({
                id: d.id,
                name: d.name.trim(),
                amount: normalizeMoney(d.amount),
                categoryId: d.categoryId || ''
            }))
            .sort((a, b) => a.id.localeCompare(b.id));
    };

    const normalizeAmenities = (list: InstallmentPlanAmenity[]) => {
        return [...list]
            .map(a => ({
                amenityId: a.amenityId,
                amenityName: a.amenityName.trim(),
                calculatedAmount: normalizeMoney(a.calculatedAmount)
            }))
            .sort((a, b) => a.amenityId.localeCompare(b.amenityId));
    };

    const isPlanUnchanged = (plan: InstallmentPlan) => {
        const currentSnapshot = {
            leadId,
            projectId,
            unitId,
            durationYears: parseFloat(durationYears) || 0,
            downPaymentPercentage: parseFloat(downPaymentPercentage) || 0,
            frequency,
            listPrice: normalizeMoney(parseFloat(listPrice) || 0),
            discounts: normalizeDiscounts(discounts),
            description: description.trim(),
            introText: introText.trim(),
            selectedAmenities: normalizeAmenities(buildSelectedAmenities()),
            amenitiesTotal: normalizeMoney(amenitiesTotal)
        };

        const planSnapshot = {
            leadId: plan.leadId,
            projectId: plan.projectId,
            unitId: plan.unitId,
            durationYears: plan.durationYears,
            downPaymentPercentage: plan.downPaymentPercentage,
            frequency: plan.frequency,
            listPrice: normalizeMoney(plan.listPrice),
            discounts: normalizeDiscounts(plan.discounts || []),
            description: (plan.description || '').trim(),
            introText: (plan.introText || '').trim(),
            selectedAmenities: normalizeAmenities(plan.selectedAmenities || []),
            amenitiesTotal: normalizeMoney(plan.amenitiesTotal || 0)
        };

        return JSON.stringify(currentSnapshot) === JSON.stringify(planSnapshot);
    };

    const handleSave = (mode: 'draft' | 'submitApproval' = 'draft', approverId?: string) => {
        if (!leadId || !projectId || !unitId) {
            showAlert('Please fill all required fields');
            return;
        }

        if (mode === 'submitApproval' && !approverId) {
            showToast('Please select an approver');
            return;
        }

        const existingPlan = selectedPlanId
            ? (state.installmentPlans || []).find(p => p.id === selectedPlanId)
            : null;

        const now = new Date().toISOString();
        const submitStatus: InstallmentPlan['status'] = mode === 'submitApproval' ? 'Pending Approval' : 'Draft';
        const approvalRequestedBy = mode === 'submitApproval' ? (state.currentUser?.id || undefined) : undefined;
        const approvalRequestedTo = mode === 'submitApproval' ? approverId : undefined;

        if (mode === 'submitApproval' && existingPlan && isPlanUnchanged(existingPlan)) {
            const updatedPlan: InstallmentPlan = {
                ...existingPlan,
                status: submitStatus,
                approvalRequestedById: approvalRequestedBy,
                approvalRequestedToId: approvalRequestedTo,
                approvalRequestedAt: now,
                approvalReviewedById: undefined,
                approvalReviewedAt: undefined,
                updatedAt: now
            };
            dispatch({ type: 'UPDATE_INSTALLMENT_PLAN', payload: updatedPlan });
            showToast('Approval request sent');
            resetForm();
            return;
        }

        // Always create a new version when saving changes for review or draft.
        const newVersion = selectedPlanId ? version + 1 : 1;
        const newRootId = rootId || `root_${Date.now()}`;

        const newPlan: InstallmentPlan = {
            id: `plan_${Date.now()}`,
            rootId: newRootId,
            version: newVersion,
            status: submitStatus,
            leadId,
            projectId,
            unitId,
            durationYears: parseFloat(durationYears),
            downPaymentPercentage: parseFloat(downPaymentPercentage),
            frequency,
            listPrice: parseFloat(listPrice),
            discounts,
            netValue: calculations.netValue,
            downPaymentAmount: calculations.dpAmount,
            installmentAmount: calculations.installmentAmount,
            totalInstallments: calculations.totalInstallments,
            description,
            introText,
            selectedAmenities: buildSelectedAmenities(),
            amenitiesTotal,
            approvalRequestedById: approvalRequestedBy,
            approvalRequestedToId: approvalRequestedTo,
            approvalRequestedAt: mode === 'submitApproval' ? now : undefined,
            approvalReviewedById: undefined,
            approvalReviewedAt: undefined,
            createdAt: now,
            updatedAt: now,
            userId: state.currentUser?.id
        };

        dispatch({ type: 'ADD_INSTALLMENT_PLAN', payload: newPlan });
        showToast(mode === 'submitApproval' ? 'Approval request sent' : 'New version saved successfully');
        
        resetForm();
    };

    const addDiscount = () => {
        if (!newDiscountName.trim() || parseFloat(newDiscountAmount) <= 0) {
            showToast('Please enter discount name and amount');
            return;
        }
        setDiscounts(prev => [...prev, {
            id: `disc_${Date.now()}`,
            name: newDiscountName.trim(),
            amount: parseFloat(newDiscountAmount),
            categoryId: newDiscountCategoryId || undefined
        }]);
        setNewDiscountName('');
        setNewDiscountAmount('0');
        setNewDiscountCategoryId('');
    };

    const removeDiscount = (id: string) => {
        setDiscounts(prev => prev.filter(d => d.id !== id));
    };

    const addAmenity = () => {
        if (!selectedAmenityIdToAdd) return;
        if (selectedAmenityIds.includes(selectedAmenityIdToAdd)) {
            showToast('Amenity already added');
            return;
        }
        setSelectedAmenityIds(prev => [...prev, selectedAmenityIdToAdd]);
        setSelectedAmenityIdToAdd('');
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
        setDiscounts([]);
        setSelectedAmenityIds([]);
        setSelectedPlanId(null);
        setIntroText('');
        setStatus('Draft');
        setVersion(1);
        setRootId(undefined);
        setApprovalRequestedById(undefined);
        setApprovalRequestedToId('');
        setApprovalRequestedAt(undefined);
        setApprovalReviewedById(undefined);
        setApprovalReviewedAt(undefined);
        setNewDiscountName('');
        setNewDiscountAmount('0');
        setNewDiscountCategoryId('');
        setSelectedAmenityIdToAdd('');
        setShowApprovalModal(false);
        setApprovalModalApproverId('');
        setShowForm(false);
    };

    const handleEdit = (plan: InstallmentPlan) => {
        const isLatest = latestVersions[plan.rootId || plan.id] === plan.version;
        if (!isLatest) {
            showAlert('Only the latest version of a plan can be edited.');
            return;
        }
        
        setSelectedPlanId(plan.id);
        setLeadId(plan.leadId);
        setProjectId(plan.projectId);
        setUnitId(plan.unitId);
        setDurationYears(plan.durationYears.toString());
        setDownPaymentPercentage(plan.downPaymentPercentage.toString());
        setFrequency(plan.frequency);
        setListPrice(plan.listPrice.toString());
        setDiscounts(plan.discounts || []);
        setDescription(plan.description || '');
        setIntroText(plan.introText || '');
        setStatus(plan.status || 'Draft');
        setVersion(plan.version || 1);
        setRootId(plan.rootId || plan.id);
        setApprovalRequestedById(plan.approvalRequestedById);
        setApprovalRequestedToId(plan.approvalRequestedToId || '');
        setApprovalRequestedAt(plan.approvalRequestedAt);
        setApprovalReviewedById(plan.approvalReviewedById);
        setApprovalReviewedAt(plan.approvalReviewedAt);
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

    useEffect(() => {
        if (state.editingEntity?.type === 'INSTALLMENT_PLAN' && state.editingEntity.id) {
            const plan = (state.installmentPlans || []).find(p => p.id === state.editingEntity?.id);
            if (plan) {
                handleEdit(plan);
            }
            dispatch({ type: 'CLEAR_EDITING_ENTITY' });
        }
    }, [state.editingEntity, state.installmentPlans, dispatch]);

    const handleApprovalDecision = async (decision: 'Approved' | 'Rejected') => {
        if (!selectedPlanId) return;
        const plan = (state.installmentPlans || []).find(p => p.id === selectedPlanId);
        if (!plan) return;

        const confirmed = await showConfirm(`Are you sure you want to ${decision.toLowerCase()} this plan?`);
        if (!confirmed) return;

        const now = new Date().toISOString();
        const updatedPlan: InstallmentPlan = {
            ...plan,
            status: decision,
            approvalReviewedById: state.currentUser?.id || undefined,
            approvalReviewedAt: now,
            updatedAt: now
        };
        dispatch({ type: 'UPDATE_INSTALLMENT_PLAN', payload: updatedPlan });
        showToast(decision === 'Approved' ? 'Plan approved' : 'Plan rejected');
        resetForm();
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

    // Filtered Plans with search - showing only latest version of each plan
    const filteredPlans = useMemo(() => {
        const currentUserId = state.currentUser?.id;
        const allPlans = (state.installmentPlans || []).filter(plan => 
            // 1. You created the plan (Draft, Rejected, etc.)
            plan.userId === currentUserId || 
            // 2. You submitted it for approval (it's your request)
            plan.approvalRequestedById === currentUserId ||
            // 3. You are the specific user assigned to approve it
            plan.approvalRequestedToId === currentUserId
        );
        
        // Group plans by rootId and find the latest version for each
        const latestPlansMap = new Map<string, InstallmentPlan>();
        allPlans.forEach(plan => {
            const rId = plan.rootId || plan.id;
            const existing = latestPlansMap.get(rId);
            if (!existing || (plan.version || 1) > (existing.version || 1)) {
                latestPlansMap.set(rId, plan);
            }
        });

        const latestPlans = Array.from(latestPlansMap.values());

        if (!searchQuery.trim()) return latestPlans;

        const q = searchQuery.toLowerCase();
        return latestPlans.filter(plan => {
            const lead = state.contacts.find(l => l.id === plan.leadId);
            const project = state.projects.find(p => p.id === plan.projectId);
            const unit = state.units.find(u => u.id === plan.unitId);
            
            return (
                lead?.name.toLowerCase().includes(q) ||
                project?.name.toLowerCase().includes(q) ||
                unit?.name.toLowerCase().includes(q)
            );
        });
    }, [state.installmentPlans, state.contacts, state.projects, state.units, state.currentUser, searchQuery]);

    const approvalTasks = useMemo(() => {
        const currentUserId = state.currentUser?.id;
        return (state.installmentPlans || [])
            .filter(plan => 
                plan.approvalRequestedToId === currentUserId && 
                plan.status === 'Pending Approval'
            )
            .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    }, [state.installmentPlans, state.currentUser]);

    const activityFeed = useMemo(() => {
        const currentUserId = state.currentUser?.id;
        const feed = (state.installmentPlans || [])
            .filter(plan => 
                plan.userId === currentUserId || 
                plan.approvalRequestedToId === currentUserId ||
                plan.approvalRequestedById === currentUserId
            )
            .flatMap(plan => {
            const lead = state.contacts.find(l => l.id === plan.leadId);
            const project = state.projects.find(p => p.id === plan.projectId);
            const unit = state.units.find(u => u.id === plan.unitId);
            const label = `${lead?.name || 'Lead'} • ${project?.name || 'Project'} • ${unit?.name || 'Unit'}`;

            const creatorUser = usersForApproval.find(u => u.id === (plan.userId || plan.approvalRequestedById));
            const requestedBy = usersForApproval.find(u => u.id === plan.approvalRequestedById);
            const requestedTo = usersForApproval.find(u => u.id === plan.approvalRequestedToId);
            const reviewedBy = usersForApproval.find(u => u.id === plan.approvalReviewedById);

            const entries: { title: string; detail: string; time: string; planId: string }[] = [];

            if (plan.createdAt) {
                entries.push({
                    title: 'Plan created',
                    detail: `${label} • Created by ${creatorUser?.name || creatorUser?.username || 'User'}`,
                    time: plan.createdAt,
                    planId: plan.id
                });
            }

            if (plan.approvalRequestedAt) {
                entries.push({
                    title: 'Approval requested',
                    detail: `${label} • ${requestedBy?.name || requestedBy?.username || 'User'} → ${requestedTo?.name || requestedTo?.username || 'Approver'}`,
                    time: plan.approvalRequestedAt,
                    planId: plan.id
                });
            }

            if (plan.approvalReviewedAt && (plan.status === 'Approved' || plan.status === 'Rejected')) {
                entries.push({
                    title: `Plan ${plan.status.toLowerCase()}`,
                    detail: `${label} • Reviewed by ${reviewedBy?.name || reviewedBy?.username || 'Admin'}`,
                    time: plan.approvalReviewedAt,
                    planId: plan.id
                });
            }

            return entries;
        });

        return feed.sort((a, b) => b.time.localeCompare(a.time));
    }, [state.installmentPlans, state.contacts, state.projects, state.units, state.currentUser, usersForApproval]);

    const formatActivityTime = (time: string) => {
        if (!time) return '';
        const date = new Date(time);
        if (Number.isNaN(date.getTime())) return time;
        return date.toLocaleString();
    };

    const getStatusMeta = (planStatus: InstallmentPlan['status']) => {
        switch (planStatus) {
            case 'Pending Approval':
                return {
                    label: 'Pending Approval',
                    badge: 'bg-blue-100 text-blue-700',
                    border: 'border-blue-500 bg-blue-50/30'
                };
            case 'Approved':
                return {
                    label: 'Approved',
                    badge: 'bg-green-100 text-green-700',
                    border: 'border-green-500 bg-green-50/30'
                };
            case 'Rejected':
                return {
                    label: 'Rejected',
                    badge: 'bg-rose-100 text-rose-700',
                    border: 'border-rose-500 bg-rose-50/30'
                };
            case 'Locked':
                return {
                    label: 'Locked',
                    badge: 'bg-amber-100 text-amber-700',
                    border: 'border-amber-500 bg-amber-50/30'
                };
            case 'Draft':
            default:
                return {
                    label: 'Draft',
                    badge: 'bg-slate-100 text-slate-600',
                    border: 'border-indigo-500 bg-white'
                };
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
            <style>{STANDARD_PRINT_STYLES}</style>
            <div className="flex items-center justify-between p-4 bg-white border-b border-slate-200 no-print">
                <div className="flex items-center gap-4">
                    <h1 className="text-xl font-bold text-slate-800">Installment Plans (Marketing)</h1>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            <div className="w-4 h-4">{ICONS.search}</div>
                        </div>
                        <input 
                            type="text"
                            placeholder="Search by Unit, Project or Client..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="pl-10 pr-4 py-2 bg-slate-100 border-none rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-80 transition-all"
                        />
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <PrintButton
                        onPrint={handlePrint}
                        disabled={!showForm}
                        label="Print Plan"
                        className="print:hidden"
                    />
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
                        <div className="w-80 flex flex-col bg-white border-r border-slate-200 overflow-y-auto shrink-0 no-print">
                            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                                <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Project Info</h2>
                                <Button variant="ghost" onClick={() => setShowForm(false)} size="sm">
                                    <div className="w-4 h-4">{ICONS.x}</div>
                                </Button>
                            </div>
                            
                            <div className="p-4 space-y-6">
                                {/* Template Selection */}
                                <div className="space-y-3">
                                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Plan Template</h3>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button 
                                            onClick={() => setSelectedTemplate('formal')}
                                            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all border-2 ${selectedTemplate === 'formal' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                                        >
                                            Template 1 (Formal)
                                        </button>
                                        <button 
                                            onClick={() => setSelectedTemplate('modern')}
                                            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all border-2 ${selectedTemplate === 'modern' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                                        >
                                            Template 2 (Modern)
                                        </button>
                                    </div>
                                </div>

                                {/* Basic Selection */}
                                <div className="space-y-4">
                                    <ComboBox 
                                        label="Project Name" 
                                        items={state.projects} 
                                        selectedId={projectId} 
                                        onSelect={item => { setProjectId(item?.id || ''); setUnitId(''); }} 
                                        placeholder="Select Project"
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

                                {/* Pricing & Discount */}
                                <div className="space-y-4 pt-4 border-t border-slate-100">
                                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pricing</h3>
                                    <Input label="Base Price (PKR)" type="number" value={listPrice} onChange={e => setListPrice(e.target.value)} />
                                    
                                    <div className="flex justify-between items-center px-1">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase">Amenities Total</span>
                                        <span className="text-xs font-bold text-indigo-600">Rs. {amenitiesTotal.toLocaleString()}</span>
                                    </div>
                                </div>

                                {/* Amenities Selection */}
                                <div className="space-y-3 pt-4 border-t border-slate-100">
                                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Add Amenities</h3>
                                    
                                    <div className="space-y-2 p-2 rounded bg-slate-50 border border-slate-100">
                                        <select 
                                            value={selectedAmenityIdToAdd}
                                            onChange={e => setSelectedAmenityIdToAdd(e.target.value)}
                                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                                        >
                                            <option value="">Select Amenity...</option>
                                            {activeAmenities
                                                .filter(a => !selectedAmenityIds.includes(a.id))
                                                .map(amenity => (
                                                    <option key={amenity.id} value={amenity.id}>
                                                        {amenity.name} ({amenity.isPercentage ? `${amenity.price}%` : `Rs. ${amenity.price.toLocaleString()}`})
                                                    </option>
                                                ))
                                            }
                                        </select>
                                        <Button 
                                            variant="secondary" 
                                            size="sm" 
                                            className="w-full justify-center py-1.5 text-[10px]"
                                            onClick={addAmenity}
                                            disabled={!selectedAmenityIdToAdd}
                                        >
                                            Add Amenity
                                        </Button>
                                    </div>

                                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                                        {selectedAmenityIds.map(amenityId => {
                                            const amenity = activeAmenities.find(a => a.id === amenityId);
                                            if (!amenity) return null;
                                            return (
                                                <div 
                                                    key={amenity.id} 
                                                    className="flex items-center justify-between p-2 rounded bg-indigo-50 border border-indigo-200 shadow-sm animate-fade-in"
                                                >
                                                    <div className="flex-1">
                                                        <p className="text-[11px] font-medium text-slate-700">{amenity.name}</p>
                                                        <p className="text-[10px] font-bold text-indigo-600">
                                                            {amenity.isPercentage ? `${amenity.price}%` : `Rs. ${amenity.price.toLocaleString()}`}
                                                        </p>
                                                    </div>
                                                    <button 
                                                        onClick={() => setSelectedAmenityIds(prev => prev.filter(id => id !== amenityId))}
                                                        className="text-slate-400 hover:text-rose-600 p-1"
                                                    >
                                                        <div className="w-3.5 h-3.5">{ICONS.trash}</div>
                                                    </button>
                                                </div>
                                            );
                                        })}
                                        {selectedAmenityIds.length === 0 && (
                                            <p className="text-[10px] text-slate-400 italic text-center py-2">No amenities added</p>
                                        )}
                                    </div>
                                </div>

                                {/* Discount Selection */}
                                <div className="space-y-4 pt-4 border-t border-slate-100">
                                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Discounts</h3>
                                    
                                    <div className="space-y-2 p-2 rounded bg-slate-50 border border-slate-100">
                                        <Input 
                                            label="Discount Name" 
                                            value={newDiscountName}
                                            onChange={e => setNewDiscountName(e.target.value)}
                                            placeholder="e.g. Special Offer"
                                            className="text-xs"
                                        />
                                        <div className="flex gap-2">
                                            <div className="flex-1">
                                                <Input 
                                                    label="Amount (PKR)" 
                                                    type="number"
                                                    value={newDiscountAmount}
                                                    onChange={e => setNewDiscountAmount(e.target.value)}
                                                    className="text-xs"
                                                />
                                            </div>
                                            <div className="flex-1">
                                                <ComboBox
                                                    label="Category"
                                                    items={expenseCategories}
                                                    selectedId={newDiscountCategoryId}
                                                    onSelect={item => setNewDiscountCategoryId(item?.id || '')}
                                                    placeholder="Search or add category..."
                                                    entityType="category"
                                                    onAddNew={(entityType, name) => {
                                                        entityFormModal.openForm('category', name, undefined, TransactionType.EXPENSE, (newId) => {
                                                            setNewDiscountCategoryId(newId);
                                                        });
                                                    }}
                                                    compact
                                                />
                                            </div>
                                        </div>
                                        <Button 
                                            variant="secondary" 
                                            size="sm" 
                                            className="w-full justify-center py-1.5 text-[10px]"
                                            onClick={addDiscount}
                                            disabled={!newDiscountName.trim() || parseFloat(newDiscountAmount) <= 0}
                                        >
                                            Add Discount
                                        </Button>
                                    </div>

                                    <div className="space-y-2">
                                        {discounts.map(d => (
                                            <div key={d.id} className="flex items-center justify-between p-2 rounded bg-rose-50 border border-rose-100 animate-fade-in">
                                                <div className="flex-1">
                                                    <p className="text-[11px] font-bold text-slate-700">{d.name}</p>
                                                    <p className="text-[10px] font-bold text-rose-600">Rs. {d.amount.toLocaleString()}</p>
                                                </div>
                                                <button 
                                                    onClick={() => removeDiscount(d.id)}
                                                    className="text-slate-400 hover:text-rose-600 p-1"
                                                >
                                                    <div className="w-3.5 h-3.5">{ICONS.trash}</div>
                                                </button>
                                            </div>
                                        ))}
                                        {discounts.length === 0 && (
                                            <p className="text-[10px] text-slate-400 italic text-center py-2">No discounts added</p>
                                        )}
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

                                <div className="space-y-4 pt-4 border-t border-slate-100">
                                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Proposal Text</h3>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase">Intro Message</label>
                                        <textarea 
                                            value={introText}
                                            onChange={e => setIntroText(e.target.value)}
                                            className="w-full h-32 px-2 py-1.5 bg-white border border-slate-200 rounded text-xs focus:ring-1 focus:ring-indigo-500 outline-none resize-none"
                                            placeholder="Custom intro text... (Leave empty for default)"
                                        />
                                        <p className="text-[10px] text-slate-400 italic">This text appears after "Exclusively for You"</p>
                                    </div>
                                </div>

                                <div className="pt-6 flex flex-col gap-2">
                                    <Button 
                                        className="w-full justify-center py-3" 
                                        onClick={() => handleSave('draft')}
                                        disabled={isReadOnly}
                                    >
                                        {selectedPlanId ? 'Save New Version' : 'Save Plan'}
                                    </Button>

                                    {selectedPlanId && (
                                        <div className="pt-2 space-y-2">
                                            {/* Creator Actions: Submit */}
                                            {(normalizedStatus === 'draft' || isRejectedStatus) && (
                                                <Button 
                                                    variant="secondary" 
                                                    className="w-full justify-center py-3 border-green-200 text-green-700 hover:bg-green-50" 
                                                    onClick={() => {
                                                        setApprovalModalApproverId('');
                                                        setShowApprovalModal(true);
                                                    }}
                                                >
                                                    Submit for Approval
                                                </Button>
                                            )}

                                            {/* Approver Actions: Approve/Reject */}
                                            {isApproverForSelectedPlan && (
                                                <div className="grid grid-cols-2 gap-2">
                                                    <Button 
                                                        variant="primary" 
                                                        className="justify-center py-3 bg-green-600 hover:bg-green-700 text-white font-bold"
                                                        onClick={() => handleApprovalDecision('Approved')}
                                                    >
                                                        Approve
                                                    </Button>
                                                    <Button 
                                                        variant="ghost" 
                                                        className="justify-center py-3 text-rose-600 border border-rose-200 hover:bg-rose-50 font-bold"
                                                        onClick={() => handleApprovalDecision('Rejected')}
                                                    >
                                                        Reject
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {isPendingApproval && (
                                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                            <p className="text-[11px] text-blue-800 font-medium text-center">
                                                Awaiting approval from {approvalRequestedToName || 'approver'}
                                                {approvalRequestedByName ? `. Requested by ${approvalRequestedByName}.` : '.'}
                                            </p>
                                        </div>
                                    )}
                                    {isApprovedStatus && (
                                        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                                            <p className="text-[11px] text-green-800 font-medium text-center">
                                                Approved{approvalReviewedByName ? ` by ${approvalReviewedByName}` : ''}. You can convert this plan to a sales agreement.
                                            </p>
                                        </div>
                                    )}
                                    {isRejectedStatus && (
                                        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg">
                                            <p className="text-[11px] text-rose-800 font-medium text-center">
                                                Rejected{approvalReviewedByName ? ` by ${approvalReviewedByName}` : ''}. Please update and submit for approval again.
                                            </p>
                                        </div>
                                    )}
                                    {isLockedStatus && (
                                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                            <p className="text-[11px] text-amber-800 font-medium text-center">
                                                This version is LOCKED. Save a new version to make changes.
                                            </p>
                                        </div>
                                    )}
                                    {/* Temporary debug badges for approval visibility */}
                                    <div className="p-3 bg-slate-50 border border-dashed border-slate-300 rounded-lg">
                                        <p className="text-[10px] text-slate-600 font-bold uppercase mb-1">Debug Approval</p>
                                        <div className="text-[10px] text-slate-600 space-y-1">
                                            <div>Status: {String(effectiveStatus || '')}</div>
                                            <div>Normalized: {normalizedStatus}</div>
                                            <div>Approver Value: {String(effectiveApprovalRequestedToId || '')}</div>
                                            <div>Current User ID: {String(state.currentUser?.id || '')}</div>
                                            <div>Current Username: {String(state.currentUser?.username || '')}</div>
                                            <div>Current Name: {String(state.currentUser?.name || '')}</div>
                                            <div>isApproverForSelectedPlan: {String(isApproverForSelectedPlan)}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right Content - Installment Plan Preview */}
                        <div className="flex-1 overflow-y-auto p-8 bg-slate-100 print:p-0 print:bg-white">
                            <div className="printable-area max-w-4xl mx-auto bg-white shadow-2xl rounded-sm overflow-hidden min-h-full flex flex-col print:shadow-none print:p-0" id="printable-area">
                                <ReportHeader />
                                
                                {selectedTemplate === 'formal' ? (
                                    <div className="flex flex-col p-10 print:p-0 flex-1">
                                        {/* Header */}
                                        <div className="flex flex-col items-center mb-6">
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className="w-12 h-12 relative flex items-center justify-center">
                                                    <svg viewBox="0 0 100 100" className="w-full h-full text-slate-800">
                                                        <path d="M50 5 L95 25 L95 75 L50 95 L5 75 L5 25 Z" fill="none" stroke="currentColor" strokeWidth="4"/>
                                                        <path d="M50 20 L80 35 L80 65 L50 80 L20 65 L20 35 Z" fill="currentColor"/>
                                                        <path d="M35 45 L50 35 L65 45 L65 65 L50 75 L35 65 Z" fill="white"/>
                                                    </svg>
                                                </div>
                                                <div className="text-4xl font-black tracking-widest text-slate-800 uppercase">
                                                    {state.projects.find(p => p.id === projectId)?.name || 'EMPORIUM'}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Title Box */}
                                        <div className="border-[3px] border-slate-800 py-3 text-center mb-6">
                                            <h2 className="text-2xl font-black tracking-[0.3em] text-slate-800">INSTALLMENT PLAN</h2>
                                        </div>

                                        {/* PRIMARY DATA SECTION */}
                                        <div className="border border-slate-800 mb-6">
                                            <div className="bg-slate-100 border-b border-slate-800 px-4 py-1.5 font-bold text-sm flex justify-between items-center">
                                                <span className="tracking-widest">PRIMARY DATA</span>
                                                <div className="flex gap-8">
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-xs uppercase">{state.projects.find(p => p.id === projectId)?.name || 'Project Name'}</span>
                                                        <div className="w-14 h-6 border border-slate-800 bg-slate-200 flex items-center justify-center text-[10px] font-bold">YES</div>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div className="p-4 grid grid-cols-3 gap-y-4 gap-x-8 text-[11px] uppercase font-bold">
                                                <div className="flex items-end gap-2">
                                                    <span className="whitespace-nowrap">UNIT:</span>
                                                    <span className="border-b border-slate-400 flex-1 px-1 pb-0.5 italic text-slate-900 min-h-[1.5em]">
                                                        {state.units.find(u => u.id === unitId)?.name || ''}
                                                    </span>
                                                </div>
                                                <div className="flex items-end gap-2">
                                                    <span className="whitespace-nowrap">CATEGORY:</span>
                                                    <span className="border-b border-slate-400 flex-1 px-1 pb-0.5 italic text-slate-900 min-h-[1.5em]">
                                                        {state.units.find(u => u.id === unitId)?.type || ''}
                                                    </span>
                                                </div>
                                                <div className="flex items-end gap-2">
                                                    <span className="whitespace-nowrap">FLOOR:</span>
                                                    <span className="border-b border-slate-400 flex-1 px-1 pb-0.5 italic text-slate-900 min-h-[1.5em]">
                                                        {state.units.find(u => u.id === unitId)?.floor || ''}
                                                    </span>
                                                </div>
                                                
                                                <div className="flex items-end gap-2">
                                                    <span className="whitespace-nowrap">SIZE:</span>
                                                    <div className="border-b border-slate-400 flex-1 flex justify-between px-1 pb-0.5 italic text-slate-900 min-h-[1.5em]">
                                                        <span>{state.units.find(u => u.id === unitId)?.area?.toFixed(2) || ''}</span>
                                                        <span className="text-[9px] font-normal not-italic">SFT</span>
                                                    </div>
                                                </div>
                                                <div className="flex items-end gap-2">
                                                    <span className="whitespace-nowrap">RATE:</span>
                                                    <span className="border-b border-slate-400 flex-1 px-1 pb-0.5 italic text-slate-900 min-h-[1.5em]">
                                                        {(() => {
                                                            const unit = state.units.find(u => u.id === unitId);
                                                            if (unit?.salePrice && unit?.area) {
                                                                return (unit.salePrice / unit.area).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                                            }
                                                            return '';
                                                        })()}
                                                    </span>
                                                </div>
                                                <div className="flex items-end gap-2">
                                                    {selectedAmenityIds[0] && (
                                                        <>
                                                            <span className="whitespace-nowrap uppercase">{activeAmenities.find(a => a.id === selectedAmenityIds[0])?.name || 'AMENITY 1'}:</span>
                                                            <span className="border-b border-slate-400 flex-1 px-1 pb-0.5 italic text-slate-900 text-center min-h-[1.5em]">YES</span>
                                                        </>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-2 col-span-2">
                                                    <span className="whitespace-nowrap">PRICE OF UNIT:</span>
                                                    <div className="bg-slate-200 px-4 py-1.5 flex-1 font-black italic border border-slate-800 text-base text-center">
                                                        {calculations.netValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </div>
                                                </div>
                                                <div className="flex items-end gap-2">
                                                    {selectedAmenityIds[1] && (
                                                        <>
                                                            <span className="whitespace-nowrap text-[9px] leading-tight uppercase">{activeAmenities.find(a => a.id === selectedAmenityIds[1])?.name || 'AMENITY 2'}:</span>
                                                            <span className="border-b border-slate-400 flex-1 px-1 pb-0.5 italic text-slate-900 text-center min-h-[1.5em]">YES</span>
                                                        </>
                                                    )}
                                                </div>

                                                <div className="flex items-end gap-2 col-span-3 justify-end pt-2">
                                                    <span className="whitespace-nowrap">DATE:</span>
                                                    <span className="border-b border-slate-400 w-48 px-1 pb-0.5 italic text-slate-900 text-center font-black">
                                                        {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* PRICING SECTION */}
                                        <div className="flex items-center gap-12 px-6 mb-8 font-black uppercase text-xs tracking-wider">
                                            <div className="w-32">PRICING</div>
                                            <div className="flex items-center gap-4">
                                                <span>Fresh Sale:</span>
                                                <div className="w-14 h-8 border border-slate-800 bg-slate-200 flex items-center justify-center text-[10px]">YES</div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <span>Resale</span>
                                                <div className="w-14 h-8 border border-slate-800"></div>
                                            </div>
                                        </div>

                                        {/* PAYMENT INFO SECTION */}
                                        <div className="grid grid-cols-2 gap-x-16 gap-y-6 px-4 mb-8 uppercase text-[11px] font-black">
                                            <div className="flex items-center gap-4">
                                                <span className="w-40">DOWN PAYMENT %</span>
                                                <span className="border-b border-slate-400 flex-1 text-center italic pb-0.5">{downPaymentPercentage}.00%</span>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <span className="w-40">DOWN PAYMENT:</span>
                                                <div className="bg-slate-200 px-4 py-2 flex-1 italic border border-slate-800 text-center">
                                                    {calculations.dpAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <span className="w-40">NO OF INSTALLEMENTS:</span>
                                                <span className="border-b border-slate-400 flex-1 text-center italic pb-0.5">{calculations.totalInstallments}.00</span>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <span className="w-40">INSTALLEMENT:</span>
                                                <span className="border-b border-slate-400 flex-1 text-center italic pb-0.5">
                                                    {calculations.installmentAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                            </div>
                                        </div>

                                        {/* INSTALLMENTS DETAIL TABLE */}
                                        <div className="flex-1 flex flex-col mb-10">
                                            <div className="bg-slate-100 border border-slate-800 text-center py-1.5 font-black text-xs tracking-[0.2em] uppercase">
                                                INSTALLMENTS DETAIL
                                            </div>
                                            <table className="w-full border-collapse border border-slate-800 text-[11px] uppercase">
                                                <thead>
                                                    <tr className="bg-slate-200">
                                                        <th className="border border-slate-800 px-3 py-2 w-16 text-center">NO</th>
                                                        <th className="border border-slate-800 px-3 py-2 w-32 text-center">DATE</th>
                                                        <th className="border border-slate-800 px-3 py-2 text-center">DETAIL</th>
                                                        <th className="border border-slate-800 px-3 py-2 w-40 text-center">AMOUNT</th>
                                                        <th className="border border-slate-800 px-3 py-2 w-48 text-center">REMARKS</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="font-bold">
                                                    {schedule.filter(item => item.index !== 'Initial').map((item, idx) => (
                                                        <tr key={idx}>
                                                            <td className="border border-slate-800 px-3 py-1.5 text-center">{item.index.padStart(2, '0')}</td>
                                                            <td className="border border-slate-800 px-3 py-1.5 text-center italic text-slate-700">
                                                                {item.dueDate}
                                                            </td>
                                                            <td className="border border-slate-800 px-3 py-1.5">INSTALLEMENT # {item.index}</td>
                                                            <td className="border border-slate-800 px-3 py-1.5 text-center">{item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                            <td className="border border-slate-800 px-3 py-1.5"></td>
                                                        </tr>
                                                    ))}
                                                    {/* Fill empty rows to maintain layout if needed */}
                                                    {schedule.length < 12 && Array.from({ length: 12 - schedule.length }).map((_, i) => (
                                                        <tr key={`empty-${i}`}>
                                                            <td className="border border-slate-800 px-3 py-4 text-center"></td>
                                                            <td className="border border-slate-800 px-3 py-4 text-center"></td>
                                                            <td className="border border-slate-800 px-3 py-4"></td>
                                                            <td className="border border-slate-800 px-3 py-4 text-center"></td>
                                                            <td className="border border-slate-800 px-3 py-4"></td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot>
                                                    <tr className="bg-slate-50 font-black">
                                                        <td colSpan={3} className="border border-slate-800 px-4 py-2 text-right tracking-widest">TOTAL</td>
                                                        <td className="border border-slate-800 px-3 py-2 text-center">
                                                            {(calculations.netValue - calculations.dpAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </td>
                                                        <td className="border border-slate-800 px-3 py-2"></td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>

                                        {/* Footer */}
                                        <div className="mt-auto">
                                            <div className="flex justify-between items-end gap-20">
                                                <div className="flex-1">
                                                    <div className="border-t-2 border-slate-800 w-full mb-3"></div>
                                                    <div className="text-center text-[10px] font-bold uppercase tracking-widest">Availability Checked by</div>
                                                    <div className="flex justify-between items-center mt-6 text-[10px] font-bold uppercase">
                                                        <span>Date & Time:</span>
                                                        <span className="italic">{new Date().toLocaleDateString('en-GB')} {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                                                    </div>
                                                </div>
                                                <div className="flex-1">
                                                    <div className="border-t-2 border-slate-800 w-full mb-3"></div>
                                                    <div className="text-center text-[10px] font-black uppercase tracking-[0.2em]">AUTHORISED SIGN:</div>
                                                </div>
                                            </div>
                                            
                                            <div className="mt-10 text-[9px] font-medium text-slate-500 leading-relaxed">
                                                <p>* 5% Additional charges for Margalla Face</p>
                                                <p>** 10% Additional charges for corner unit</p>
                                            </div>
                                        </div>

                                        {/* Intro Text */}
                                        {introText && (
                                            <div className="mt-10 pt-10 border-t border-dashed border-slate-300 print:break-before-page">
                                                <h3 className="text-sm font-bold text-slate-800 mb-2 uppercase tracking-wider">Additional Notes</h3>
                                                <div className="text-xs text-slate-600 italic leading-relaxed whitespace-pre-wrap">
                                                    {introText}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex flex-col flex-1">
                                        {/* Proposal Header (Modern) */}
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
                                                <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-[10px] font-black text-indigo-700 uppercase tracking-widest border-b border-indigo-50 pb-2">
                                                    <span className="flex items-center gap-1.5">
                                                        <span className="text-slate-400">Unit:</span> {units.find(u => u.id === unitId)?.name || 'N/A'}
                                                    </span>
                                                    <span className="flex items-center gap-1.5">
                                                        <span className="text-slate-400">Type:</span> {units.find(u => u.id === unitId)?.type || 'N/A'}
                                                    </span>
                                                    <span className="flex items-center gap-1.5">
                                                        <span className="text-slate-400">Floor:</span> {units.find(u => u.id === unitId)?.floor || 'N/A'}
                                                    </span>
                                                    <span className="flex items-center gap-1.5">
                                                        <span className="text-slate-400">Area:</span> {units.find(u => u.id === unitId)?.area || '0'} SFT
                                                    </span>
                                                </div>
                                                <div className="text-slate-600 italic leading-relaxed whitespace-pre-wrap">
                                                    {introText ? introText : (
                                                        `Dear ${leads.find(l => l.id === leadId)?.name || 'Mr. Doe'}, Unit #${units.find(u => u.id === unitId)?.name || 'A-1204'} at ${state.projects.find(p => p.id === projectId)?.name || 'Project Name'} has been meticulously selected for you as a private sanctuary that epitomizes contemporary elegance and absolute exclusivity. This ${units.find(u => u.id === unitId)?.type || 'Unit'} residence offers more than just a sophisticated lifestyle; it serves as a high-performing asset with exceptional capital appreciation potential in an increasingly sought-after corridor. Securing this premier unit is a strategic move to anchor your portfolio with a legacy property that truly reflects your standard of distinction.`
                                                    )}
                                                </div>
                                            </div>

                                            {/* Summary Stats Grid */}
                                            <div className="grid grid-cols-3 gap-4">
                                                <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Total Net Price</p>
                                                    <p className="text-sm font-bold text-indigo-700">Rs. {calculations.netValue.toLocaleString()}</p>
                                                    <p className="text-[10px] text-slate-500">Incl. Rs. {totalDiscountAmount.toLocaleString()} Discount</p>
                                                </div>
                                                <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Down Payment</p>
                                                    <p className="text-sm font-bold text-indigo-700">Rs. {calculations.dpAmount.toLocaleString()}</p>
                                                    <p className="text-[10px] text-slate-500">{downPaymentPercentage}% required</p>
                                                </div>
                                                <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Installment</p>
                                                    <p className="text-sm font-bold text-indigo-700">Rs. {calculations.installmentAmount.toLocaleString()}</p>
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
                                                        <span className="font-bold text-slate-900">Rs. {parseFloat(listPrice).toLocaleString()}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="text-slate-600">Premium Amenities & Facilities</span>
                                                        <span className="font-bold text-slate-900">Rs. {amenitiesTotal.toLocaleString()}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-sm pt-2 border-t border-slate-100">
                                                        <span className="font-bold text-slate-800">Total Gross Price</span>
                                                        <span className="font-extrabold text-slate-900">Rs. {(parseFloat(listPrice) + amenitiesTotal).toLocaleString()}</span>
                                                    </div>
                                                    {discounts.map(d => (
                                                        <div key={d.id} className="flex justify-between items-center text-sm">
                                                            <span className="text-rose-600 italic">{d.name}</span>
                                                            <span className="font-bold text-rose-600">-Rs. {d.amount.toLocaleString()}</span>
                                                        </div>
                                                    ))}
                                                    <div className="flex justify-between items-center py-4 px-4 bg-indigo-50/50 rounded-lg mt-4">
                                                        <span className="font-extrabold text-slate-800 uppercase tracking-wider">Net Payable Price</span>
                                                        <span className="text-2xl font-black text-indigo-700">Rs. {calculations.netValue.toLocaleString()}</span>
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
                                                                        Rs. {item.amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                                                    </td>
                                                                    <td className="px-6 py-4 text-right font-bold text-slate-800">
                                                                        Rs. {item.balance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                <ReportFooter />
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="max-w-6xl mx-auto no-print">
                        <div className="flex flex-col lg:flex-row gap-4">
                            <div className="flex-1 space-y-4">
                                {state.currentUser?.role === 'Admin' && approvalTasks.length > 0 && (
                                    <Card className="p-4 bg-white border border-slate-200">
                                        <div className="flex items-center justify-between mb-3">
                                            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Approval Tasks</h2>
                                            <span className="text-xs text-slate-500">{approvalTasks.length} total</span>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-xs">
                                                <thead>
                                                    <tr className="text-slate-500 border-b border-slate-200">
                                                        <th className="text-left py-2 font-semibold">Plan</th>
                                                        <th className="text-left py-2 font-semibold">Requested By</th>
                                                        <th className="text-left py-2 font-semibold">Assigned To</th>
                                                        <th className="text-left py-2 font-semibold">Status</th>
                                                        <th className="text-right py-2 font-semibold">Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {approvalTasks.map(plan => {
                                                        const lead = state.contacts.find(l => l.id === plan.leadId);
                                                        const project = state.projects.find(p => p.id === plan.projectId);
                                                        const unit = state.units.find(u => u.id === plan.unitId);
                                                        const statusMeta = getStatusMeta(plan.status);
                                                        return (
                                                            <tr key={plan.id} className="border-b border-slate-100">
                                                                <td className="py-2">
                                                                    <div className="font-medium text-slate-800">{lead?.name || 'Unknown Lead'}</div>
                                                                    <div className="text-[10px] text-slate-500">{project?.name} - {unit?.name}</div>
                                                                </td>
                                                                <td className="py-2 text-slate-700">
                                                                    {usersForApproval.find(u => u.id === plan.approvalRequestedById)?.name ||
                                                                        usersForApproval.find(u => u.id === plan.approvalRequestedById)?.username ||
                                                                        'N/A'}
                                                                </td>
                                                                <td className="py-2 text-slate-700">
                                                                    {usersForApproval.find(u => u.id === plan.approvalRequestedToId)?.name ||
                                                                        usersForApproval.find(u => u.id === plan.approvalRequestedToId)?.username ||
                                                                        'N/A'}
                                                                </td>
                                                                <td className="py-2">
                                                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${statusMeta.badge}`}>
                                                                        {statusMeta.label}
                                                                    </span>
                                                                </td>
                                                                <td className="py-2 text-right">
                                                                    <Button
                                                                        variant="secondary"
                                                                        size="sm"
                                                                        className="py-1 px-2 text-[10px]"
                                                                        onClick={() => handleEdit(plan)}
                                                                    >
                                                                        View
                                                                    </Button>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </Card>
                                )}
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {filteredPlans.map(plan => {
                                        const lead = state.contacts.find(l => l.id === plan.leadId);
                                        const project = state.projects.find(p => p.id === plan.projectId);
                                        const unit = state.units.find(u => u.id === plan.unitId);
                                        const statusMeta = getStatusMeta(plan.status);
                                        const isConvertible = plan.status === 'Approved' || plan.status === 'Locked';
                                        
                                        return (
                                            <Card 
                                                key={plan.id} 
                                                className={`p-4 hover:shadow-lg transition-all cursor-pointer border-l-4 ${statusMeta.border}`}
                                                onClick={() => handleEdit(plan)}
                                            >
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <h3 className="font-bold text-slate-900">{lead?.name || 'Unknown Lead'}</h3>
                                                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase ${statusMeta.badge}`}>
                                                                {statusMeta.label} v{plan.version}
                                                            </span>
                                                        </div>
                                                        {plan.status === 'Pending Approval' && plan.approvalRequestedToId === state.currentUser?.id && (
                                                            <div className="mb-2 px-2 py-1 bg-amber-50 border border-amber-200 rounded text-[10px] text-amber-700 font-bold animate-pulse">
                                                                ACTION REQUIRED: WAITING FOR YOUR APPROVAL
                                                            </div>
                                                        )}
                                                        <p className="text-xs text-slate-500">{project?.name} - {unit?.name}</p>
                                                        <p className="text-[10px] text-slate-500 mt-1 italic">
                                                            Created by: {(() => {
                                                                const uid = plan.userId || plan.approvalRequestedById;
                                                                if (!uid) return 'System';
                                                                if (uid === state.currentUser?.id) return state.currentUser.name || state.currentUser.username || 'You';
                                                                const user = usersForApproval.find(u => u.id === uid);
                                                                return user?.name || user?.username || uid;
                                                            })()}
                                                        </p>
                                                        {plan.status === 'Pending Approval' && plan.approvalRequestedToId && (
                                                            <p className="text-[10px] text-blue-600">
                                                                Awaiting: {usersForApproval.find(u => u.id === plan.approvalRequestedToId)?.name ||
                                                                    usersForApproval.find(u => u.id === plan.approvalRequestedToId)?.username ||
                                                                    'Approver'}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setHistoryRootId(plan.rootId || plan.id);
                                                                setShowHistoryDrawer(true);
                                                            }}
                                                            className="text-slate-400 hover:text-indigo-600 p-1 transition-colors"
                                                            title="View Plan History"
                                                        >
                                                            <div className="w-4 h-4">{ICONS.repeat}</div>
                                                        </button>
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); handleDelete(plan.id); }}
                                                            className="text-slate-400 hover:text-rose-500 p-1"
                                                        >
                                                            <div className="w-4 h-4">{ICONS.trash}</div>
                                                        </button>
                                                    </div>
                                                </div>
                                                
                                                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                                                    <div className="bg-slate-50 p-2 rounded">
                                                        <p className="text-[10px] text-slate-500 uppercase font-bold">Net Value</p>
                                                        <p className="font-bold text-indigo-700">Rs. {plan.netValue?.toLocaleString()}</p>
                                                    </div>
                                                    <div className="bg-slate-50 p-2 rounded">
                                                        <p className="text-[10px] text-slate-500 uppercase font-bold">Monthly</p>
                                                        <p className="font-bold text-slate-800">Rs. {plan.installmentAmount?.toLocaleString()}</p>
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
                                                
                                                <div className="mt-4 flex justify-between items-center">
                                                    <div className="text-xs text-slate-500">
                                                        <span>{plan.durationYears} Years | {plan.frequency}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {isConvertible && (
                                                            <Button 
                                                                variant="primary" 
                                                                size="sm" 
                                                                className="py-1 px-2 text-[10px] bg-indigo-600 hover:bg-indigo-700"
                                                                onClick={(e) => { e.stopPropagation(); showToast('Agreement conversion logic will be developed later'); }}
                                                            >
                                                                Convert to Agreement
                                                            </Button>
                                                        )}
                                                        <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium text-[10px]">View Detail</span>
                                                    </div>
                                                </div>
                                            </Card>
                                        );
                                    })}
                                </div>
                                
                                {filteredPlans.length === 0 && (
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
                            <div className="w-full lg:w-80 shrink-0">
                                <Card className="p-4 bg-white border border-slate-200">
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Activity</h3>
                                    {activityFeed.length === 0 ? (
                                        <p className="text-xs text-slate-400">No activity yet.</p>
                                    ) : (
                                        <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                                            {activityFeed.map((item, idx) => (
                                                <button
                                                    key={`${item.planId}-${item.title}-${idx}`}
                                                    onClick={() => {
                                                        const plan = (state.installmentPlans || []).find(p => p.id === item.planId);
                                                        if (plan) {
                                                            handleEdit(plan);
                                                        }
                                                    }}
                                                    className="w-full text-left border-b border-slate-100 pb-2 last:border-b-0 last:pb-0 hover:bg-slate-50 rounded-md px-2 py-1"
                                                >
                                                    <p className="text-xs font-semibold text-slate-700">{item.title}</p>
                                                    <p className="text-[10px] text-slate-500">{item.detail}</p>
                                                    <p className="text-[10px] text-slate-400 mt-1">{formatActivityTime(item.time)}</p>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </Card>
                            </div>
                        </div>
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
            <ApprovalRequestModal
                isOpen={showApprovalModal}
                onClose={() => setShowApprovalModal(false)}
                approvers={approvers}
                selectedApproverId={approvalModalApproverId}
                onSelectApprover={setApprovalModalApproverId}
                onSubmit={() => {
                    if (!approvalModalApproverId) {
                        showToast('Please select an approver');
                        return;
                    }
                    handleSave('submitApproval', approvalModalApproverId);
                    setShowApprovalModal(false);
                }}
            />
            <EntityFormModal
                isOpen={entityFormModal.isFormOpen}
                formType={entityFormModal.formType}
                initialName={entityFormModal.initialName}
                contactType={entityFormModal.contactType}
                categoryType={entityFormModal.categoryType}
                onClose={entityFormModal.closeForm}
                onSubmit={entityFormModal.handleSubmit}
            />

            {/* Plan History Drawer */}
            {showHistoryDrawer && (
                <div className="fixed inset-0 z-[60] flex justify-end">
                    <div 
                        className="absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity"
                        onClick={() => setShowHistoryDrawer(false)}
                    />
                    <div className="relative w-full max-w-md bg-white shadow-2xl flex flex-col h-full animate-in slide-in-from-right duration-300">
                        <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                                    <div className="w-5 h-5">{ICONS.history}</div>
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-slate-800">Plan History</h2>
                                    <p className="text-xs text-slate-500">View previous versions and status changes</p>
                                </div>
                            </div>
                            <button 
                                onClick={() => setShowHistoryDrawer(false)}
                                className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-slate-600 transition-colors uppercase tracking-widest"
                            >
                                CLOSE
                                <div className="w-4 h-4">{ICONS.x}</div>
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-6 space-y-8 relative">
                            {/* Vertical Timeline Line */}
                            <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-slate-100 -z-10" />

                            {(() => {
                                const history = (state.installmentPlans || [])
                                    .filter(p => (p.rootId || p.id) === historyRootId)
                                    .sort((a, b) => (b.version || 1) - (a.version || 1));

                                if (history.length === 0) {
                                    return (
                                        <div className="text-center py-10">
                                            <p className="text-slate-500">No history found for this plan.</p>
                                        </div>
                                    );
                                }

                                return history.map((planVersion, idx) => {
                                    const statusMeta = getStatusMeta(planVersion.status);
                                    const isApproved = planVersion.status === 'Approved';
                                    const isGenesis = idx === history.length - 1;
                                    
                                    const user = usersForApproval.find(u => u.id === (isApproved ? planVersion.approvalReviewedById : planVersion.approvalRequestedById));
                                    const userName = user?.name || user?.username || (isGenesis ? 'SYSTEM ADMIN' : 'USER');

                                    return (
                                        <div 
                                            key={planVersion.id}
                                            className="relative pl-10"
                                        >
                                            {/* Timeline Node */}
                                            <div className={`absolute left-[-5px] top-1 w-6 h-6 rounded-full flex items-center justify-center ring-4 ring-white shadow-sm z-10 ${
                                                isApproved ? 'bg-indigo-600 text-white' : 'bg-white text-slate-400 border border-slate-200'
                                            }`}>
                                                <div className="w-3.5 h-3.5">
                                                    {isApproved ? ICONS.checkCircle : (isGenesis ? ICONS.send : ICONS.history)}
                                                </div>
                                            </div>

                                            <div 
                                                onClick={() => {
                                                    handleEdit(planVersion);
                                                    setShowHistoryDrawer(false);
                                                }}
                                                className="group bg-white border border-slate-100 rounded-xl p-4 hover:border-indigo-200 hover:shadow-lg transition-all cursor-pointer"
                                            >
                                                <div className="flex justify-between items-start mb-1">
                                                    <div>
                                                        <h3 className={`text-[10px] font-extrabold uppercase tracking-widest ${isApproved ? 'text-indigo-600' : 'text-slate-500'}`}>
                                                            {isGenesis ? 'GENESIS PLAN' : (isApproved ? 'APPROVED PLAN' : `${planVersion.status.toUpperCase()} PLAN`)}
                                                        </h3>
                                                        <div className="text-[10px] text-slate-400 mt-1">
                                                            {new Date(planVersion.updatedAt || planVersion.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                        </div>
                                                    </div>
                                                    <div className="text-[10px] font-bold text-slate-400">
                                                        {new Date(planVersion.updatedAt || planVersion.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </div>
                                                
                                                <div className="mt-3 bg-slate-50/50 rounded-lg p-3 border border-slate-100">
                                                    <p className="text-xs text-slate-600 leading-relaxed italic">
                                                        {planVersion.description || (isGenesis ? 'Initial project plan scaffolded.' : `Plan moved to ${planVersion.status.toLowerCase()} status.`)}
                                                    </p>
                                                    
                                                    <div className="mt-3 flex items-center gap-2 bg-white rounded-md p-2 border border-slate-100/50 shadow-sm">
                                                        <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500 uppercase">
                                                            {userName.charAt(0)}
                                                        </div>
                                                        <span className="text-[10px] font-bold text-slate-600 uppercase tracking-tight">
                                                            {userName}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="mt-4 flex items-center justify-between text-[9px] font-bold uppercase tracking-widest text-slate-400">
                                                    <span>VERSION v{planVersion.version}</span>
                                                    <span className="text-indigo-500 group-hover:translate-x-1 transition-transform flex items-center gap-1">
                                                        RESTORE VERSION <div className="w-3 h-3">{ICONS.chevronRight}</div>
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                        
                        <div className="p-4 border-t border-slate-100 bg-slate-50">
                            <div className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 border-slate-200 bg-white shadow-sm">
                                <div className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
                                <span className="text-xs font-bold text-slate-700 uppercase tracking-widest">Latest Version Active</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MarketingPage;
