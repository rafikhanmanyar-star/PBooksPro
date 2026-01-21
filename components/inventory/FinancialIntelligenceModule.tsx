import React, { useState, useEffect, useMemo } from 'react';
import { CustomerBill, InventoryItem } from '../../types';
import { customerBillApi } from '../../services/api/repositories/customerBillApi';
import { inventoryApi } from '../../services/api/repositories/inventoryApi';
import { logger } from '../../services/logger';
import { 
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
    PieChart, Pie, Cell, Legend, LineChart, Line
} from 'recharts';

const COLORS = ['#020617', '#f97316', '#10b981', '#ef4444', '#f59e0b', '#6366f1'];

const FinancialIntelligenceModule: React.FC = () => {
    const [bills, setBills] = useState<CustomerBill[]>([]);
    const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [billData, itemData] = await Promise.all([
                customerBillApi.getAll(),
                inventoryApi.getAll()
            ]);
            setBills(billData);
            setInventoryItems(itemData);
        } catch (error) {
            logger.errorCategory('inventory', 'Failed to fetch analytics data', error);
        } finally {
            setIsLoading(false);
        }
    };

    // KPI Calculations
    const stats = useMemo(() => {
        const grossRevenue = bills.reduce((sum, b) => sum + b.totalAmount, 0);
        const grossProfit = bills.reduce((sum, b) => sum + b.totalProfit, 0);
        const totalCOGS = grossRevenue - grossProfit;
        const profitMargin = grossRevenue > 0 ? (grossProfit / grossRevenue) * 100 : 0;

        return { grossRevenue, totalCOGS, grossProfit, profitMargin };
    }, [bills]);

    // Area Chart Data (Last 7 Days)
    const chartData = useMemo(() => {
        const days = Array.from({ length: 7 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - (6 - i));
            return d.toISOString().split('T')[0];
        });

        return days.map(date => {
            const dayBills = bills.filter(b => b.date.startsWith(date));
            return {
                date: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
                revenue: dayBills.reduce((sum, b) => sum + b.totalAmount, 0),
                profit: dayBills.reduce((sum, b) => sum + b.totalProfit, 0)
            };
        });
    }, [bills]);

    // Pie Chart Data (Revenue by Category)
    const categoryData = useMemo(() => {
        const catMap: Record<string, number> = {};
        bills.forEach(bill => {
            bill.items.forEach(item => {
                const invItem = inventoryItems.find(i => i.id === item.itemId);
                const cat = invItem?.category || 'Other';
                catMap[cat] = (catMap[cat] || 0) + item.total;
            });
        });

        return Object.entries(catMap).map(([name, value]) => ({ name, value }));
    }, [bills, inventoryItems]);

    // Top 5 Profitable Materials
    const topMaterials = useMemo(() => {
        const matMap: Record<string, { name: string, profit: number }> = {};
        bills.forEach(bill => {
            bill.items.forEach(item => {
                if (!matMap[item.itemId]) {
                    matMap[item.itemId] = { name: item.name, profit: 0 };
                }
                matMap[item.itemId].profit += item.profit;
            });
        });

        return Object.values(matMap)
            .sort((a, b) => b.profit - a.profit)
            .slice(0, 5);
    }, [bills]);

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { label: 'Gross Revenue', value: `₹${stats.grossRevenue.toLocaleString()}`, icon: '💰', color: 'slate' },
                    { label: 'Total COGS', value: `₹${stats.totalCOGS.toLocaleString()}`, icon: '📦', color: 'orange' },
                    { label: 'Gross Profit', value: `₹${stats.grossProfit.toLocaleString()}`, icon: '📈', color: 'emerald' },
                    { label: 'Profit Margin', value: `${stats.profitMargin.toFixed(1)}%`, icon: '🎯', color: 'indigo' },
                ].map((kpi, idx) => (
                    <div key={idx} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-2xl">{kpi.icon}</span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{kpi.label}</span>
                        </div>
                        <p className="text-2xl font-bold text-slate-950">{kpi.value}</p>
                    </div>
                ))}
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between mb-8">
                        <h3 className="text-sm font-bold font-heading uppercase tracking-widest text-slate-950">Revenue vs Profit (Last 7 Days)</h3>
                        <div className="flex gap-4">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 bg-slate-950 rounded-full"></div>
                                <span className="text-[10px] font-bold text-slate-500 uppercase">Revenue</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                                <span className="text-[10px] font-bold text-slate-500 uppercase">Profit</span>
                            </div>
                        </div>
                    </div>
                    <div className="h-80 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData}>
                                <defs>
                                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#020617" stopOpacity={0.1}/>
                                        <stop offset="95%" stopColor="#020617" stopOpacity={0}/>
                                    </linearGradient>
                                    <linearGradient id="colorProf" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#f97316" stopOpacity={0.1}/>
                                        <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis 
                                    dataKey="date" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{fontSize: 10, fontWeight: 700, fill: '#94a3b8'}} 
                                    dy={10}
                                />
                                <YAxis 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{fontSize: 10, fontWeight: 700, fill: '#94a3b8'}}
                                    tickFormatter={(val) => `₹${val >= 1000 ? (val/1000).toFixed(0) + 'k' : val}`}
                                />
                                <Tooltip 
                                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '12px' }}
                                    itemStyle={{ fontSize: '12px', fontWeight: 700 }}
                                />
                                <Area type="monotone" dataKey="revenue" stroke="#020617" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                                <Area type="monotone" dataKey="profit" stroke="#f97316" strokeWidth={3} fillOpacity={1} fill="url(#colorProf)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                    <h3 className="text-sm font-bold font-heading uppercase tracking-widest text-slate-950 mb-8 text-center">Revenue by Category</h3>
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={categoryData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {categoryData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend verticalAlign="bottom" height={36} iconType="circle" />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Material Profitability Table */}
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-sm font-bold font-heading uppercase tracking-widest text-slate-950">Top Profitable Materials</h3>
                    <button 
                        onClick={() => window.print()}
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all no-print flex items-center gap-2"
                    >
                         <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                        Export Report
                    </button>
                </div>
                <div className="overflow-hidden">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-slate-100">
                                <th className="py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Material</th>
                                <th className="py-4 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">Net Profit</th>
                                <th className="py-4 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">Contribution</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 font-sans">
                            {topMaterials.map((mat, idx) => (
                                <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="py-4 font-bold text-slate-900">{mat.name}</td>
                                    <td className="py-4 text-right font-bold text-emerald-600">₹{mat.profit.toLocaleString()}</td>
                                    <td className="py-4 text-right">
                                        <div className="flex items-center justify-end gap-3">
                                            <span className="text-xs text-slate-500 font-bold">
                                                {((mat.profit / stats.grossProfit) * 100).toFixed(1)}%
                                            </span>
                                            <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                                                <div 
                                                    className="h-full bg-emerald-500 rounded-full" 
                                                    style={{ width: `${(mat.profit / stats.grossProfit) * 100}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default FinancialIntelligenceModule;
