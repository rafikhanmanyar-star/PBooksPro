
import React, { useState, useEffect, memo, Suspense } from 'react';
import { useCollapsibleSubNav } from '../../hooks/useCollapsibleSubNav';
import SubNavModeToggle from '../layout/SubNavModeToggle';
import NavSectionLabel from '../layout/NavSectionLabel';
import BillsPage from '../bills/BillsPage';
import ProjectAgreementsPage from './ProjectAgreementsPage';
import MarketingPage from '../marketing/MarketingPage';
import SalesReturnsPage from './SalesReturnsPage';
import BrokerPayouts from '../payouts/BrokerPayouts';
import { Page, InvoiceType, TransactionType } from '../../types';
import { isAccountingView } from '../accounting/accountingReportTypes';
import { useStateSelector, useDispatchOnly } from '../../hooks/useSelectiveState';
import { useAuth } from '../../context/AuthContext';
import useLocalStorage from '../../hooks/useLocalStorage';
// Non-report page imports (not lazy since they're operational)
import ProjectPMPayouts from './ProjectPMPayouts';
import ProjectContractsPage from './ProjectContractsPage';
import ProjectExpenseVouchersPage from './ProjectExpenseVouchersPage';
/** Static import: nested React.lazy + file:// in Electron often causes "Failed to fetch dynamically imported module" for the child chunk. */
import ProjectReceivedAssetsPage from './ProjectReceivedAssetsPage';
import {
  ProjectSellingCustomReportsPage,
  ProjectConstructionCustomReportsPage,
} from '../../modules/report-designer/ReportDesignerPage';

// Lazy-loaded report imports to reduce initial bundle size
const ProjectLayoutReport = React.lazy(() => import('../reports/ProjectLayoutReport'));
const ProjectUnitReport = React.lazy(() => import('../reports/ProjectUnitReport'));
const ProjectSummaryReport = React.lazy(() => import('../reports/ProjectSummaryReport'));
const RevenueAnalysisReport = React.lazy(() => import('../reports/RevenueAnalysisReport'));
const ClientLedgerReport = React.lazy(() => import('../reports/ClientLedgerReport'));
const ProjectBrokerReport = React.lazy(() => import('../reports/ProjectBrokerReport'));
const ProjectCategoryReport = React.lazy(() => import('../reports/ProjectCategoryReport'));
const VendorLedgerReport = React.lazy(() => import('../reports/VendorLedgerReport'));
const ProjectPMCostReport = React.lazy(() => import('../reports/ProjectPMCostReport'));
const ProjectContractReport = React.lazy(() => import('../reports/ProjectContractReport'));
const ProjectBudgetReport = React.lazy(() => import('../reports/ProjectBudgetReport'));
const ProjectMaterialReport = React.lazy(() => import('../reports/ProjectMaterialReport'));
const MarketingActivityReport = React.lazy(() => import('../reports/MarketingActivityReport'));
const ProjectExpenseVoucherReportsPage = React.lazy(() => import('../reports/ProjectExpenseVoucherReportsPage'));
const InvoicesPage = React.lazy(() => import('../invoices/InvoicesPage'));
const ExpenseAnalyticsPage = React.lazy(() => import('../../modules/expense-analytics/ExpenseAnalyticsPage'));
const CollectionsAnalyticsPage = React.lazy(() => import('../../modules/collections-analytics/CollectionsAnalyticsPage'));

interface ProjectManagementPageProps {
    initialPage: Page;
}

// Define all possible view keys
type ProjectView =
    | 'Marketing' | 'Agreements' | 'Contracts' | 'Invoices' | 'Collections Analytics' | 'Bills' | 'Expense Analytics' | 'Expense Vouchers' | 'Sales Returns'
    | 'Assets'
    | 'Broker Payouts' | 'PM Payouts'
    | 'Visual Layout' | 'Tabular View'
    | 'Project Summary' | 'Revenue Analysis' | 'Owner Ledger' | 'Broker Report'
    | 'Income by Category' | 'Expense by Category' | 'Material Report' | 'Vendor Ledger'
    | 'PM Cost Report' | 'Contract Report'
    | 'Budget vs Actual' | 'Marketing Activity' | 'Custom Reports' | 'Vendor Ledger'
    | 'Petty cash report';

/** Project selling — operational tabs (persistent mount) */
const SELLING_OPERATIONAL_VIEWS: ProjectView[] = ['Marketing', 'Agreements', 'Invoices', 'Collections Analytics', 'Assets', 'Sales Returns'];

const SELLING_OTHER_REPORTS: ProjectView[] = [
    'Project Summary',
    'Marketing Activity',
    'Revenue Analysis',
    'Broker Report',
    'Income by Category',
    'Expense by Category',
    'Custom Reports',
];

/** Project construction */
const CONSTRUCTION_OPERATIONAL_VIEWS: ProjectView[] = ['Expense Analytics', 'Contracts', 'Bills', 'Expense Vouchers'];

const CONSTRUCTION_OTHER_REPORTS: ProjectView[] = [
    'Project Summary',
    'Budget vs Actual',
    'Contract Report',
    'PM Cost Report',
    'Material Report',
    'Vendor Ledger',
    'Custom Reports',
    'Owner Ledger',
    'Income by Category',
    'Expense by Category',
    'Petty cash report',
];

const CONSTRUCTION_PERSISTENT_VIEWS: ProjectView[] = ['Contracts', 'Bills', 'Expense Vouchers', 'PM Payouts'];

function projectNavLabelShort(label: string): string {
    const w = label.trim().split(/\s+/);
    if (w.length === 1) return w[0].slice(0, 3).toUpperCase();
    return w.map((x) => x[0]).join('').slice(0, 3).toUpperCase();
}

const ProjectManagementPage: React.FC<ProjectManagementPageProps> = ({ initialPage }) => {
    const initialTabs = useStateSelector(s => s.initialTabs);
    const currentUser = useStateSelector(s => s.currentUser);
    const dispatch = useDispatchOnly();
    const { user } = useAuth();
    const [constructionView, setConstructionView] = useLocalStorage<ProjectView>('projectManagement_activeView', 'Contracts');
    const [sellingView, setSellingView] = useLocalStorage<ProjectView>('projectSelling_activeView', 'Marketing');

    const [sellingReportsExpanded, setSellingReportsExpanded] = useState(true);
    const [constructionReportsExpanded, setConstructionReportsExpanded] = useState(true);

    const sellingSubNav = useCollapsibleSubNav('subnav_project_selling');
    const constructionSubNav = useCollapsibleSubNav('subnav_project_construction');

    const isSellingMode = initialPage === 'projectSelling' || initialPage === 'projectInvoices';
    const activeView = isSellingMode ? sellingView : constructionView;
    const setActiveView = isSellingMode ? setSellingView : setConstructionView;

    const allowedSellingViews = [
        'Marketing', 'Agreements', 'Invoices', 'Collections Analytics', 'Assets', 'Sales Returns', 'Broker Payouts',
        'Visual Layout', 'Tabular View',
        'Project Summary', 'Marketing Activity', 'Revenue Analysis',
        'Broker Report', 'Income by Category', 'Expense by Category',
        'Custom Reports',
    ];

    const allowedConstructionViews = [
        'Contracts', 'Bills', 'Expense Analytics', 'Expense Vouchers', 'PM Payouts',
        'Project Summary', 'Budget vs Actual', 'Contract Report',
        'PM Cost Report', 'Material Report', 'Vendor Ledger', 'Custom Reports',
        'Owner Ledger', 'Income by Category', 'Expense by Category', 'Petty cash report',
    ];

    useEffect(() => {
        if (initialTabs && initialTabs.length > 0) {
            const [mainTab, subTab] = initialTabs;
            if (mainTab === 'Reports' && subTab && isAccountingView(subTab)) {
                dispatch({ type: 'SET_PAGE', payload: 'accounting' });
                dispatch({ type: 'SET_INITIAL_TABS', payload: [subTab] });
                return;
            }
            if (isAccountingView(mainTab)) {
                dispatch({ type: 'SET_PAGE', payload: 'accounting' });
                dispatch({ type: 'SET_INITIAL_TABS', payload: [mainTab] });
                return;
            }
            if (mainTab === 'Reports' && subTab) {
                if (subTab === 'Visual Layout') setActiveView('Visual Layout');
                else if (subTab === 'Project Units') setActiveView('Tabular View');
                else if (subTab === 'PM Cost') setActiveView('PM Cost Report');
                else setActiveView(subTab as ProjectView);
            } else if (['Marketing', 'Agreements', 'Contracts', 'Invoices', 'Collections Analytics', 'Bills', 'Expense Vouchers', 'Sales Returns'].includes(mainTab)) {
                setActiveView(mainTab as ProjectView);
            }
            dispatch({ type: 'CLEAR_INITIAL_TABS' });
            return;
        }

        const defaultView: ProjectView = isSellingMode ? 'Marketing' : 'Contracts';
        if (isAccountingView(activeView)) {
            setActiveView(defaultView);
        } else if (isSellingMode) {
            const legacy = activeView as string;
            if (legacy === 'Custom Report Builder' || legacy === 'Customer Reports') {
                setActiveView('Custom Reports');
            } else if (!allowedSellingViews.includes(activeView as string)) {
                setActiveView(defaultView);
            }
        } else {
            const legacy = activeView as string;
            if (legacy === 'Vendor Reports') {
                setActiveView('Custom Reports');
            } else if (!allowedConstructionViews.includes(activeView as string)) {
                setActiveView(defaultView);
            }
        }
    }, [initialTabs, dispatch, setActiveView, isSellingMode, activeView]);

    const renderContent = () => {
        switch (activeView) {
            case 'Marketing': return <MarketingPage />;
            case 'Agreements': return <ProjectAgreementsPage />;
            case 'Invoices': return <InvoicesPage invoiceTypeFilter={InvoiceType.INSTALLMENT} hideTitleAndGoBack={true} />;
            case 'Collections Analytics': return <CollectionsAnalyticsPage />;
            case 'Assets': return <ProjectReceivedAssetsPage />;
            case 'Contracts': return <ProjectContractsPage />;
            case 'Bills': return <BillsPage projectContext={true} />;
            case 'Expense Analytics': return <ExpenseAnalyticsPage defaultScope="project" showScopeFilter={false} />;
            case 'Expense Vouchers': return <ProjectExpenseVouchersPage projectContext={true} />;
            case 'Sales Returns': return <SalesReturnsPage />;
            case 'Broker Payouts': return <BrokerPayouts context="Project" />;
            case 'PM Payouts': return <ProjectPMPayouts />;
            case 'Visual Layout': return <ProjectLayoutReport />;
            case 'Tabular View': return <ProjectUnitReport />;
            case 'Project Summary': return <ProjectSummaryReport />;
            case 'Revenue Analysis': return <RevenueAnalysisReport />;
            case 'Owner Ledger': return <ClientLedgerReport />;
            case 'Broker Report': return <ProjectBrokerReport />;
            case 'Income by Category': return <ProjectCategoryReport type={TransactionType.INCOME} />;
            case 'Expense by Category': return <ProjectCategoryReport type={TransactionType.EXPENSE} />;
            case 'Material Report': return <ProjectMaterialReport />;
            case 'Vendor Ledger': return <VendorLedgerReport context="Project" />;
            case 'Custom Reports':
                return isSellingMode
                    ? <ProjectSellingCustomReportsPage />
                    : <ProjectConstructionCustomReportsPage />;
            case 'PM Cost Report': return <ProjectPMCostReport />;
            case 'Contract Report': return <ProjectContractReport />;
            case 'Budget vs Actual': return <ProjectBudgetReport />;
            case 'Marketing Activity': return <MarketingActivityReport />;
            case 'Petty cash report': return <ProjectExpenseVoucherReportsPage />;
            default: return null;
        }
    };

    const SELLING_PERSISTENT_VIEWS: ProjectView[] = ['Marketing', 'Agreements', 'Invoices', 'Assets', 'Sales Returns', 'Broker Payouts'];
    const renderSellingPersistentContent = () => {
        if (!isSellingMode) return renderContent();
        if (SELLING_PERSISTENT_VIEWS.includes(activeView)) {
            return (
                <div className="relative h-full w-full">
                    {SELLING_PERSISTENT_VIEWS.map((view) => (
                        <div
                            key={view}
                            className={`absolute inset-0 h-full w-full min-w-0 ${view === 'Invoices' ? 'overflow-y-auto overflow-x-hidden' : 'overflow-auto'} ${activeView === view ? 'visible z-10' : 'invisible z-0 pointer-events-none'}`}
                            {...(activeView !== view ? { 'aria-hidden': true } : {})}
                        >
                            {view === 'Marketing' && <MarketingPage />}
                            {view === 'Agreements' && <ProjectAgreementsPage />}
                            {view === 'Invoices' && <InvoicesPage invoiceTypeFilter={InvoiceType.INSTALLMENT} hideTitleAndGoBack={true} />}
                            {view === 'Assets' && <ProjectReceivedAssetsPage />}
                            {view === 'Sales Returns' && <SalesReturnsPage />}
                            {view === 'Broker Payouts' && <BrokerPayouts context="Project" />}
                        </div>
                    ))}
                </div>
            );
        }
        return renderContent();
    };

    /** Keep Contracts / Bills / PM Payouts mounted when viewing reports so filters, scroll, and sidebar state are preserved. */
    const renderConstructionPersistentContent = () => {
        const operationalVisible = CONSTRUCTION_PERSISTENT_VIEWS.includes(activeView);
        return (
            <div className="relative h-full w-full">
                {CONSTRUCTION_PERSISTENT_VIEWS.map((view) => (
                    <div
                        key={view}
                        className={`absolute inset-0 h-full w-full overflow-auto ${
                            operationalVisible && activeView === view ? 'visible z-10' : 'invisible z-0 pointer-events-none'
                        }`}
                        {...(operationalVisible && activeView === view ? {} : { 'aria-hidden': true })}
                    >
                        {view === 'Contracts' && <ProjectContractsPage />}
                        {view === 'Bills' && <BillsPage projectContext={true} />}
                        {view === 'Expense Vouchers' && <ProjectExpenseVouchersPage projectContext={true} />}
                        {view === 'PM Payouts' && <ProjectPMPayouts />}
                    </div>
                ))}
                {!operationalVisible && (
                    <div className="absolute inset-0 h-full w-full min-w-0 overflow-auto z-10">{renderContent()}</div>
                )}
            </div>
        );
    };

    const sellingReportKeys = [...SELLING_OTHER_REPORTS];
    const constructionReportKeys = [...CONSTRUCTION_OTHER_REPORTS];

    const isSellingReportActive = sellingReportKeys.includes(activeView);
    const isConstructionReportActive = constructionReportKeys.includes(activeView);

    useEffect(() => {
        if (!isSellingMode) return;
        if (sellingReportKeys.includes(activeView)) {
            setSellingReportsExpanded(true);
        }
    }, [isSellingMode, activeView, sellingReportKeys]);

    useEffect(() => {
        if (isSellingMode) return;
        if (constructionReportKeys.includes(activeView)) {
            setConstructionReportsExpanded(true);
        }
    }, [isSellingMode, activeView, constructionReportKeys]);

    const ModuleNavItem = ({ view, label, collapsed, dataTour }: { view: ProjectView; label: string; collapsed: boolean; dataTour?: string }) => {
        const on = activeView === view;
        const short = projectNavLabelShort(label);
        if (collapsed) {
            return (
                <button
                    type="button"
                    title={label}
                    data-tour={dataTour}
                    onClick={() => setActiveView(view)}
                    className={`w-full flex justify-center px-1 py-1.5 rounded-md text-[10px] font-bold leading-tight transition-colors ${on
                        ? 'bg-indigo-600 text-white shadow-sm'
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
                data-tour={dataTour}
                onClick={() => setActiveView(view)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${on
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-900/20'
                    : 'text-app-muted hover:bg-app-table-hover'
                    }`}
            >
                {label}
            </button>
        );
    };

    const sellingNavPanel = (subCollapsed: boolean) => (
        <>
            <div
                className={`border-b border-app-border shrink-0 flex items-center gap-1 ${subCollapsed ? 'flex-col py-2 px-1' : 'justify-between px-3 py-2.5'}`}
            >
                {!subCollapsed && (
                    <NavSectionLabel variant="header">Project selling</NavSectionLabel>
                )}
                <SubNavModeToggle
                    collapsed={sellingSubNav.effectiveCollapsed}
                    onToggle={sellingSubNav.toggle}
                    title={sellingSubNav.toggleTitle}
                    compact
                />
            </div>
            <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-2 space-y-1 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600 min-h-0" aria-label="Project selling navigation" data-tour="project-selling-subnav">
                <div className="space-y-0.5">
                    <ModuleNavItem view="Marketing" label="Marketing" collapsed={subCollapsed} dataTour="selling-plan" />
                    <ModuleNavItem view="Agreements" label="Agreements" collapsed={subCollapsed} dataTour="selling-agreements" />
                    <ModuleNavItem view="Invoices" label="Invoices" collapsed={subCollapsed} dataTour="selling-invoices" />
                    <ModuleNavItem view="Collections Analytics" label="Collections" collapsed={subCollapsed} dataTour="selling-collections" />
                    <ModuleNavItem view="Assets" label="Assets" collapsed={subCollapsed} />
                    <ModuleNavItem view="Sales Returns" label="Returns" collapsed={subCollapsed} />
                </div>

                <div className="pt-3 mt-2 border-t border-app-border space-y-0.5">
                    {!subCollapsed && (
                        <NavSectionLabel variant="section">Payouts</NavSectionLabel>
                    )}
                    <ModuleNavItem view="Broker Payouts" label="Brokers" collapsed={subCollapsed} />
                </div>

                <div className="pt-3 mt-2 border-t border-app-border space-y-0.5">
                    {!subCollapsed && (
                        <NavSectionLabel variant="section">Project views</NavSectionLabel>
                    )}
                    <ModuleNavItem view="Visual Layout" label="Visual" collapsed={subCollapsed} />
                    <ModuleNavItem view="Tabular View" label="Units" collapsed={subCollapsed} />
                </div>

                <div className="pt-3 mt-2 border-t border-app-border">
                    <button
                        type="button"
                        onClick={() => setSellingReportsExpanded((e) => !e)}
                        className={`w-full flex items-center ${subCollapsed ? 'justify-center px-1' : 'justify-between px-3'} py-2 rounded-md text-sm font-medium transition-colors ${isSellingReportActive || sellingReportsExpanded
                            ? 'bg-app-highlight text-primary'
                            : 'text-app-muted hover:bg-app-table-hover'
                            }`}
                    >
                        {subCollapsed ? <span className="text-[10px] font-bold">RPT</span> : <span>Reports</span>}
                        {!subCollapsed && (
                            <svg className={`w-4 h-4 shrink-0 transition-transform ${sellingReportsExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        )}
                    </button>
                    {sellingReportsExpanded && (
                        <div className="mt-1 space-y-0.5">
                            {SELLING_OTHER_REPORTS.map((name) => (
                                <ModuleNavItem key={name} view={name} label={name} collapsed={subCollapsed} />
                            ))}
                        </div>
                    )}
                </div>
            </nav>
        </>
    );

    const constructionNavPanel = (subCollapsed: boolean) => (
        <>
            <div
                className={`border-b border-app-border shrink-0 flex items-center gap-1 ${subCollapsed ? 'flex-col py-2 px-1' : 'justify-between px-3 py-2.5'}`}
            >
                {!subCollapsed && (
                    <NavSectionLabel variant="header">Project construction</NavSectionLabel>
                )}
                <SubNavModeToggle
                    collapsed={constructionSubNav.effectiveCollapsed}
                    onToggle={constructionSubNav.toggle}
                    title={constructionSubNav.toggleTitle}
                    compact
                />
            </div>
            <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-2 space-y-1 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600 min-h-0" aria-label="Project construction navigation" data-tour="project-subnav">
                <div className="space-y-0.5">
                    <ModuleNavItem view="Expense Analytics" label="Expense Analytics" collapsed={subCollapsed} />
                    <ModuleNavItem view="Contracts" label="Contracts" collapsed={subCollapsed} dataTour="project-contracts" />
                    <ModuleNavItem view="Bills" label="Bills" collapsed={subCollapsed} dataTour="project-bills" />
                    <ModuleNavItem view="Expense Vouchers" label="Petty Cash" collapsed={subCollapsed} />
                </div>

                <div className="pt-3 mt-2 border-t border-app-border space-y-0.5">
                    {!subCollapsed && (
                        <NavSectionLabel variant="section">Payouts</NavSectionLabel>
                    )}
                    <ModuleNavItem view="PM Payouts" label="PM Fee Log" collapsed={subCollapsed} />
                </div>

                <div className="pt-3 mt-2 border-t border-app-border">
                    <button
                        type="button"
                        data-tour="project-reports"
                        onClick={() => setConstructionReportsExpanded((e) => !e)}
                        className={`w-full flex items-center ${subCollapsed ? 'justify-center px-1' : 'justify-between px-3'} py-2 rounded-md text-sm font-medium transition-colors ${isConstructionReportActive || constructionReportsExpanded
                            ? 'bg-app-highlight text-primary'
                            : 'text-app-muted hover:bg-app-table-hover'
                            }`}
                    >
                        {subCollapsed ? <span className="text-[10px] font-bold">RPT</span> : <span>Reports</span>}
                        {!subCollapsed && (
                            <svg className={`w-4 h-4 shrink-0 transition-transform ${constructionReportsExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        )}
                    </button>
                    {constructionReportsExpanded && (
                        <div className="mt-1 space-y-0.5">
                            {CONSTRUCTION_OTHER_REPORTS.map((name) => (
                                <ModuleNavItem key={name} view={name} label={name} collapsed={subCollapsed} />
                            ))}
                        </div>
                    )}
                </div>
            </nav>
        </>
    );

    const allSellingMobileOptions: { value: ProjectView; label: string; group: string }[] = [
        ...SELLING_OPERATIONAL_VIEWS.map((v) => ({ value: v, label: v === 'Sales Returns' ? 'Returns' : v, group: 'Operations' })),
        { value: 'Broker Payouts', label: 'Brokers', group: 'Payouts' },
        { value: 'Visual Layout', label: 'Visual', group: 'Project views' },
        { value: 'Tabular View', label: 'Units', group: 'Project views' },
        ...SELLING_OTHER_REPORTS.map((v) => ({ value: v, label: v === 'Custom Reports' ? 'Custom reports' : v, group: 'Reports' })),
    ];

    const allConstructionMobileOptions: { value: ProjectView; label: string; group: string }[] = [
        ...CONSTRUCTION_OPERATIONAL_VIEWS.map((v) => ({ value: v, label: v === 'Expense Vouchers' ? 'Petty Cash' : v, group: 'Operations' })),
        { value: 'PM Payouts', label: 'PM Fee Log', group: 'Payouts' },
        ...CONSTRUCTION_OTHER_REPORTS.map((v) => ({
            value: v,
            label: v === 'Custom Reports' ? 'Custom reports' : v,
            group: 'Reports',
        })),
    ];

    const sharedContentShell = (children: React.ReactNode) => (
        <div className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col px-2 sm:px-3 md:px-0 pt-2 md:pt-0">
            <Suspense fallback={<div className="flex items-center justify-center h-full text-app-muted">Loading...</div>}>
                {children}
            </Suspense>
        </div>
    );

    // ——— Project selling: second-level left nav ———
    if (isSellingMode) {
        return (
            <div className="flex flex-col md:flex-row h-full min-h-0 w-full">
                <aside
                    className={`hidden md:flex flex-col shrink-0 border-r border-app-border bg-app-toolbar/40 h-full min-h-0 overflow-hidden transition-[width] duration-200 ease-out ${sellingSubNav.effectiveCollapsed ? 'w-14' : 'w-60'}`}
                    aria-label="Project selling secondary navigation"
                >
                    {sellingNavPanel(sellingSubNav.effectiveCollapsed)}
                </aside>

                <div className="md:hidden shrink-0 border-b border-app-border bg-app-toolbar/40 px-3 py-2">
                    <NavSectionLabel as="label" variant="form" htmlFor="project-selling-view">Project selling</NavSectionLabel>
                    <select
                        id="project-selling-view"
                        value={activeView}
                        onChange={(e) => setActiveView(e.target.value as ProjectView)}
                        className="w-full rounded-lg border border-app-border bg-app-input text-app-text text-sm py-2 px-3"
                        aria-label="Project selling section"
                    >
                        {['Operations', 'Payouts', 'Project views', 'Reports'].map((group) => {
                            const opts = allSellingMobileOptions.filter((o) => o.group === group);
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

                {sharedContentShell(renderSellingPersistentContent())}
            </div>
        );
    }

    // ——— Project construction: second-level left nav ———
    return (
        <div className="flex flex-col md:flex-row h-full min-h-0 w-full">
            <aside
                className={`hidden md:flex flex-col shrink-0 border-r border-app-border bg-app-toolbar/40 h-full min-h-0 overflow-hidden transition-[width] duration-200 ease-out ${constructionSubNav.effectiveCollapsed ? 'w-14' : 'w-60'}`}
                aria-label="Project construction secondary navigation"
            >
                {constructionNavPanel(constructionSubNav.effectiveCollapsed)}
            </aside>

            <div className="md:hidden shrink-0 border-b border-app-border bg-app-toolbar/40 px-3 py-2">
                <NavSectionLabel as="label" variant="form" htmlFor="project-construction-view">Project construction</NavSectionLabel>
                <select
                    id="project-construction-view"
                    value={activeView}
                    onChange={(e) => setActiveView(e.target.value as ProjectView)}
                        className="w-full ds-input-field text-sm py-2 px-3"
                    aria-label="Project construction section"
                >
                    {['Operations', 'Payouts', 'Reports'].map((group) => {
                        const opts = allConstructionMobileOptions.filter((o) => o.group === group);
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

            {sharedContentShell(renderConstructionPersistentContent())}
        </div>
    );
};

export default memo(ProjectManagementPage);
