
import React, { useState, useEffect } from 'react';
import { MultiStoreProvider, useMultiStore } from '../../context/MultiStoreContext';
import OrganizationDashboard from './multistore/OrganizationDashboard';
import BranchDirectory from './multistore/BranchDirectory';
import TerminalManager from './multistore/TerminalManager';
import { ICONS } from '../../constants';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';

const MultiStoreContent: React.FC = () => {
    const { addStore, policies, savePolicies } = useMultiStore();
    const [activeTab, setActiveTab] = useState<'org' | 'branches' | 'terminals'>('org');
    const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
    const [isPoliciesModalOpen, setIsPoliciesModalOpen] = useState(false);
    const [policyForm, setPolicyForm] = useState(policies);

    // Sync form with context when modal opens
    useEffect(() => {
        if (isPoliciesModalOpen) {
            setPolicyForm(policies);
        }
    }, [isPoliciesModalOpen, policies]);

    const handleSavePolicies = async () => {
        try {
            await savePolicies(policyForm);
            setIsPoliciesModalOpen(false);
        } catch (e) {
            alert('Failed to save policies');
        }
    };
    const [newStoreData, setNewStoreData] = useState({
        name: '',
        code: '',
        type: 'Express' as any,
        location: '',
        region: '',
        manager: '',
        contact: '',
        timezone: 'GMT+5',
        openTime: '09:00',
        closeTime: '21:00'
    });

    const handleRegisterStore = async () => {
        try {
            await addStore({
                name: newStoreData.name,
                code: newStoreData.code || `BR-${Date.now().toString().slice(-4)}`,
                type: newStoreData.type,
                location: newStoreData.location,
                region: newStoreData.region,
                manager: newStoreData.manager,
                contact: newStoreData.contact,
                timezone: newStoreData.timezone,
                openTime: newStoreData.openTime,
                closeTime: newStoreData.closeTime
            });
            setIsRegisterModalOpen(false);
            setNewStoreData({
                name: '',
                code: '',
                type: 'Express',
                location: '',
                region: '',
                manager: '',
                contact: '',
                timezone: 'GMT+5',
                openTime: '09:00',
                closeTime: '21:00'
            });
        } catch (e) {
            alert('Failed to register store');
        }
    };

    const tabs = [
        { id: 'org', label: 'Organization Hub', icon: ICONS.grid },
        { id: 'branches', label: 'Branch Directory', icon: ICONS.building },
        { id: 'terminals', label: 'Terminal Control', icon: ICONS.history },
    ];

    return (
        <div className="flex flex-col h-full bg-slate-50 -m-4 md:-m-8">
            {/* Header / Tab Navigation */}
            <div className="bg-white border-b border-slate-200 px-8 pt-6 shadow-sm z-10 transition-all">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-2xl font-black text-slate-800 tracking-tight">Organization & Scale</h1>
                        <p className="text-slate-500 text-sm font-medium italic">Multi-branch orchestration and centralized policy engine.</p>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => setIsRegisterModalOpen(true)}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center gap-2"
                        >
                            {ICONS.plus} Register Store
                        </button>
                        <button
                            onClick={() => setIsPoliciesModalOpen(true)}
                            className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all items-center gap-2 hidden md:flex"
                        >
                            {ICONS.settings} Global Policies
                        </button>
                    </div>
                </div>

                <div className="flex gap-8">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`pb-4 text-sm font-bold transition-all relative flex items-center gap-2 ${activeTab === tab.id
                                ? 'text-indigo-600'
                                : 'text-slate-400 hover:text-slate-600'
                                }`}
                        >
                            {React.cloneElement(tab.icon as React.ReactElement<any>, { width: 18, height: 18 })}
                            {tab.label}
                            {activeTab === tab.id && (
                                <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600 rounded-t-full animate-in fade-in slide-in-from-bottom-1"></div>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-8">
                {activeTab === 'org' && <OrganizationDashboard />}
                {activeTab === 'branches' && <BranchDirectory />}
                {activeTab === 'terminals' && <TerminalManager />}
            </div>

            <Modal
                isOpen={isRegisterModalOpen}
                onClose={() => setIsRegisterModalOpen(false)}
                title="Register New Branch"
                size="lg"
            >
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="Branch Name"
                            placeholder="e.g. Downtown Mall"
                            value={newStoreData.name}
                            onChange={(e) => setNewStoreData({ ...newStoreData, name: e.target.value })}
                        />
                        <Input
                            label="Branch Code"
                            placeholder="Auto-generated if empty"
                            value={newStoreData.code}
                            onChange={(e) => setNewStoreData({ ...newStoreData, code: e.target.value })}
                        />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <Select
                            label="Store Type"
                            value={newStoreData.type}
                            onChange={(e) => setNewStoreData({ ...newStoreData, type: e.target.value as any })}
                        >
                            <option value="Flagship">Flagship</option>
                            <option value="Express">Express</option>
                            <option value="Warehouse">Warehouse</option>
                            <option value="Virtual">Virtual</option>
                            <option value="Franchise">Franchise</option>
                        </Select>
                        <Input
                            label="Region"
                            placeholder="e.g. North"
                            value={newStoreData.region}
                            onChange={(e) => setNewStoreData({ ...newStoreData, region: e.target.value })}
                        />
                        <Input
                            label="Location"
                            placeholder="Address/Area"
                            value={newStoreData.location}
                            onChange={(e) => setNewStoreData({ ...newStoreData, location: e.target.value })}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="Manager Name"
                            placeholder="Branch Manager"
                            value={newStoreData.manager}
                            onChange={(e) => setNewStoreData({ ...newStoreData, manager: e.target.value })}
                        />
                        <Input
                            label="Contact"
                            placeholder="Phone/Email"
                            value={newStoreData.contact}
                            onChange={(e) => setNewStoreData({ ...newStoreData, contact: e.target.value })}
                        />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <Select
                            label="Timezone"
                            value={newStoreData.timezone}
                            onChange={(e) => setNewStoreData({ ...newStoreData, timezone: e.target.value })}
                        >
                            <option value="GMT+5">GMT+5 (PKT)</option>
                            <option value="GMT">GMT</option>
                            <option value="GMT+4">GMT+4 (Gulf)</option>
                        </Select>
                        <Input
                            label="Open Time"
                            type="time"
                            value={newStoreData.openTime}
                            onChange={(e) => setNewStoreData({ ...newStoreData, openTime: e.target.value })}
                        />
                        <Input
                            label="Close Time"
                            type="time"
                            value={newStoreData.closeTime}
                            onChange={(e) => setNewStoreData({ ...newStoreData, closeTime: e.target.value })}
                        />
                    </div>

                    <div className="flex justify-end gap-3 mt-6">
                        <Button variant="secondary" onClick={() => setIsRegisterModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleRegisterStore} disabled={!newStoreData.name}>Register Branch</Button>
                    </div>
                </div>
            </Modal>

            {/* Global Policies Modal */}
            <Modal
                isOpen={isPoliciesModalOpen}
                onClose={() => setIsPoliciesModalOpen(false)}
                title="Global Organization Policies"
            >
                <div className="space-y-6">
                    <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl flex gap-3 text-amber-800">
                        <div className="mt-1">{ICONS.alertTriangle}</div>
                        <p className="text-xs font-medium leading-relaxed">
                            Changes here affect all branches and terminals immediately. These are top-level controls for your organization's POS operations.
                        </p>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl">
                            <div>
                                <h4 className="text-sm font-bold text-slate-700">Allow Negative Stock</h4>
                                <p className="text-[10px] text-slate-400">Permit sales even if system inventory is zero.</p>
                            </div>
                            <input
                                type="checkbox"
                                checked={policyForm.allowNegativeStock}
                                onChange={(e) => setPolicyForm({ ...policyForm, allowNegativeStock: e.target.checked })}
                                className="w-5 h-5 text-indigo-600 rounded"
                            />
                        </div>

                        <div className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl">
                            <div>
                                <h4 className="text-sm font-bold text-slate-700">Universal Pricing</h4>
                                <p className="text-[10px] text-slate-400">All branches use the core catalog price.</p>
                            </div>
                            <input
                                type="checkbox"
                                checked={policyForm.universalPricing}
                                onChange={(e) => setPolicyForm({ ...policyForm, universalPricing: e.target.checked })}
                                className="w-5 h-5 text-indigo-600 rounded"
                            />
                        </div>

                        <div className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl">
                            <div>
                                <h4 className="text-sm font-bold text-slate-700">Tax Inclusive Pricing</h4>
                                <p className="text-[10px] text-slate-400">Prices displayed include all taxes.</p>
                            </div>
                            <input
                                type="checkbox"
                                checked={policyForm.taxInclusive}
                                onChange={(e) => setPolicyForm({ ...policyForm, taxInclusive: e.target.checked })}
                                className="w-5 h-5 text-indigo-600 rounded"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <Input
                                label="Default Tax Rate (%)"
                                type="number"
                                value={policyForm.defaultTaxRate}
                                onChange={(e) => setPolicyForm({ ...policyForm, defaultTaxRate: parseFloat(e.target.value) })}
                            />
                            <Input
                                label="Loyalty Redemption Ratio"
                                type="number"
                                step="0.001"
                                value={policyForm.loyaltyRedemptionRatio}
                                onChange={(e) => setPolicyForm({ ...policyForm, loyaltyRedemptionRatio: parseFloat(e.target.value) })}
                            />
                        </div>

                        <div className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl">
                            <div>
                                <h4 className="text-sm font-bold text-slate-700">Require Manager Approval</h4>
                                <p className="text-[10px] text-slate-400">For discounts exceeding 20% or returns.</p>
                            </div>
                            <input
                                type="checkbox"
                                checked={policyForm.requireManagerApproval}
                                onChange={(e) => setPolicyForm({ ...policyForm, requireManagerApproval: e.target.checked })}
                                className="w-5 h-5 text-indigo-600 rounded"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="secondary" onClick={() => setIsPoliciesModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleSavePolicies}>Apply Changes</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

const MultiStorePage: React.FC = () => {
    return (
        <MultiStoreProvider>
            <MultiStoreContent />
        </MultiStoreProvider>
    );
};

export default MultiStorePage;
