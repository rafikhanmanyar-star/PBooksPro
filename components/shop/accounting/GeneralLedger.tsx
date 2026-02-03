
import React, { useState } from 'react';
import { useAccounting } from '../../../context/AccountingContext';
import { CURRENCY, ICONS } from '../../../constants';
import Card from '../../ui/Card';

const GeneralLedger: React.FC = () => {
    const { entries, accounts } = useAccounting();
    const [searchTerm, setSearchTerm] = useState('');

    const filteredEntries = entries.filter(e =>
        e.reference.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.description.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6 animate-fade-in shadow-inner flex flex-col h-full">
            <div className="flex justify-between items-center mb-4">
                <div className="relative group w-96">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        {ICONS.search}
                    </div>
                    <input
                        type="text"
                        className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-xl leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-xs"
                        placeholder="Search by Reference, Description..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex gap-2">
                    <button className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all flex items-center gap-2">
                        {ICONS.export} Export CSV
                    </button>
                </div>
            </div>

            <Card className="border-none shadow-sm overflow-hidden flex-1 overflow-y-auto">
                <table className="w-full text-left">
                    <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 sticky top-0 z-20">
                        <tr>
                            <th className="px-6 py-4">Date</th>
                            <th className="px-6 py-4">Reference</th>
                            <th className="px-6 py-4">Posting Detail</th>
                            <th className="px-6 py-4 text-right">Debit</th>
                            <th className="px-6 py-4 text-right">Credit</th>
                            <th className="px-6 py-4 text-center">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filteredEntries.length > 0 ? filteredEntries.map(entry => (
                            <React.Fragment key={entry.id}>
                                <tr className="bg-slate-50/50">
                                    <td className="px-6 py-4 text-xs font-bold text-slate-600">
                                        {new Date(entry.date).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="font-mono text-[10px] font-bold bg-indigo-50 text-indigo-600 px-2 py-1 rounded uppercase tracking-tighter">
                                            {entry.reference}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-xs font-black text-slate-800">{entry.description}</div>
                                        <div className="text-[10px] text-slate-400 uppercase tracking-widest">{entry.sourceModule} Log</div>
                                    </td>
                                    <td className="px-6 py-4 text-right font-mono font-black text-sm text-slate-900 border-t border-slate-200" colSpan={2}>
                                        {/* Entry level total */}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-600 rounded text-[9px] font-black uppercase">Posted</span>
                                    </td>
                                </tr>
                                {entry.lines.map((line, idx) => (
                                    <tr key={`${entry.id}-${idx}`} className="hover:bg-slate-50/30">
                                        <td colSpan={2}></td>
                                        <td className="px-6 py-3">
                                            <div className="text-xs font-bold text-slate-700 pl-4 border-l-2 border-indigo-100 italic">{line.accountName}</div>
                                            {line.memo && <div className="text-[9px] text-slate-400 pl-4">{line.memo}</div>}
                                        </td>
                                        <td className="px-6 py-3 text-right">
                                            {line.debit > 0 && <span className="font-mono text-xs font-bold text-slate-800">{line.debit.toLocaleString()}</span>}
                                        </td>
                                        <td className="px-6 py-3 text-right">
                                            {line.credit > 0 && <span className="font-mono text-xs font-bold text-slate-600">{line.credit.toLocaleString()}</span>}
                                        </td>
                                        <td></td>
                                    </tr>
                                ))}
                            </React.Fragment>
                        )) : (
                            <tr>
                                <td colSpan={6} className="px-6 py-20 text-center text-slate-300 italic">
                                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                        {React.cloneElement(ICONS.clipboard as React.ReactElement<any>, { width: 32, height: 32 })}
                                    </div>
                                    <p className="font-bold uppercase tracking-[0.2em] text-[10px]">No ledger entries found</p>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </Card>
        </div>
    );
};

export default GeneralLedger;
