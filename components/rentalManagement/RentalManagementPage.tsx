
import React, { useState, useEffect, useRef, memo, Suspense } from 'react';
import RentalAgreementsPage from '../rentalAgreements/RentalAgreementsPage';
import OwnerPayoutsPage from '../payouts/OwnerPayoutsPage';
import { Page } from '../../types';
import RentalInvoicesPage from './RentalInvoicesPage';
import RentalPaymentSearch from './RentalPaymentSearch';
import RentalBillsPage from './RentalBillsPage';
import { useAppContext } from '../../context/AppContext';
import useLocalStorage from '../../hooks/useLocalStorage';

// Lazy-loaded report imports to reduce initial bundle size
const PropertyLayoutReport = React.lazy(() => import('../reports/PropertyLayoutReport'));
const UnitStatusReport = React.lazy(() => import('../reports/UnitStatusReport'));
const AgreementExpiryReport = React.lazy(() => import('../reports/AgreementExpiryReport'));
const BuildingAccountsReport = React.lazy(() => import('../reports/BuildingAccountsReport'));
const BMAnalysisReport = React.lazy(() => import('../reports/BMAnalysisReport'));
const OwnerPayoutsReport = React.lazy(() => import('../reports/OwnerPayoutsReport'));
const ServiceChargesDeductionReport = React.lazy(() => import('../reports/ServiceChargesDeductionReport'));
const TenantLedgerReport = React.lazy(() => import('../reports/TenantLedgerReport'));
const VendorLedgerReport = React.lazy(() => import('../reports/VendorLedgerReport'));
const OwnerSecurityDepositReport = React.lazy(() => import('../reports/OwnerSecurityDepositReport'));
const BrokerFeeReport = React.lazy(() => import('../reports/BrokerFeeReport'));
const InvoicePaymentAnalysisReport = React.lazy(() => import('../reports/InvoicePaymentAnalysisReport'));
const OwnerIncomeSummaryReport = React.lazy(() => import('../reports/OwnerIncomeSummaryReport'));

interface RentalManagementPageProps {
    initialPage: Page;
}

// Define all possible view keys
type RentalView =
    | 'Agreements' | 'Invoices' | 'Bills' | 'Payment' | 'Payouts'
    | 'Visual Layout' | 'Tabular Layout'
    | 'Agreement Expiry' | 'Building Analysis' | 'BM Analysis' | 'Invoice & Payment Analysis'
    | 'Owner Income' | 'Owner Income Summary'
    | 'Service Charges Deduction' | 'Tenant Ledger' | 'Vendor Ledger'
    | 'Owner Security Deposit' | 'Broker Fees';

const RentalManagementPage: React.FC<RentalManagementPageProps> = ({ initialPage }) => {
    const { state, dispatch } = useAppContext();
    const { initialTabs } = state;

    // Detect Mobile
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const [activeView, setActiveView] = useLocalStorage<RentalView>('rentalManagement_activeView', 'Agreements');
    const [isReportDropdownOpen, setIsReportDropdownOpen] = useState(false);
    const reportDropdownRef = useRef<HTMLDivElement>(null);

    // Handle outside click for dropdown
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (reportDropdownRef.current && !reportDropdownRef.current.contains(event.target as Node)) {
                setIsReportDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        // This hook handles the initial page load based on the footer navigation.
        switch (initialPage) {
            case 'rentalInvoices':
                setActiveView('Invoices');
                break;
            case 'rentalAgreements':
                setActiveView('Agreements');
                break;
            case 'ownerPayouts':
                setActiveView('Payouts');
                break;
            case 'rentalManagement':
                // Do nothing - preserve current view unless invalid
                break;
            default:
                // Do nothing
                break;
        }
    }, [initialPage, setActiveView]);

    useEffect(() => {
        // This hook specifically handles deep-linking from favorite reports,
        // overriding the initial page load if necessary.
        if (initialTabs && initialTabs.length > 0) {
            const [mainTab, subTab] = initialTabs;
            // Handle report deep-linking
            if (mainTab === 'Reports' && subTab) {
                setActiveView(subTab as RentalView);
            } else if (['Agreements', 'Invoices', 'Bills', 'Payment', 'Payouts'].includes(mainTab)) {
                setActiveView(mainTab as RentalView);
            }
            // Clear global state immediately to prevent re-render loops in children
            dispatch({ type: 'CLEAR_INITIAL_TABS' });
        }
    }, [initialTabs, dispatch, setActiveView]);

    const OPERATIONAL_VIEWS: RentalView[] = ['Agreements', 'Invoices', 'Bills', 'Payment', 'Payouts'];
    const isOperationalView = OPERATIONAL_VIEWS.includes(activeView);

    const renderReportContent = () => {
        switch (activeView) {
            case 'Visual Layout': return <PropertyLayoutReport />;
            case 'Tabular Layout': return <UnitStatusReport />;
            case 'Agreement Expiry': return <AgreementExpiryReport />;
            case 'Building Analysis': return <BuildingAccountsReport />;
            case 'BM Analysis': return <BMAnalysisReport />;
            case 'Invoice & Payment Analysis': return <InvoicePaymentAnalysisReport />;
            case 'Owner Income': return <OwnerPayoutsReport />;
            case 'Owner Income Summary': return <OwnerIncomeSummaryReport />;
            case 'Service Charges Deduction': return <ServiceChargesDeductionReport />;
            case 'Tenant Ledger': return <TenantLedgerReport />;
            case 'Vendor Ledger': return <VendorLedgerReport context="Rental" />;
            case 'Owner Security Deposit': return <OwnerSecurityDepositReport />;
            case 'Broker Fees': return <BrokerFeeReport />;
            default: return null;
        }
    };

    const isReportActive = [
        'Agreement Expiry', 'Building Analysis', 'BM Analysis', 'Invoice & Payment Analysis',
        'Owner Income', 'Owner Income Summary',
        'Service Charges Deduction', 'Tenant Ledger', 'Vendor Ledger',
        'Owner Security Deposit', 'Broker Fees'
    ].includes(activeView);

    const NavButton = ({ view, label }: { view: RentalView, label: string }) => (
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
                    {/* Operational Tabs - Scrollable */}
                    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-shrink">
                        <NavButton view="Agreements" label="Agreements" />
                        <NavButton view="Invoices" label="Invoices" />
                        <NavButton view="Bills" label="Bills" />
                        <NavButton view="Payment" label="Payment" />
                        <NavButton view="Payouts" label="Payouts" />
                    </div>

                    {/* Vertical Divider */}
                    <div className="w-px h-5 bg-slate-300 mx-2 flex-shrink-0"></div>

                    {/* Reports Dropdown */}
                    <div className="relative flex-shrink-0" ref={reportDropdownRef}>
                        <button
                            onClick={() => setIsReportDropdownOpen(!isReportDropdownOpen)}
                            className={`whitespace-nowrap px-3 py-2 text-sm font-medium rounded-md transition-colors ${isReportActive || isReportDropdownOpen
                                ? 'bg-indigo-50 text-accent ring-1 ring-indigo-100'
                                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                }`}
                        >
                            Reports
                        </button>

                        {isReportDropdownOpen && (
                            <div className="absolute left-0 mt-2 w-64 bg-white border border-slate-200 rounded-lg shadow-xl z-[100] animate-fade-in-fast overflow-hidden">
                                <div className="py-1 max-h-[60vh] overflow-y-auto">
                                    <div className="bg-slate-50 px-4 py-1 text-xs font-semibold text-slate-500 border-b border-slate-200">ANALYSIS</div>
                                    {[
                                        'Agreement Expiry',
                                        'Building Analysis',
                                        'BM Analysis',
                                        'Invoice & Payment Analysis'
                                    ].map((reportName) => (
                                        <button
                                            key={reportName}
                                            onClick={() => {
                                                setActiveView(reportName as RentalView);
                                                setIsReportDropdownOpen(false);
                                            }}
                                            className={`block w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors border-b border-slate-50 ${activeView === reportName ? 'text-accent font-medium bg-indigo-50/50' : 'text-slate-700'
                                                }`}
                                        >
                                            {reportName}
                                        </button>
                                    ))}


                                    <div className="bg-slate-50 px-4 py-1 text-xs font-semibold text-slate-500 border-b border-slate-200">LEDGERS</div>
                                    {[
                                        'Owner Income',
                                        'Owner Income Summary',
                                        'Service Charges Deduction',
                                        'Tenant Ledger',
                                        'Vendor Ledger',
                                        'Owner Security Deposit',
                                        'Broker Fees'
                                    ].map((reportName) => (
                                        <button
                                            key={reportName}
                                            onClick={() => {
                                                setActiveView(reportName as RentalView);
                                                setIsReportDropdownOpen(false);
                                            }}
                                            className={`block w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0 ${activeView === reportName ? 'text-accent font-medium bg-indigo-50/50' : 'text-slate-700'
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

                {/* Right Side: Segmented Control for Views */}
                <div className="flex items-center bg-slate-100 rounded-full p-1 flex-shrink-0 self-start md:self-center">
                    <button
                        onClick={() => setActiveView('Visual Layout')}
                        className={`px-4 py-1.5 text-xs sm:text-sm font-medium rounded-full transition-all duration-200 ${activeView === 'Visual Layout'
                            ? 'bg-slate-200 text-slate-800 shadow-[inset_0_2px_4px_rgba(0,0,0,0.1)]'
                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                            }`}
                    >
                        Visual Layout
                    </button>
                    <button
                        onClick={() => setActiveView('Tabular Layout')}
                        className={`px-4 py-1.5 text-xs sm:text-sm font-medium rounded-full transition-all duration-200 ${activeView === 'Tabular Layout'
                            ? 'bg-slate-200 text-slate-800 shadow-[inset_0_2px_4px_rgba(0,0,0,0.1)]'
                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                            }`}
                    >
                        Tabular Layout
                    </button>
                </div>
            </div>

            <div className="flex-grow overflow-hidden">
                {activeView === 'Agreements' && <RentalAgreementsPage />}
                {activeView === 'Invoices' && <RentalInvoicesPage />}
                {activeView === 'Bills' && <RentalBillsPage />}
                {activeView === 'Payment' && <RentalPaymentSearch />}
                {activeView === 'Payouts' && <OwnerPayoutsPage />}
                {!isOperationalView && (
                    <Suspense fallback={<div className="flex items-center justify-center h-full text-slate-400">Loading report...</div>}>
                        {renderReportContent()}
                    </Suspense>
                )}
            </div>
        </div>
    );
};

export default memo(RentalManagementPage);
