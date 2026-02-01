
import React, { useState } from 'react';
import { useMultiStore } from '../../../context/MultiStoreContext';
import { ICONS } from '../../../constants';
import Card from '../../ui/Card';

const BranchDirectory: React.FC = () => {
    const { stores } = useMultiStore();
    const [search, setSearch] = useState('');

    const filtered = stores.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.code.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
            <div className="flex justify-between items-center mb-4">
                <div className="relative group w-96">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        {ICONS.search}
                    </div>
                    <input
                        type="text"
                        className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-xs"
                        placeholder="Search by Branch Name, Code or Region..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="flex gap-2">
                    <button className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all flex items-center gap-2">
                        {ICONS.download} Export Roster
                    </button>
                </div>
            </div>

            <Card className="border-none shadow-sm overflow-hidden flex-1">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400">
                            <tr>
                                <th className="px-6 py-4">Branch Detail</th>
                                <th className="px-6 py-4">Type</th>
                                <th className="px-6 py-4">Manager / Contact</th>
                                <th className="px-6 py-4">Operating Hours</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filtered.map(store => (
                                <tr key={store.id} className="hover:bg-slate-50 transition-colors group">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                                                {React.cloneElement(ICONS.building as React.ReactElement<any>, { width: 18, height: 18 })}
                                            </div>
                                            <div>
                                                <div className="font-bold text-slate-800 text-sm">{store.name}</div>
                                                <div className="text-[10px] text-slate-400 font-mono italic">{store.location}, {store.region}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${store.type === 'Flagship' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' :
                                                store.type === 'Warehouse' ? 'bg-amber-100 text-amber-600' :
                                                    'bg-slate-100 text-slate-600'
                                            }`}>
                                            {store.type}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-xs font-bold text-slate-700">{store.manager}</div>
                                        <div className="text-[10px] text-slate-400">{store.contact}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-xs font-mono font-bold text-slate-600">
                                            {store.openTime} - {store.closeTime}
                                        </div>
                                        <div className="text-[9px] text-slate-400 italic">({store.timezone})</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full ${store.status === 'Active' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></div>
                                            <span className={`text-[10px] font-black uppercase ${store.status === 'Active' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                {store.status}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <button className="p-2 text-slate-300 hover:text-indigo-600 transition-colors">
                                            {ICONS.edit}
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

export default BranchDirectory;
