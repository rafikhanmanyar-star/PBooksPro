
import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import InvoicesPage from '../invoices/InvoicesPage';
import BillsPage from '../bills/BillsPage';
import ProjectAgreementsPage from './ProjectAgreementsPage';
import SalesReturnsPage from './SalesReturnsPage';
import BrokerPayouts from '../payouts/BrokerPayouts';
import { Page, InvoiceType, TransactionType } from '../../types';
import { useAppContext } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import useLocalStorage from '../../hooks/useLocalStorage';

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
    | 'Budget vs Actual' | 'Cash Flows';

const ProjectManagementPage: React.FC<ProjectManagementPageProps> = ({ initialPage }) => {
    const { state, dispatch } = useAppContext();
    const { initialTabs, currentUser } = state;
    const { user } = useAuth();
    // Check admin role from both AuthContext (cloud auth) and AppContext (local auth)
    // Organization admins should have full access to all reports
    const isAdmin = user?.role === 'Admin' || currentUser?.role === 'Admin';
    
    // Detect Mobile
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const [activeView, setActiveView] = useLocalStorage<ProjectView>('projectManagement_activeView', isMobile ? 'Invoices' : 'Agreements');
    
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

    useEffect(() => {
        switch(initialPage) {
            case 'projectInvoices': setActiveView('Invoices'); break;
            case 'bills': setActiveView('Bills'); break;
            case 'projectManagement': break; // Keep current
            default: break;
        }
    }, [initialPage, setActiveView]);

    // Ensure we don't land on a hidden view on mobile
    useEffect(() => {
        if (isMobile && ['Marketing', 'Agreements', 'Contracts'].includes(activeView)) {
            setActiveView('Invoices');
        }
    }, [isMobile, activeView, setActiveView]);

    useEffect(() => {
        if (initialTabs && initialTabs.length > 0) {
            const [mainTab, subTab] = initialTabs;
            if (mainTab === 'Reports' && subTab) {
                if (subTab === 'Visual Layout') setActiveView('Visual Layout');
                else if (subTab === 'Project Units') setActiveView('Tabular View');
                else if (subTab === 'PM Cost') setActiveView('PM Cost Report');
                else setActiveView(subTab as ProjectView);
            } else if (['Marketing', 'Agreements', 'Contracts', 'Invoices', 'Bills', 'Sales Returns'].includes(mainTab)) {
                if (isMobile && ['Marketing', 'Agreements', 'Contracts'].includes(mainTab)) {
                    setActiveView('Invoices');
                } else {
                    setActiveView(mainTab as ProjectView);
                }
            }
            dispatch({ type: 'CLEAR_INITIAL_TABS' });
        }
    }, [initialTabs, dispatch, isMobile, setActiveView]);

    const renderContent = () => {
        switch(activeView) {
            // Operations
            case 'Marketing': return !isMobile ? <div className="flex items-center justify-center h-full text-slate-400">Marketing</div> : null;
            case 'Agreements': return !isMobile ? <ProjectAgreementsPage /> : null;
            case 'Contracts': return !isMobile ? <ProjectContractsPage /> : null;
            case 'Invoices': return <InvoicesPage invoiceTypeFilter={InvoiceType.INSTALLMENT} hideTitleAndGoBack={true} />;
            case 'Bills': return <BillsPage projectContext={true} />;
            case 'Sales Returns': return <SalesReturnsPage />;

            // Payouts
            case 'Broker Payouts': return <BrokerPayouts context="Project" />;
            case 'PM Payouts': return <ProjectPMPayouts />; // Legacy / Simple View
            
            // Primary Reports (Now on Nav)
            case 'Visual Layout': return <ProjectLayoutReport />;
            case 'Tabular View': return <ProjectUnitReport />;
            
            // Secondary Reports (From Dropdown)
            case 'Project Summary': return <ProjectSummaryReport />;
            case 'Profit & Loss': return isAdmin ? <ProjectProfitLossReport /> : null;
            case 'Balance Sheet': return isAdmin ? <ProjectBalanceSheetReport /> : null;
            case 'Cash Flows': return isAdmin ? <ProjectCashFlowReport /> : null;
            case 'Investor Distribution': return isAdmin ? <ProjectInvestorReport /> : null;
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
            
            default: return null;
        }
    };

    const isReportActive = [
        'Project Summary', 'Profit & Loss', 'Balance Sheet', 'Investor Distribution', 'Revenue Analysis', 'Owner Ledger', 'Broker Report', 
        'Income by Category', 'Expense by Category', 'Material Report', 'Vendor Ledger', 'PM Cost Report', 'Contract Report', 'Budget vs Actual', 'Cash Flows'
    ].includes(activeView);

    const isPayoutActive = ['Broker Payouts', 'PM Payouts'].includes(activeView);

    const NavButton = ({ view, label }: { view: ProjectView, label: string }) => (
        <button
            onClick={() => setActiveView(view)}
            className={`whitespace-nowrap px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                activeView === view 
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
                    {/* Operational Tabs - Scrollable */}
                    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-shrink">
                        {!isMobile && <NavButton view="Marketing" label="Marketing" />}
                        {!isMobile && <NavButton view="Agreements" label="Sales Agr." />}
                        <NavButton view="Invoices" label="Invoices" />
                        {!isMobile && <NavButton view="Contracts" label="Contracts" />}
                        <NavButton view="Bills" label="Bills" />
                        <NavButton view="Sales Returns" label="Returns" />
                    </div>

                    {/* Vertical Divider */}
                    <div className="w-px h-5 bg-slate-300 mx-2 flex-shrink-0"></div>

                    {/* Fixed Dropdowns (Outside Scroll) */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                        
                        {/* Payouts Dropdown */}
                        <div className="relative" ref={payoutDropdownRef}>
                            <button
                                onClick={() => setIsPayoutDropdownOpen(!isPayoutDropdownOpen)}
                                className={`whitespace-nowrap px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                                    isPayoutActive || isPayoutDropdownOpen
                                    ? 'bg-indigo-50 text-accent ring-1 ring-indigo-100' 
                                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                }`}
                            >
                                Payouts
                            </button>

                            {isPayoutDropdownOpen && (
                                <div className="absolute left-0 mt-2 w-48 bg-white border border-slate-200 rounded-lg shadow-xl z-[100] animate-fade-in-fast overflow-hidden">
                                    <div className="py-1">
                                        <button
                                            onClick={() => {
                                                setActiveView('Broker Payouts');
                                                setIsPayoutDropdownOpen(false);
                                            }}
                                            className={`block w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors border-b border-slate-50 ${
                                                activeView === 'Broker Payouts' ? 'text-accent font-medium bg-indigo-50/50' : 'text-slate-700'
                                            }`}
                                        >
                                            Brokers
                                        </button>
                                        <button
                                            onClick={() => {
                                                setActiveView('PM Payouts');
                                                setIsPayoutDropdownOpen(false);
                                            }}
                                            className={`block w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors ${
                                                activeView === 'PM Payouts' ? 'text-accent font-medium bg-indigo-50/50' : 'text-slate-700'
                                            }`}
                                        >
                                            PM Fee Log
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Reports Dropdown */}
                        <div className="relative" ref={reportDropdownRef}>
                            <button
                                onClick={() => setIsReportDropdownOpen(!isReportDropdownOpen)}
                                className={`whitespace-nowrap px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                                    isReportActive || isReportDropdownOpen
                                    ? 'bg-indigo-50 text-accent ring-1 ring-indigo-100' 
                                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                }`}
                            >
                                Reports
                            </button>

                            {isReportDropdownOpen && (
                                <div className="absolute left-0 mt-2 w-64 bg-white border border-slate-200 rounded-lg shadow-xl z-[100] animate-fade-in-fast overflow-hidden">
                                    <div className="py-1 max-h-[60vh] overflow-y-auto">
                                        {isAdmin && (
                                            <>
                                                <div className="bg-slate-50 px-4 py-1 text-xs font-semibold text-slate-500 border-b border-slate-200">FINANCIAL STATEMENTS</div>
                                                <button
                                                    onClick={() => { setActiveView('Profit & Loss'); setIsReportDropdownOpen(false); }}
                                                    className={`block w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors border-b border-slate-50 ${activeView === 'Profit & Loss' ? 'text-accent font-medium' : 'text-slate-700'}`}
                                                >
                                                    Profit & Loss
                                                </button>
                                                <button
                                                    onClick={() => { setActiveView('Balance Sheet'); setIsReportDropdownOpen(false); }}
                                                    className={`block w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors border-b border-slate-50 ${activeView === 'Balance Sheet' ? 'text-accent font-medium' : 'text-slate-700'}`}
                                                >
                                                    Balance Sheet
                                                </button>
                                                <button
                                                    onClick={() => { setActiveView('Cash Flows'); setIsReportDropdownOpen(false); }}
                                                    className={`block w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors border-b border-slate-50 ${activeView === 'Cash Flows' ? 'text-accent font-medium' : 'text-slate-700'}`}
                                                >
                                                    Cash Flows
                                                </button>
                                                <button
                                                    onClick={() => { setActiveView('Investor Distribution'); setIsReportDropdownOpen(false); }}
                                                    className={`block w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors border-b border-slate-200 ${activeView === 'Investor Distribution' ? 'text-accent font-medium' : 'text-slate-700'}`}
                                                >
                                                    Investor Distribution
                                                </button>
                                            </>
                                        )}

                                        <div className="bg-slate-50 px-4 py-1 text-xs font-semibold text-slate-500 border-b border-slate-200">OPERATIONAL</div>
                                        {[
                                            'Project Summary',
                                            'Budget vs Actual',
                                            'Contract Report',
                                            'PM Cost Report',
                                            'Revenue Analysis',
                                            'Owner Ledger',
                                            'Broker Report',
                                            'Income by Category',
                                            'Expense by Category',
                                            'Material Report',
                                            'Vendor Ledger'
                                        ].map((reportName) => (
                                            <button
                                                key={reportName}
                                                onClick={() => {
                                                    setActiveView(reportName as ProjectView);
                                                    setIsReportDropdownOpen(false);
                                                }}
                                                className={`block w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0 ${
                                                    activeView === reportName ? 'text-accent font-medium bg-indigo-50/50' : 'text-slate-700'
                                                }`}
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

                {/* Right Side: Segmented Control for Views */}
                <div className="flex items-center bg-slate-100 rounded-full p-1 flex-shrink-0 self-start md:self-center">
                    <button
                        onClick={() => setActiveView('Visual Layout')}
                        className={`px-4 py-1.5 text-xs sm:text-sm font-medium rounded-full transition-all duration-200 ${
                            activeView === 'Visual Layout'
                            ? 'bg-slate-200 text-slate-800 shadow-[inset_0_2px_4px_rgba(0,0,0,0.1)]'
                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                        }`}
                    >
                        Visual Layout
                    </button>
                    <button
                        onClick={() => setActiveView('Tabular View')}
                        className={`px-4 py-1.5 text-xs sm:text-sm font-medium rounded-full transition-all duration-200 ${
                            activeView === 'Tabular View'
                            ? 'bg-slate-200 text-slate-800 shadow-[inset_0_2px_4px_rgba(0,0,0,0.1)]'
                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                        }`}
                    >
                        Tabular View
                    </button>
                </div>
            </div>

            <div className="flex-grow overflow-hidden">
                {renderContent()}
            </div>
        </div>
    );
};

export default memo(ProjectManagementPage);
