import { useProjectReportAppState } from '../../hooks/useSelectiveState';
import React, { memo, useEffect, useMemo } from 'react';
import ProjectEquityManagement, {
    EQUITY_LEDGER_TABS,
    INV_MGMT_REPORT_TABS,
    type InvManagementContentTab,
} from '../projectManagement/ProjectEquityManagement';
import InvestmentDashboard from './InvestmentDashboard';
import { useAuth } from '../../context/AuthContext';
import { ICONS } from '../../constants';
import useLocalStorage from '../../hooks/useLocalStorage';
import { useCollapsibleSubNav } from '../../hooks/useCollapsibleSubNav';
import SubNavModeToggle from '../layout/SubNavModeToggle';
import NavSectionLabel from '../layout/NavSectionLabel';

export type InvTab = 'Overview' | InvManagementContentTab;

const ALL_INV_TABS: InvTab[] = ['Overview', ...EQUITY_LEDGER_TABS, ...INV_MGMT_REPORT_TABS];

function invNavLabelShort(label: string): string {
    const w = label.trim().split(/\s+/);
    if (w.length === 1) return w[0].slice(0, 3).toUpperCase();
    return w.map((x) => x[0]).join('').slice(0, 3).toUpperCase();
}

const InvestmentManagementPage: React.FC = () => {
    const state = useProjectReportAppState();
    const { user } = useAuth();
    const { currentUser } = state;

    const isAdmin = user?.role === 'Admin' || currentUser?.role === 'Admin';

    const [activeTab, setActiveTab] = useLocalStorage<InvTab>('investmentManagement_activeTab', 'Overview');

    const subNav = useCollapsibleSubNav('subnav_investment');

    useEffect(() => {
        const v = activeTab as string;
        if (v === 'Equity & ledger') {
            setActiveTab('Ledger');
            return;
        }
        if (v === 'Profit') {
            setActiveTab('Profitability');
            return;
        }
        if (!ALL_INV_TABS.includes(activeTab)) {
            setActiveTab('Overview');
        }
    }, [activeTab, setActiveTab]);

    const NavItem = ({ tab, label }: { tab: InvTab; label: string }) => {
        const on = activeTab === tab;
        const short = invNavLabelShort(label);
        if (subNav.effectiveCollapsed) {
            return (
                <button
                    type="button"
                    title={label}
                    onClick={() => setActiveTab(tab)}
                    className={`w-full flex justify-center px-1 py-1.5 rounded-md text-[10px] font-bold leading-tight transition-colors ${on
                        ? 'bg-primary text-white shadow-sm'
                        : 'text-app-muted hover:bg-app-table-hover'
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
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-app-muted hover:bg-app-table-hover'
                    }`}
            >
                {label}
            </button>
        );
    };

    const mobileOptions = useMemo(
        () => [
            { value: 'Overview' as const, label: 'Overview', group: 'General' },
            ...EQUITY_LEDGER_TABS.map((t) => ({ value: t, label: t, group: 'Equity & ledger' })),
            ...INV_MGMT_REPORT_TABS.map((t) => ({ value: t, label: t, group: 'Reports' })),
        ],
        []
    );

    const navPanel = (
        <>
            <div
                className={`border-b border-app-border shrink-0 flex items-center gap-1 ${subNav.effectiveCollapsed ? 'flex-col py-2 px-1' : 'justify-between px-3 py-2.5'}`}
            >
                {!subNav.effectiveCollapsed && (
                    <NavSectionLabel variant="header">Inv. management</NavSectionLabel>
                )}
                <SubNavModeToggle collapsed={subNav.effectiveCollapsed} onToggle={subNav.toggle} title={subNav.toggleTitle} compact />
            </div>
            <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-2 space-y-0.5 scrollbar-thin min-h-0" aria-label="Investment management navigation">
                <NavItem tab="Overview" label="Overview" />
                <div className="pt-3 mt-2 border-t border-app-border">
                    {!subNav.effectiveCollapsed && (
                        <NavSectionLabel variant="section" className="pb-1.5">Equity & ledger</NavSectionLabel>
                    )}
                    <div className="space-y-0.5">
                        {EQUITY_LEDGER_TABS.map((t) => (
                            <NavItem key={t} tab={t} label={t} />
                        ))}
                    </div>
                </div>
                <div className="pt-3 mt-2 border-t border-app-border">
                    {!subNav.effectiveCollapsed && (
                        <NavSectionLabel variant="section" className="pb-1.5">Reports</NavSectionLabel>
                    )}
                    <div className="space-y-0.5">
                        {INV_MGMT_REPORT_TABS.map((t) => (
                            <NavItem key={t} tab={t} label={t} />
                        ))}
                    </div>
                </div>
            </nav>
        </>
    );

    if (!isAdmin) {
        return (
            <div className="flex items-center justify-center h-full bg-app-bg">
                <div className="text-center p-8 bg-app-card rounded-lg shadow-ds-card border border-app-border max-w-md">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                        <div className="text-amber-600">{ICONS.lock || '🔒'}</div>
                    </div>
                    <h2 className="text-xl font-bold text-app-text mb-2">Access Restricted</h2>
                    <p className="text-app-muted mb-1">This feature is available to Administrators only.</p>
                    <p className="text-sm text-app-muted">Please contact your administrator for access.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col md:flex-row h-full min-h-0 w-full">
            <aside
                className={`hidden md:flex flex-col shrink-0 border-r border-app-border bg-app-toolbar/40 h-full min-h-0 overflow-hidden transition-[width] duration-200 ease-out ${subNav.effectiveCollapsed ? 'w-14' : 'w-60'}`}
                aria-label="Investment management secondary navigation"
            >
                {navPanel}
            </aside>

            <div className="md:hidden shrink-0 border-b border-app-border bg-app-toolbar/40 px-3 py-2">
                <NavSectionLabel as="label" variant="form" htmlFor="inv-mgmt-section">Inv. management</NavSectionLabel>
                <select
                    id="inv-mgmt-section"
                    value={activeTab}
                    onChange={(e) => setActiveTab(e.target.value as InvTab)}
                    className="w-full ds-input-field text-sm py-2 px-3"
                    aria-label="Investment management section"
                >
                    {['General', 'Equity & ledger', 'Reports'].map((group) => {
                        const opts = mobileOptions.filter((o) => o.group === group);
                        if (opts.length === 0) return null;
                        return (
                            <optgroup key={group} label={group}>
                                {opts.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </optgroup>
                        );
                    })}
                </select>
            </div>

            <div className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col bg-app-bg">
                {activeTab === 'Overview' ? (
                    <InvestmentDashboard />
                ) : (
                    <ProjectEquityManagement
                        equityTab={activeTab}
                        onEquityTabChange={(t) => setActiveTab(t)}
                    />
                )}
            </div>
        </div>
    );
};

export default memo(InvestmentManagementPage);
