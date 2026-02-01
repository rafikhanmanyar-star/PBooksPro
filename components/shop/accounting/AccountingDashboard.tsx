
import React from 'react';
import { useAccounting } from '../../../context/AccountingContext';
import { CURRENCY, ICONS } from '../../../constants';
import Card from '../../ui/Card';

const AccountingDashboard: React.FC = () => {
    const { totalRevenue, grossProfit, netMargin, receivablesTotal, payablesTotal } = useAccounting();

    const metrics = [
        { label: 'Total Revenue', value: totalRevenue, icon: ICONS.trendingUp, color: 'text-indigo-600', bg: 'bg-indigo-50' },
        { label: 'Gross Profit', value: grossProfit, icon: ICONS.dollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        { label: 'Margin %', value: `${netMargin.toFixed(1)}%`, icon: ICONS.barChart, color: 'text-amber-600', bg: 'bg-amber-50', isString: true },
        { label: 'Receivables', value: receivablesTotal, icon: ICONS.arrowDownCircle, color: 'text-rose-600', bg: 'bg-rose-50' },
    ];

    return (
        <div className="space-y-8 animate-fade-in">
            {/* KPI Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {metrics.map((m, i) => (
                    <Card key={i} className="p-6 border-none shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
                        <div className={`w-14 h-14 rounded-2xl ${m.bg} ${m.color} flex items-center justify-center`}>
                            {React.cloneElement(m.icon as React.ReactElement<any>, { width: 28, height: 28 })}
                        </div>
                        <div>
                            <p className="text-xs font-black uppercase tracking-widest text-slate-400">{m.label}</p>
                            <p className="text-2xl font-black text-slate-800 tracking-tight">
                                {m.isString ? m.value : `${CURRENCY} ${m.value.toLocaleString()}`}
                            </p>
                        </div>
                    </Card>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Revenue vs Expenses Chart Placeholder */}
                <Card className="lg:col-span-2 border-none shadow-sm p-8 space-y-6">
                    <div className="flex justify-between items-center">
                        <h3 className="font-bold text-slate-800">Financial Performance (MTD)</h3>
                        <div className="flex gap-2">
                            <span className="flex items-center gap-1 text-[10px] font-bold text-indigo-600">
                                <span className="w-2 h-2 bg-indigo-600 rounded-full"></span> Revenue
                            </span>
                            <span className="flex items-center gap-1 text-[10px] font-bold text-rose-600">
                                <span className="w-2 h-2 bg-rose-600 rounded-full"></span> Expenses
                            </span>
                        </div>
                    </div>
                    <div className="h-64 bg-slate-50 rounded-2xl border border-dashed border-slate-200 flex items-center justify-center text-slate-300">
                        <div className="text-center">
                            {React.cloneElement(ICONS.barChart as React.ReactElement<any>, { width: 48, height: 48, className: 'mx-auto opacity-20' })}
                            <p className="text-xs font-bold uppercase tracking-widest mt-2">Revenue Growth Analysis</p>
                        </div>
                    </div>
                </Card>

                {/* Cash & Bank Summary */}
                <Card className="border-none shadow-sm p-6 space-y-6">
                    <h3 className="font-bold text-slate-800">Cash & Bank Balances</h3>
                    <div className="space-y-4">
                        {[
                            { name: 'Cash in Hand', balance: 45000, icon: ICONS.wallet },
                            { name: 'Main Bank (HBL)', balance: 850000, icon: ICONS.building },
                            { name: 'POS Settlement', balance: 125000, icon: ICONS.creditCard }
                        ].map((acc, i) => (
                            <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group hover:border-indigo-200 transition-all">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-slate-400 shadow-sm border border-slate-100 group-hover:text-indigo-600">
                                        {React.cloneElement(acc.icon as React.ReactElement<any>, { width: 18, height: 18 })}
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-slate-800">{acc.name}</p>
                                        <p className="text-[10px] text-slate-400 font-medium uppercase">Active</p>
                                    </div>
                                </div>
                                <div className="text-sm font-black text-slate-900 font-mono">
                                    {acc.balance.toLocaleString()}
                                </div>
                            </div>
                        ))}
                    </div>

                    <button className="w-full py-4 bg-slate-50 text-slate-400 rounded-2xl font-black text-xs uppercase tracking-[0.2em] border border-dashed border-slate-200 hover:bg-slate-100 transition-all flex items-center justify-center gap-2">
                        {ICONS.history} View Transactions
                    </button>
                </Card>
            </div>

            {/* Exception Alerts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-center gap-4">
                    <div className="p-2 bg-amber-100 text-amber-600 rounded-lg">
                        {ICONS.alertTriangle}
                    </div>
                    <div>
                        <p className="text-sm font-bold text-amber-900">Pending Reconciliation</p>
                        <p className="text-xs text-amber-700">3 settlement batches from yesterday require matching.</p>
                    </div>
                </div>
                <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-4">
                    <div className="p-2 bg-rose-100 text-rose-600 rounded-lg">
                        {ICONS.xCircle}
                    </div>
                    <div>
                        <p className="text-sm font-bold text-rose-900">Tax Filing Deadline</p>
                        <p className="text-xs text-rose-700">Monthly sales tax report is due in 2 days.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AccountingDashboard;
