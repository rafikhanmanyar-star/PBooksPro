
import React from 'react';
import { useMultiStore } from '../../../context/MultiStoreContext';
import { ICONS } from '../../../constants';
import Card from '../../ui/Card';

const TerminalManager: React.FC = () => {
    const { terminals, stores, lockTerminal } = useMultiStore();

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex justify-between items-center mb-4">
                <div>
                    <h3 className="text-lg font-black text-slate-800 tracking-tight">Active Hardware Network</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Real-time terminal health and synchronization status.</p>
                </div>
                <div className="flex gap-2">
                    <button className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:bg-black transition-all">
                        {ICONS.plus} Register New POS
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {terminals.map(terminal => {
                    const store = stores.find(s => s.id === terminal.storeId);
                    return (
                        <Card key={terminal.id} className="p-6 border-none shadow-sm relative overflow-hidden bg-white group hover:shadow-xl transition-all">
                            {/* Health Bar at the top */}
                            <div className="absolute top-0 left-0 right-0 h-1 bg-slate-50">
                                <div
                                    className={`h-full transition-all duration-1000 ${terminal.healthScore > 90 ? 'bg-emerald-500' :
                                            terminal.healthScore > 70 ? 'bg-amber-400' : 'bg-rose-500'
                                        }`}
                                    style={{ width: `${terminal.healthScore}%` }}
                                ></div>
                            </div>

                            <div className="flex justify-between items-start mb-6">
                                <div className={`p-4 rounded-2xl ${terminal.status === 'Online' ? 'bg-emerald-50 text-emerald-600' :
                                        terminal.status === 'Locked' ? 'bg-rose-50 text-rose-600' : 'bg-slate-50 text-slate-400'
                                    }`}>
                                    {React.cloneElement(ICONS.history as React.ReactElement<any>, { width: 24, height: 24 })}
                                </div>
                                <div className="text-right">
                                    <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest ${terminal.status === 'Online' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-50' :
                                            terminal.status === 'Locked' ? 'bg-rose-600 text-white' : 'bg-slate-200 text-slate-500'
                                        }`}>
                                        {terminal.status}
                                    </span>
                                    <p className="text-[9px] font-mono text-slate-400 mt-2">{terminal.ipAddress}</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <h4 className="text-lg font-black text-slate-800 tracking-tight">{terminal.name}</h4>
                                    <p className="text-[10px] font-black text-indigo-600 uppercase italic">{store?.name}</p>
                                </div>

                                <div className="grid grid-cols-2 gap-4 py-4 border-y border-slate-50">
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 uppercase">Version</p>
                                        <p className="text-xs font-bold text-slate-700">v{terminal.version}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[9px] font-black text-slate-400 uppercase">Last Sync</p>
                                        <p className="text-xs font-bold text-slate-700">{new Date(terminal.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                    </div>
                                </div>

                                <div className="flex gap-2 pt-2">
                                    <button className="flex-1 py-3 bg-slate-50 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-tighter hover:bg-slate-100 transition-all">
                                        Remote Diagnostic
                                    </button>
                                    {terminal.status !== 'Locked' && (
                                        <button
                                            onClick={() => lockTerminal(terminal.id)}
                                            className="px-3 bg-rose-50 text-rose-300 rounded-xl hover:text-rose-600 transition-all tooltip"
                                        >
                                            {ICONS.alertTriangle}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </Card>
                    );
                })}

                {/* Unregistered Device Alert */}
                <div className="h-full border-4 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center p-8 text-center gap-4 bg-slate-50/50 group hover:border-indigo-300 transition-all cursor-pointer">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-slate-300 group-hover:text-indigo-600 transition-colors shadow-sm">
                        {ICONS.plus}
                    </div>
                    <div>
                        <p className="text-xs font-black uppercase text-slate-400 tracking-widest">Register Hardware</p>
                        <p className="text-[10px] text-slate-300 font-medium italic mt-1">Found 2 unassigned devices on local network.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TerminalManager;
