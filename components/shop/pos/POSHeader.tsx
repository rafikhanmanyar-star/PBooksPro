
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { usePOS } from '../../../context/POSContext';
import { ICONS } from '../../../constants';

const POSHeader: React.FC = () => {
    const { user, tenant } = useAuth();
    const {
        branches,
        terminals,
        selectedBranchId,
        selectedTerminalId,
        setSelectedBranchId,
        setSelectedTerminalId
    } = usePOS();
    const [time, setTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="h-14 bg-slate-900 text-white flex items-center justify-between px-6 shadow-md z-20">
            <div className="flex items-center gap-6">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-indigo-600 flex items-center justify-center font-bold text-sm">P</div>
                    <span className="font-bold text-lg tracking-tight">
                        <span className="text-red-500">P</span>Books <span className="text-indigo-400">Retail</span>
                    </span>
                </div>

                <div className="h-6 w-px bg-slate-700 hidden md:block"></div>

                <div className="flex items-center gap-4 text-sm text-slate-300">
                    <div className="flex items-center gap-2">
                        <span className="text-slate-500">Branch:</span>
                        {branches.length > 1 ? (
                            <select
                                value={selectedBranchId || ''}
                                onChange={(e) => setSelectedBranchId(e.target.value)}
                                className="bg-slate-800 text-white border-none text-xs rounded px-2 py-1 outline-none appearance-none cursor-pointer hover:bg-slate-700 transition-colors"
                            >
                                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                        ) : (
                            <span className="font-semibold text-white">{branches.find(b => b.id === selectedBranchId)?.name || 'Default Branch'}</span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-slate-500">Terminal:</span>
                        {terminals.length > 1 ? (
                            <select
                                value={selectedTerminalId || ''}
                                onChange={(e) => setSelectedTerminalId(e.target.value)}
                                className="bg-slate-800 text-white border-none text-xs rounded px-2 py-1 outline-none appearance-none cursor-pointer hover:bg-slate-700 transition-colors"
                            >
                                {terminals.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                        ) : (
                            <span className="font-semibold text-white">{terminals.find(t => t.id === selectedTerminalId)?.name || 'T-01'}</span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-slate-500">Shift:</span>
                        <span className="text-emerald-400 font-medium">Open</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-6">
                <div className="flex items-center gap-4 mr-4">
                    <div className="flex flex-col items-end">
                        <div className="text-sm font-bold text-white">{user?.name || 'Cashier'}</div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-widest">{tenant?.companyName || 'Main Store'}</div>
                    </div>
                    <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden">
                        {ICONS.users}
                    </div>
                </div>

                <div className="flex items-center gap-4 text-sm font-mono text-slate-400">
                    <div className="flex items-center gap-2 bg-slate-800 px-3 py-1 rounded-full text-emerald-400 border border-slate-700">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                        <span className="text-xs font-bold">ONLINE</span>
                    </div>
                    <span>{time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                </div>
            </div>
        </div>
    );
};

export default POSHeader;
