
import React, { useState, useEffect, memo, Suspense } from 'react';
import { useCollapsibleSubNav } from '../../hooks/useCollapsibleSubNav';
import SubNavModeToggle from '../layout/SubNavModeToggle';
import BillsPage from '../bills/BillsPage';
import ProjectAgreementsPage from './ProjectAgreementsPage';
import MarketingPage from '../marketing/MarketingPage';
import SalesReturnsPage from './SalesReturnsPage';
import BrokerPayouts from '../payouts/BrokerPayouts';
import { Page, InvoiceType, TransactionType } from '../../types';
import { useStateSelector, useDispatchOnly } from '../../hooks/useSelectiveState';
import { useAuth } from '../../context/AuthContext';
import useLocalStorage from '../../hooks/useLocalStorage';
// Non-report page imports (not lazy since they're operational)
import ProjectPMPayouts from './ProjectPMPayouts';
import ProjectContractsPage from './ProjectContractsPage';
/** Static import: nested React.lazy + file:// in Electron often causes "Failed to fetch dynamically imported module" for the child chunk. */
import ProjectReceivedAssetsPage from './ProjectReceivedAssetsPage';

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
const ProjectProfitLossReport = React.lazy(() => import('../reports/ProjectProfitLossReport'));
const ProjectBalanceSheetReport = React.lazy(() => import('../reports/ProjectBalanceSheetReport'));
const ProjectInvestorReport = React.lazy(() => import('../reports/ProjectInvestorReport'));
const ProjectContractReport = React.lazy(() => import('../reports/ProjectContractReport'));
const ProjectBudgetReport = React.lazy(() => import('../reports/ProjectBudgetReport'));
const ProjectMaterialReport = React.lazy(() => import('../reports/ProjectMaterialReport'));
const ProjectCashFlowReport = React.lazy(() => import('../reports/ProjectCashFlowReport'));
const TrialBalanceReport = React.lazy(() => import('../reports/TrialBalanceReport'));
const MarketingActivityReport = React.lazy(() => import('../reports/MarketingActivityReport'));
const InvoicesPage = React.lazy(() => import('../invoices/InvoicesPage'));

interface ProjectManagementPageProps {
    initialPage: Page;
}

// Define all possible view keys
type ProjectView =
    | 'Marketing' | 'Agreements' | 'Contracts' | 'Invoices' | 'Bills' | 'Sales Returns'
    | 'Assets'
    | 'Broker Payouts' | 'PM Payouts'
    | 'Visual Layout' | 'Tabular View'
    | 'Project Summary' | 'Revenue Analysis' | 'Owner Ledger' | 'Broker Report'
    | 'Income by Category' | 'Expense by Category' | 'Material Report' | 'Vendor Ledger'
    | 'PM Cost Report' | 'Profit & Loss' | 'Balance Sheet' | 'Trial Balance' | 'Investor Distribution' | 'Contract Report'
    | 'Budget vs Actual' | 'Cash Flows' | 'Marketing Activity';

/** Project selling — operational tabs (persistent mount) */
const SELLING_OPERATIONAL_VIEWS: ProjectView[] = ['Marketing', 'Agreements', 'Invoices', 'Assets', 'Sales Returns'];

const SELLING_FINANCIAL_REPORTS: ProjectView[] = ['Profit & Loss', 'Balance Sheet', 'Trial Balance', 'Cash Flows', 'Investor Distribution'];

const SELLING_OTHER_REPORTS: ProjectView[] = [
    'Project Summary',
    'Marketing Activity',
    'Revenue Analysis',
    'Broker Report',
    'Owner Ledger',
    'Income by Category',
    'Expense by Category',
];

/** Project construction */
const CONSTRUCTION_OPERATIONAL_VIEWS: ProjectView[] = ['Contracts', 'Bills'];

const CONSTRUCTION_FINANCIAL_REPORTS: ProjectView[] = ['Profit & Loss', 'Balance Sheet', 'Trial Balance', 'Cash Flows', 'Investor Distribution'];

const CONSTRUCTION_OTHER_REPORTS: ProjectView[] = [
    'Project Summary',
    'Budget vs Actual',
    'Contract Report',
    'PM Cost Report',
    'Material Report',
    'Vendor Ledger',
    'Owner Ledger',
    'Income by Category',
    'Expense by Category',
];

const CONSTRUCTION_PERSISTENT_VIEWS: ProjectView[] = ['Contracts', 'Bills', 'PM Payouts'];

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
    const isAdmin = user?.role === 'Admin' || currentUser?.role === 'Admin';

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
        'Marketing', 'Agreements', 'Invoices', 'Assets', 'Sales Returns', 'Broker Payouts',
        'Visual Layout', 'Tabular View',
        'Project Summary', 'Marketing Activity', 'Revenue Analysis',
        'Owner Ledger', 'Broker Report', 'Income by Category', 'Expense by Category',
        'Profit & Loss', 'Balance Sheet', 'Trial Balance', 'Cash Flows', 'Investor Distribution'
    ];

    const allowedConstructionViews = [
        'Contracts', 'Bills', 'PM Payouts',
        'Project Summary', 'Budget vs Actual', 'Contract Report',
        'PM Cost Report', 'Material Report', 'Vendor Ledger',
        'Owner Ledger', 'Income by Category', 'Expense by Category',
        'Profit & Loss', 'Balance Sheet', 'Trial Balance', 'Cash Flows', 'Investor Distribution'
    ];

    useEffect(() => {
        if (initialTabs && initialTabs.length > 0) {
            const [mainTab, subTab] = initialTabs;
            if (mainTab === 'Reports' && subTab) {
                if (subTab === 'Visual Layout') setActiveView('Visual Layout');
                else if (subTab === 'Project Units') setActiveView('Tabular View');
                else if (subTab === 'PM Cost') setActiveView('PM Cost Report');
                else setActiveView(subTab as ProjectView);
            } else if (['Marketing', 'Agreements', 'Contracts', 'Invoices', 'Bills', 'Sales Returns'].includes(mainTab)) {
                setActiveView(mainTab as ProjectView);
            }
            dispatch({ type: 'CLEAR_INITIAL_TABS' });
        } else {
            if (isSellingMode) {
                if (!allowedSellingViews.includes(activeView as string)) {
                    setActiveView('Marketing');
                }
            } else {
                if (!allowedConstructionViews.includes(activeView as string)) {
                    setActiveView('Contracts');
                }
            }
        }
    }, [initialTabs, dispatch, setActiveView, isSellingMode, activeView]);

    const renderContent = () => {
        switch (activeView) {
            case 'Marketing': return <MarketingPage />;
            case 'Agreements': return <ProjectAgreementsPage />;
            case 'Invoices': return <InvoicesPage invoiceTypeFilter={InvoiceType.INSTALLMENT} hideTitleAndGoBack={true} />;
            case 'Assets': return <ProjectReceivedAssetsPage />;
            case 'Contracts': return <ProjectContractsPage />;
            case 'Bills': return <BillsPage projectContext={true} />;
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
            case 'PM Cost Report': return <ProjectPMCostReport />;
            case 'Contract Report': return <ProjectContractReport />;
            case 'Budget vs Actual': return <ProjectBudgetReport />;
            case 'Marketing Activity': return <MarketingActivityReport />;
            case 'Profit & Loss': return isAdmin ? <ProjectProfitLossReport /> : null;
            case 'Balance Sheet': return isAdmin ? <ProjectBalanceSheetReport /> : null;
            case 'Trial Balance': return isAdmin ? <TrialBalanceReport /> : null;
            case 'Cash Flows': return isAdmin ? <ProjectCashFlowReport /> : null;
            case 'Investor Distribution': return isAdmin ? <ProjectInvestorReport /> : null;
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
                        {view === 'PM Payouts' && <ProjectPMPayouts />}
                    </div>
                ))}
                {!operationalVisible && (
                    <div className="absolute inset-0 h-full w-full min-w-0 overflow-auto z-10">{renderContent()}</div>
                )}
            </div>
        );
    };

    const sellingReportKeys = [...(isAdmin ? SELLING_FINANCIAL_REPORTS : []), ...SELLING_OTHER_REPORTS];
    const constructionReportKeys = [...(isAdmin ? CONSTRUCTION_FINANCIAL_REPORTS : []), ...CONSTRUCTION_OTHER_REPORTS];

    const isSellingReportActive = sellingReportKeys.includes(activeView);
    const isConstructionReportActive = constructionReportKeys.includes(activeView);

    useEffect(() => {
        if (!isSellingMode) return;
        if (sellingReportKeys.includes(activeView)) {
            setSellingReportsExpanded(true);
        }
    }, [isSellingMode, activeView, isAdmin]);

    useEffect(() => {
        if (isSellingMode) return;
        if (constructionReportKeys.includes(activeView)) {
            setConstructionReportsExpanded(true);
        }
    }, [isSellingMode, activeView, isAdmin]);

    const ModuleNavItem = ({ view, label, collapsed }: { view: ProjectView; label: string; collapsed: boolean }) => {
        const on = activeView === view;
        const short = projectNavLabelShort(label);
        if (collapsed) {
            return (
                <button
                    type="button"
                    title={label}
                    onClick={() => setActiveView(view)}
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
                onClick={() => setActiveView(view)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${on
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-900/20'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-700/80'
                    }`}
            >
                {label}
            </button>
        );
    };

    const sellingNavPanel = (subCollapsed: boolean) => (
        <>
            <div
                className={`border-b border-slate-200 dark:border-slate-700 shrink-0 flex items-center gap-1 ${subCollapsed ? 'flex-col py-2 px-1' : 'justify-between px-3 py-2.5'}`}
            >
                {!subCollapsed && (
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Project selling</p>
                )}
                <SubNavModeToggle
                    collapsed={sellingSubNav.effectiveCollapsed}
                    onToggle={sellingSubNav.toggle}
                    title={sellingSubNav.toggleTitle}
                    compact
                />
            </div>
            <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-2 space-y-1 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600 min-h-0" aria-label="Project selling navigation">
                <div className="space-y-0.5">
                    <ModuleNavItem view="Marketing" label="Marketing" collapsed={subCollapsed} />
                    <ModuleNavItem view="Agreements" label="Agreements" collapsed={subCollapsed} />
                    <ModuleNavItem view="Invoices" label="Invoices" collapsed={subCollapsed} />
                    <ModuleNavItem view="Assets" label="Assets" collapsed={subCollapsed} />
                    <ModuleNavItem view="Sales Returns" label="Returns" collapsed={subCollapsed} />
                </div>

                <div className="pt-3 mt-2 border-t border-slate-200 dark:border-slate-700 space-y-0.5">
                    {!subCollapsed && (
                        <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Payouts</p>
                    )}
                    <ModuleNavItem view="Broker Payouts" label="Brokers" collapsed={subCollapsed} />
                </div>

                <div className="pt-3 mt-2 border-t border-slate-200 dark:border-slate-700 space-y-0.5">
                    {!subCollapsed && (
                        <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Project views</p>
                    )}
                    <ModuleNavItem view="Visual Layout" label="Visual" collapsed={subCollapsed} />
                    <ModuleNavItem view="Tabular View" label="Units" collapsed={subCollapsed} />
                </div>

                <div className="pt-3 mt-2 border-t border-slate-200 dark:border-slate-700">
                    <button
                        type="button"
                        onClick={() => setSellingReportsExpanded((e) => !e)}
                        className={`w-full flex items-center ${subCollapsed ? 'justify-center px-1' : 'justify-between px-3'} py-2 rounded-md text-sm font-medium transition-colors ${isSellingReportActive || sellingReportsExpanded
                            ? 'bg-indigo-50 dark:bg-indigo-950/50 text-accent'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-700/80'
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
                        <div className="mt-1 space-y-2">
                            {isAdmin && (
                                <div>
                                    {!subCollapsed && (
                                        <p className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Financial statements</p>
                                    )}
                                    <div className="space-y-0.5">
                                        {SELLING_FINANCIAL_REPORTS.map((name) => (
                                            <ModuleNavItem key={name} view={name} label={name} collapsed={subCollapsed} />
                                        ))}
                                    </div>
                                </div>
                            )}
                            <div>
                                {!subCollapsed && (
                                    <p className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Operational reports</p>
                                )}
                                <div className="space-y-0.5">
                                    {SELLING_OTHER_REPORTS.map((name) => (
                                        <ModuleNavItem key={name} view={name} label={name} collapsed={subCollapsed} />
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </nav>
        </>
    );

    const constructionNavPanel = (subCollapsed: boolean) => (
        <>
            <div
                className={`border-b border-slate-200 dark:border-slate-700 shrink-0 flex items-center gap-1 ${subCollapsed ? 'flex-col py-2 px-1' : 'justify-between px-3 py-2.5'}`}
            >
                {!subCollapsed && (
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Project construction</p>
                )}
                <SubNavModeToggle
                    collapsed={constructionSubNav.effectiveCollapsed}
                    onToggle={constructionSubNav.toggle}
                    title={constructionSubNav.toggleTitle}
                    compact
                />
            </div>
            <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-2 space-y-1 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600 min-h-0" aria-label="Project construction navigation">
                <div className="space-y-0.5">
                    <ModuleNavItem view="Contracts" label="Contracts" collapsed={subCollapsed} />
                    <ModuleNavItem view="Bills" label="Bills" collapsed={subCollapsed} />
                </div>

                <div className="pt-3 mt-2 border-t border-slate-200 dark:border-slate-700 space-y-0.5">
                    {!subCollapsed && (
                        <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Payouts</p>
                    )}
                    <ModuleNavItem view="PM Payouts" label="PM Fee Log" collapsed={subCollapsed} />
                </div>

                <div className="pt-3 mt-2 border-t border-slate-200 dark:border-slate-700">
                    <button
                        type="button"
                        onClick={() => setConstructionReportsExpanded((e) => !e)}
                        className={`w-full flex items-center ${subCollapsed ? 'justify-center px-1' : 'justify-between px-3'} py-2 rounded-md text-sm font-medium transition-colors ${isConstructionReportActive || constructionReportsExpanded
                            ? 'bg-indigo-50 dark:bg-indigo-950/50 text-accent'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-700/80'
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
                        <div className="mt-1 space-y-2">
                            {isAdmin && (
                                <div>
                                    {!subCollapsed && (
                                        <p className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Financial statements</p>
                                    )}
                                    <div className="space-y-0.5">
                                        {CONSTRUCTION_FINANCIAL_REPORTS.map((name) => (
                                            <ModuleNavItem key={name} view={name} label={name} collapsed={subCollapsed} />
                                        ))}
                                    </div>
                                </div>
                            )}
                            <div>
                                {!subCollapsed && (
                                    <p className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Operational reports</p>
                                )}
                                <div className="space-y-0.5">
                                    {CONSTRUCTION_OTHER_REPORTS.map((name) => (
                                        <ModuleNavItem key={name} view={name} label={name} collapsed={subCollapsed} />
                                    ))}
                                </div>
                            </div>
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
        ...(isAdmin ? SELLING_FINANCIAL_REPORTS.map((v) => ({ value: v, label: v, group: 'Reports — Financial' })) : []),
        ...SELLING_OTHER_REPORTS.map((v) => ({ value: v, label: v, group: 'Reports — Operational' })),
    ];

    const allConstructionMobileOptions: { value: ProjectView; label: string; group: string }[] = [
        ...CONSTRUCTION_OPERATIONAL_VIEWS.map((v) => ({ value: v, label: v, group: 'Operations' })),
        { value: 'PM Payouts', label: 'PM Fee Log', group: 'Payouts' },
        ...(isAdmin ? CONSTRUCTION_FINANCIAL_REPORTS.map((v) => ({ value: v, label: v, group: 'Reports — Financial' })) : []),
        ...CONSTRUCTION_OTHER_REPORTS.map((v) => ({ value: v, label: v, group: 'Reports — Operational' })),
    ];

    const sharedContentShell = (children: React.ReactNode) => (
        <div className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col px-2 sm:px-3 md:px-0 pt-2 md:pt-0">
            <Suspense fallback={<div className="flex items-center justify-center h-full text-slate-400">Loading...</div>}>
                {children}
            </Suspense>
        </div>
    );

    // ——— Project selling: second-level left nav ———
    if (isSellingMode) {
        return (
            <div className="flex flex-col md:flex-row h-full min-h-0 w-full">
                <aside
                    className={`hidden md:flex flex-col shrink-0 border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 h-full min-h-0 overflow-hidden transition-[width] duration-200 ease-out ${sellingSubNav.effectiveCollapsed ? 'w-14' : 'w-60'}`}
                    aria-label="Project selling secondary navigation"
                >
                    {sellingNavPanel(sellingSubNav.effectiveCollapsed)}
                </aside>

                <div className="md:hidden shrink-0 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 px-3 py-2">
                    <label htmlFor="project-selling-view" className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Project selling</label>
                    <select
                        id="project-selling-view"
                        value={activeView}
                        onChange={(e) => setActiveView(e.target.value as ProjectView)}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm py-2 px-3"
                        aria-label="Project selling section"
                    >
                        {['Operations', 'Payouts', 'Project views', 'Reports — Financial', 'Reports — Operational'].map((group) => {
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
                className={`hidden md:flex flex-col shrink-0 border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 h-full min-h-0 overflow-hidden transition-[width] duration-200 ease-out ${constructionSubNav.effectiveCollapsed ? 'w-14' : 'w-60'}`}
                aria-label="Project construction secondary navigation"
            >
                {constructionNavPanel(constructionSubNav.effectiveCollapsed)}
            </aside>

            <div className="md:hidden shrink-0 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 px-3 py-2">
                <label htmlFor="project-construction-view" className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Project construction</label>
                <select
                    id="project-construction-view"
                    value={activeView}
                    onChange={(e) => setActiveView(e.target.value as ProjectView)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm py-2 px-3"
                    aria-label="Project construction section"
                >
                    {['Operations', 'Payouts', 'Reports — Financial', 'Reports — Operational'].map((group) => {
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
