
import React from 'react';
import { useBI } from '../../../context/BIContext';
import { ICONS, CURRENCY } from '../../../constants';
import Card from '../../ui/Card';

const ProfitabilityAnalysis: React.FC = () => {
    return (
        <div className="space-y-8 animate-in slide-in-from-bottom duration-700">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                    {ICONS.dollarSign} Margin & Yield Optimization
                </h3>
                <div className="flex gap-2">
                    <button className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl">
                        Deep Drill
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Margin Waterfall Mock */}
                <Card className="border-none shadow-sm p-8 bg-white space-y-8">
                    <h4 className="font-bold text-slate-800 uppercase tracking-widest text-[10px]">Margin Erosion Waterfall</h4>
                    <div className="space-y-6 pt-4">
                        {[
                            { label: 'Gross Sales', val: '100%', color: 'bg-indigo-600' },
                            { label: 'COGS', val: '-58%', color: 'bg-rose-500' },
                            { label: 'Operating Costs', val: '-12%', color: 'bg-rose-400' },
                            { label: 'Discounts', val: '-4%', color: 'bg-amber-400' },
                            { label: 'Net Margin', val: '26%', color: 'bg-emerald-500' }
                        ].map((step, i) => (
                            <div key={i} className="flex items-center gap-6">
                                <div className="w-32 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">{step.label}</div>
                                <div className="flex-1 h-8 bg-slate-50 rounded-lg relative overflow-hidden">
                                    <div
                                        className={`h-full ${step.color} transition-all duration-1000 shadow-sm`}
                                        style={{ width: step.val.replace('-', '') }}
                                    ></div>
                                </div>
                                <div className="w-12 text-sm font-black text-slate-800 font-mono">{step.val}</div>
                            </div>
                        ))}
                    </div>
                </Card>

                {/* Top SKU Profitability */}
                <Card className="border-none shadow-sm p-8 bg-white flex flex-col h-full">
                    <h4 className="font-bold text-slate-800 uppercase tracking-widest text-[10px] mb-8">Top Profitable SKUs</h4>
                    <div className="space-y-6 flex-1">
                        {[
                            { name: 'GROHE Premium Tap v2', margin: 42, rev: 850000, trend: '+4%' },
                            { name: 'TOTO Smart Toilet G5', margin: 38, rev: 1250000, trend: '+12%' },
                            { name: 'Kohler Basin Set - Matte', margin: 35, rev: 640000, trend: '-2%' }
                        ].map((sku, i) => (
                            <div key={i} className="flex items-center justify-between p-4 border border-slate-50 rounded-2xl hover:border-indigo-100 transition-all cursor-pointer group">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-slate-300 font-black text-xl group-hover:text-indigo-600 transition-colors">
                                        {sku.name.charAt(0)}
                                    </div>
                                    <div>
                                        <p className="text-sm font-black text-slate-800 tracking-tight">{sku.name}</p>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">{sku.rev.toLocaleString()} Revenue</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-lg font-black text-emerald-600 font-mono leading-none">{sku.margin}%</p>
                                    <p className={`text-[10px] font-bold mt-1 ${sku.trend.startsWith('+') ? 'text-emerald-400' : 'text-rose-400'}`}>{sku.trend}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            </div>

            {/* Price Sensitivity Insight */}
            <div className="p-8 bg-slate-900 rounded-[2rem] text-white relative overflow-hidden shadow-2xl">
                <div className="absolute right-0 top-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px] -mr-48 -mt-48"></div>
                <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
                    <div className="p-6 bg-white/5 border border-white/10 rounded-2xl">
                        {ICONS.trendingUp}
                    </div>
                    <div className="flex-1">
                        <p className="text-sm font-black uppercase tracking-[0.3em] text-indigo-400">Yield Opportunity Detected</p>
                        <h4 className="text-2xl font-black mt-2 tracking-tight">Price Inelasticity in "Luxury Fittings"</h4>
                        <p className="text-slate-400 text-sm mt-2 max-w-2xl">Our AI engine has detected low price sensitivity for top-tier Grohe products. A strategic 4.5% price adjustment across the region could generate an additional <span className="text-white font-black underline decoration-indigo-500 underline-offset-4">PKR 4.2M in monthly profit</span> without volume loss.</p>
                    </div>
                    <button className="px-8 py-4 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-500/20 hover:bg-indigo-500 transition-all">
                        Deploy Recommendation
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ProfitabilityAnalysis;
