
import React from 'react';
import { useBI } from '../../../context/BIContext';
import { ICONS, CURRENCY } from '../../../constants';
import Card from '../../ui/Card';

const SalesAnalytics: React.FC = () => {
    const { categoryPerformance, salesTrend } = useBI();

    return (
        <div className="space-y-8 animate-in slide-in-from-right duration-700">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                    {ICONS.trendingUp} Volume & Mix Analysis
                </h3>
                <div className="flex gap-2">
                    <button className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all">
                        Comparison Mode: OFF
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Category Mix (Heatmap/List) */}
                <Card className="border-none shadow-sm p-8 bg-white flex flex-col gap-8">
                    <h4 className="font-bold text-slate-800 uppercase tracking-widest text-[10px]">Revenue by Category Mix</h4>
                    <div className="space-y-8 flex-1">
                        {categoryPerformance.map((cat, i) => {
                            const total = categoryPerformance.reduce((sum, c) => sum + c.revenue, 0);
                            const percent = (cat.revenue / total) * 100;
                            return (
                                <div key={i} className="space-y-3 cursor-pointer group">
                                    <div className="flex justify-between items-end">
                                        <div>
                                            <p className="text-sm font-black text-slate-800 group-hover:text-indigo-600 transition-colors">{cat.category}</p>
                                            <p className="text-[10px] text-slate-400 font-bold mt-0.5">{cat.turnoverRate}x Turnover Rate</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-black text-slate-800 font-mono tracking-tight">
                                                {CURRENCY} {(cat.revenue / 1000000).toFixed(2)}M
                                            </p>
                                            <p className="text-[10px] text-indigo-500 font-black tracking-widest uppercase">{percent.toFixed(1)}% Share</p>
                                        </div>
                                    </div>
                                    <div className="h-3 bg-slate-50 rounded-full overflow-hidden flex">
                                        <div
                                            className={`h-full transition-all duration-1000 ${i === 0 ? 'bg-indigo-600' : i === 1 ? 'bg-emerald-500' : 'bg-amber-400'}`}
                                            style={{ width: `${percent}%` }}
                                        ></div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </Card>

                {/* Sales Activity Matrix */}
                <Card className="border-none shadow-sm p-8 bg-white space-y-8">
                    <h4 className="font-bold text-slate-800 uppercase tracking-widest text-[10px]">Peak Activity Matrix (7-Day)</h4>
                    <div className="grid grid-cols-7 gap-2 h-64">
                        {[...Array(35)].map((_, i) => (
                            <div
                                key={i}
                                className={`rounded-lg transition-all hover:scale-110 cursor-pointer ${Math.random() > 0.8 ? 'bg-indigo-600' :
                                        Math.random() > 0.6 ? 'bg-indigo-400' :
                                            Math.random() > 0.4 ? 'bg-indigo-200' : 'bg-slate-50'
                                    }`}
                                title={`Activity Index: ${Math.floor(Math.random() * 100)}`}
                            ></div>
                        ))}
                    </div>
                    <div className="flex justify-between text-[8px] font-black text-slate-400 uppercase tracking-[0.2em]">
                        <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
                    </div>
                </Card>
            </div>

            {/* Refund & Return Trends */}
            <Card className="border-none shadow-sm overflow-hidden bg-white">
                <div className="p-6 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center">
                    <h4 className="font-bold text-slate-800 text-sm">Return & Refund Exceptions (Last 24h)</h4>
                    <span className="px-2 py-1 bg-rose-100 text-rose-600 text-[10px] font-black rounded uppercase">Anomaly Detection Active</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400">
                            <tr>
                                <th className="px-6 py-4">Transaction ID</th>
                                <th className="px-6 py-4">Node (Branch)</th>
                                <th className="px-6 py-4">Reason Code</th>
                                <th className="px-6 py-4 text-right">Value ({CURRENCY})</th>
                                <th className="px-6 py-4">Risk Flag</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 text-xs">
                            {[
                                { id: 'TX-88921', store: 'Karachi Flagship', reason: 'Damaged Item', val: 12500, risk: 'Low' },
                                { id: 'TX-88925', store: 'Lahore Express', reason: 'Customer Changed Mind', val: 4500, risk: 'None' },
                                { id: 'TX-89012', store: 'Islamabad Centaurus', reason: 'Quality Not as Expected', val: 85000, risk: 'High (Value)' }
                            ].map((row, i) => (
                                <tr key={i} className="hover:bg-slate-50 transition-colors font-medium">
                                    <td className="px-6 py-4 font-mono font-bold text-slate-500">{row.id}</td>
                                    <td className="px-6 py-4 font-bold text-slate-700">{row.store}</td>
                                    <td className="px-6 py-4 italic text-slate-400">{row.reason}</td>
                                    <td className="px-6 py-4 text-right font-black text-slate-900">{row.val.toLocaleString()}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-0.5 rounded-[4px] text-[10px] font-bold ${row.risk.includes('High') ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-500'
                                            }`}>
                                            {row.risk}
                                        </span>
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

export default SalesAnalytics;
