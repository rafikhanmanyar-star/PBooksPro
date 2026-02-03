
import React from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    BarChart, Bar, Legend, PieChart, Pie, Cell
} from 'recharts';
import {
    TrendingUp, ArrowUpRight, ArrowDownRight, Users,
    Briefcase, PieChart as PieChartIcon, Activity, DollarSign
} from 'lucide-react';

const InvestmentDashboard: React.FC = () => {
    // Mock data for the dashboard
    const summaryStats = [
        { label: 'Total Capital', value: '$0.00', change: '+0%', status: 'up', icon: DollarSign, color: 'text-blue-600', bg: 'bg-blue-50' },
        { label: 'Active Cycles', value: '0', change: '+0', status: 'up', icon: Activity, color: 'text-green-600', bg: 'bg-green-50' },
        { label: 'Total Investors', value: '0', change: '+0', status: 'up', icon: Users, color: 'text-purple-600', bg: 'bg-purple-50' },
        { label: 'Avg. ROI', value: '0.0%', change: '+0%', status: 'up', icon: TrendingUp, color: 'text-amber-600', bg: 'bg-amber-50' },
    ];

    return (
        <div className="p-4 space-y-6 overflow-y-auto h-full pb-20">
            {/* Header */}
            <div>
                <h2 className="text-xl font-bold text-gray-800">Investment Overview</h2>
                <p className="text-sm text-gray-500">Track and manage your investment cycles and distributions</p>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {summaryStats.map((stat, index) => (
                    <div key={index} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-4">
                            <div className={`${stat.bg} p-2 rounded-lg`}>
                                <stat.icon className={`w-5 h-5 ${stat.color}`} />
                            </div>
                            <div className={`flex items-center text-xs font-medium ${stat.status === 'up' ? 'text-green-600' : 'text-red-600'}`}>
                                {stat.change}
                                {stat.status === 'up' ? <ArrowUpRight className="w-3 h-3 ml-1" /> : <ArrowDownRight className="w-3 h-3 ml-1" />}
                            </div>
                        </div>
                        <div>
                            <p className="text-sm text-slate-500 font-medium">{stat.label}</p>
                            <h3 className="text-2xl font-bold text-slate-900 mt-1">{stat.value}</h3>
                        </div>
                    </div>
                ))}
            </div>

            {/* Main Content Area */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Placeholder Chart 1 */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <Activity className="w-4 h-4 text-green-600" />
                            Investment Performance
                        </h3>
                    </div>
                    <div className="h-[300px] flex items-center justify-center bg-slate-50 rounded-lg border border-dashed border-slate-300">
                        <p className="text-slate-400 text-sm">Initialize investment cycles to see performance data</p>
                    </div>
                </div>

                {/* Placeholder Chart 2 */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <PieChartIcon className="w-4 h-4 text-purple-600" />
                            Portfolio Allocation
                        </h3>
                    </div>
                    <div className="h-[300px] flex items-center justify-center bg-slate-50 rounded-lg border border-dashed border-slate-300">
                        <p className="text-slate-400 text-sm">Add investments to track allocation</p>
                    </div>
                </div>
            </div>

            {/* Recent Activity Placeholder */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="font-bold text-slate-800">Recent Investment Activity</h3>
                    <button className="text-xs font-medium text-green-600 hover:text-green-700">View All</button>
                </div>
                <div className="p-8 text-center bg-slate-50/50">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 text-slate-400 mb-3">
                        <Briefcase className="w-6 h-6" />
                    </div>
                    <p className="text-slate-500 text-sm">No investment activity yet. Start by creating a new cycle.</p>
                </div>
            </div>
        </div>
    );
};

export default InvestmentDashboard;
