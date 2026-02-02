import React, { useState } from 'react';
import { ICONS } from '../../../constants';

interface KPICardProps {
    title: string;
    value: string | number;
    trend: string;
    trendValue: string;
    status: 'success' | 'warning' | 'danger';
    icon: React.ReactNode;
}

const KPICard: React.FC<KPICardProps> = ({ title, value, trend, trendValue, status, icon }) => {
    return (
        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
            <div className="flex justify-between items-start mb-4">
                <div className={`p-3 rounded-lg ${status === 'success' ? 'bg-green-50 text-green-600' : status === 'warning' ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'}`}>
                    {icon}
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${trend === 'up' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {trend === 'up' ? '↑' : '↓'} {trendValue}
                </span>
            </div>
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">{title}</h3>
            <p className="text-2xl font-bold text-gray-900 mt-2">{value}</p>
        </div>
    );
};

// Mock Chart Component (Placeholder for Recharts or similar)
const KPIChart = ({ type }: { type: 'bar' | 'line' }) => (
    <div className="w-full h-48 bg-gray-50 rounded-lg flex items-center justify-center border border-dashed border-gray-300">
        <span className="text-gray-400 text-sm">
            {type === 'bar' ? 'Bar Chart Placeholder' : 'Line Chart Placeholder'}
        </span>
    </div>
);

const KPIDashboard: React.FC = () => {
    const [period, setPeriod] = useState('Q1 2026');

    // Mock Data
    const kpis = [
        { title: 'OKR Completion Rate', value: '78%', trend: 'up', trendValue: '12%', status: 'success', icon: ICONS.checkCircle },
        { title: 'On-Time Task Delivery', value: '92%', trend: 'up', trendValue: '5%', status: 'success', icon: ICONS.clock },
        { title: 'Initiative Health', value: '85%', trend: 'down', trendValue: '2%', status: 'warning', icon: ICONS.activity },
        { title: 'Resource Utilization', value: '94%', trend: 'up', trendValue: '8%', status: 'danger', icon: ICONS.users },
    ];

    return (
        <div className="space-y-6 animate-fade-in p-6">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">KPI & Progress Monitoring</h1>
                    <p className="text-gray-500">Real-time performance metrics and strategic insights.</p>
                </div>
                <div className="flex gap-2">
                    <select
                        value={period}
                        onChange={(e) => setPeriod(e.target.value)}
                        className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 focus:ring-green-500 focus:border-green-500"
                    >
                        <option>Q1 2026</option>
                        <option>Q4 2025</option>
                        <option>FY 2025</option>
                    </select>
                    <button className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                        {ICONS.download} Export
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {kpis.map((kpi, idx) => (
                    <KPICard key={idx} {...kpi as any} />
                ))}
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold text-gray-900">Task Completion by Department</h3>
                        <button className="text-sm text-blue-600 hover:text-blue-700">View Details</button>
                    </div>
                    <KPIChart type="bar" />
                </div>
                <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold text-gray-900">Initiative Progress Trend</h3>
                        <button className="text-sm text-blue-600 hover:text-blue-700">View Details</button>
                    </div>
                    <KPIChart type="line" />
                </div>
            </div>

            {/* Detailed Metrics Table */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                    <h3 className="font-bold text-gray-900">Department Performance</h3>
                </div>
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-white">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Department</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Active OKRs</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Task Completion</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Avg. Progress</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {[
                            { dept: 'Marketing', okrs: 3, completion: '92%', progress: 75, status: 'On Track' },
                            { dept: 'Engineering', okrs: 5, completion: '85%', progress: 60, status: 'At Risk' },
                            { dept: 'Sales', okrs: 2, completion: '98%', progress: 90, status: 'On Track' },
                        ].map((row, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{row.dept}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.okrs}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.completion}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    <div className="flex items-center gap-2">
                                        <div className="w-16 bg-gray-200 rounded-full h-1.5">
                                            <div className={`h-1.5 rounded-full ${row.progress > 80 ? 'bg-green-500' : 'bg-amber-500'}`} style={{ width: `${row.progress}%` }}></div>
                                        </div>
                                        <span className="text-xs">{row.progress}%</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                                        ${row.status === 'On Track' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                        {row.status}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default KPIDashboard;
