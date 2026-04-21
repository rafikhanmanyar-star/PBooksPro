
import React, { useMemo, useState, useEffect, useCallback, memo } from 'react';
import { useDispatchOnly, useStateSelector } from '../../hooks/useSelectiveState';
import { useLookupMaps } from '../../hooks/useLookupMaps';
import { Page, Project, TransactionType, InvoiceStatus, RentalAgreementStatus } from '../../types';
import { useKpis } from '../../context/KPIContext';
import KPICard from './KPI_Card';
import Button from '../ui/Button';
import { ICONS, CURRENCY } from '../../constants';
import { formatRoundedNumber, formatCurrency } from '../../utils/numberUtils';
import DashboardConfigModal from './DashboardConfigModal';
import Card from '../ui/Card';
import SimpleInvoiceBillItem from './SimpleInvoiceBillItem';
import ProjectCategoryDetailModal from '../reports/ProjectCategoryDetailModal';
import Modal from '../ui/Modal';
import TransferStatisticsReport from '../reports/TransferStatisticsReport';
import ProjectBuildingFundsReport from './ProjectBuildingFundsReport';
import BankAccountsReport from './BankAccountsReport';
import AccountConsistencyReport from './AccountConsistencyReport';
import Tabs from '../ui/Tabs';
import { formatDate } from '../../utils/dateUtils';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '../../context/AuthContext';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { useMonthlyRentalSummaryRangeQuery } from '../../hooks/queries/useRentalRollupQueries';

const DashboardPage: React.FC = () => {
    const dispatch = useDispatchOnly();
    const transactions = useStateSelector(s => s.transactions);
    const invoices = useStateSelector(s => s.invoices);
    const categories = useStateSelector(s => s.categories);
    const currentUser = useStateSelector(s => s.currentUser);
    const dashboardConfig = useStateSelector(s => s.dashboardConfig);
    const rentalAgreements = useStateSelector(s => s.rentalAgreements);
    const accounts = useStateSelector(s => s.accounts);
    const contacts = useStateSelector(s => s.contacts);
    const bills = useStateSelector(s => s.bills);
    const projects = useStateSelector(s => s.projects);
    const projectAgreements = useStateSelector(s => s.projectAgreements);
    const properties = useStateSelector(s => s.properties);
    const buildings = useStateSelector(s => s.buildings);
    const lookupMaps = useLookupMaps();
    const { allKpis, openDrilldown } = useKpis();
    const { isAuthenticated } = useAuth();
    const useApiRentalRollup = !isLocalOnlyMode() && isAuthenticated;
    const { data: monthlyRentalRollup, isFetching: monthlyRollupFetching } = useMonthlyRentalSummaryRangeQuery(
        useApiRentalRollup && isAdmin,
        5
    );
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

    /** Defer Recharts until after layout so ResponsiveContainer gets non-zero width (avoids width/height -1 warnings). */
    const [chartLayoutReady, setChartLayoutReady] = useState(false);
    useEffect(() => {
        const id = requestAnimationFrame(() => setChartLayoutReady(true));
        return () => cancelAnimationFrame(id);
    }, []);

    const isAdmin = currentUser?.role === 'Admin';

    useEffect(() => {
        const h = new Date().getHours();
        setGreeting(h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening');
    }, []);

    const navigate = (page: Page) => dispatch({ type: 'SET_PAGE', payload: page });

    const kpiState = useMemo(() => ({
        transactions, invoices, categories, accounts, contacts,
        bills, projects, projectAgreements, properties, buildings,
        rentalAgreements, currentUser,
    }), [transactions, invoices, categories, accounts, contacts,
        bills, projects, projectAgreements, properties, buildings,
        rentalAgreements, currentUser]);

    const kpisToDisplay = useMemo(() => {
        const visibleKpiIds = Array.isArray(dashboardConfig?.visibleKpis) ? dashboardConfig.visibleKpis : [];
        const defaultKpiIds = ['totalBalance', 'totalIncome', 'totalExpense', 'netIncome'];
        const idsToShow = visibleKpiIds.length > 0 ? visibleKpiIds : defaultKpiIds;

        return idsToShow.map(id => {
            const kpiDef = allKpis.find(k => k.id === id);
            if (!kpiDef) return null;
            const amount = kpiDef.getData ? kpiDef.getData(kpiState) : 0;
            return { ...kpiDef, amount, onClick: () => openDrilldown(kpiDef) };
        }).filter((k): k is Exclude<typeof k, null> => k !== null);
    }, [dashboardConfig, kpiState, allKpis, openDrilldown]);

    // --- Chart Data ---
    const excludedCategoryIds = useMemo(() => categories.filter(c => c.name === 'Owner Equity' || c.name === 'Owner Withdrawn').map(c => c.id), [categories]);

    const cashFlowData = useMemo(() => {
        if (!isAdmin) return [];
        const months: Record<string, { income: number, expense: number, name: string }> = {};
        for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            months[key] = { income: 0, expense: 0, name: d.toLocaleString('default', { month: 'short' }) };
        }
        transactions.forEach(tx => {
            if (tx.categoryId && excludedCategoryIds.includes(tx.categoryId)) return;
            const key = tx.date.slice(0, 7);
            if (months[key]) {
                if (tx.type === TransactionType.INCOME) months[key].income += tx.amount;
                else if (tx.type === TransactionType.EXPENSE) months[key].expense += tx.amount;
            }
        });
        return Object.values(months);
    }, [transactions, excludedCategoryIds, isAdmin]);

    const rentalOwnerNetServer6mo = useMemo(() => {
        if (!monthlyRentalRollup?.length) return null;
        return monthlyRentalRollup.reduce((s, r) => s + r.netAmount, 0);
    }, [monthlyRentalRollup]);

    const recentActivity = useMemo(() => {
        const recentInvoices = [...invoices].sort((a, b) => new Date(b.issueDate || b.dueDate).getTime() - new Date(a.issueDate || a.dueDate).getTime()).slice(0, 3).map(i => ({
            id: i.id, type: 'Invoice', title: `Invoice #${i.invoiceNumber}`, amount: i.amount, date: i.issueDate || i.dueDate, status: i.status
        }));
        const recentTxs = [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 3).map(t => ({
            id: t.id, type: t.type === TransactionType.INCOME ? 'Income' : 'Expense', title: t.description || 'Transaction', amount: t.amount, date: t.date, status: 'Completed'
        }));
        return [...recentInvoices, ...recentTxs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);
    }, [invoices, transactions]);

    return (
        <div className="space-y-4 md:space-y-6 max-w-[1600px] mx-auto px-2 sm:px-4">

            {/* Welcome Banner */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 md:gap-4">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-app-text">{greeting}, {currentUser?.name?.split(' ')[0]}</h1>
                    <p className="text-app-muted text-xs md:text-sm mt-1">Here's what's happening with your projects today.</p>
                    {isAdmin && useApiRentalRollup && (
                        <p className="text-[11px] text-app-muted mt-2 max-w-xl" title="From PostgreSQL monthly_owner_summary: rental invoice income vs expenses per owner/property, last six calendar months in the feed.">
                            {monthlyRollupFetching && !monthlyRentalRollup?.length ? (
                                <span>Loading rental owner summary from server…</span>
                            ) : rentalOwnerNetServer6mo != null ? (
                                <span>
                                    Rental owner net (server, 6 mo):{' '}
                                    <span className="font-semibold text-app-text">
                                        {CURRENCY} {formatCurrency(rentalOwnerNetServer6mo)}
                                    </span>
                                </span>
                            ) : null}
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-2 md:gap-3 w-full md:w-auto">
                    <Button variant="secondary" onClick={() => setIsConfigModalOpen(true)} className="text-app-muted border-app-border hover:bg-app-toolbar text-xs md:text-sm flex-1 md:flex-none">
                        Customize
                    </Button>
                </div>
            </div>

            {/* Overview Reports & Bank Accounts - Top Section */}
            <div className="flex flex-col rounded-2xl overflow-hidden">
                <div className="flex-shrink-0">
                    <Tabs
                        variant="browser"
                        tabs={['Overview Reports', 'Bank Accounts', 'Account consistency']}
                        activeTab={activeReportTab}
                        onTabClick={setActiveReportTab}
                    />
                </div>
                <div className="flex-grow bg-app-card rounded-b-2xl -mt-px p-4 border border-app-border border-t-0 shadow-ds-card">
                    {activeReportTab === 'Overview Reports' ? (
                        <ProjectBuildingFundsReport />
                    ) : activeReportTab === 'Bank Accounts' ? (
                        <BankAccountsReport />
                    ) : (
                        <AccountConsistencyReport />
                    )}
                </div>
            </div>

            {/* Custom KPIs & Dashboard Widgets Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-6">

                {/* KPI Cards Row */}
                {kpisToDisplay.slice(0, 4).map((kpi) => (
                    <div key={kpi.id} className="col-span-1">
                        <KPICard
                            title={kpi.title}
                            amount={kpi.amount}
                            icon={kpi.icon || ICONS.barChart}
                            onClick={kpi.onClick}
                            // Trend will be calculated based on actual historical data when available
                            // Only show trends when there's meaningful data to compare
                        />
                    </div>
                ))}

                {/* Main Chart Section (Span 2 or 3 cols) */}
                <div className="col-span-1 md:col-span-2 lg:col-span-3 min-w-0 bg-app-card p-4 md:p-6 rounded-2xl border border-app-border shadow-ds-card relative overflow-hidden transition-shadow duration-ds">
                    <div className="flex justify-between items-center mb-4 md:mb-6">
                        <h3 className="text-base md:text-lg font-bold text-app-text">Cash Flow</h3>
                        <div className="flex gap-2 md:gap-3">
                            <div className="flex items-center gap-1 md:gap-1.5 text-[10px] md:text-xs font-medium text-app-muted">
                                <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-ds-success"></span> <span className="hidden sm:inline">Income</span>
                            </div>
                            <div className="flex items-center gap-1 md:gap-1.5 text-[10px] md:text-xs font-medium text-app-muted">
                                <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-ds-danger"></span> <span className="hidden sm:inline">Expense</span>
                            </div>
                        </div>
                    </div>

                    {isAdmin ? (
                        <div className="h-48 md:h-72 w-full min-h-[192px] min-w-0 relative">
                            {chartLayoutReady && cashFlowData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={192} debounce={32}>
                                    <AreaChart data={cashFlowData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="gIncome" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="var(--color-success)" stopOpacity={0.25} />
                                            <stop offset="95%" stopColor="var(--color-success)" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="gExpense" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="var(--color-danger)" stopOpacity={0.25} />
                                            <stop offset="95%" stopColor="var(--color-danger)" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-subtle)" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                                    <RechartsTooltip
                                        contentStyle={{
                                            borderRadius: '12px',
                                            border: '1px solid var(--border-color)',
                                            backgroundColor: 'var(--modal-bg)',
                                            color: 'var(--text-primary)',
                                            boxShadow: 'var(--shadow-modal)',
                                        }}
                                        formatter={(value: number) => [CURRENCY + ' ' + formatRoundedNumber(value), '']}
                                    />
                                    <Area type="monotone" dataKey="income" stroke="var(--color-success)" strokeWidth={2} fill="url(#gIncome)" />
                                    <Area type="monotone" dataKey="expense" stroke="var(--color-danger)" strokeWidth={2} fill="url(#gExpense)" />
                                </AreaChart>
                            </ResponsiveContainer>
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center text-app-muted text-sm">
                                    No data available
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="h-72 flex items-center justify-center text-app-muted">Access Restricted</div>
                    )}
                </div>

                {/* Quick Actions / Activity (Sidebar Col) */}
                <div className="col-span-1 md:col-span-1 lg:col-span-1 space-y-3 md:space-y-6">

                    {/* Recent Activity Mini List */}
                    <div className="bg-app-card p-4 md:p-5 rounded-2xl border border-app-border shadow-ds-card transition-shadow duration-ds">
                        <h3 className="text-xs md:text-sm font-bold text-app-text mb-3 md:mb-4 uppercase tracking-wide">Recent Activity</h3>
                        <div className="space-y-3 md:space-y-4">
                            {recentActivity.map((item, i) => (
                                <div key={i} className="flex items-center gap-3">
                                    <div className={`w-2 h-2 rounded-full shrink-0 ${item.type === 'Income' ? 'bg-ds-success' : item.type === 'Expense' ? 'bg-ds-danger' : 'bg-app-muted'}`}></div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-app-text truncate">{item.title}</div>
                                        <div className="text-xs text-app-muted">{formatDate(new Date(item.date))}</div>
                                    </div>
                                    <div className="text-sm font-bold text-app-text tabular-nums">{formatRoundedNumber(item.amount)}</div>
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
