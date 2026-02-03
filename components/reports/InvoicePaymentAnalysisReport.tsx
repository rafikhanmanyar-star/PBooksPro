
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { InvoiceType, TransactionType } from '../../types';
import Select from '../ui/Select';
import { ICONS, CURRENCY } from '../../constants';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell
} from 'recharts';
import { format } from 'date-fns';

const COLORS = ['#00C49F', '#FFBB28', '#FF8042', '#0088FE'];

const InvoicePaymentAnalysisReport: React.FC = () => {
    const { state } = useAppContext();
    const [groupBy, setGroupBy] = useState<'tenant' | 'owner' | 'property'>('tenant');
    const [selectedEntityId, setSelectedEntityId] = useState<string>('all');
    const [dateRange, setDateRange] = useState<'all' | 'this_year' | 'last_year'>('this_year');

    // 1. Get List of Entities for Dropdown
    const entities = useMemo(() => {
        if (groupBy === 'tenant') {
            // Filter contacts that have at least one rental invoice
            const tenantIds = new Set(state.invoices.filter(i => i.invoiceType === InvoiceType.RENTAL).map(i => i.contactId));
            return state.contacts.filter(c => tenantIds.has(c.id)).map(c => ({ id: c.id, name: c.name }));
        } else if (groupBy === 'owner') {
            // Owners are linked to properties
            const ownerIds = new Set(state.properties.map(p => p.ownerId).filter(Boolean));
            return state.contacts.filter(c => ownerIds.has(c.id)).map(c => ({ id: c.id, name: c.name }));
        } else {
            return state.properties.map(p => ({ id: p.id, name: p.name }));
        }
    }, [groupBy, state.contacts, state.properties, state.invoices]);

    // 2. Filter Data
    const { filteredInvoices, filteredPayments } = useMemo(() => {
        let invoices = state.invoices.filter(i => i.invoiceType === InvoiceType.RENTAL);

        // Apply Date Range Filter
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
        const lastYearEnd = new Date(now.getFullYear() - 1, 11, 31);

        if (dateRange === 'this_year') {
            invoices = invoices.filter(i => new Date(i.issueDate) >= startOfYear);
        } else if (dateRange === 'last_year') {
            invoices = invoices.filter(i => {
                const d = new Date(i.issueDate);
                return d >= lastYearStart && d <= lastYearEnd;
            });
        }

        // Apply Entity Filter
        if (selectedEntityId !== 'all') {
            if (groupBy === 'tenant') {
                invoices = invoices.filter(i => i.contactId === selectedEntityId);
            } else if (groupBy === 'owner') {
                // Invoices -> Property -> Owner
                const propertiesOwned = new Set(state.properties.filter(p => p.ownerId === selectedEntityId).map(p => p.id));
                invoices = invoices.filter(i => i.propertyId && propertiesOwned.has(i.propertyId));
            } else { // Property
                invoices = invoices.filter(i => i.propertyId === selectedEntityId);
            }
        }

        // Get related payments (transactions)
        // We filter transactions that are linked to these specific invoices
        const invoiceIds = new Set(invoices.map(i => i.id));
        const payments = state.transactions.filter(t =>
            t.type === TransactionType.INCOME &&
            t.invoiceId &&
            invoiceIds.has(t.invoiceId)
        );

        return { filteredInvoices: invoices, filteredPayments: payments };
    }, [state.invoices, state.transactions, state.properties, groupBy, selectedEntityId, dateRange]);

    // 3. Analytics Data Preparation
    const summary = useMemo(() => {
        const totalInvoiced = filteredInvoices.reduce((sum, i) => sum + i.amount, 0);
        const totalPaid = filteredInvoices.reduce((sum, i) => sum + i.paidAmount, 0); // Use invoice paidAmount for accuracy
        const outstanding = totalInvoiced - totalPaid;
        const collectionRate = totalInvoiced > 0 ? (totalPaid / totalInvoiced) * 100 : 0;

        return { totalInvoiced, totalPaid, outstanding, collectionRate };
    }, [filteredInvoices]);

    const chartData = useMemo(() => {
        // Group by Month
        const monthlyData: Record<string, { name: string, invoiced: number, collected: number }> = {};

        filteredInvoices.forEach(inv => {
            const monthKey = format(new Date(inv.issueDate), 'yyyy-MM');
            const monthName = format(new Date(inv.issueDate), 'MMM yyyy');

            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = { name: monthName, invoiced: 0, collected: 0 };
            }
            monthlyData[monthKey].invoiced += inv.amount;
            // For simplicity in this chart, we attribute collection to the invoice month
            // A more strictly cash-flow chart would look at transaction date
            monthlyData[monthKey].collected += inv.paidAmount;
        });

        return Object.values(monthlyData).sort((a, b) => new Date(a.name).getTime() - new Date(b.name).getTime());
    }, [filteredInvoices]);

    const statusData = useMemo(() => {
        const statusCounts = { Paid: 0, Partial: 0, Unpaid: 0, Overdue: 0 };
        filteredInvoices.forEach(inv => {
            if (inv.status === 'Paid') statusCounts.Paid += inv.amount;
            else if (inv.status === 'Partially Paid') statusCounts.Partial += inv.amount;
            else if (inv.status === 'Overdue') statusCounts.Overdue += inv.amount;
            else statusCounts.Unpaid += inv.amount;
        });

        return [
            { name: 'Paid', value: statusCounts.Paid },
            { name: 'Partial', value: statusCounts.Partial },
            { name: 'Overdue', value: statusCounts.Overdue },
            { name: 'Unpaid', value: statusCounts.Unpaid },
        ].filter(d => d.value > 0);
    }, [filteredInvoices]);


    return (
        <div className="flex flex-col h-full space-y-6 p-1">
            {/* Header / Controls */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap gap-4 items-end">
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-500 uppercase">Analyze By</label>
                    <div className="flex bg-slate-100 p-1 rounded-lg">
                        {(['tenant', 'owner', 'property'] as const).map(opt => (
                            <button
                                key={opt}
                                onClick={() => { setGroupBy(opt); setSelectedEntityId('all'); }}
                                className={`px-4 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all capitalize ${groupBy === opt
                                        ? 'bg-white text-indigo-600 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700'
                                    }`}
                            >
                                {opt}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex flex-col gap-1 flex-grow min-w-[200px]">
                    <label className="text-xs font-semibold text-slate-500 uppercase">Select Entity</label>
                    <Select
                        value={selectedEntityId}
                        onChange={(e) => setSelectedEntityId(e.target.value)}
                        className="!w-full"
                    >
                        <option value="all">Check All {groupBy}s</option>
                        {entities.map(e => (
                            <option key={e.id} value={e.id}>{e.name}</option>
                        ))}
                    </Select>
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-500 uppercase">Time Period</label>
                    <Select
                        value={dateRange}
                        onChange={(e) => setDateRange(e.target.value as any)}
                        className="!w-40"
                    >
                        <option value="all">All Time</option>
                        <option value="this_year">This Year</option>
                        <option value="last_year">Last Year</option>
                    </Select>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                    <div className="text-slate-500 text-sm font-medium">Total Invoiced</div>
                    <div className="text-2xl font-bold text-slate-900 mt-1">{CURRENCY} {summary.totalInvoiced.toLocaleString()}</div>
                    <div className="text-xs text-slate-400 mt-1">Gross potential rent</div>
                </div>
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                    <div className="text-slate-500 text-sm font-medium">Total Collected</div>
                    <div className="text-2xl font-bold text-emerald-600 mt-1">{CURRENCY} {summary.totalPaid.toLocaleString()}</div>
                    <div className="text-xs text-slate-400 mt-1">Actual revenue received</div>
                </div>
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                    <div className="text-slate-500 text-sm font-medium">Outstanding Balance</div>
                    <div className="text-2xl font-bold text-rose-600 mt-1">{CURRENCY} {summary.outstanding.toLocaleString()}</div>
                    <div className="text-xs text-slate-400 mt-1">Unpaid invoices</div>
                </div>
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                    <div className="text-slate-500 text-sm font-medium">Collection Rate</div>
                    <div className={`text-2xl font-bold mt-1 ${summary.collectionRate >= 90 ? 'text-emerald-600' : summary.collectionRate >= 75 ? 'text-amber-500' : 'text-rose-600'}`}>
                        {summary.collectionRate.toFixed(1)}%
                    </div>
                    <div className="text-xs text-slate-400 mt-1">Performance metric</div>
                </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-80">
                <div className="lg:col-span-2 bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                    <h3 className="text-sm font-bold text-slate-700 mb-4">Financial Trends</h3>
                    <div className="flex-grow w-full min-h-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={12} tick={{ fill: '#64748B' }} />
                                <YAxis axisLine={false} tickLine={false} fontSize={12} tick={{ fill: '#64748B' }} tickFormatter={(val) => `${val / 1000}k`} />
                                <Tooltip
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                                    cursor={{ fill: '#F1F5F9' }}
                                />
                                <Legend wrapperStyle={{ fontSize: '12px' }} />
                                <Bar dataKey="invoiced" name="Invoiced" fill="#94A3B8" radius={[4, 4, 0, 0]} maxBarSize={50} />
                                <Bar dataKey="collected" name="Collected" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={50} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                    <h3 className="text-sm font-bold text-slate-700 mb-4">Payment Status Dist.</h3>
                    <div className="flex-grow w-full min-h-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={statusData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {statusData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend wrapperStyle={{ fontSize: '12px' }} layout="vertical" verticalAlign="middle" align="right" />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Detailed Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col flex-grow">
                <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="text-sm font-bold text-slate-700">Detailed Invoice List</h3>
                </div>
                <div className="overflow-auto flex-grow">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 font-medium sticky top-0 z-10">
                            <tr>
                                <th className="p-3 border-b border-slate-200">Date</th>
                                <th className="p-3 border-b border-slate-200">Invoice #</th>
                                <th className="p-3 border-b border-slate-200">Entity</th>
                                <th className="p-3 border-b border-slate-200 text-right">Amount</th>
                                <th className="p-3 border-b border-slate-200 text-right">Paid</th>
                                <th className="p-3 border-b border-slate-200 text-right">Balance</th>
                                <th className="p-3 border-b border-slate-200 text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredInvoices.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="p-8 text-center text-slate-400 italic">
                                        No invoices found for the selected criteria.
                                    </td>
                                </tr>
                            ) : (
                                filteredInvoices.map(inv => (
                                    <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="p-3 text-slate-600">{format(new Date(inv.issueDate), 'dd MMM yyyy')}</td>
                                        <td className="p-3 font-medium text-slate-700">#{inv.invoiceNumber}</td>
                                        <td className="p-3 text-slate-600">
                                            {groupBy === 'tenant' ? state.contacts.find(c => c.id === inv.contactId)?.name
                                                : groupBy === 'owner' ? state.properties.find(p => p.id === inv.propertyId)?.name
                                                    : state.contacts.find(c => c.id === inv.contactId)?.name}
                                        </td>
                                        <td className="p-3 text-slate-700 text-right font-medium">{CURRENCY} {inv.amount.toLocaleString()}</td>
                                        <td className="p-3 text-emerald-600 text-right">{CURRENCY} {inv.paidAmount.toLocaleString()}</td>
                                        <td className="p-3 text-rose-600 text-right font-medium">{CURRENCY} {(inv.amount - inv.paidAmount).toLocaleString()}</td>
                                        <td className="p-3 text-center">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase
                                                ${inv.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' :
                                                    inv.status === 'Overdue' ? 'bg-rose-100 text-rose-700' :
                                                        inv.status === 'Partially Paid' ? 'bg-amber-100 text-amber-700' :
                                                            'bg-slate-100 text-slate-600'}`}>
                                                {inv.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default InvoicePaymentAnalysisReport;
