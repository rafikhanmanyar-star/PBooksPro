
import React from 'react';
import { useLoyalty } from '../../../context/LoyaltyContext';
import { ICONS } from '../../../constants';
import Card from '../../ui/Card';

const TierMatrix: React.FC = () => {
    const { tiers, programs } = useLoyalty();

    return (
        <div className="space-y-8 animate-fade-in text-slate-800">
            {/* Active Rules Snapshot */}
            <div className="flex justify-between items-center mb-4 px-2">
                <div>
                    <h3 className="text-lg font-black text-slate-800 tracking-tight">Enterprise Rule Engine</h3>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Global configurations for earning & burning.</p>
                </div>
                <div className="flex gap-3">
                    <button className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg hover:bg-black transition-all">
                        {ICONS.settings} Configuration Wizard
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Earning Rules */}
                <Card className="border-none shadow-sm p-8 bg-white space-y-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                            {ICONS.plus}
                        </div>
                        <h4 className="font-black text-slate-800 uppercase tracking-widest text-sm">Base Earning Rules</h4>
                    </div>
                    {programs.map(prog => (
                        <div key={prog.id} className="p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
                            <div className="flex justify-between items-center pb-4 border-b border-slate-200/50">
                                <span className="text-xs font-bold text-slate-500 uppercase">Conversion Ratio</span>
                                <span className="text-sm font-black text-slate-900 font-mono">1 Point per {1 / prog.earnRate} PKR</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-bold text-slate-500 uppercase">Min Redemption</span>
                                <span className="text-sm font-black text-indigo-600 font-mono">{prog.minRedeemPoints} Pts</span>
                            </div>
                        </div>
                    ))}
                    <div className="space-y-3">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Bonus Multipliers</p>
                        <div className="flex flex-wrap gap-2">
                            <span className="px-3 py-1.5 bg-amber-50 border border-amber-100 text-amber-600 rounded-full text-[10px] font-black uppercase">Weekend 1.2x</span>
                            <span className="px-3 py-1.5 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-full text-[10px] font-black uppercase">Birthday 2.0x</span>
                            <span className="px-3 py-1.5 bg-rose-50 border border-rose-100 text-rose-600 rounded-full text-[10px] font-black uppercase">Welcome Bonus: 500 Pts</span>
                        </div>
                    </div>
                </Card>

                {/* Redemption Rules */}
                <Card className="border-none shadow-sm p-8 bg-white space-y-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
                            {ICONS.trash}
                        </div>
                        <h4 className="font-black text-slate-800 uppercase tracking-widest text-sm">Redemption Controls</h4>
                    </div>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center p-4 bg-rose-50/30 rounded-xl border border-rose-100">
                            <div>
                                <p className="text-xs font-black text-rose-900">Maximum Redemption / Bill</p>
                                <p className="text-[10px] text-rose-600 opacity-70">Capped to prevent point dumping.</p>
                            </div>
                            <span className="text-sm font-black text-rose-900">30% of Bill</span>
                        </div>
                        <div className="flex justify-between items-center p-4 bg-slate-50 rounded-xl border border-slate-100">
                            <div>
                                <p className="text-xs font-black text-slate-800">Point Expiry Period</p>
                                <p className="text-[10px] text-slate-400">Rolling window for issued points.</p>
                            </div>
                            <span className="text-sm font-black text-slate-900">12 Months</span>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Tier Ladder Matrix */}
            <div className="mt-12 space-y-6 px-2">
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-widest text-center">Benefit Tier Lifecycle Matrix</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {tiers.map((t, i) => (
                        <Card key={i} className={`p-8 border-none shadow-xl transform transition-all hover:-translate-y-2 flex flex-col items-center relative overflow-hidden ${t.tier === 'Platinum' ? 'bg-slate-900 text-white' :
                                t.tier === 'Gold' ? 'bg-amber-50 border-t-8 border-amber-400' :
                                    'bg-white border-t-8 border-slate-200'
                            }`}>
                            {t.tier === 'Platinum' && (
                                <div className="absolute top-0 right-0 p-4 opacity-10">
                                    {React.cloneElement(ICONS.trophy as React.ReactElement<any>, { width: 120, height: 120 })}
                                </div>
                            )}
                            <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-6 shadow-2xl ${t.tier === 'Platinum' ? 'bg-indigo-500/20 text-indigo-300' :
                                    t.tier === 'Gold' ? 'bg-amber-100 text-amber-600' :
                                        'bg-slate-100 text-slate-400'
                                }`}>
                                {React.cloneElement(ICONS.trophy as React.ReactElement<any>, { width: 32, height: 32 })}
                            </div>
                            <h4 className="text-2xl font-black mb-1">{t.tier}</h4>
                            <p className={`text-[10px] font-black uppercase tracking-widest inline-block px-3 py-1 rounded-full mb-8 ${t.tier === 'Platinum' ? 'bg-indigo-500/30 text-indigo-400' : 'bg-slate-200/50 text-slate-500'
                                }`}>
                                Threshold: ${t.threshold.toLocaleString()}
                            </p>

                            <div className="w-full space-y-4 flex-1">
                                <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2">Member Privileges</p>
                                {t.benefits.map((b, idx) => (
                                    <div key={idx} className="flex items-center gap-2 text-xs font-bold leading-relaxed">
                                        <div className={`w-1.5 h-1.5 rounded-full ${t.tier === 'Platinum' ? 'bg-indigo-400' : 'bg-emerald-500'}`}></div>
                                        {b}
                                    </div>
                                ))}
                            </div>

                            <div className="mt-8 pt-6 border-t border-slate-200/20 w-full text-center">
                                <span className={`text-xl font-black font-mono ${t.tier === 'Platinum' ? 'text-indigo-400' : 'text-slate-900'}`}>{t.multiplier}x</span>
                                <p className="text-[9px] font-black uppercase tracking-tighter opacity-40 mt-1">Multiplied Earn Velocity</p>
                            </div>
                        </Card>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default TierMatrix;
