
import React from 'react';
import { useMultiStore } from '../../../context/MultiStoreContext';
import { ICONS, CURRENCY } from '../../../constants';
import Card from '../../ui/Card';

const OrganizationDashboard: React.FC = () => {
    const { organization, consolidatedRevenue, activeTerminalsCount, stores, performance } = useMultiStore();

    const stats = [
        { label: 'Network Revenue', value: `${CURRENCY} ${consolidatedRevenue.toLocaleString()}`, icon: ICONS.trendingUp, color: 'text-indigo-600', bg: 'bg-indigo-50' },
        { label: 'Active Branches', value: stores.filter(s => s.status === 'Active').length, icon: ICONS.building, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        { label: 'POS Terminals', value: activeTerminalsCount, icon: ICONS.history, color: 'text-amber-600', bg: 'bg-amber-50' },
        { label: 'Health Index', value: '94%', icon: ICONS.heart, color: 'text-rose-600', bg: 'bg-rose-50' },
    ];

    // Top branches by performance
    const sortedBranches = [...performance].sort((a, b) => b.salesToday - a.salesToday);

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* KPI Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {stats.map((stat, i) => (
                    <Card key={i} className="p-6 border-none shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
                        <div className={`w-14 h-14 rounded-2xl ${stat.bg} ${stat.color} flex items-center justify-center`}>
                            {React.cloneElement(stat.icon as React.ReactElement<any>, { width: 28, height: 28 })}
                        </div>
                        <div>
                            <p className="text-xs font-black uppercase tracking-widest text-slate-400">{stat.label}</p>
                            <p className="text-2xl font-black text-slate-800 tracking-tight">{stat.value}</p>
                        </div>
                    </Card>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Network Performance Leaderboard */}
                <Card className="lg:col-span-2 border-none shadow-sm p-8 space-y-6 bg-white">
                    <div className="flex justify-between items-center">
                        <div>
                            <h3 className="font-bold text-slate-800 text-lg">Branch Performance Ranking</h3>
                            <p className="text-xs text-slate-400 font-medium">Real-time throughput comparison across the network.</p>
                        </div>
                        <button className="text-xs font-bold text-indigo-600 hover:underline">Full Benchmark Report</button>
                    </div>

                    <div className="space-y-8 pt-4">
                        {sortedBranches.map((perf, i) => {
                            const store = stores.find(s => s.id === perf.storeId);
                            const percent = (perf.salesToday / sortedBranches[0].salesToday) * 100;
                            return (
                                <div key={perf.storeId} className="space-y-2">
                                    <div className="flex justify-between items-end">
                                        <div className="flex items-center gap-3">
                                            <span className="text-xs font-black text-slate-300">#0{i + 1}</span>
                                            <div>
                                                <p className="text-sm font-bold text-slate-800">{store?.name}</p>
                                                <p className="text-[10px] text-slate-400 uppercase font-mono">{store?.code}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-black text-slate-800 font-mono">{CURRENCY} {perf.salesToday.toLocaleString()}</p>
                                            <p className={`text-[10px] font-bold ${perf.variance >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                {perf.variance >= 0 ? '+' : ''}{perf.variance}% vs Yesterday
                                            </p>
                                        </div>
                                    </div>
                                    <div className="h-2 bg-slate-50 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-indigo-600 rounded-full transition-all duration-1000"
                                            style={{ width: `${percent}%` }}
                                        ></div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Card>

                {/* Regional Distribution */}
                <Card className="border-none shadow-sm p-8 flex flex-col gap-8">
                    <h3 className="font-bold text-slate-800">Regional Footprint</h3>
                    <div className="flex-1 flex items-center justify-center relative">
                        {/* Mock Map / Radial Visual */}
                        <div className="w-48 h-48 rounded-full border-8 border-slate-50 flex items-center justify-center relative">
                            <div className="absolute inset-0 rounded-full border-t-8 border-indigo-600 rotate-45"></div>
                            <div className="absolute inset-0 rounded-full border-r-8 border-emerald-500 -rotate-12"></div>
                            <div className="text-center">
                                <p className="text-3xl font-black text-slate-800">12</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Active Nodes</p>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-indigo-600"></div>
                                <span className="text-xs font-bold text-slate-600">South Region</span>
                            </div>
                            <span className="text-xs font-black text-slate-800 font-mono">5 Stores</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                <span className="text-xs font-bold text-slate-600">Central Region</span>
                            </div>
                            <span className="text-xs font-black text-slate-800 font-mono">4 Stores</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-amber-400"></div>
                                <span className="text-xs font-bold text-slate-600">North Region</span>
                            </div>
                            <span className="text-xs font-black text-slate-800 font-mono">3 Stores</span>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default OrganizationDashboard;
