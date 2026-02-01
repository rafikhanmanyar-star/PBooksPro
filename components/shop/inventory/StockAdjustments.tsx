
import React from 'react';
import { useInventory } from '../../../context/InventoryContext';
import { ICONS } from '../../../constants';
import Card from '../../ui/Card';

const StockAdjustments: React.FC = () => {
    const { adjustments, approveAdjustment, warehouses, items } = useInventory();

    return (
        <div className="space-y-6 animate-fade-in shadow-inner">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-black text-slate-800 tracking-tight">Adjustment Approval Queue</h3>
                <button className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center gap-2">
                    {ICONS.plus} New Request
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {adjustments.length > 0 ? adjustments.map(adj => {
                    const item = items.find(i => i.id === adj.itemId);
                    const warehouse = warehouses.find(w => w.id === adj.warehouseId);

                    return (
                        <Card key={adj.id} className={`p-6 border-2 transition-all group ${adj.status === 'Approved' ? 'border-emerald-100 bg-emerald-50/20' : 'border-amber-100 bg-amber-50/20 shadow-xl'
                            }`}>
                            <div className="flex justify-between items-start mb-4">
                                <div className={`p-2 rounded-lg ${adj.type === 'Increase' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                                    {adj.type === 'Increase' ? ICONS.plus : ICONS.minus}
                                </div>
                                <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest ${adj.status === 'Approved' ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'
                                    }`}>
                                    {adj.status}
                                </span>
                            </div>

                            <div className="space-y-1 mb-6">
                                <h4 className="font-black text-slate-800 tracking-tight">{item?.name || 'Unknown Item'}</h4>
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                                    {warehouse?.name} • Reason: {adj.reasonCode}
                                </p>
                            </div>

                            <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-100 shadow-sm mb-6">
                                <span className="text-xs font-bold text-slate-400">Adjustment Qty</span>
                                <span className={`text-xl font-black font-mono ${adj.type === 'Increase' ? 'text-emerald-500' : 'text-rose-500'}`}>
                                    {adj.type === 'Increase' ? '+' : '-'}{adj.quantity}
                                </span>
                            </div>

                            {adj.status === 'Pending' ? (
                                <button
                                    onClick={() => approveAdjustment(adj.id)}
                                    className="w-full py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all"
                                >
                                    Approve & Commit
                                </button>
                            ) : (
                                <div className="text-[10px] text-slate-400 font-medium italic text-center">
                                    Approved by {adj.approvedBy} on {new Date(adj.timestamp).toLocaleDateString()}
                                </div>
                            )}
                        </Card>
                    );
                }) : (
                    <div className="col-span-full py-20 bg-white border border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center text-slate-300 gap-4">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center">
                            {React.cloneElement(ICONS.settings as React.ReactElement<any>, { width: 32, height: 32 })}
                        </div>
                        <p className="text-sm font-bold uppercase tracking-widest">No pending adjustments</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default StockAdjustments;
