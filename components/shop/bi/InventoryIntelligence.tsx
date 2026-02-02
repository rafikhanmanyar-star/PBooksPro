
import React from 'react';
import { useBI } from '../../../context/BIContext';
import { ICONS, CURRENCY } from '../../../constants';
import Card from '../../ui/Card';
import InventoryAuditWizard from './InventoryAuditWizard';

const InventoryIntelligence: React.FC = () => {
    const { categoryPerformance } = useBI();

    const [isAuditWizardOpen, setIsAuditWizardOpen] = React.useState(false);

    return (
        <div className="space-y-8 animate-in zoom-in duration-700">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                    {ICONS.package} Supply Chain & Inventory IQ
                </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                    { label: 'Stock Valuation', value: `${CURRENCY} 85.4M`, icon: ICONS.dollarSign, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                    { label: 'Avg Turnover', value: '3.4x', icon: ICONS.history, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                    { label: 'Days of Stock', value: '42 Days', icon: ICONS.barChart, color: 'text-amber-600', bg: 'bg-amber-50' },
                ].map((stat, i) => (
                    <Card key={i} className="p-6 border-none shadow-sm flex items-center gap-4 bg-white">
                        <div className={`w-12 h-12 rounded-xl ${stat.bg} ${stat.color} flex items-center justify-center`}>
                            {React.cloneElement(stat.icon as React.ReactElement<any>, { width: 24, height: 24 })}
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{stat.label}</p>
                            <p className="text-xl font-black text-slate-800 tracking-tight">{stat.value}</p>
                        </div>
                    </Card>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Stock Aging Chart */}
                <Card className="lg:col-span-2 border-none shadow-sm p-8 bg-white space-y-8">
                    <h4 className="font-bold text-slate-800 uppercase tracking-widest text-[10px]">Stock Aging Bucket (Days)</h4>
                    <div className="flex gap-4 h-64 items-end justify-between px-4">
                        {[
                            { label: '0-30', val: 45, color: 'bg-emerald-500' },
                            { label: '31-60', val: 28, color: 'bg-indigo-500' },
                            { label: '61-90', val: 15, color: 'bg-amber-500' },
                            { label: '90+', val: 12, color: 'bg-rose-500' }
                        ].map((bucket, i) => (
                            <div key={i} className="flex-1 flex flex-col items-center gap-4">
                                <div className="text-xs font-black text-slate-800">{bucket.val}%</div>
                                <div
                                    className={`w-full ${bucket.color} rounded-t-xl transition-all duration-1000 shadow-lg`}
                                    style={{ height: `${bucket.val * 2}px` }}
                                ></div>
                                <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{bucket.label}</span>
                            </div>
                        ))}
                    </div>
                </Card>

                {/* Critical Movers */}
                <Card className="border-none shadow-sm p-8 bg-white space-y-6">
                    <h4 className="font-bold text-slate-800 uppercase tracking-widest text-[10px]">Movement IQ</h4>
                    <div className="space-y-6">
                        <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 relative overflow-hidden group">
                            <div className="absolute right-0 top-0 opacity-10 p-2 transform rotate-12 group-hover:scale-125 transition-transform">
                                {ICONS.trendingUp}
                            </div>
                            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Fastest Movers</p>
                            <p className="text-sm font-black text-emerald-900 mt-1">CP Fittings - Premium Range</p>
                            <p className="text-[10px] text-emerald-700 mt-1">Turnover: 8.4x / Mo</p>
                        </div>
                        <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100 relative overflow-hidden group">
                            <div className="absolute right-0 top-0 opacity-10 p-2 transform -rotate-12 group-hover:scale-125 transition-transform">
                                {ICONS.trendingDown}
                            </div>
                            <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest">Dead Stock</p>
                            <p className="text-sm font-black text-rose-900 mt-1">Tiles - Legacy Batch (2024)</p>
                            <p className="text-[10px] text-rose-700 mt-1">No Sale in 120 Days</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setIsAuditWizardOpen(true)}
                        className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-black transition-all"
                    >
                        Inventory Audit Wizard
                    </button>
                </Card>
            </div>

            <InventoryAuditWizard
                isOpen={isAuditWizardOpen}
                onClose={() => setIsAuditWizardOpen(false)}
            />
        </div>
    );

};

export default InventoryIntelligence;
