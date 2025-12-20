
import React, { useMemo, useState, useEffect, useCallback, memo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Page, Project, TransactionType, InvoiceStatus, RentalAgreementStatus } from '../../types';
import { useKpis } from '../../context/KPIContext';
import KPICard from './KPI_Card';
import Button from '../ui/Button';
import { ICONS, CURRENCY } from '../../constants';
import DashboardConfigModal from './DashboardConfigModal';
import Card from '../ui/Card';
import SimpleInvoiceBillItem from './SimpleInvoiceBillItem';
import ProjectCategoryDetailModal from '../reports/ProjectCategoryDetailModal';
import Modal from '../ui/Modal';
import TransferStatisticsReport from '../reports/TransferStatisticsReport';
import ProjectBuildingFundsReport from './ProjectBuildingFundsReport';
import { formatDate } from '../../utils/dateUtils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';

const DashboardPage: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const { allKpis, openDrilldown } = useKpis();
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isTransferReportOpen, setIsTransferReportOpen] = useState(false);
  const [greeting, setGreeting] = useState('Good morning');
  const [detailModalData, setDetailModalData] = useState<{
    isOpen: boolean;
    project: Project | null;
    startDate: Date;
    endDate: Date;
  }>({ isOpen: false, project: null, startDate: new Date(), endDate: new Date() });
  
  const isAdmin = state.currentUser?.role === 'Admin';
  
  useEffect(() => {
      const hour = new Date().getHours();
      if (hour < 12) setGreeting('Good morning');
      else if (hour < 18) setGreeting('Good afternoon');
      else setGreeting('Good evening');
  }, []);
  
  const navigate = (page: Page) => dispatch({ type: 'SET_PAGE', payload: page });

  const handleQuickExpense = () => {
      dispatch({ type: 'SET_PAGE', payload: 'transactions' });
      dispatch({ type: 'SET_INITIAL_TRANSACTION_TYPE', payload: TransactionType.EXPENSE });
  };

  const handleQuickIncome = () => {
      dispatch({ type: 'SET_PAGE', payload: 'transactions' });
      dispatch({ type: 'SET_INITIAL_TRANSACTION_TYPE', payload: TransactionType.INCOME });
  };

  const kpiColorClasses = [
    'bg-indigo-50 text-indigo-800 hover:bg-indigo-100',
    'bg-emerald-50 text-emerald-800 hover:bg-emerald-100',
    'bg-amber-50 text-amber-800 hover:bg-amber-100',
    'bg-rose-50 text-rose-800 hover:bg-rose-100',
    'bg-sky-50 text-sky-800 hover:bg-sky-100',
    'bg-violet-50 text-violet-800 hover:bg-violet-100',
  ];

  const kpisToDisplay = useMemo(() => {
    const visibleKpiIds = Array.isArray(state.dashboardConfig?.visibleKpis) ? state.dashboardConfig.visibleKpis : [];
    return visibleKpiIds.map(id => {
      const kpiDef = allKpis.find(k => k.id === id);
      if (!kpiDef) return null;
      
      const amount = kpiDef.getData ? kpiDef.getData(state) : 0;
      
      return { ...kpiDef, amount, onClick: () => openDrilldown(kpiDef) };
    }).filter((kpi): kpi is Exclude<typeof kpi, null> => kpi !== null);
  }, [state.dashboardConfig, state, allKpis, openDrilldown]);

  // --- Chart Data Preparation ---

  const excludedCategoryIds = useMemo(() => {
      return state.categories
        .filter(c => c.name === 'Owner Equity' || c.name === 'Owner Withdrawn')
        .map(c => c.id);
  }, [state.categories]);

  const cashFlowData = useMemo(() => {
      if (!isAdmin) return []; // Hide from non-admins

      const months: Record<string, { income: number, expense: number, name: string }> = {};
      // Get last 6 months
      for(let i=5; i>=0; i--) {
          const d = new Date();
          d.setMonth(d.getMonth() - i);
          const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
          const name = d.toLocaleString('default', { month: 'short' });
          months[key] = { income: 0, expense: 0, name };
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

  const expenseBreakdownData = useMemo(() => {
      const categories: Record<string, number> = {};
      let total = 0;
      
      state.transactions.forEach(tx => {
          if (tx.type === TransactionType.EXPENSE && tx.categoryId) {
              if (excludedCategoryIds.includes(tx.categoryId)) return; // Exclude Drawings

              const cat = state.categories.find(c => c.id === tx.categoryId);
              const name = cat?.name || 'Uncategorized';
              categories[name] = (categories[name] || 0) + tx.amount;
              total += tx.amount;
          }
      });

      const sorted = Object.entries(categories)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value);
      
      const top5 = sorted.slice(0, 5);
      const others = sorted.slice(5).reduce((sum, item) => sum + item.value, 0);
      
      if (others > 0) top5.push({ name: 'Others', value: others });
      
      return top5.filter(i => i.value > 0);
  }, [state.transactions, state.categories, excludedCategoryIds]);

  const buildingChartData = useMemo(() => {
      if (!isAdmin) return []; // Hide from non-admins

      return state.buildings.map(b => {
          const propIds = new Set(state.properties.filter(p => p.buildingId === b.id).map(p => p.id));
          const income = state.transactions.filter(tx => 
              tx.type === TransactionType.INCOME && 
              (!tx.categoryId || !excludedCategoryIds.includes(tx.categoryId)) &&
              (tx.buildingId === b.id || (tx.propertyId && propIds.has(tx.propertyId)))
          ).reduce((s, t) => s + t.amount, 0);
          
          const expense = state.transactions.filter(tx => 
              tx.type === TransactionType.EXPENSE && 
              (!tx.categoryId || !excludedCategoryIds.includes(tx.categoryId)) &&
              (tx.buildingId === b.id || (tx.propertyId && propIds.has(tx.propertyId)))
          ).reduce((s, t) => s + t.amount, 0);
          
          return { name: b.name, Revenue: income, Expenses: expense };
      }).filter(d => d.Revenue > 0 || d.Expenses > 0).sort((a,b) => b.Revenue - a.Revenue).slice(0, 5);
  }, [state.buildings, state.properties, state.transactions, excludedCategoryIds, isAdmin]);

  const occupancyData = useMemo(() => {
      const totalUnits = state.properties.length;
      const occupied = state.rentalAgreements.filter(ra => ra.status === RentalAgreementStatus.ACTIVE).length;
      const vacant = totalUnits - occupied;
      
      if(totalUnits === 0) return [];
      return [
          { name: 'Occupied', value: occupied, color: '#10b981' },
          { name: 'Vacant', value: vacant, color: '#f43f5e' }
      ];
  }, [state.properties, state.rentalAgreements]);

  const { overdueInvoices, upcomingBills } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overdue = state.invoices
        .filter(inv => inv.status !== InvoiceStatus.PAID && new Date(inv.dueDate) < today)
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(today.getDate() + 30);
    
    const upcoming = state.bills
        .filter(bill => 
            bill.status !== InvoiceStatus.PAID && 
            bill.dueDate &&
            new Date(bill.dueDate) >= today && 
            new Date(bill.dueDate) <= thirtyDaysFromNow
        )
        .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());

    return { overdueInvoices: overdue.slice(0, 5), upcomingBills: upcoming.slice(0, 5) };
  }, [state.invoices, state.bills]);

  const EXPENSE_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#64748b'];

  return (
    <div className="space-y-4 sm:space-y-6">
        {/* Dashboard Banner */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl p-4 sm:p-6 text-white shadow-lg relative overflow-hidden">
            <div className="relative z-10 flex justify-between items-center">
                <div>
                    <h2 className="text-2xl sm:text-3xl font-bold mb-1">{greeting}, {state.currentUser?.name}!</h2>
                    <p className="text-slate-300 opacity-90 font-medium text-xs sm:text-sm">
                        Overview for {formatDate(new Date())}
                    </p>
                </div>
                <button 
                    onClick={() => setIsConfigModalOpen(true)}
                    className="flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors backdrop-blur-sm text-xs sm:text-sm font-medium"
                >
                     <div className="w-4 h-4">{ICONS.settings}</div>
                     <span className="hidden sm:inline">Customize</span>
                </button>
            </div>
            <div className="absolute top-0 right-0 -mt-6 -mr-6 w-24 h-24 sm:w-32 sm:h-32 bg-white opacity-5 rounded-full blur-2xl"></div>
        </div>

        {/* Project Funds Report - High Priority View */}
        <ProjectBuildingFundsReport />

        {/* KPI Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {kpisToDisplay.map((kpi, index) => (
            kpi && <KPICard
              key={kpi.id}
              title={kpi.title}
              amount={kpi.amount}
              icon={kpi.icon || ICONS.barChart}
              colorClass={kpiColorClasses[index % kpiColorClasses.length]}
              onClick={kpi.onClick}
            />
          ))}
        </div>

        {/* Quick Actions */}
        <Card className="bg-white border-slate-200">
             <h3 className="text-xs sm:text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">Quick Actions</h3>
             <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-3">
                <Button onClick={handleQuickIncome} className="bg-emerald-600 hover:bg-emerald-700 text-white border-none shadow-sm justify-center px-2">
                    <div className="w-4 h-4 mr-1">{ICONS.plus}</div> Income
                </Button>
                <Button onClick={handleQuickExpense} className="bg-rose-600 hover:bg-rose-700 text-white border-none shadow-sm justify-center px-2">
                    <div className="w-4 h-4 mr-1">{ICONS.plus}</div> Expense
                </Button>
                <Button onClick={() => navigate('transactions')} variant="secondary" className="justify-center px-2">
                     <div className="w-4 h-4 mr-1">{ICONS.trendingUp}</div> Ledger
                </Button>
                <Button onClick={() => navigate('loans')} variant="secondary" className="justify-center px-2">
                     <div className="w-4 h-4 mr-1">{ICONS.loan}</div> Loans
                </Button>
                <Button onClick={() => setIsTransferReportOpen(true)} variant="secondary" className="justify-center px-2 col-span-2 sm:col-span-1">
                     <div className="w-4 h-4 mr-1">{ICONS.repeat}</div> Transfers
                </Button>
             </div>
        </Card>

        {/* Primary Charts - Restricted for non-admins */}
        {isAdmin && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                {/* Cash Flow Trend */}
                <Card className="lg:col-span-2">
                    <h3 className="text-base sm:text-lg font-semibold text-slate-800 mb-4">Cash Flow Trend</h3>
                    <div className="h-64 sm:h-72 w-full" style={{ minWidth: 0, minHeight: 256 }}>
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={256}>
                            <AreaChart data={cashFlowData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                    </linearGradient>
                                    <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.1}/>
                                        <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} tickFormatter={(value) => `${value/1000}k`} />
                                <RechartsTooltip 
                                    formatter={(val: number) => [`${CURRENCY} ${val.toLocaleString()}`, '']}
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                />
                                <Legend verticalAlign="top" height={36} iconType="circle" />
                                <Area type="monotone" dataKey="income" name="Income" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorIncome)" />
                                <Area type="monotone" dataKey="expense" name="Expense" stroke="#f43f5e" strokeWidth={2} fillOpacity={1} fill="url(#colorExpense)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                {/* Expense Breakdown */}
                <Card>
                    <h3 className="text-base sm:text-lg font-semibold text-slate-800 mb-4">Top Expenses</h3>
                    <div className="h-64 sm:h-72 w-full" style={{ minWidth: 0, minHeight: 256 }}>
                        {expenseBreakdownData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={256}>
                                <PieChart>
                                    <Pie
                                        data={expenseBreakdownData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {expenseBreakdownData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={EXPENSE_COLORS[index % EXPENSE_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip formatter={(val: number) => `${CURRENCY} ${val.toLocaleString()}`} />
                                    <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: '11px' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-full text-slate-400">No expense data available.</div>
                        )}
                    </div>
                </Card>
            </div>
        )}

        {/* Secondary Charts & Info */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            {isAdmin && buildingChartData.length > 0 && (
                <Card className="lg:col-span-2">
                    <h3 className="text-base sm:text-lg font-semibold text-slate-800 mb-4">Building Performance</h3>
                    <div className="h-64 w-full" style={{ minWidth: 0, minHeight: 256 }}>
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={256}>
                            <BarChart data={buildingChartData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" hide />
                                <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `${value/1000}k`} />
                                <RechartsTooltip 
                                    formatter={(val: number) => `${CURRENCY} ${val.toLocaleString()}`} 
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                />
                                <Legend />
                                <Bar dataKey="Revenue" fill="#6366f1" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="Expenses" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
            )}

            {occupancyData.length > 0 && (
                <Card>
                    <h3 className="text-base sm:text-lg font-semibold text-slate-800 mb-4">Occupancy Rate</h3>
                    <div className="h-64 w-full" style={{ minWidth: 0, minHeight: 256 }}>
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={256}>
                            <PieChart>
                                <Pie
                                    data={occupancyData}
                                    cx="50%"
                                    cy="50%"
                                    startAngle={180}
                                    endAngle={0}
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {occupancyData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <RechartsTooltip />
                                <Legend verticalAlign="bottom" height={36}/>
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
            )}
        </div>

        {/* Lists Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <Card className="flex flex-col h-full">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-base sm:text-lg font-semibold text-slate-800">Overdue Invoices</h3>
                    <Button variant="ghost" size="sm" onClick={() => navigate('projectInvoices')}>View All</Button>
                </div>
                {overdueInvoices.length > 0 ? (
                    <div className="space-y-3 overflow-y-auto max-h-64 pr-1">
                        {overdueInvoices.map(inv => (
                            <SimpleInvoiceBillItem key={inv.id} item={inv} type="invoice" />
                        ))}
                    </div>
                ) : (
                    <div className="flex-grow flex items-center justify-center py-8 text-slate-500 bg-slate-50/50 rounded-lg">
                        <div className="text-center">
                            <div className="text-emerald-500 mb-2 text-xl">✓</div>
                            <p>No overdue invoices.</p>
                        </div>
                    </div>
                )}
            </Card>
            
            <Card className="flex flex-col h-full">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-base sm:text-lg font-semibold text-slate-800">Upcoming Bills</h3>
                    <Button variant="ghost" size="sm" onClick={() => navigate('bills')}>View All</Button>
                </div>
                {upcomingBills.length > 0 ? (
                    <div className="space-y-3 overflow-y-auto max-h-64 pr-1">
                        {upcomingBills.map(bill => (
                            <SimpleInvoiceBillItem key={bill.id} item={bill} type="bill" />
                        ))}
                    </div>
                ) : (
                    <div className="flex-grow flex items-center justify-center py-8 text-slate-500 bg-slate-50/50 rounded-lg">
                        <p>No upcoming bills in the next 30 days.</p>
                    </div>
                )}
            </Card>
        </div>
      
      <DashboardConfigModal isOpen={isConfigModalOpen} onClose={() => setIsConfigModalOpen(false)} />
      <ProjectCategoryDetailModal 
        isOpen={detailModalData.isOpen}
        onClose={() => setDetailModalData({ ...detailModalData, isOpen: false, project: null })}
        project={detailModalData.project}
        startDate={detailModalData.startDate}
        endDate={detailModalData.endDate}
      />
      
      <Modal isOpen={isTransferReportOpen} onClose={() => setIsTransferReportOpen(false)} title="Transfer Statistics" size="xl">
          <TransferStatisticsReport />
          <div className="flex justify-end mt-4 border-t pt-4">
              <Button variant="secondary" onClick={() => setIsTransferReportOpen(false)}>Close</Button>
          </div>
      </Modal>
    </div>
  );
};

export default memo(DashboardPage);
