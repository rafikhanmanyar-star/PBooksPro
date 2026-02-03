
import React from 'react';
import { useInventory } from '../../../context/InventoryContext';
import { ICONS } from '../../../constants';
import Card from '../../ui/Card';

const StockMovements: React.FC = () => {
    const { movements, warehouses } = useInventory();

    const getMovementStyle = (type: string) => {
        switch (type) {
            case 'Sale': return 'bg-rose-100 text-rose-600';
            case 'Purchase': return 'bg-emerald-100 text-emerald-600';
            case 'Transfer': return 'bg-indigo-100 text-indigo-600';
            case 'Adjustment': return 'bg-amber-100 text-amber-600';
            default: return 'bg-slate-100 text-slate-600';
        }
    };

    return (
        <div className="space-y-6 animate-fade-in shadow-inner">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-black text-slate-800 tracking-tight">Immutable Transaction Ledger</h3>
                <div className="flex gap-2">
                    <button className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all flex items-center gap-2">
                        {ICONS.calendar} Date Filter
                    </button>
                    <button className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all flex items-center gap-2">
                        {ICONS.fileText} Export Trace Log
                    </button>
                </div>
            </div>

            <Card className="border-none shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400">
                            <tr>
                                <th className="px-6 py-4">Timestamp</th>
                                <th className="px-6 py-4">Item Detail</th>
                                <th className="px-6 py-4">Event Type</th>
                                <th className="px-6 py-4">Warehouse</th>
                                <th className="px-6 py-4 text-center">Change</th>
                                <th className="px-6 py-4">Before / After</th>
                                <th className="px-6 py-4">Reference</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {movements.length > 0 ? movements.map(move => (
                                <tr key={move.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-xs font-bold text-slate-700">
                                            {new Date(move.timestamp).toLocaleDateString()}
                                        </div>
                                        <div className="text-[10px] text-slate-400 font-mono">
                                            {new Date(move.timestamp).toLocaleTimeString()}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-bold text-slate-800">{move.itemName}</div>
                                        <div className="text-[10px] text-slate-400">ID: {move.itemId.slice(0, 8)}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider ${getMovementStyle(move.type)}`}>
                                            {move.type}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-xs font-bold text-slate-600">
                                        {warehouses.find(w => w.id === move.warehouseId)?.code || '---'}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`text-sm font-black font-mono ${move.quantity > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                            {move.quantity > 0 ? '+' : ''}{move.quantity}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="text-slate-400 text-[10px] font-mono">{move.beforeQty}</span>
                                        <span className="mx-2 text-slate-300">→</span>
                                        <span className="text-slate-800 text-sm font-black font-mono">{move.afterQty}</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-500 p-1 rounded uppercase">
                                                {move.referenceId.slice(0, 10)}
                                            </span>
                                            {move.notes && <div className="text-[10px] text-slate-400 italic truncate max-w-[100px]">{move.notes}</div>}
                                        </div>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={7} className="px-6 py-20 text-center text-slate-400 italic">
                                        No stock movements recorded in this period.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

export default StockMovements;
