
import React, { useState } from 'react';
import { LoyaltyProvider, useLoyalty } from '../../context/LoyaltyContext';
import LoyaltyDashboard from './loyalty/LoyaltyDashboard';
import MemberDirectory from './loyalty/MemberDirectory';
import TierMatrix from './loyalty/TierMatrix';
import CampaignManager from './loyalty/CampaignManager';
import { ICONS } from '../../constants';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';

const LoyaltyContent: React.FC = () => {
    const { addMember } = useLoyalty();
    const [activeTab, setActiveTab] = useState<'dashboard' | 'members' | 'tiers' | 'campaigns'>('dashboard');
    const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
    const [newMemberData, setNewMemberData] = useState({
        customerName: '',
        cardNumber: '',
        email: '',
        phone: ''
    });

    const handleEnroll = () => {
        addMember({
            customerId: newMemberData.cardNumber || `CUST-${Date.now().toString().slice(-6)}`,
            customerName: newMemberData.customerName,
            cardNumber: newMemberData.cardNumber || `LOY-${Date.now().toString().slice(-6)}`,
            email: newMemberData.email,
            phone: newMemberData.phone,
            tier: 'Silver',
            visitCount: 0,
            totalSpend: 0,
            status: 'Active'
        });
        setIsEnrollModalOpen(false);
        setNewMemberData({ customerName: '', cardNumber: '', email: '', phone: '' });
    };

    const tabs = [
        { id: 'dashboard', label: 'Retention Hub', icon: ICONS.barChart },
        { id: 'members', label: 'Member Directory', icon: ICONS.users },
        { id: 'tiers', label: 'Tier & Rules', icon: ICONS.trophy },
        { id: 'campaigns', label: 'Campaigns', icon: ICONS.target },
    ];

    return (
        <div className="flex flex-col h-full bg-slate-50 -m-4 md:-m-8">
            {/* Header / Tab Navigation */}
            <div className="bg-white border-b border-slate-200 px-8 pt-6 shadow-sm z-10">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-2xl font-black text-slate-800 tracking-tight">Customer Retention Engine</h1>
                        <p className="text-slate-500 text-sm font-medium">Enterprise Loyalty & Reward Lifecycle Management.</p>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => setIsEnrollModalOpen(true)}
                            className="px-4 py-2 bg-rose-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-rose-100 hover:bg-rose-700 transition-all flex items-center gap-2"
                        >
                            {ICONS.plus} Enroll Member
                        </button>
                    </div>
                </div>

                <div className="flex gap-8">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`pb-4 text-sm font-bold transition-all relative flex items-center gap-2 ${activeTab === tab.id
                                ? 'text-rose-600'
                                : 'text-slate-400 hover:text-slate-600'
                                }`}
                        >
                            {React.cloneElement(tab.icon as React.ReactElement<any>, { width: 18, height: 18 })}
                            {tab.label}
                            {activeTab === tab.id && (
                                <div className="absolute bottom-0 left-0 right-0 h-1 bg-rose-600 rounded-t-full"></div>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto p-8">
                {activeTab === 'dashboard' && <LoyaltyDashboard />}
                {activeTab === 'members' && <MemberDirectory />}
                {activeTab === 'tiers' && <TierMatrix />}
                {activeTab === 'campaigns' && <CampaignManager />}
            </div>

            <Modal
                isOpen={isEnrollModalOpen}
                onClose={() => setIsEnrollModalOpen(false)}
                title="Enroll New Loyalty Member"
                size="lg"
            >
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="Customer Name"
                            placeholder="Full Name"
                            value={newMemberData.customerName}
                            onChange={(e) => setNewMemberData({ ...newMemberData, customerName: e.target.value })}
                        />
                        <Input
                            label="Card / Member ID"
                            placeholder="Auto-generated if empty"
                            value={newMemberData.cardNumber}
                            onChange={(e) => setNewMemberData({ ...newMemberData, cardNumber: e.target.value })}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="Email Address"
                            type="email"
                            placeholder="customer@example.com"
                            value={newMemberData.email}
                            onChange={(e) => setNewMemberData({ ...newMemberData, email: e.target.value })}
                        />
                        <Input
                            label="Phone Number"
                            placeholder="+92..."
                            value={newMemberData.phone}
                            onChange={(e) => setNewMemberData({ ...newMemberData, phone: e.target.value })}
                        />
                    </div>

                    <div className="bg-rose-50 p-4 rounded-xl border border-rose-100 mt-2">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-rose-100 text-rose-600 rounded-lg">
                                {ICONS.trophy}
                            </div>
                            <div>
                                <p className="text-sm font-bold text-rose-900">Sign-up Bonus</p>
                                <p className="text-xs text-rose-700">New members automatically receive 50 bonus points upon enrollment.</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 mt-6">
                        <Button variant="secondary" onClick={() => setIsEnrollModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleEnroll} disabled={!newMemberData.customerName}>Enroll Member</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

const LoyaltyPage: React.FC = () => {
    return <LoyaltyContent />;
};

export default LoyaltyPage;
