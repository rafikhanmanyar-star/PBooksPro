
import React, { useMemo, useState, useEffect, useCallback, memo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { useLookupMaps } from '../../hooks/useLookupMaps';
import { Page, Project, TransactionType, InvoiceStatus, RentalAgreementStatus } from '../../types';
import { useKpis } from '../../context/KPIContext';
import KPICard from './KPI_Card';
import Button from '../ui/Button';
import { ICONS, CURRENCY } from '../../constants';
import { formatRoundedNumber } from '../../utils/numberUtils';
import DashboardConfigModal from './DashboardConfigModal';
import Card from '../ui/Card';
import SimpleInvoiceBillItem from './SimpleInvoiceBillItem';
import ProjectCategoryDetailModal from '../reports/ProjectCategoryDetailModal';
import Modal from '../ui/Modal';
import TransferStatisticsReport from '../reports/TransferStatisticsReport';
import ProjectBuildingFundsReport from './ProjectBuildingFundsReport';
import BankAccountsReport from './BankAccountsReport';
import Tabs from '../ui/Tabs';
import { formatDate } from '../../utils/dateUtils';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';

const DashboardPage: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const lookupMaps = useLookupMaps();
    const { allKpis, openDrilldown } = useKpis();
    const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
    const [isTransferReportOpen, setIsTransferReportOpen] = useState(false);
    const [greeting, setGreeting] = useState('');
    const [activeReportTab, setActiveReportTab] = useState('Overview Reports');

    const [detailModalData, setDetailModalData] = useState<{
        isOpen: boolean;
        project: Project | null;
        startDate: Date;
        endDate: Date;
    }>({ isOpen: false, project: null, startDate: new Date(), endDate: new Date() });

    const isAdmin = state.currentUser?.role === 'Admin';

    useEffect(() => {
        const h = new Date().getHours();
        setGreeting(h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening');
    }, []);

    const navigate = (page: Page) => dispatch({ type: 'SET_PAGE', payload: page });

    const kpisToDisplay = useMemo(() => {
        const visibleKpiIds = Array.isArray(state.dashboardConfig?.visibleKpis) ? state.dashboardConfig.visibleKpis : [];
        // If no config, show defaults
        const idsToShow = visibleKpiIds.length > 0 ? visibleKpiIds : ['total_income', 'total_expenses', 'net_profit', 'total_balance'];

        return idsToShow.map(id => {
            const kpiDef = allKpis.find(k => k.id === id);
            if (!kpiDef) return null;
            const amount = kpiDef.getData ? kpiDef.getData(state) : 0;
            return { ...kpiDef, amount, onClick: () => openDrilldown(kpiDef) };
        }).filter((k): k is Exclude<typeof k, null> => k !== null);
    }, [state.dashboardConfig, state, allKpis, openDrilldown]);

    // --- Chart Data ---
    const excludedCategoryIds = useMemo(() => state.categories.filter(c => c.name === 'Owner Equity' || c.name === 'Owner Withdrawn').map(c => c.id), [state.categories]);

    const cashFlowData = useMemo(() => {
        if (!isAdmin) return [];
        const months: Record<string, { income: number, expense: number, name: string }> = {};
        for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            months[key] = { income: 0, expense: 0, name: d.toLocaleString('default', { month: 'short' }) };
        }
        state.transactions.forEach(tx => {
            if (tx.categoryId && excludedCategoryIds.includes(tx.categoryId)) return;
            const key = tx.date.slice(0, 7);
            if (months[key]) {
                if (tx.type === TransactionType.INCOME) months[key].income += tx.amount;
                else if (tx.type === TransactionType.EXPENSE) months[key].expense += tx.amount;
            }
        });
        return Object.values(months);
    }, [state.transactions, excludedCategoryIds, isAdmin]);

    const recentActivity = useMemo(() => {
        // Combine recent invoices and payments
        const invoices = state.invoices.slice(-3).map(i => ({
            id: i.id, type: 'Invoice', title: `Invoice #${i.invoiceNumber}`, amount: i.totalAmount, date: i.date, status: i.status
        }));
        const txs = state.transactions.slice(-3).map(t => ({
            id: t.id, type: t.type === TransactionType.INCOME ? 'Income' : 'Expense', title: t.description || 'Transaction', amount: t.amount, date: t.date, status: 'Completed'
        }));
        return [...invoices, ...txs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);
    }, [state.invoices, state.transactions]);

    return (
        <div className="space-y-4 md:space-y-6 max-w-7xl mx-auto">

            {/* Welcome Banner */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 md:gap-4">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-slate-900">{greeting}, {state.currentUser?.name?.split(' ')[0]}</h1>
                    <p className="text-slate-500 text-xs md:text-sm mt-1">Here's what's happening with your projects today.</p>
                </div>
                <div className="flex items-center gap-2 md:gap-3 w-full md:w-auto">
                    <Button variant="secondary" onClick={() => setIsConfigModalOpen(true)} className="text-slate-600 border-slate-200 hover:bg-white text-xs md:text-sm flex-1 md:flex-none">
                        Customize
                    </Button>
                </div>
            </div>

            {/* Overview Reports & Bank Accounts - Top Section */}
            <div className="flex flex-col rounded-2xl overflow-hidden">
                <div className="flex-shrink-0">
                    <Tabs
                        variant="browser"
                        tabs={['Overview Reports', 'Bank Accounts']}
                        activeTab={activeReportTab}
                        onTabClick={setActiveReportTab}
                    />
                </div>
                <div className="flex-grow bg-white rounded-b-2xl -mt-px p-4 border border-slate-200 border-t-0 shadow-sm">
                    {activeReportTab === 'Overview Reports' ? <ProjectBuildingFundsReport /> : <BankAccountsReport />}
                </div>
            </div>

            {/* Custom KPIs & Dashboard Widgets Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-6">

                {/* KPI Cards Row */}
                {kpisToDisplay.slice(0, 4).map((kpi, idx) => (
                    <div key={kpi.id} className="col-span-1">
                        <KPICard
                            title={kpi.title}
                            amount={kpi.amount}
                            icon={kpi.icon || ICONS.barChart}
                            onClick={kpi.onClick}
                            // Add dummy trend data for visual richness (in real app, calculate this)
                            trend={idx === 0 ? { value: 12, isPositive: true } : idx === 1 ? { value: 4, isPositive: false } : undefined}
                        />
                    </div>
                ))}

                {/* Main Chart Section (Span 2 or 3 cols) */}
                <div className="col-span-1 md:col-span-2 lg:col-span-3 bg-white p-4 md:p-6 rounded-2xl border border-slate-200/60 shadow-sm relative overflow-hidden">
                    <div className="flex justify-between items-center mb-4 md:mb-6">
                        <h3 className="text-base md:text-lg font-bold text-slate-800">Cash Flow</h3>
                        <div className="flex gap-2 md:gap-3">
                            <div className="flex items-center gap-1 md:gap-1.5 text-[10px] md:text-xs font-medium text-slate-500">
                                <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-emerald-500"></span> <span className="hidden sm:inline">Income</span>
                            </div>
                            <div className="flex items-center gap-1 md:gap-1.5 text-[10px] md:text-xs font-medium text-slate-500">
                                <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-rose-500"></span> <span className="hidden sm:inline">Expense</span>
                            </div>
                        </div>
                    </div>

                    {isAdmin ? (
                        <div className="h-48 md:h-72 w-full min-h-[192px] relative">
                            {cashFlowData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                    <AreaChart data={cashFlowData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="gIncome" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="gExpense" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2} />
                                            <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                                    <RechartsTooltip
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                        formatter={(value: number) => [CURRENCY + ' ' + formatRoundedNumber(value), '']}
                                    />
                                    <Area type="monotone" dataKey="income" stroke="#10b981" strokeWidth={3} fillUrl="url(#gIncome)" />
                                    <Area type="monotone" dataKey="expense" stroke="#f43f5e" strokeWidth={3} fillUrl="url(#gExpense)" />
                                </AreaChart>
                            </ResponsiveContainer>
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">
                                    No data available
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="h-72 flex items-center justify-center text-slate-400">Access Restricted</div>
                    )}
                </div>

                {/* Quick Actions / Activity (Sidebar Col) */}
                <div className="col-span-1 md:col-span-1 lg:col-span-1 space-y-3 md:space-y-6">

                    {/* Recent Activity Mini List */}
                    <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200/60 shadow-sm">
                        <h3 className="text-xs md:text-sm font-bold text-slate-800 mb-3 md:mb-4 uppercase tracking-wide">Recent Activity</h3>
                        <div className="space-y-3 md:space-y-4">
                            {recentActivity.map((item, i) => (
                                <div key={i} className="flex items-center gap-3">
                                    <div className={`w-2 h-2 rounded-full ${item.type === 'Income' ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-slate-900 truncate">{item.title}</div>
                                        <div className="text-xs text-slate-500">{formatDate(new Date(item.date))}</div>
                                    </div>
                                    <div className="text-sm font-bold text-slate-700">{formatRoundedNumber(item.amount)}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>

            </div>

            <DashboardConfigModal isOpen={isConfigModalOpen} onClose={() => setIsConfigModalOpen(false)} />
            <Modal isOpen={isTransferReportOpen} onClose={() => setIsTransferReportOpen(false)} title="Transfer Statistics">
                <TransferStatisticsReport />
            </Modal>
        </div>
    );
};

export default memo(DashboardPage);
