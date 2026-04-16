
import React, { useState, useEffect, useLayoutEffect, memo, Suspense, startTransition, useCallback } from 'react';
import { useCollapsibleSubNav } from '../../hooks/useCollapsibleSubNav';
import SubNavModeToggle from '../layout/SubNavModeToggle';
import RentalAgreementsPage from '../rentalAgreements/RentalAgreementsPage';
import OwnerPayoutsPage from '../payouts/OwnerPayoutsPage';
import { Page } from '../../types';
import RentalInvoicesPage from './RentalInvoicesPage';
import RecurringInvoicesList from './RecurringInvoicesList';
import MonthlyServiceChargesPage from './MonthlyServiceChargesPage';
import RentalPaymentSearch from './RentalPaymentSearch';
import RentalBillsPage from './RentalBillsPage';
import RentalSettingsPage from './RentalSettingsPage';
import { useAppContext } from '../../context/AppContext';
import useLocalStorage from '../../hooks/useLocalStorage';

// Static report imports for file:// (Electron) compatibility — dynamic import can fail there
import PropertyLayoutReport from '../reports/PropertyLayoutReport';
import UnitStatusReport from '../reports/UnitStatusReport';
import AgreementExpiryReport from '../reports/AgreementExpiryReport';
import BuildingAccountsReport from '../reports/BuildingAccountsReport';
import BMAnalysisReport from '../reports/BMAnalysisReport';
import OwnerPayoutsReport from '../reports/OwnerPayoutsReport';
import ServiceChargesDeductionReport from '../reports/ServiceChargesDeductionReport';
import TenantLedgerReport from '../reports/TenantLedgerReport';
import VendorLedgerReport from '../reports/VendorLedgerReport';
import OwnerSecurityDepositReport from '../reports/OwnerSecurityDepositReport';
import BrokerFeeReport from '../reports/BrokerFeeReport';
import InvoicePaymentAnalysisReport from '../reports/InvoicePaymentAnalysisReport';
import OwnerIncomeSummaryReport from '../reports/OwnerIncomeSummaryReport';
import RentalReceivableReport from '../reports/RentalReceivableReport';

interface RentalManagementPageProps {
    initialPage: Page;
}

// Define all possible view keys
type RentalView =
    | 'Rental setup'
    | 'Agreements' | 'Invoices' | 'Recurring Templates' | 'Monthly Service Charges' | 'Bills' | 'Payment' | 'Payouts'
    | 'Visual Layout' | 'Tabular Layout'
    | 'Agreement Expiry' | 'Building Analysis' | 'BM Analysis' | 'Invoice & Payment Analysis'
    | 'Owner Rental Income' | 'Owner Rental Income Summary'
    | 'Service Charges Deduction' | 'Tenant Ledger' | 'Vendor Ledger'
    | 'Owner Security Deposit' | 'Broker Fees' | 'Rental Receivable';

const ANALYSIS_REPORTS: RentalView[] = [
    'Agreement Expiry',
    'Building Analysis',
    'BM Analysis',
    'Invoice & Payment Analysis',
];

function rentalNavLabelShort(label: string): string {
    const w = label.trim().split(/\s+/);
    if (w.length === 1) return w[0].slice(0, 3).toUpperCase();
    return w.map((x) => x[0]).join('').slice(0, 3).toUpperCase();
}

const LEDGER_REPORTS: RentalView[] = [
    'Owner Rental Income',
    'Owner Rental Income Summary',
    'Service Charges Deduction',
    'Tenant Ledger',
    'Vendor Ledger',
    'Owner Security Deposit',
    'Broker Fees',
    'Rental Receivable',
];

const RentalManagementPage: React.FC<RentalManagementPageProps> = ({ initialPage }) => {
    const { state, dispatch } = useAppContext();
    const { initialTabs } = state;

    const [activeView, setActiveView] = useLocalStorage<RentalView>('rentalManagement_activeView', 'Agreements');
    const [reportsExpanded, setReportsExpanded] = useState(true);

    const {
        effectiveCollapsed: subNavCollapsed,
        toggle: toggleSubNav,
        toggleTitle: subNavToggleTitle,
    } = useCollapsibleSubNav('subnav_rental');

    const isReportActive = [
        ...ANALYSIS_REPORTS,
        ...LEDGER_REPORTS,
    ].includes(activeView);

    useEffect(() => {
        if (isReportActive) setReportsExpanded(true);
    }, [isReportActive]);

    /** Legacy `rentalSettings` top-level page → embedded Rental setup + normalize to rentalManagement. */
    useLayoutEffect(() => {
        if (initialPage !== 'rentalSettings') return;
        setActiveView('Rental setup');
        dispatch({ type: 'SET_PAGE', payload: 'rentalManagement' });
    }, [initialPage, dispatch, setActiveView]);

    useEffect(() => {
        startTransition(() => {
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
                    break;
                default:
                    break;
            }
        });
    }, [initialPage, setActiveView]);

    useEffect(() => {
        if (initialTabs && initialTabs.length > 0) {
            const [mainTab, subTab] = initialTabs;
            startTransition(() => {
                if (mainTab === 'Reports' && subTab) {
                    setActiveView(subTab as RentalView);
                } else if (mainTab === 'Rental setup') {
                    setActiveView('Rental setup');
                } else if (['Agreements', 'Invoices', 'Recurring Templates', 'Monthly Service Charges', 'Bills', 'Payment', 'Payouts'].includes(mainTab)) {
                    setActiveView(mainTab as RentalView);
                }
            });
            dispatch({ type: 'CLEAR_INITIAL_TABS' });
        }
    }, [initialTabs, dispatch, setActiveView]);

    const OPERATIONAL_VIEWS: RentalView[] = [
        'Rental setup',
        'Agreements',
        'Invoices',
        'Recurring Templates',
        'Monthly Service Charges',
        'Bills',
        'Payment',
        'Payouts',
    ];
    const isOperationalView = OPERATIONAL_VIEWS.includes(activeView);

    const goRecurringTemplates = useCallback(() => {
        startTransition(() => setActiveView('Recurring Templates'));
    }, [setActiveView]);

    /** Mount ONLY the active operational view — avoids mounting all 7 at once (major INP win). */
    const renderOperationalContent = () => (
        <div className="relative h-full w-full min-h-0">
            {activeView === 'Rental setup' && <RentalSettingsPage embeddedInRentalModule />}
            {activeView === 'Agreements' && <RentalAgreementsPage />}
            {activeView === 'Invoices' && (
                <RentalInvoicesPage onNavigateToRecurringTemplates={goRecurringTemplates} />
            )}
            {activeView === 'Recurring Templates' && (
                <div className="h-full min-h-0 overflow-y-auto">
                    <RecurringInvoicesList />
                </div>
            )}
            {activeView === 'Monthly Service Charges' && <MonthlyServiceChargesPage />}
            {activeView === 'Bills' && <RentalBillsPage />}
            {activeView === 'Payment' && <RentalPaymentSearch />}
            {activeView === 'Payouts' && <OwnerPayoutsPage />}
        </div>
    );

    const renderReportContent = () => {
        switch (activeView) {
            case 'Visual Layout': return <PropertyLayoutReport />;
            case 'Tabular Layout': return <UnitStatusReport />;
            case 'Agreement Expiry': return <AgreementExpiryReport />;
            case 'Building Analysis': return <BuildingAccountsReport />;
            case 'BM Analysis': return <BMAnalysisReport />;
            case 'Invoice & Payment Analysis': return <InvoicePaymentAnalysisReport />;
            case 'Owner Rental Income': return <OwnerPayoutsReport />;
            case 'Owner Rental Income Summary': return <OwnerIncomeSummaryReport />;
            case 'Service Charges Deduction': return <ServiceChargesDeductionReport />;
            case 'Tenant Ledger': return <TenantLedgerReport />;
            case 'Vendor Ledger': return <VendorLedgerReport context="Rental" />;
            case 'Owner Security Deposit': return <OwnerSecurityDepositReport />;
            case 'Broker Fees': return <BrokerFeeReport />;
            case 'Rental Receivable': return <RentalReceivableReport />;
            default: return null;
        }
    };

    const NavItem = ({ view, label }: { view: RentalView; label: string }) => {
        const on = activeView === view;
        const short = rentalNavLabelShort(label);
        const onNavigate = () => startTransition(() => setActiveView(view));
        if (subNavCollapsed) {
            return (
                <button
                    type="button"
                    title={label}
                    onClick={onNavigate}
                    className={`w-full flex justify-center px-1 py-1.5 rounded-md text-[10px] font-bold leading-tight transition-colors ${on
                        ? 'bg-primary text-ds-on-primary shadow-sm'
                        : 'text-app-muted hover:bg-app-toolbar hover:text-app-text'
                        }`}
                >
                    {short}
                </button>
            );
        }
        return (
            <button
                type="button"
                onClick={onNavigate}
                className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${on
                    ? 'bg-primary text-ds-on-primary shadow-sm shadow-primary/20'
                    : 'text-app-muted hover:bg-app-toolbar hover:text-app-text'
                    }`}
            >
                {label}
            </button>
        );
    };

    const rentalNavPanel = (
        <>
            <div
                className={`border-b border-slate-200 dark:border-slate-700 shrink-0 flex items-center gap-1 ${subNavCollapsed ? 'flex-col py-2 px-1' : 'justify-between px-3 py-2.5'}`}
            >
                {!subNavCollapsed && (
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Rental module</p>
                )}
                <SubNavModeToggle collapsed={subNavCollapsed} onToggle={toggleSubNav} title={subNavToggleTitle} compact />
            </div>
            <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-2 space-y-1 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600 min-h-0" aria-label="Rental module navigation">
                <div className="space-y-0.5">
                    <NavItem view="Rental setup" label="Rental setup" />
                    <NavItem view="Agreements" label="Agreements" />
                    <NavItem view="Invoices" label="Invoices" />
                    <NavItem view="Recurring Templates" label="Recurring Templates" />
                    <NavItem view="Monthly Service Charges" label="Monthly Service Charges" />
                    <NavItem view="Bills" label="Bills" />
                    <NavItem view="Payment" label="Payment" />
                    <NavItem view="Payouts" label="Payouts" />
                </div>

                <div className="pt-3 mt-2 border-t border-app-border space-y-0.5">
                    {!subNavCollapsed && (
                        <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-app-muted">Property views</p>
                    )}
                    <NavItem view="Visual Layout" label="Visual layout" />
                    <NavItem view="Tabular Layout" label="Tabular layout" />
                </div>

                <div className="pt-3 mt-2 border-t border-app-border">
                    <button
                        type="button"
                        onClick={() => setReportsExpanded((e) => !e)}
                        className={`w-full flex items-center ${subNavCollapsed ? 'justify-center px-1' : 'justify-between px-3'} py-2 rounded-md text-sm font-medium transition-colors ${isReportActive || reportsExpanded
                            ? 'bg-primary/10 text-primary'
                            : 'text-app-muted hover:bg-app-toolbar hover:text-app-text'
                            }`}
                    >
                        {subNavCollapsed ? (
                            <span className="text-[10px] font-bold">RPT</span>
                        ) : (
                            <span>Reports</span>
                        )}
                        {!subNavCollapsed && (
                            <svg className={`w-4 h-4 shrink-0 transition-transform ${reportsExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        )}
                    </button>
                    {reportsExpanded && (
                        <div className="mt-1 space-y-2 pl-0">
                            <div>
                                {!subNavCollapsed && (
                                    <p className="px-3 py-1 text-[10px] font-semibold text-app-muted uppercase tracking-wide">Analysis</p>
                                )}
                                <div className="space-y-0.5">
                                    {ANALYSIS_REPORTS.map((name) => (
                                        <NavItem key={name} view={name} label={name} />
                                    ))}
                                </div>
                            </div>
                            <div>
                                {!subNavCollapsed && (
                                    <p className="px-3 py-1 text-[10px] font-semibold text-app-muted uppercase tracking-wide">Ledgers</p>
                                )}
                                <div className="space-y-0.5">
                                    {LEDGER_REPORTS.map((name) => (
                                        <NavItem key={name} view={name} label={name} />
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </nav>
        </>
    );

    const allViewsForMobile: { value: RentalView; label: string; group: string }[] = [
        ...OPERATIONAL_VIEWS.map((v) => ({ value: v, label: v, group: 'Operations' })),
        { value: 'Visual Layout', label: 'Visual layout', group: 'Property views' },
        { value: 'Tabular Layout', label: 'Tabular layout', group: 'Property views' },
        ...ANALYSIS_REPORTS.map((v) => ({ value: v, label: v, group: 'Reports — Analysis' })),
        ...LEDGER_REPORTS.map((v) => ({ value: v, label: v, group: 'Reports — Ledgers' })),
    ];

    return (
        <div className="flex flex-col md:flex-row h-full min-h-0 w-full">
            {/* Second-level left navigation — desktop / tablet */}
            <aside
                className={`hidden md:flex flex-col shrink-0 border-r border-app-border bg-app-toolbar/30 h-full min-h-0 overflow-hidden transition-[width] duration-200 ease-out ${subNavCollapsed ? 'w-14' : 'w-60'}`}
                aria-label="Rental secondary navigation"
            >
                {rentalNavPanel}
            </aside>

            {/* Mobile: compact picker (second-level nav) */}
            <div className="md:hidden shrink-0 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 px-3 py-2">
                    <label htmlFor="rental-module-view" className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Rental</label>
                    <select
                        id="rental-module-view"
                        value={activeView}
                        onChange={(e) => {
                            const v = e.target.value as RentalView;
                            startTransition(() => setActiveView(v));
                        }}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm py-2 px-3"
                        aria-label="Rental module section"
                    >
                        {['Operations', 'Property views', 'Reports — Analysis', 'Reports — Ledgers'].map((group) => {
                            const opts = allViewsForMobile.filter((o) => o.group === group);
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

            <div className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col">
                {isOperationalView ? renderOperationalContent() : (
                    <Suspense fallback={<div className="flex items-center justify-center h-full text-app-muted">Loading report...</div>}>
                        {renderReportContent()}
                    </Suspense>
                )}
            </div>
        </div>
    );
};

export default memo(RentalManagementPage);
