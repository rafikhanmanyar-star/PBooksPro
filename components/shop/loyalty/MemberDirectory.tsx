
import React, { useState } from 'react';
import { useLoyalty } from '../../../context/LoyaltyContext';
import { ICONS } from '../../../constants';
import Card from '../../ui/Card';

const MemberDirectory: React.FC = () => {
    const { members } = useLoyalty();
    const [searchQuery, setSearchQuery] = useState('');

    const filteredMembers = members.filter(m =>
        m.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.cardNumber.includes(searchQuery)
    );

    return (
        <div className="space-y-6 animate-fade-in flex flex-col h-full">
            <div className="flex justify-between items-center mb-4">
                <div className="relative group w-96">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        {ICONS.search}
                    </div>
                    <input
                        type="text"
                        className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500 transition-all text-xs shadow-sm"
                        placeholder="Search Member Name or ID..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="flex gap-2">
                    <button className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all flex items-center gap-2">
                        {ICONS.download} Export Roster
                    </button>
                </div>
            </div>

            <Card className="border-none shadow-sm overflow-hidden flex-1 flex flex-col">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400">
                            <tr>
                                <th className="px-6 py-4">Card / Member</th>
                                <th className="px-6 py-4">Tier Status</th>
                                <th className="px-6 py-4 text-center">Visit Count</th>
                                <th className="px-6 py-4 text-right">Points Balance</th>
                                <th className="px-6 py-4 text-right">Total Lifetime Value</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredMembers.map(m => (
                                <tr key={m.id} className="hover:bg-rose-50/30 transition-colors group cursor-pointer">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-black text-xs group-hover:bg-rose-100 group-hover:text-rose-600 transition-colors">
                                                {m.customerName.charAt(0)}
                                            </div>
                                            <div>
                                                <div className="font-bold text-slate-800 text-sm">{m.customerName}</div>
                                                <div className="text-[10px] text-slate-400 font-mono italic">ID: {m.cardNumber}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider ${m.tier === 'Platinum' ? 'bg-slate-900 text-white shadow-lg' :
                                                m.tier === 'Gold' ? 'bg-amber-400 text-amber-900' :
                                                    'bg-slate-200 text-slate-600'
                                            }`}>
                                            {m.tier}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center font-black text-slate-600 font-mono text-sm">
                                        {m.visitCount}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="text-sm font-black text-slate-800 font-mono">{m.pointsBalance.toLocaleString()}</div>
                                        <div className="text-[9px] text-rose-500 font-bold uppercase tracking-widest mt-0.5">Ready to Burn</div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="text-sm font-black text-slate-900 font-mono">${m.totalSpend.toLocaleString()}</div>
                                        <div className="text-[9px] text-slate-400 uppercase font-medium">PKR Equivalent</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                            <span className="text-[10px] font-bold text-slate-600 uppercase">Active</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button className="p-2 text-slate-300 hover:text-rose-600 transition-colors">
                                            {ICONS.chevronRight}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

export default MemberDirectory;
