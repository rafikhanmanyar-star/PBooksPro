
import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import InvoicesPage from '../invoices/InvoicesPage';
import BillsPage from '../bills/BillsPage';
import ProjectAgreementsPage from './ProjectAgreementsPage';
import MarketingPage from '../marketing/MarketingPage';
import SalesReturnsPage from './SalesReturnsPage';
import BrokerPayouts from '../payouts/BrokerPayouts';
import { Page, InvoiceType, TransactionType } from '../../types';
import { useAppContext } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import useLocalStorage from '../../hooks/useLocalStorage';
import { ICONS } from '../../constants';

// Direct Report Imports
import ProjectLayoutReport from '../reports/ProjectLayoutReport';
import ProjectUnitReport from '../reports/ProjectUnitReport';
import ProjectSummaryReport from '../reports/ProjectSummaryReport';
import RevenueAnalysisReport from '../reports/RevenueAnalysisReport';
import ClientLedgerReport from '../reports/ClientLedgerReport';
import ProjectBrokerReport from '../reports/ProjectBrokerReport';
import ProjectCategoryReport from '../reports/ProjectCategoryReport';
import VendorLedgerReport from '../reports/VendorLedgerReport';
import ProjectPMCostReport from '../reports/ProjectPMCostReport';
import ProjectPMPayouts from './ProjectPMPayouts';
import ProjectProfitLossReport from '../reports/ProjectProfitLossReport';
import ProjectBalanceSheetReport from '../reports/ProjectBalanceSheetReport';
import ProjectInvestorReport from '../reports/ProjectInvestorReport';
import ProjectContractsPage from './ProjectContractsPage';
import ProjectContractReport from '../reports/ProjectContractReport';
import ProjectBudgetReport from '../reports/ProjectBudgetReport';
import ProjectMaterialReport from '../reports/ProjectMaterialReport';
import ProjectCashFlowReport from '../reports/ProjectCashFlowReport';
import MarketingActivityReport from '../reports/MarketingActivityReport';

interface ProjectManagementPageProps {
    initialPage: Page;
}

// Define all possible view keys
type ProjectView =
    | 'Marketing' | 'Agreements' | 'Contracts' | 'Invoices' | 'Bills' | 'Sales Returns'
    | 'Broker Payouts' | 'PM Payouts'
    | 'Visual Layout' | 'Tabular View'
    | 'Project Summary' | 'Revenue Analysis' | 'Owner Ledger' | 'Broker Report'
    | 'Income by Category' | 'Expense by Category' | 'Material Report' | 'Vendor Ledger'
    | 'PM Cost Report' | 'Profit & Loss' | 'Balance Sheet' | 'Investor Distribution' | 'Contract Report'
    | 'Budget vs Actual' | 'Cash Flows' | 'Marketing Activity';

const ProjectManagementPage: React.FC<ProjectManagementPageProps> = ({ initialPage }) => {
    const { state, dispatch } = useAppContext();
    const { initialTabs, currentUser } = state;
    const { user } = useAuth();
    // Check admin role from both AuthContext (cloud auth) and AppContext (local auth)
    const isAdmin = user?.role === 'Admin' || currentUser?.role === 'Admin';

    // Detect Mobile
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const [activeView, setActiveView] = useLocalStorage<ProjectView>('projectManagement_activeView', 'Agreements');

    const [isReportDropdownOpen, setIsReportDropdownOpen] = useState(false);
    const [isPayoutDropdownOpen, setIsPayoutDropdownOpen] = useState(false);

    const reportDropdownRef = useRef<HTMLDivElement>(null);
    const payoutDropdownRef = useRef<HTMLDivElement>(null);

    // Handle outside click for dropdowns
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (reportDropdownRef.current && !reportDropdownRef.current.contains(event.target as Node)) {
                setIsReportDropdownOpen(false);
            }
            if (payoutDropdownRef.current && !payoutDropdownRef.current.contains(event.target as Node)) {
                setIsPayoutDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const isSellingMode = initialPage === 'projectSelling' || initialPage === 'projectInvoices';

    // Lists of allowed views for each mode - used for resetting invalid states
    const allowedSellingViews = [
        'Marketing', 'Agreements', 'Invoices', 'Broker Payouts',
        'Visual Layout', 'Tabular View',
        'Project Summary', 'Marketing Activity', 'Revenue Analysis',
        'Owner Ledger', 'Broker Report', 'Income by Category', 'Expense by Category',
        'Profit & Loss', 'Balance Sheet', 'Cash Flows', 'Investor Distribution'
    ];

    const allowedConstructionViews = [
        'Contracts', 'Bills', 'Sales Returns', 'PM Payouts',
        'Visual Layout', 'Tabular View',
        'Project Summary', 'Budget vs Actual', 'Contract Report',
        'PM Cost Report', 'Material Report', 'Vendor Ledger',
        'Owner Ledger', 'Income by Category', 'Expense by Category',
        'Profit & Loss', 'Balance Sheet', 'Cash Flows', 'Investor Distribution'
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
            // Validate current activeView based on mode
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
            case 'Cash Flows': return isAdmin ? <ProjectCashFlowReport /> : null;
            case 'Investor Distribution': return isAdmin ? <ProjectInvestorReport /> : null;
            default: return null;
        }
    };

    const isReportActive = [
        'Project Summary', 'Marketing Activity', 'Profit & Loss', 'Balance Sheet', 'Investor Distribution', 'Revenue Analysis', 'Owner Ledger', 'Broker Report',
        'Income by Category', 'Expense by Category', 'Material Report', 'Vendor Ledger', 'PM Cost Report', 'Contract Report', 'Budget vs Actual', 'Cash Flows'
    ].includes(activeView);

    const isPayoutActive = ['Broker Payouts', 'PM Payouts'].includes(activeView);

    const NavButton = ({ view, label }: { view: ProjectView, label: string }) => (
        <button
            onClick={() => setActiveView(view)}
            className={`whitespace-nowrap px-3 py-2 text-sm font-medium rounded-md transition-colors ${activeView === view
                ? 'bg-indigo-50 text-accent ring-1 ring-indigo-100'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
        >
            {label}
        </button>
    );

    return (
        <div className="flex flex-col h-full space-y-4">
            {/* Custom Navigation Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between bg-white border-b border-slate-200 px-4 py-2 shadow-sm flex-shrink-0 gap-3 md:gap-4 z-50 relative">

                {/* Left Side: Operational Tabs & Reports Dropdown */}
                <div className="flex items-center flex-grow min-w-0">
                    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-shrink">
                        {isSellingMode ? (
                            <>
                                <NavButton view="Marketing" label="Marketing" />
                                <NavButton view="Agreements" label="Agreements" />
                                <NavButton view="Invoices" label="Invoices" />
                            </>
                        ) : (
                            <>
                                <NavButton view="Contracts" label="Contracts" />
                                <NavButton view="Bills" label="Bills" />
                                <NavButton view="Sales Returns" label="Returns" />
                            </>
                        )}
                    </div>

                    <div className="w-px h-5 bg-slate-300 mx-2 flex-shrink-0"></div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                        <div className="relative" ref={payoutDropdownRef}>
                            <button
                                onClick={() => { setIsPayoutDropdownOpen(!isPayoutDropdownOpen); setIsReportDropdownOpen(false); }}
                                className={`whitespace-nowrap px-3 py-2 text-sm font-medium rounded-md transition-colors ${isPayoutActive || isPayoutDropdownOpen
                                    ? 'bg-indigo-50 text-accent ring-1 ring-indigo-100'
                                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                    }`}
                            >
                                Payouts
                            </button>

                            {isPayoutDropdownOpen && (
                                <div className="absolute left-0 mt-2 w-48 bg-white border border-slate-200 rounded-lg shadow-xl z-[100] animate-fade-in-fast overflow-hidden">
                                    <div className="py-1">
                                        {isSellingMode && (
                                            <button
                                                onClick={() => { setActiveView('Broker Payouts'); setIsPayoutDropdownOpen(false); }}
                                                className={`block w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors ${activeView === 'Broker Payouts' ? 'text-accent font-medium bg-indigo-50/50' : 'text-slate-700'}`}
                                            >
                                                Brokers
                                            </button>
                                        )}
                                        {!isSellingMode && (
                                            <button
                                                onClick={() => { setActiveView('PM Payouts'); setIsPayoutDropdownOpen(false); }}
                                                className={`block w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors ${activeView === 'PM Payouts' ? 'text-accent font-medium bg-indigo-50/50' : 'text-slate-700'}`}
                                            >
                                                PM Fee Log
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="relative" ref={reportDropdownRef}>
                            <button
                                onClick={() => { setIsReportDropdownOpen(!isReportDropdownOpen); setIsPayoutDropdownOpen(false); }}
                                className={`whitespace-nowrap px-3 py-2 text-sm font-medium rounded-md transition-colors ${isReportActive || isReportDropdownOpen
                                    ? 'bg-indigo-50 text-accent ring-1 ring-indigo-100'
                                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                    }`}
                            >
                                Reports
                            </button>

                            {isReportDropdownOpen && (
                                <div className="absolute left-0 mt-2 w-64 bg-white border border-slate-200 rounded-lg shadow-xl z-[100] animate-fade-in-fast overflow-hidden">
                                    <div className="max-h-[70vh] overflow-y-auto no-scrollbar">
                                        {isAdmin && (
                                            <>
                                                <div className="bg-slate-50 px-4 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">Financial Statements</div>
                                                <button onClick={() => { setActiveView('Profit & Loss'); setIsReportDropdownOpen(false); }} className={`block w-full text-left px-4 py-2 text-sm hover:bg-slate-50 ${activeView === 'Profit & Loss' ? 'text-accent font-semibold bg-indigo-50/30' : 'text-slate-600'}`}>Profit & Loss</button>
                                                <button onClick={() => { setActiveView('Balance Sheet'); setIsReportDropdownOpen(false); }} className={`block w-full text-left px-4 py-2 text-sm hover:bg-slate-50 ${activeView === 'Balance Sheet' ? 'text-accent font-semibold bg-indigo-50/30' : 'text-slate-600'}`}>Balance Sheet</button>
                                                <button onClick={() => { setActiveView('Cash Flows'); setIsReportDropdownOpen(false); }} className={`block w-full text-left px-4 py-2 text-sm hover:bg-slate-50 ${activeView === 'Cash Flows' ? 'text-accent font-semibold bg-indigo-50/30' : 'text-slate-600'}`}>Cash Flows</button>
                                                <button onClick={() => { setActiveView('Investor Distribution'); setIsReportDropdownOpen(false); }} className={`block w-full text-left px-4 py-2 text-sm hover:bg-slate-50 ${activeView === 'Investor Distribution' ? 'text-accent font-semibold bg-indigo-50/30' : 'text-slate-600'}`}>Investor Distribution</button>
                                            </>
                                        )}

                                        <div className="bg-slate-50 px-4 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-t border-b border-slate-100 mt-1">Operational Reports</div>
                                        {[
                                            'Project Summary',
                                            ...(isSellingMode ? ['Marketing Activity', 'Revenue Analysis', 'Broker Report'] : []),
                                            ...(!isSellingMode ? ['Budget vs Actual', 'Contract Report', 'PM Cost Report', 'Material Report', 'Vendor Ledger'] : []),
                                            'Owner Ledger',
                                            'Income by Category',
                                            'Expense by Category'
                                        ].map((reportName) => (
                                            <button
                                                key={reportName}
                                                onClick={() => {
                                                    setActiveView(reportName as ProjectView);
                                                    setIsReportDropdownOpen(false);
                                                }}
                                                className={`block w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors ${activeView === reportName ? 'text-accent font-medium bg-indigo-50/50' : 'text-slate-700'}`}
                                            >
                                                {reportName}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Side: Segmented Control for Layouts - Only shown in Construction mode */}
                {!isSellingMode && (
                    <div className="flex items-center bg-slate-100 rounded-lg p-1 flex-shrink-0">
                        <button
                            onClick={() => setActiveView('Visual Layout')}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${activeView === 'Visual Layout' ? 'bg-white shadow text-accent' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Visual
                        </button>
                        <button
                            onClick={() => setActiveView('Tabular View')}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${activeView === 'Tabular View' ? 'bg-white shadow text-accent' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Units
                        </button>
                    </div>
                )}
            </div>

            <div className="flex-grow overflow-hidden px-4 md:px-0">
                {renderContent()}
            </div>
        </div>
    );
};

export default memo(ProjectManagementPage);
