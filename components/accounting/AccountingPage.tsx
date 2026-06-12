import React, { memo, Suspense, useEffect, useState } from 'react';
import { useCollapsibleSubNav } from '../../hooks/useCollapsibleSubNav';
import SubNavModeToggle from '../layout/SubNavModeToggle';
import NavSectionLabel from '../layout/NavSectionLabel';
import { useStateSelector, useDispatchOnly } from '../../hooks/useSelectiveState';
import { usePermissions } from '../../hooks/usePermissions';
import useLocalStorage from '../../hooks/useLocalStorage';
import {
  ACCOUNTING_FINANCIAL_REPORTS,
  ACCOUNTING_PORTFOLIO_REPORTS,
  isAccountingPortfolioView,
  type AccountingView,
} from './accountingReportTypes';

export type { AccountingView } from './accountingReportTypes';
export { ACCOUNTING_FINANCIAL_REPORTS, ACCOUNTING_PORTFOLIO_REPORTS } from './accountingReportTypes';

const ProjectProfitLossReport = React.lazy(() => import('../reports/ProjectProfitLossReport'));
const ProjectBalanceSheetReport = React.lazy(() => import('../reports/ProjectBalanceSheetReport'));
const TrialBalanceReport = React.lazy(() => import('../reports/TrialBalanceReport'));
const ReconciliationDashboard = React.lazy(() => import('../reports/ReconciliationDashboard'));
const ProjectCashFlowReport = React.lazy(() => import('../reports/ProjectCashFlowReport'));
const ProjectInvestorReport = React.lazy(() => import('../reports/ProjectInvestorReport'));
const ProjectBuildingFundsReport = React.lazy(() => import('../dashboard/ProjectBuildingFundsReport'));
const BankAccountsReport = React.lazy(() => import('../dashboard/BankAccountsReport'));
const AccountConsistencyReport = React.lazy(() => import('../dashboard/AccountConsistencyReport'));
const AccountingAnalyticsPage = React.lazy(() => import('../../modules/accounting-analytics/AccountingAnalyticsPage'));
const BankingAnalyticsPage = React.lazy(() => import('../../modules/banking-analytics/BankingAnalyticsPage'));
/** Static import — Report Designer is a heavy shell; avoid nested lazy chunks in Electron file:// mode. */
import ReportDesignerPage from '../../modules/report-designer/ReportDesignerPage';
const UnpostedTransactionsQueuePage = React.lazy(() => import('./UnpostedTransactionsQueuePage'));

const DEFAULT_VIEW: AccountingView = 'Profit & Loss';

function navLabelShort(label: string): string {
  const w = label.trim().split(/\s+/);
  if (w.length === 1) return w[0].slice(0, 3).toUpperCase();
  return w.map((x) => x[0]).join('').slice(0, 3).toUpperCase();
}

const AccountingPage: React.FC = () => {
  const initialTabs = useStateSelector((s) => s.initialTabs);
  const dispatch = useDispatchOnly();
  const perms = usePermissions();
  const subNav = useCollapsibleSubNav('subnav_accounting');

  const [activeView, setActiveView] = useLocalStorage<AccountingView>('accounting_activeView', DEFAULT_VIEW);
  /** Overview and Bank Accounts reports hide rows/columns whose net balance totals zero. */
  const [hideZeroNetBalance, setHideZeroNetBalance] = useState(false);

  const canView = (name: AccountingView): boolean => {
    switch (name) {
      case 'Analytics':
        return perms.canReadProfitLoss || perms.canReadBalanceSheet;
      case 'Profit & Loss':
        return perms.canReadProfitLoss;
      case 'Balance Sheet':
        return perms.canReadBalanceSheet;
      case 'Trial Balance':
        return perms.canReadTrialBalance;
      case 'Reconciliation':
        return perms.canReadTrialBalance;
      case 'Cash Flows':
        return perms.canReadCashFlow;
      case 'Investor Distribution':
        return perms.canReadProfitLoss;
      case 'Overview Reports':
      case 'Bank Accounts':
      case 'Account Consistency':
        return true;
      default:
        return true;
    }
  };

  const visibleFinancialReports = ACCOUNTING_FINANCIAL_REPORTS.filter((name) => canView(name));
  const visiblePortfolioReports = ACCOUNTING_PORTFOLIO_REPORTS.filter((name) => canView(name));
  const visibleReports = [...visibleFinancialReports, ...visiblePortfolioReports];

  useEffect(() => {
    if (initialTabs && initialTabs.length > 0) {
      const [mainTab, subTab] = initialTabs;
      if (mainTab === 'Reports' && subTab && visibleReports.includes(subTab as AccountingView)) {
        setActiveView(subTab as AccountingView);
      } else if (visibleReports.includes(mainTab as AccountingView)) {
        setActiveView(mainTab as AccountingView);
      }
      dispatch({ type: 'CLEAR_INITIAL_TABS' });
      return;
    }

    if (!visibleReports.includes(activeView)) {
      setActiveView(visibleReports[0] ?? DEFAULT_VIEW);
    }
  }, [initialTabs, dispatch, setActiveView, visibleReports, activeView]);

  const renderContent = () => {
    switch (activeView) {
      case 'Analytics':
        return (perms.canReadProfitLoss || perms.canReadBalanceSheet) ? <AccountingAnalyticsPage /> : null;
      case 'Unposted Transactions':
        return <UnpostedTransactionsQueuePage />;
      case 'Profit & Loss':
        return perms.canReadProfitLoss ? <ProjectProfitLossReport /> : null;
      case 'Balance Sheet':
        return perms.canReadBalanceSheet ? <ProjectBalanceSheetReport /> : null;
      case 'Trial Balance':
        return perms.canReadTrialBalance ? <TrialBalanceReport /> : null;
      case 'Reconciliation':
        return perms.canReadTrialBalance ? <ReconciliationDashboard /> : null;
      case 'Cash Flows':
        return perms.canReadCashFlow ? <ProjectCashFlowReport /> : null;
      case 'Investor Distribution':
        return perms.canReadProfitLoss ? <ProjectInvestorReport /> : null;
      case 'Overview Reports':
        return <ProjectBuildingFundsReport hideZeroNetBalance={hideZeroNetBalance} />;
      case 'Banking Analytics':
        return <BankingAnalyticsPage />;
      case 'Bank Accounts':
        return <BankAccountsReport hideZeroNetBalance={hideZeroNetBalance} />;
      case 'Account Consistency':
        return <AccountConsistencyReport />;
      case 'Report Designer':
        return <ReportDesignerPage showModulePicker />;
      default:
        return null;
    }
  };

  const showHideZeroToggle = isAccountingPortfolioView(activeView)
    && (activeView === 'Overview Reports' || activeView === 'Bank Accounts');

  const NavItem = ({
    view,
    label,
    collapsed,
    dataTour,
  }: {
    view: AccountingView;
    label: string;
    collapsed: boolean;
    dataTour?: string;
  }) => {
    const on = activeView === view;
    if (collapsed) {
      return (
        <button
          type="button"
          title={label}
          data-tour={dataTour}
          onClick={() => setActiveView(view)}
          className={`w-full flex justify-center px-1 py-1.5 rounded-md text-[10px] font-bold leading-tight transition-colors ${
            on
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-app-muted hover:bg-app-table-hover'
          }`}
        >
          {navLabelShort(label)}
        </button>
      );
    }
    return (
      <button
        type="button"
        data-tour={dataTour}
        onClick={() => setActiveView(view)}
        className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
          on
            ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-900/20'
            : 'text-app-muted hover:bg-app-table-hover'
        }`}
      >
        {label}
      </button>
    );
  };

  const navPanel = (collapsed: boolean) => (
    <>
      <div
        className={`border-b border-app-border shrink-0 flex items-center gap-1 ${
          collapsed ? 'flex-col py-2 px-1' : 'justify-between px-3 py-2.5'
        }`}
      >
        {!collapsed && (
          <NavSectionLabel variant="header">Accounting</NavSectionLabel>
        )}
        <SubNavModeToggle collapsed={subNav.effectiveCollapsed} onToggle={subNav.toggle} title={subNav.toggleTitle} compact />
      </div>
      <nav
        className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-2 space-y-0.5 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600 min-h-0"
        aria-label="Accounting reports navigation"
        data-tour="accounting-subnav"
      >
        {visibleFinancialReports.length > 0 && (
          <>
            {!collapsed && (
              <NavSectionLabel variant="section">Financial statements</NavSectionLabel>
            )}
            {visibleFinancialReports.map((name) => (
              <NavItem
                key={name}
                view={name}
                label={name}
                collapsed={collapsed}
                dataTour={name === 'Trial Balance' ? 'report-trial-balance' : name === 'Profit & Loss' ? 'report-profit-loss' : undefined}
              />
            ))}
          </>
        )}
        {visiblePortfolioReports.length > 0 && (
          <>
            {!collapsed && (
              <NavSectionLabel variant="section" className="pt-2">Portfolio reports</NavSectionLabel>
            )}
            {visiblePortfolioReports.map((name) => (
              <NavItem
                key={name}
                view={name}
                label={name}
                collapsed={collapsed}
                dataTour={name === 'Overview Reports' ? 'accounting-overview-report' : undefined}
              />
            ))}
          </>
        )}
      </nav>
    </>
  );

  return (
    <div className="flex flex-col md:flex-row h-full min-h-0 w-full">
      <aside
        className={`hidden md:flex flex-col shrink-0 border-r border-app-border bg-app-toolbar/40 h-full min-h-0 overflow-hidden transition-[width] duration-200 ease-out ${
          subNav.effectiveCollapsed ? 'w-14' : 'w-60'
        }`}
        aria-label="Accounting secondary navigation"
      >
        {navPanel(subNav.effectiveCollapsed)}
      </aside>

      <div className="md:hidden shrink-0 border-b border-app-border bg-app-toolbar/40 px-3 py-2">
        <NavSectionLabel as="label" variant="form" htmlFor="accounting-view">
          Accounting
        </NavSectionLabel>
        <select
          id="accounting-view"
          value={activeView}
          onChange={(e) => setActiveView(e.target.value as AccountingView)}
          className="w-full rounded-lg border border-app-border bg-app-input text-app-text text-sm py-2 px-3"
          aria-label="Accounting report"
        >
          {visibleReports.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col px-2 sm:px-3 md:px-0 pt-2 md:pt-0">
        {showHideZeroToggle && (
          <div className="shrink-0 flex justify-end px-2 sm:px-4 py-2 border-b border-app-border bg-app-toolbar/30">
            <label className="flex items-center gap-2 text-xs text-app-muted cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hideZeroNetBalance}
                onChange={(e) => setHideZeroNetBalance(e.target.checked)}
                className="rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-600 w-3.5 h-3.5 shrink-0 cursor-pointer"
                aria-label="Hide projects and columns with zero net balance"
              />
              <span className="whitespace-nowrap">Hide zero net balance</span>
            </label>
          </div>
        )}
        <Suspense fallback={<div className="flex items-center justify-center h-full text-app-muted">Loading...</div>}>
          {renderContent()}
        </Suspense>
      </div>
    </div>
  );
};

export default memo(AccountingPage);
