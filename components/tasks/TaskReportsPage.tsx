import React, { useState, useEffect, useRef } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line, AreaChart, Area
} from 'recharts';
import { useReactToPrint } from 'react-to-print';
import { ICONS } from '../../constants';
import { tasksApi } from '../../services/api/repositories/tasksApi';
import Loading from '../ui/Loading';

const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6'];

const TaskReportsPage: React.FC = () => {
    const [reportData, setReportData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const contentRef = useRef<HTMLDivElement>(null);

    const handlePrint = useReactToPrint({
        content: () => contentRef.current,
        documentTitle: 'Team Task Report',
    });

    useEffect(() => {
        loadReport();
    }, []);

    const loadReport = async () => {
        try {
            setLoading(true);
            const data = await tasksApi.getTeamReport();
            setReportData(data);
        } catch (error) {
            console.error('Error loading report:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <Loading message="Generating Team Reports..." />;
    if (!reportData) return <div className="p-6 text-center text-gray-500">Failed to load reporting data.</div>;

    const { summary, teamProductivity, statusDistribution, trend } = reportData;

    return (
        <div className="p-8 space-y-8 animate-fade-in bg-[#fcfcfd] min-h-screen" ref={contentRef}>
            <div className="flex justify-between items-end pb-6 border-b border-gray-100">
                <div>
                    <div className="flex items-center gap-2 text-green-600 font-bold text-xs uppercase tracking-widest mb-2">
                        <span className="w-8 h-[2px] bg-green-600"></span> Analytical Suite
                    </div>
                    <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">Team Intelligence</h1>
                    <p className="text-gray-500 mt-2 font-medium">Real-time performance analytics and task execution metrics.</p>
                </div>
                <div className="flex gap-3 no-print">
                    <button
                        onClick={() => handlePrint()}
                        className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-bold shadow-lg hover:bg-gray-800 transition-all hover:scale-105 active:scale-95"
                    >
                        {ICONS.print} Export PDF
                    </button>
                    <button
                        onClick={loadReport}
                        className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 shadow-sm transition-all"
                    >
                        {ICONS.rotateCw} Refresh
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { label: 'Total Tasks', value: summary.total, icon: ICONS.layers, color: 'from-blue-500 to-indigo-600', iconColor: 'text-blue-600', bg: 'bg-blue-50' },
                    { label: 'Completed', value: summary.completed, icon: ICONS.checkCircle, color: 'from-emerald-400 to-green-600', iconColor: 'text-green-600', bg: 'bg-green-50' },
                    { label: 'In Progress', value: summary.in_progress, icon: ICONS.clock, color: 'from-amber-400 to-orange-500', iconColor: 'text-amber-600', bg: 'bg-amber-50' },
                    { label: 'Overdue', value: summary.overdue, icon: ICONS.alertCircle, color: 'from-rose-500 to-red-700', iconColor: 'text-red-600', bg: 'bg-red-50' },
                ].map((stat, idx) => (
                    <div key={idx} className="relative overflow-hidden bg-white p-6 rounded-2xl border border-gray-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] hover:shadow-xl transition-all group">
                        <div className="flex justify-between items-start mb-4">
                            <div className={`p-3 rounded-xl ${stat.bg} ${stat.iconColor} group-hover:scale-110 transition-transform`}>
                                {stat.icon}
                            </div>
                            <div className="text-right">
                                <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">{stat.label}</p>
                                <p className="text-3xl font-black text-gray-900 mt-1">{stat.value}</p>
                            </div>
                        </div>
                        <div className="relative h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                            <div
                                className={`absolute inset-y-0 left-0 bg-gradient-to-r ${stat.color} transition-all duration-1000 ease-out`}
                                style={{ width: `${(stat.value / (summary.total || 1)) * 100}%` }}
                            ></div>
                        </div>
                        <p className="text-[10px] font-bold text-gray-400 mt-2 text-right">
                            {Math.round((stat.value / (summary.total || 1)) * 100)}% of total scope
                        </p>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                {/* Team Productivity Bar Chart */}
                <div className="lg:col-span-3 bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
                    <div className="flex justify-between items-center mb-10">
                        <h3 className="text-xl font-black text-gray-900 flex items-center gap-3">
                            <div className="w-2 h-8 bg-blue-600 rounded-full"></div>
                            Execution by Member
                        </h3>
                        <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-widest text-gray-400">
                            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500"></span> Completed</div>
                            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-gray-200"></span> Backlog</div>
                        </div>
                    </div>
                    <div className="h-[400px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={teamProductivity} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f8fafc" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8', fontWeight: 600 }} dy={10} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8', fontWeight: 600 }} />
                                <Tooltip
                                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', padding: '12px' }}
                                    cursor={{ fill: '#f1f5f9', opacity: 0.4 }}
                                />
                                <Bar dataKey="completed_tasks" name="Completed" fill="#10B981" radius={[6, 6, 0, 0]} barSize={24} />
                                <Bar dataKey="total_tasks" name="Total Assigned" fill="#e2e8f0" radius={[6, 6, 0, 0]} barSize={24} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Status Distribution Pie Chart */}
                <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
                    <h3 className="text-xl font-black text-gray-900 mb-10 flex items-center gap-3">
                        <div className="w-2 h-8 bg-purple-600 rounded-full"></div>
                        Portfolio Mix
                    </h3>
                    <div className="h-[400px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={statusDistribution}
                                    cx="50%"
                                    cy="45%"
                                    innerRadius={90}
                                    outerRadius={130}
                                    paddingAngle={8}
                                    dataKey="value"
                                    stroke="none"
                                >
                                    {statusDistribution.map((entry: any, index: number) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}
                                />
                                <Legend
                                    verticalAlign="bottom"
                                    align="center"
                                    iconType="circle"
                                    wrapperStyle={{ paddingTop: '20px', fontWeight: 600, fontSize: '12px', color: '#64748b' }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Completion Trend */}
                <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
                    <h3 className="text-xl font-black text-gray-900 mb-8 flex items-center gap-3">
                        <div className="w-2 h-8 bg-emerald-600 rounded-full"></div>
                        Velocity Trend
                    </h3>
                    <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={trend}>
                                <defs>
                                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.2} />
                                        <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f8fafc" />
                                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} dy={10} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                                />
                                <Area type="monotone" dataKey="count" name="Completed" stroke="#10B981" fillOpacity={1} fill="url(#colorCount)" strokeWidth={4} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Team Leaderboard Table */}
                <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden h-full">
                    <div className="p-8 border-b border-gray-50 bg-gray-50/50">
                        <h3 className="text-xl font-black text-gray-900">Performance Index</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="text-gray-400 font-bold text-[10px] uppercase tracking-widest border-b border-gray-50">
                                <tr>
                                    <th className="px-8 py-5">Initiator</th>
                                    <th className="px-8 py-5 text-center">Velocity</th>
                                    <th className="px-8 py-5 text-right">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 text-sm">
                                {teamProductivity.map((user: any) => (
                                    <tr key={user.user_id} className="group hover:bg-gray-50/80 transition-all">
                                        <td className="px-8 py-5">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-black text-sm shadow-md group-hover:rotate-6 transition-transform">
                                                    {user.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-gray-900">{user.name}</p>
                                                    <p className="text-[11px] text-gray-400 font-medium">Core Member</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-8 py-5">
                                            <div className="flex flex-col items-center">
                                                <span className="text-sm font-black text-gray-900 mb-1">{Math.round((user.completed_tasks / user.total_tasks) * 100)}%</span>
                                                <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-indigo-500 rounded-full transition-all duration-1000"
                                                        style={{ width: `${(user.completed_tasks / user.total_tasks) * 100}%` }}
                                                    ></div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-8 py-5 text-right">
                                            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-tight ${(user.completed_tasks / user.total_tasks) >= 0.8 ? 'bg-emerald-50 text-emerald-600' :
                                                    (user.completed_tasks / user.total_tasks) >= 0.5 ? 'bg-blue-50 text-blue-600' : 'bg-rose-50 text-rose-600'
                                                }`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${(user.completed_tasks / user.total_tasks) >= 0.8 ? 'bg-emerald-500' :
                                                        (user.completed_tasks / user.total_tasks) >= 0.5 ? 'bg-blue-500' : 'bg-rose-500'
                                                    }`}></span>
                                                {(user.completed_tasks / user.total_tasks) >= 0.8 ? 'Elite' :
                                                    (user.completed_tasks / user.total_tasks) >= 0.5 ? 'Stable' : 'Review'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TaskReportsPage;
