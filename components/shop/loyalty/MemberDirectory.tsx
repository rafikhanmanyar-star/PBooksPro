
import React, { useState, useMemo } from 'react';
import { useLoyalty } from '../../../context/LoyaltyContext';
import { ICONS } from '../../../constants';
import Card from '../../ui/Card';
import Modal from '../../ui/Modal';
import { LoyaltyMember, LoyaltyTier } from '../../../types/loyalty';

const MemberDirectory: React.FC = () => {
    const { members, deleteMember, updateMember, transactions } = useLoyalty();
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTierFilter, setActiveTierFilter] = useState<LoyaltyTier | 'All'>('All');
    const [selectedMember, setSelectedMember] = useState<LoyaltyMember | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

    const filteredMembers = useMemo(() => {
        return members.filter(m => {
            const nameMatch = (m.customerName || '').toLowerCase().includes(searchQuery.toLowerCase());
            const cardMatch = (m.cardNumber || '').toLowerCase().includes(searchQuery.toLowerCase());
            const phoneMatch = (m.phone || '').includes(searchQuery);

            const matchesSearch = nameMatch || cardMatch || phoneMatch;

            const matchesTier = activeTierFilter === 'All' || m.tier === activeTierFilter;

            return matchesSearch && matchesTier;
        });
    }, [members, searchQuery, activeTierFilter]);

    const tierStats = useMemo(() => {
        const stats = {
            Silver: 0,
            Gold: 0,
            Platinum: 0,
            Total: members.length
        };
        members.forEach(m => {
            if (stats[m.tier] !== undefined) stats[m.tier]++;
        });
        return stats;
    }, [members]);

    const handleViewDetails = (member: LoyaltyMember) => {
        setSelectedMember(member);
        setIsDetailModalOpen(true);
    };

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm('Are you sure you want to remove this member from the loyalty program?')) {
            await deleteMember(id);
        }
    };

    const getMemberTransactions = (memberId: string) => {
        return transactions.filter(t => t.memberId === memberId);
    };

    return (
        <div className="space-y-6 animate-fade-in flex flex-col h-full">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                    { label: 'Total Roster', count: tierStats.Total, tier: 'All', color: 'bg-slate-900' },
                    { label: 'Silver Tier', count: tierStats.Silver, tier: 'Silver', color: 'bg-slate-400' },
                    { label: 'Gold Tier', count: tierStats.Gold, tier: 'Gold', color: 'bg-amber-400' },
                    { label: 'Platinum Tier', count: tierStats.Platinum, tier: 'Platinum', color: 'bg-rose-500' }
                ].map(stat => (
                    <button
                        key={stat.label}
                        onClick={() => setActiveTierFilter(stat.tier as any)}
                        className={`p-4 rounded-2xl transition-all shadow-sm flex flex-col items-start gap-1 border-2 ${activeTierFilter === stat.tier ? 'border-rose-500 ring-2 ring-rose-100 shadow-lg scale-[1.02]' : 'border-transparent bg-white hover:border-slate-200'}`}
                    >
                        <div className={`w-2 h-2 rounded-full ${stat.color} mb-1`}></div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{stat.label}</p>
                        <p className="text-xl font-black text-slate-800">{stat.count}</p>
                    </button>
                ))}
            </div>

            {/* Filter & Search Toolbar */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                <div className="relative group flex-1 max-w-md">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-rose-500 transition-colors">
                        {ICONS.search}
                    </div>
                    <input
                        type="text"
                        className="block w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl leading-5 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all text-xs font-medium placeholder-slate-400"
                        placeholder="Search by Name, Card ID, or Phone..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <div className="flex items-center gap-2">
                    <button className="px-4 py-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-all flex items-center gap-2">
                        {ICONS.download} Export
                    </button>
                </div>
            </div>

            <Card className="border-none shadow-sm overflow-hidden flex-1 flex flex-col bg-white">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50/80 backdrop-blur-sm sticky top-0 z-10 text-[10px] font-black uppercase text-slate-400">
                            <tr>
                                <th className="px-8 py-5">Card / Member</th>
                                <th className="px-6 py-5">Tier Segment</th>
                                <th className="px-6 py-5 text-center">Visits</th>
                                <th className="px-6 py-5 text-right">Points Balance</th>
                                <th className="px-6 py-5 text-right">LTV (Lifetime)</th>
                                <th className="px-6 py-5">Status</th>
                                <th className="px-8 py-5"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {filteredMembers.length > 0 ? filteredMembers.map(m => (
                                <tr
                                    key={m.id}
                                    onClick={() => handleViewDetails(m)}
                                    className="hover:bg-rose-50/20 transition-all group cursor-pointer"
                                >
                                    <td className="px-8 py-5 whitespace-nowrap">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-sm transition-all group-hover:scale-110 shadow-sm ${m.tier === 'Platinum' ? 'bg-slate-900 text-rose-500' :
                                                m.tier === 'Gold' ? 'bg-amber-100 text-amber-600' :
                                                    'bg-slate-100 text-slate-400'
                                                }`}>
                                                {m.customerName.charAt(0)}
                                            </div>
                                            <div>
                                                <div className="font-bold text-slate-800 text-sm group-hover:text-rose-600 transition-colors">{m.customerName}</div>
                                                <div className="text-[10px] text-slate-400 font-mono italic tracking-tighter">ID: {m.cardNumber}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-5">
                                        <div className="flex flex-col">
                                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider inline-block w-fit shadow-sm ${m.tier === 'Platinum' ? 'bg-rose-600 text-white' :
                                                m.tier === 'Gold' ? 'bg-amber-400 text-amber-900' :
                                                    'bg-slate-200 text-slate-600'
                                                }`}>
                                                {m.tier} Member
                                            </span>
                                            <span className="text-[9px] text-slate-400 italic mt-1 font-medium">Joined {new Date(m.joinDate).toLocaleDateString()}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-5 text-center font-black text-slate-600 font-mono text-sm">
                                        {m.visitCount}
                                    </td>
                                    <td className="px-6 py-5 text-right">
                                        <div className="text-sm font-black text-slate-800 font-mono tracking-tighter">{m.pointsBalance.toLocaleString()}</div>
                                        <div className="text-[9px] text-rose-500 font-bold uppercase tracking-widest mt-0.5 animate-pulse">Available</div>
                                    </td>
                                    <td className="px-6 py-5 text-right font-mono">
                                        <div className="text-sm font-black text-slate-900 tracking-tighter">${m.totalSpend.toLocaleString()}</div>
                                        <div className="text-[9px] text-slate-400 uppercase font-medium">Gross Value</div>
                                    </td>
                                    <td className="px-6 py-5">
                                        <div className="flex items-center gap-1.5 focus:ring-2">
                                            <div className={`w-2 h-2 rounded-full ${m.status === 'Active' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-300'}`}></div>
                                            <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{m.status}</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-5 text-right">
                                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={(e) => handleDelete(m.id, e)}
                                                className="p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                            >
                                                {ICONS.trash}
                                            </button>
                                            <div className="p-2 text-rose-600">
                                                {ICONS.chevronRight}
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={7} className="px-8 py-20 text-center">
                                        <div className="flex flex-col items-center justify-center gap-3">
                                            <div className="p-6 bg-slate-50 rounded-3xl text-slate-200">
                                                {React.cloneElement(ICONS.users as React.ReactElement<any>, { width: 48, height: 48 })}
                                            </div>
                                            <div className="space-y-1">
                                                <p className="text-slate-800 font-black tracking-tight text-lg">No Members Found</p>
                                                <p className="text-slate-400 text-xs font-medium">Try adjusting your filters or search terms.</p>
                                            </div>
                                            <button
                                                onClick={() => { setSearchQuery(''); setActiveTierFilter('All'); }}
                                                className="mt-4 px-6 py-2 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest"
                                            >
                                                Reset Filters
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Member Details Modal */}
            <Modal
                isOpen={isDetailModalOpen}
                onClose={() => setIsDetailModalOpen(false)}
                title="Member Profile Insights"
                size="xl"
            >
                {selectedMember && (
                    <div className="space-y-8 pb-4">
                        <div className="flex flex-col md:flex-row gap-8 items-start">
                            {/* Left Side: Basic Info Card */}
                            <div className="w-full md:w-1/3 space-y-4">
                                <div className="p-8 bg-slate-50 rounded-[32px] border border-slate-100 flex flex-col items-center text-center">
                                    <div className={`w-28 h-28 rounded-[40px] flex items-center justify-center font-black text-4xl mb-6 shadow-xl ${selectedMember.tier === 'Platinum' ? 'bg-slate-900 text-rose-600' :
                                        selectedMember.tier === 'Gold' ? 'bg-amber-400 text-amber-900' :
                                            'bg-white text-slate-300 border-2 border-slate-100'
                                        }`}>
                                        {(selectedMember.customerName || 'U').charAt(0)}
                                    </div>
                                    <h4 className="text-2xl font-black text-slate-900 tracking-tight">{selectedMember.customerName || 'Unnamed Member'}</h4>
                                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-rose-600 mt-1">{selectedMember.tier} Elite Member</p>

                                    <div className="w-full mt-8 pt-8 border-t border-slate-200 space-y-4">
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="font-bold text-slate-400 uppercase tracking-widest text-[9px]">Card Number</span>
                                            <span className="font-mono text-slate-800 font-black">{selectedMember.cardNumber}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="font-bold text-slate-400 uppercase tracking-widest text-[9px]">Mobile No</span>
                                            <span className="font-mono text-slate-800 font-black">{selectedMember.phone || 'Not Provided'}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="font-bold text-slate-400 uppercase tracking-widest text-[9px]">Enrollment</span>
                                            <span className="text-slate-800 font-black">{new Date(selectedMember.joinDate).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    className="w-full py-4 bg-slate-100 text-slate-400 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-50 hover:text-rose-600 transition-all border border-transparent hover:border-rose-100"
                                    onClick={() => {
                                        if (window.confirm('Deactivate this member?')) {
                                            updateMember(selectedMember.id, { status: selectedMember.status === 'Active' ? 'Inactive' : 'Active' });
                                            setIsDetailModalOpen(false);
                                        }
                                    }}
                                >
                                    {selectedMember.status === 'Active' ? 'Deactivate Membership' : 'Reactivate Membership'}
                                </button>
                            </div>

                            {/* Right Side: Performance stats and history */}
                            <div className="flex-1 space-y-8">
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="p-6 bg-white border border-slate-100 rounded-3xl shadow-sm">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Points</p>
                                        <p className="text-2xl font-black text-rose-600 font-mono tracking-tighter">{selectedMember.pointsBalance.toLocaleString()}</p>
                                    </div>
                                    <div className="p-6 bg-white border border-slate-100 rounded-3xl shadow-sm">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Total LTV</p>
                                        <p className="text-2xl font-black text-slate-900 font-mono tracking-tighter">${selectedMember.totalSpend.toLocaleString()}</p>
                                    </div>
                                    <div className="p-6 bg-white border border-slate-100 rounded-3xl shadow-sm">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Visit Count</p>
                                        <p className="text-2xl font-black text-slate-900 font-mono tracking-tighter">{selectedMember.visitCount}</p>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <h5 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-2 uppercase">
                                            {ICONS.barChart} Transaction History
                                        </h5>
                                        <button className="text-[10px] font-black text-rose-600 uppercase tracking-widest">Full Ledger</button>
                                    </div>

                                    <div className="bg-slate-50/50 rounded-3xl border border-slate-100 overflow-hidden">
                                        {getMemberTransactions(selectedMember.id).length > 0 ? (
                                            <div className="divide-y divide-slate-100">
                                                {getMemberTransactions(selectedMember.id).map(tx => (
                                                    <div key={tx.id} className="p-4 flex justify-between items-center hover:bg-white transition-colors">
                                                        <div className="flex items-center gap-4">
                                                            <div className={`p-2 rounded-lg ${tx.type === 'Earn' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                                                                {tx.type === 'Earn' ? ICONS.plus : ICONS.minus}
                                                            </div>
                                                            <div>
                                                                <p className="text-[11px] font-bold text-slate-800 uppercase tracking-tighter">Sale Ref: #{tx.referenceId.slice(-8)}</p>
                                                                <p className="text-[9px] text-slate-400 font-medium italic">{new Date(tx.timestamp).toLocaleString()}</p>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className={`text-xs font-black font-mono ${tx.type === 'Earn' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                                {tx.type === 'Earn' ? '+' : '-'}{tx.points} Pts
                                                            </p>
                                                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.1em]">Verified</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="p-12 text-center text-slate-300">
                                                <p className="text-xs font-black uppercase tracking-widest italic">No transactions recorded yet</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center gap-4 mt-4">
                            <div className="p-3 bg-indigo-100 text-indigo-600 rounded-xl">
                                {ICONS.trophy}
                            </div>
                            <div className="flex-1">
                                <p className="text-[11px] font-black text-indigo-900 uppercase tracking-widest">Tier Evolution</p>
                                <p className="text-xs text-indigo-700 font-medium">Spending another <span className="font-black">$2,400</span> will upgrade this customer to <span className="font-black italic underline">Platinum Status</span>.</p>
                            </div>
                            <div className="w-48 h-2 bg-indigo-200 rounded-full overflow-hidden">
                                <div className="h-full bg-indigo-600 w-3/4 rounded-full"></div>
                            </div>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default MemberDirectory;
