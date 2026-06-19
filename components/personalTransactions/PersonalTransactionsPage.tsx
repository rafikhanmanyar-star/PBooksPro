import React, { useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useStateSelector } from '../../hooks/useSelectiveState';
import { useCompanyOptional } from '../../context/CompanyContext';
import PersonalCategoriesSettingsPanel from './PersonalCategoriesSettingsPanel';
import PersonalTransactionsTab from './PersonalTransactionsTab';
import MyWalletsTab from './MyWalletsTab';
import MyTasksTab from './MyTasksTab';
import useLocalStorage from '../../hooks/useLocalStorage';
import { useCollapsibleSubNav } from '../../hooks/useCollapsibleSubNav';
import SubNavModeToggle from '../layout/SubNavModeToggle';
import NavSectionLabel from '../layout/NavSectionLabel';
import { isAdminRole } from '../../hooks/useRecordLock';

import LoanManagementPage from '../loans/LoanManagementPage';

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

  const { user } = useAuth();
  const currentUserRole = useStateSelector(s => s.currentUser?.role);
  const companyCtx = useCompanyOptional();

  const effectiveRole = user?.role || currentUserRole || companyCtx?.authenticatedUser?.role;
  const isAdmin = isAdminRole(effectiveRole);

  useEffect(() => {
    if (!TABS.includes(activeTab)) {
      setActiveTab('Transactions');
    }
  }, [activeTab, setActiveTab]);

  useEffect(() => {
    const onTab = (e: Event) => {
      const tab = (e as CustomEvent<{ tab?: TabId }>).detail?.tab;
      if (tab && TABS.includes(tab)) setActiveTab(tab);
    };
    window.addEventListener('pb:set-personal-tab', onTab);
    return () => window.removeEventListener('pb:set-personal-tab', onTab);
  }, [setActiveTab]);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'Transactions':
        return (
          <div className="p-4 h-full overflow-auto bg-app-bg">
            <PersonalTransactionsTab />
          </div>
        );
      case 'My wallets':
        return (
          <div className="p-4 h-full overflow-auto bg-app-bg">
            <MyWalletsTab />
          </div>
        );
      case 'My Tasks':
        return (
          <div className="p-4 h-full overflow-auto bg-app-bg">
            <MyTasksTab />
          </div>
        );
      case 'Loan manager':
        return (
          <div className="h-full overflow-hidden min-h-0 bg-app-bg">
            <LoanManagementPage />
          </div>
        );
      case 'Settings':
        return (
          <div className="p-4 md:p-6 h-full min-h-0 overflow-hidden flex flex-col bg-app-bg">
            <PersonalCategoriesSettingsPanel />
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
            ? 'bg-ds-primary text-white shadow-sm'
            : 'text-app-muted hover:bg-app-table-hover hover:text-app-text'
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
          ? 'bg-ds-primary text-white shadow-sm'
          : 'text-app-muted hover:bg-app-table-hover hover:text-app-text'
          }`}
      >
        {label}
      </button>
    );
  };

  const navPanel = (
    <>
      <div
        className={`border-b border-app-border shrink-0 flex items-center gap-1 ${subNav.effectiveCollapsed ? 'flex-col py-2 px-1' : 'justify-between px-3 py-2.5'}`}
      >
        {!subNav.effectiveCollapsed && (
          <NavSectionLabel variant="header">Personal transactions</NavSectionLabel>
        )}
        <SubNavModeToggle collapsed={subNav.effectiveCollapsed} onToggle={subNav.toggle} title={subNav.toggleTitle} compact />
      </div>
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-2 space-y-0.5 min-h-0" aria-label="Personal transactions navigation">
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
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-app-muted p-4 bg-app-bg">
        <p className="text-sm font-medium text-app-text">Access denied</p>
        <p className="text-xs mt-1">This page is only visible to administrators.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-full min-h-0 w-full bg-app-bg">
      <aside
        className={`hidden md:flex flex-col shrink-0 border-r border-app-border bg-app-surface-2 h-full min-h-0 overflow-hidden transition-[width] duration-200 ease-out ${subNav.effectiveCollapsed ? 'w-14' : 'w-60'}`}
        aria-label="Personal transactions secondary navigation"
      >
        {navPanel}
      </aside>

      <div className="md:hidden shrink-0 border-b border-app-border bg-app-surface-2 px-3 py-2">
        <NavSectionLabel as="label" variant="form" htmlFor="personal-tx-section">Personal</NavSectionLabel>
        <select
          id="personal-tx-section"
          value={activeTab}
          onChange={(e) => setActiveTab(e.target.value as TabId)}
          className="w-full rounded-lg border border-app-border bg-app-card text-app-text text-sm py-2 px-3"
          aria-label="Personal transactions section"
        >
          {TABS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col bg-app-bg">
        {renderTabContent()}
      </div>
    </div>
  );
};

export default PersonalTransactionsPage;
