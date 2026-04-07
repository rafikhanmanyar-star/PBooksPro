import React, { useState, useEffect, lazy, Suspense } from 'react';
import Button from '../ui/Button';
import { useAuth } from '../../context/AuthContext';
import { useAppContext } from '../../context/AppContext';
import { useCompanyOptional } from '../../context/CompanyContext';
import PersonalCategoriesModal from './PersonalCategoriesModal';
import PersonalTransactionsTab from './PersonalTransactionsTab';
import MyWalletsTab from './MyWalletsTab';
import { seedPersonalCategoriesIfEmpty } from './personalCategoriesService';
import { isLocalOnlyMode } from '../../config/apiUrl';
import useLocalStorage from '../../hooks/useLocalStorage';
import { useCollapsibleSubNav } from '../../hooks/useCollapsibleSubNav';
import SubNavModeToggle from '../layout/SubNavModeToggle';

const LoanManagementPage = lazy(() => import('../loans/LoanManagementPage'));

const TABS = ['Transactions', 'My wallets', 'My Tasks', 'Loan manager', 'Settings'] as const;
type TabId = (typeof TABS)[number];

function personalNavLabelShort(label: string): string {
  const w = label.trim().split(/\s+/);
  if (w.length === 1) return w[0].slice(0, 3).toUpperCase();
  return w.map((x) => x[0]).join('').slice(0, 3).toUpperCase();
}

/**
 * Personal transactions page (admin only). Second-level left navigation (desktop) or section picker (mobile).
 */
const PersonalTransactionsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useLocalStorage<TabId>('personalTransactions_activeTab', 'Transactions');
  const subNav = useCollapsibleSubNav('subnav_personal_tx');
  const [incomeCategoriesModalOpen, setIncomeCategoriesModalOpen] = useState(false);
  const [expenseCategoriesModalOpen, setExpenseCategoriesModalOpen] = useState(false);

  const { user } = useAuth();
  const { state } = useAppContext();
  const companyCtx = useCompanyOptional();

  const isAdmin =
    user?.role === 'Admin' ||
    user?.role === 'SUPER_ADMIN' ||
    state.currentUser?.role === 'Admin' ||
    state.currentUser?.role === 'SUPER_ADMIN' ||
    companyCtx?.authenticatedUser?.role === 'SUPER_ADMIN';

  useEffect(() => {
    if (isAdmin && isLocalOnlyMode()) {
      seedPersonalCategoriesIfEmpty();
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!TABS.includes(activeTab)) {
      setActiveTab('Transactions');
    }
  }, [activeTab, setActiveTab]);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'Transactions':
        return (
          <div className="p-4 h-full overflow-auto">
            <PersonalTransactionsTab />
          </div>
        );
      case 'My wallets':
        return (
          <div className="p-4 h-full overflow-auto">
            <MyWalletsTab />
          </div>
        );
      case 'My Tasks':
        return (
          <div className="p-4 h-full overflow-auto">
            <p className="text-sm text-gray-600 dark:text-slate-400">My Tasks — coming soon.</p>
          </div>
        );
      case 'Loan manager':
        return (
          <div className="p-4 h-full overflow-auto min-h-0">
            <Suspense fallback={<p className="text-sm text-gray-500">Loading Loan Manager…</p>}>
              <LoanManagementPage />
            </Suspense>
          </div>
        );
      case 'Settings':
        return (
          <div className="p-4 max-w-lg">
            <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">
              Manage categories used only for Personal transactions. They are separate from the main app income and expense categories.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="outline"
                onClick={() => setIncomeCategoriesModalOpen(true)}
                className="flex-1"
              >
                Income categories
              </Button>
              <Button
                variant="outline"
                onClick={() => setExpenseCategoriesModalOpen(true)}
                className="flex-1"
              >
                Expense categories
              </Button>
            </div>
            <PersonalCategoriesModal
              isOpen={incomeCategoriesModalOpen}
              onClose={() => setIncomeCategoriesModalOpen(false)}
              type="Income"
            />
            <PersonalCategoriesModal
              isOpen={expenseCategoriesModalOpen}
              onClose={() => setExpenseCategoriesModalOpen(false)}
              type="Expense"
            />
          </div>
        );
      default:
        return null;
    }
  };

  const NavItem = ({ tab, label }: { tab: TabId; label: string }) => {
    const on = activeTab === tab;
    const short = personalNavLabelShort(label);
    if (subNav.effectiveCollapsed) {
      return (
        <button
          type="button"
          title={label}
          onClick={() => setActiveTab(tab)}
          className={`w-full flex justify-center px-1 py-1.5 rounded-md text-[10px] font-bold leading-tight transition-colors ${on
            ? 'bg-indigo-600 text-white shadow-sm'
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-700/80'
            }`}
        >
          {short}
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={() => setActiveTab(tab)}
        className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${on
          ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-900/20'
          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-700/80'
          }`}
      >
        {label}
      </button>
    );
  };

  const navPanel = (
    <>
      <div
        className={`border-b border-slate-200 dark:border-slate-700 shrink-0 flex items-center gap-1 ${subNav.effectiveCollapsed ? 'flex-col py-2 px-1' : 'justify-between px-3 py-2.5'}`}
      >
        {!subNav.effectiveCollapsed && (
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Personal transactions</p>
        )}
        <SubNavModeToggle collapsed={subNav.effectiveCollapsed} onToggle={subNav.toggle} title={subNav.toggleTitle} compact />
      </div>
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-2 space-y-0.5 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600 min-h-0" aria-label="Personal transactions navigation">
        <NavItem tab="Transactions" label="Transactions" />
        <NavItem tab="My wallets" label="My wallets" />
        <NavItem tab="My Tasks" label="My Tasks" />
        <NavItem tab="Loan manager" label="Loan manager" />
        <NavItem tab="Settings" label="Settings" />
      </nav>
    </>
  );

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-gray-500 p-4">
        <p className="text-sm font-medium text-gray-700 dark:text-slate-300">Access denied</p>
        <p className="text-xs mt-1">This page is only visible to administrators.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-full min-h-0 w-full">
      <aside
        className={`hidden md:flex flex-col shrink-0 border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 h-full min-h-0 overflow-hidden transition-[width] duration-200 ease-out ${subNav.effectiveCollapsed ? 'w-14' : 'w-60'}`}
        aria-label="Personal transactions secondary navigation"
      >
        {navPanel}
      </aside>

      <div className="md:hidden shrink-0 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 px-3 py-2">
        <label htmlFor="personal-tx-section" className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Personal</label>
        <select
          id="personal-tx-section"
          value={activeTab}
          onChange={(e) => setActiveTab(e.target.value as TabId)}
          className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm py-2 px-3"
          aria-label="Personal transactions section"
        >
          {TABS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col bg-white dark:bg-slate-900/20">
        {renderTabContent()}
      </div>
    </div>
  );
};

export default PersonalTransactionsPage;
